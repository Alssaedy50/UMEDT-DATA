import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type {
  AcademicBookResource,
  AcademicExamPackage,
  ClinicalAbbreviation,
  DictionaryTerm,
  LinkedSentence,
  MasterDataCounts,
  MediaAssetRecord,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  TopicArticle,
  UnifiedQuizQuestion,
  WorkspaceDataState
} from './src/types/umedtData.ts';
import {
  computeWorkspaceCounts,
  deleteMediaBinaryIfUnused,
  loadReleaseHistory,
  loadWorkspaceState,
  readMediaBinary,
  saveMediaBinary,
  saveWorkspaceState,
  writeCatalogAndDocsToRepoDisk,
  writeMasterFilesToRepoDisk
} from './server/workspaceStore.ts';
import {
  buildDataCatalogDocument,
  COLLECTION_SPECS,
  generateApiContractMarkdown,
  generateJsonSchemaFiles,
  wrapRecordInUnifiedEnvelope
} from './server/catalogGenerator.ts';
import {
  buildSignedReleasePackage,
  computeDiffAgainstRemote,
  generateEcdsaSigningKeyPair,
  normalizeTermKey,
  publishLocalReleaseToDisk,
  rollbackChannelRelease,
  validateWorkspaceData
} from './server/cryptoRelease.ts';
import {
  createIntegrationPrOnUmedt,
  fetchRemoteMasterData,
  fetchRepoOverview,
  importSeedFromUmedtRepo,
  publishAtomicCommitToUmedtData
} from './server/githubSync.ts';
import {
  generateUmedtDataReadme,
  generateUmedtDataWorkflowYml,
  getUmedtIntegrationPatchFiles
} from './server/umedtTemplates.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractToken(req: express.Request): string | undefined {
  const headerToken = req.header('x-github-token');
  if (headerToken && headerToken.trim()) return headerToken.trim();
  const auth = req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  return undefined;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // 1. Live GitHub Repository Overview (UMEDT + UMEDT-DATA)
  app.get('/api/github/status', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const sourceRepo =
        typeof req.query.sourceRepo === 'string' && req.query.sourceRepo.trim()
          ? req.query.sourceRepo.trim()
          : state.meta.sourceRepo;
      const dataRepo =
        typeof req.query.dataRepo === 'string' && req.query.dataRepo.trim()
          ? req.query.dataRepo.trim()
          : state.meta.dataRepo;
      const token = extractToken(req);

      const [sourceOverview, dataOverview] = await Promise.all([
        fetchRepoOverview(sourceRepo, token),
        fetchRepoOverview(dataRepo, token)
      ]);

      res.json({
        checkedAt: new Date().toISOString(),
        sourceRepo: sourceOverview,
        dataRepo: dataOverview
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر فحص حالة مستودعات GitHub'
      });
    }
  });

  // 2. Workspace State & CRUD
  app.get('/api/workspace', (_req, res) => {
    const state = loadWorkspaceState();
    const validation = validateWorkspaceData(state);
    res.json({ state, validation });
  });

  app.put('/api/workspace/meta', (req, res) => {
    const state = loadWorkspaceState();
    const body = (req.body || {}) as Partial<WorkspaceDataState['meta']>;
    state.meta = {
      ...state.meta,
      sourceRepo: body.sourceRepo?.trim() || state.meta.sourceRepo,
      dataRepo: body.dataRepo?.trim() || state.meta.dataRepo,
      branch: body.branch?.trim() || state.meta.branch,
      dataVersion: body.dataVersion?.trim() || state.meta.dataVersion
    };
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Import canonical blocks, subjects, topics, terms, sentences, affixes, abbreviations & attachments from UMEDT
  app.post('/api/workspace/import-from-umedt', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as { sourceRepo?: string; dataRepo?: string };
      const sourceRepo = body.sourceRepo?.trim() || state.meta.sourceRepo;
      const dataRepo = body.dataRepo?.trim() || state.meta.dataRepo;
      const token = extractToken(req);

      const imported = await importSeedFromUmedtRepo(sourceRepo, dataRepo, state, token);
      saveWorkspaceState(imported);
      res.json({
        state: imported,
        validation: validateWorkspaceData(imported)
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر استيراد البيانات من مستودع UMEDT'
      });
    }
  });

  // Pull live master data currently published in UMEDT-DATA
  app.post('/api/workspace/load-from-umedt-data', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as { dataRepo?: string; branch?: string };
      const dataRepo = body.dataRepo?.trim() || state.meta.dataRepo;
      const branch = body.branch?.trim() || state.meta.branch || 'main';
      const token = extractToken(req);

      // fetchRemoteMasterData is all-or-nothing: every catalog collection and every repository-owned
      // binary asset must download and pass its declared SHA-256 before this handler can mutate state.
      const remote = await fetchRemoteMasterData(dataRepo, branch, token);
      const requiredCollections: Array<keyof WorkspaceDataState> = [
        'blocks', 'subjects', 'topics', 'terms', 'sentences',
        'customAffixes', 'customAbbreviations', 'books', 'questions', 'exams', 'mediaAssets'
      ];
      const missingCollection = requiredCollections.find(
        (key) => !Array.isArray(remote[key])
      );
      if (missingCollection) {
        res.status(502).json({
          error: `لم يتم تحميل النطاق ${String(missingCollection)} بصورة مكتملة. لم يتم تغيير بيانات مساحة العمل.`
        });
        return;
      }

      const nextState: WorkspaceDataState = {
        ...state,
        meta: {
          ...state.meta,
          dataRepo,
          branch,
          lastLoadedFromDataRepoAt: new Date().toISOString()
        },
        blocks: remote.blocks!,
        subjects: remote.subjects!,
        topics: remote.topics!,
        terms: remote.terms!,
        sentences: remote.sentences!,
        customAffixes: remote.customAffixes!,
        customAbbreviations: remote.customAbbreviations!,
        books: remote.books!,
        questions: remote.questions!,
        exams: remote.exams!,
        mediaAssets: remote.mediaAssets!
      };
      const validation = validateWorkspaceData(nextState);
      if (!validation.valid) {
        res.status(422).json({
          error: 'تم تنزيل البيانات، لكن فشل التحقق البنيوي. لم يتم استبدال مساحة العمل الحالية.',
          validation
        });
        return;
      }

      saveWorkspaceState(nextState);
      res.json({ state: nextState, validation });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error
          ? err.message
          : 'تعذر جلب البيانات من مستودع UMEDT-DATA. لم يتم تغيير بيانات مساحة العمل.'
      });
    }
  });

  // Blocks CRUD
  app.post('/api/workspace/blocks', (req, res) => {
    const state = loadWorkspaceState();
    const block = req.body as MedicalBlock;
    if (!block?.id || (!block.titleEn && !block.titleAr)) {
      res.status(400).json({ error: 'معرف البلوك والعنوان مطلوبان.' });
      return;
    }
    const now = new Date().toISOString().slice(0, 10);
    const idx = state.blocks.findIndex((b) => b.id === block.id);
    const normalized: MedicalBlock = {
      ...block,
      createdAt: block.createdAt || now,
      updatedAt: now
    };
    if (idx >= 0) {
      state.blocks[idx] = normalized;
    } else {
      state.blocks.push(normalized);
    }
    state.blocks.sort((a, b) => a.order - b.order);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/blocks/:id', (req, res) => {
    const state = loadWorkspaceState();
    const id = req.params.id;
    state.blocks = state.blocks.filter((b) => b.id !== id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Subjects CRUD
  app.post('/api/workspace/subjects', (req, res) => {
    const state = loadWorkspaceState();
    const subj = req.body as MedicalSubject;
    if (!subj?.id || (!subj.titleEn && !subj.titleAr)) {
      res.status(400).json({ error: 'معرف المادة الدراسية والعنوان مطلوبان.' });
      return;
    }
    const now = new Date().toISOString().slice(0, 10);
    const idx = state.subjects.findIndex((s) => s.id === subj.id);
    const normalized: MedicalSubject = {
      ...subj,
      createdAt: subj.createdAt || now,
      updatedAt: now
    };
    if (idx >= 0) {
      state.subjects[idx] = normalized;
    } else {
      state.subjects.push(normalized);
    }
    state.subjects.sort((a, b) => a.order - b.order);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/subjects/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.subjects = state.subjects.filter((s) => s.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Topics CRUD
  app.post('/api/workspace/topics', (req, res) => {
    const state = loadWorkspaceState();
    const topic = req.body as TopicArticle;
    if (!topic?.id || (!topic.title && !topic.titleAr && !topic.titleEn)) {
      res.status(400).json({ error: 'معرف الموضوع وعنوانه مطلوبان.' });
      return;
    }
    const normalized: TopicArticle = {
      ...topic,
      title: topic.title || topic.titleAr || topic.titleEn || topic.id,
      sections: Array.isArray(topic.sections) ? topic.sections : [],
      images: Array.isArray(topic.images) ? topic.images : [],
      links: Array.isArray(topic.links) ? topic.links : [],
      attachments: Array.isArray(topic.attachments) ? topic.attachments : []
    };
    const idx = state.topics.findIndex((t) => t.id === normalized.id);
    if (idx >= 0) {
      state.topics[idx] = normalized;
    } else {
      state.topics.unshift(normalized);
    }
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/topics/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.topics = state.topics.filter((t) => t.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Terms CRUD
  app.post('/api/workspace/terms', (req, res) => {
    const state = loadWorkspaceState();
    const term = req.body as DictionaryTerm;
    if (!term?.id || !term.term?.trim()) {
      res.status(400).json({ error: 'معرف المصطلح واللفظ الإنجليزي مطلوبان.' });
      return;
    }
    const normalized: DictionaryTerm = {
      ...term,
      termNormalized: normalizeTermKey(term.term),
      ingestedAt: term.ingestedAt || new Date().toISOString().slice(0, 10),
      collections: Array.isArray(term.collections) ? term.collections : [],
      examples: Array.isArray(term.examples) ? term.examples : [],
      relations: term.relations || { synonyms: [], broader: [], related: [] }
    };
    const idx = state.terms.findIndex((t) => t.id === normalized.id);
    if (idx >= 0) {
      state.terms[idx] = normalized;
    } else {
      state.terms.unshift(normalized);
    }
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/terms/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.terms = state.terms.filter((t) => t.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Sentences, Affixes, Abbreviations, Questions CRUD
  app.post('/api/workspace/sentences', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as LinkedSentence;
    if (!item?.id || !item.en?.trim()) {
      res.status(400).json({ error: 'معرف الجملة والنص الإنجليزي مطلوبان.' });
      return;
    }
    const idx = state.sentences.findIndex((s) => s.id === item.id);
    if (idx >= 0) state.sentences[idx] = item;
    else state.sentences.unshift(item);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/sentences/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.sentences = state.sentences.filter((s) => s.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.post('/api/workspace/affixes', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as MorphologicalAffix;
    if (!item?.id || !item.affix?.trim()) {
      res.status(400).json({ error: 'معرف اللاحقة/السابقة مطلوب.' });
      return;
    }
    const idx = state.customAffixes.findIndex((a) => a.id === item.id);
    if (idx >= 0) state.customAffixes[idx] = item;
    else state.customAffixes.unshift(item);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/affixes/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.customAffixes = state.customAffixes.filter((a) => a.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.post('/api/workspace/abbreviations', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as ClinicalAbbreviation;
    if (!item?.id || !item.abbr?.trim()) {
      res.status(400).json({ error: 'معرف الاختصار والرمز مطلوبان.' });
      return;
    }
    const idx = state.customAbbreviations.findIndex((a) => a.id === item.id);
    if (idx >= 0) state.customAbbreviations[idx] = item;
    else state.customAbbreviations.unshift(item);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/abbreviations/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.customAbbreviations = state.customAbbreviations.filter((a) => a.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.post('/api/workspace/questions', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as UnifiedQuizQuestion;
    if (!item?.id || !item.questionEn?.trim()) {
      res.status(400).json({ error: 'معرف السؤال ونص السؤال مطلوبان.' });
      return;
    }
    const idx = state.questions.findIndex((q) => q.id === item.id);
    if (idx >= 0) state.questions[idx] = item;
    else state.questions.unshift(item);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/questions/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.questions = state.questions.filter((q) => q.id !== req.params.id);
    saveWorkspaceState(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Academic Books & PDFs CRUD
  app.post('/api/workspace/books', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as AcademicBookResource;
    if (!item?.id || (!item.titleEn?.trim() && !item.titleAr?.trim()) || !item.downloadUrl?.trim()) {
      res.status(400).json({ error: 'معرف الكتاب والعنوان ورابط التحميل مطلوبون.' });
      return;
    }
    const now = new Date().toISOString();
    const normalized: AcademicBookResource = {
      ...item,
      titleEn: item.titleEn || item.titleAr,
      titleAr: item.titleAr || item.titleEn,
      authors: Array.isArray(item.authors) ? item.authors : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      topicIds: Array.isArray(item.topicIds) ? item.topicIds : [],
      publishedAt: item.publishedAt || now.slice(0, 10),
      updatedAt: now.slice(0, 10)
    };
    state.books = state.books || [];
    const idx = state.books.findIndex((b) => b.id === normalized.id);
    if (idx >= 0) state.books[idx] = normalized;
    else state.books.unshift(normalized);
    saveWorkspaceState(state);
    writeMasterFilesToRepoDisk(state);
    writeCatalogAndDocsToRepoDisk(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/books/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.books = (state.books || []).filter((b) => b.id !== req.params.id);
    saveWorkspaceState(state);
    writeMasterFilesToRepoDisk(state);
    writeCatalogAndDocsToRepoDisk(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // Academic Exams CRUD
  app.post('/api/workspace/exams', (req, res) => {
    const state = loadWorkspaceState();
    const item = req.body as AcademicExamPackage;
    if (!item?.id || (!item.titleEn?.trim() && !item.titleAr?.trim())) {
      res.status(400).json({ error: 'معرف الاختبار وعنوانه مطلوبان.' });
      return;
    }
    const now = new Date().toISOString().slice(0, 10);
    const normalized: AcademicExamPackage = {
      ...item,
      titleEn: item.titleEn || item.titleAr,
      titleAr: item.titleAr || item.titleEn,
      questionIds: Array.isArray(item.questionIds) ? item.questionIds : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      durationMinutes: Number(item.durationMinutes) || 15,
      passingScorePercent: Number(item.passingScorePercent) || 70,
      totalPoints: Number(item.totalPoints) || (item.questionIds?.length || 1) * 10,
      publishedAt: item.publishedAt || now,
      updatedAt: now
    };
    state.exams = state.exams || [];
    const idx = state.exams.findIndex((e) => e.id === normalized.id);
    if (idx >= 0) state.exams[idx] = normalized;
    else state.exams.unshift(normalized);
    saveWorkspaceState(state);
    writeMasterFilesToRepoDisk(state);
    writeCatalogAndDocsToRepoDisk(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  app.delete('/api/workspace/exams/:id', (req, res) => {
    const state = loadWorkspaceState();
    state.exams = (state.exams || []).filter((e) => e.id !== req.params.id);
    saveWorkspaceState(state);
    writeMasterFilesToRepoDisk(state);
    writeCatalogAndDocsToRepoDisk(state);
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // 3. Media & Attachments Vault (SHA-256 deduplicated binary storage)
  app.post('/api/workspace/media', (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as {
        fileName: string;
        mimeType: string;
        dataBase64: string;
        mediaType?: MediaAssetRecord['mediaType'];
        linkedEntityType?: MediaAssetRecord['linkedEntityType'];
        linkedEntityId?: string;
        captionAr?: string;
        captionEn?: string;
        tags?: string[];
        width?: number;
        height?: number;
        pageCount?: number;
        durationSeconds?: number;
      };
      if (!body.fileName || !body.dataBase64) {
        res.status(400).json({ error: 'اسم الملف ومحتواه مطلوبان.' });
        return;
      }
      const cleanB64 = body.dataBase64.includes(',')
        ? body.dataBase64.split(',')[1]
        : body.dataBase64;
      const buffer = Buffer.from(cleanB64, 'base64');
      const mimeType = body.mimeType || 'application/octet-stream';
      const saved = saveMediaBinary(body.fileName, mimeType, buffer);

      const inferredType: MediaAssetRecord['mediaType'] =
        body.mediaType ||
        (mimeType === 'image/svg+xml'
          ? 'diagram'
          : mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('audio/')
          ? 'audio'
          : mimeType.startsWith('video/')
          ? 'video'
          : mimeType.includes('pdf')
          ? 'pdf'
          : 'attachment');

      const now = new Date().toISOString();
      const existing = state.mediaAssets.find((m) => m.sha256 === saved.sha256);
      const record: MediaAssetRecord = existing
        ? {
            ...existing,
            mediaType: body.mediaType || existing.mediaType,
            linkedEntityType: body.linkedEntityType || existing.linkedEntityType,
            linkedEntityId: body.linkedEntityId ?? existing.linkedEntityId,
            captionAr: body.captionAr ?? existing.captionAr,
            captionEn: body.captionEn ?? existing.captionEn,
            tags: body.tags ?? existing.tags,
            width: body.width ?? existing.width,
            height: body.height ?? existing.height,
            pageCount: body.pageCount ?? existing.pageCount,
            durationSeconds: body.durationSeconds ?? existing.durationSeconds,
            downloadable: true,
            updatedAt: now
          }
        : {
            id: `media-${saved.sha256.slice(0, 12)}`,
            fileName: body.fileName,
            relativePath: saved.relativePath,
            mediaType: inferredType,
            mimeType,
            sizeBytes: saved.sizeBytes,
            sha256: saved.sha256,
            linkedEntityType: body.linkedEntityType || 'global',
            linkedEntityId: body.linkedEntityId,
            captionAr: body.captionAr,
            captionEn: body.captionEn,
            rawUrl: `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/${saved.relativePath}`,
            downloadable: true,
            tags: body.tags,
            width: body.width,
            height: body.height,
            pageCount: body.pageCount,
            durationSeconds: body.durationSeconds,
            createdAt: now,
            updatedAt: now
          };

      if (!existing) {
        state.mediaAssets.unshift(record);
      } else {
        state.mediaAssets = state.mediaAssets.map((m) => (m.id === existing.id ? record : m));
      }

      saveWorkspaceState(state);
      res.json({
        asset: record,
        deduplicated: Boolean(existing),
        state,
        validation: validateWorkspaceData(state)
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر حفظ المرفق في الخزنة'
      });
    }
  });

  app.get('/api/workspace/media/:id/file', (req, res) => {
    const state = loadWorkspaceState();
    const asset = state.mediaAssets.find((m) => m.id === req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'المرفق غير موجود' });
      return;
    }
    const bin = readMediaBinary(asset);
    if (!bin) {
      if (asset.rawUrl && asset.rawUrl.startsWith('http')) {
        res.redirect(asset.rawUrl);
        return;
      }
      res.status(404).json({ error: 'ملف المرفق غير متوفر محلياً' });
      return;
    }
    res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${asset.fileName}"`);
    res.send(bin);
  });

  app.delete('/api/workspace/media/:id', (req, res) => {
    const state = loadWorkspaceState();
    const target = state.mediaAssets.find((m) => m.id === req.params.id);
    if (target) {
      state.mediaAssets = state.mediaAssets.filter((m) => m.id !== req.params.id);
      deleteMediaBinaryIfUnused(target, state.mediaAssets);
      saveWorkspaceState(state);
    }
    res.json({ state, validation: validateWorkspaceData(state) });
  });

  // 4. Diff & Validation against live UMEDT-DATA
  app.get('/api/workspace/diff', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const token = extractToken(req);
      const remote = await fetchRemoteMasterData(
        state.meta.dataRepo,
        state.meta.branch || 'main',
        token
      );
      const diff = computeDiffAgainstRemote(state, remote);
      const validation = validateWorkspaceData(state);
      res.json({ diff, validation });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر حساب الفروقات مع المستودع البعيد'
      });
    }
  });

  // 5. Cryptographic Keypair Generation, History, Local Release Publishing & Rollback
  app.post('/api/release/generate-keys', async (_req, res) => {
    try {
      const keyPair = await generateEcdsaSigningKeyPair();
      res.json({ keyPair });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر توليد زوج مفاتيح ECDSA-P256'
      });
    }
  });

  app.get('/api/release/history', (req, res) => {
    const channel = req.query.channel === 'beta' ? 'beta' : 'stable';
    const history = loadReleaseHistory(channel);
    res.json({ channel, history });
  });

  app.post('/api/release/publish-local', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as {
        version?: string;
        channel?: 'stable' | 'beta';
        summary?: string;
        privateKeyPem?: string;
        publicKeyPem?: string;
        allowOverwrite?: boolean;
      };
      const version = body.version?.trim() || state.meta.dataVersion || '2026.11.0-umd';
      const channel: 'stable' | 'beta' = body.channel === 'beta' ? 'beta' : 'stable';
      const result = await publishLocalReleaseToDisk({
        state,
        version,
        channel,
        summary: body.summary?.trim() || `إصدار بيانات UMEDT-DATA v${version}`,
        privateKeyPem: body.privateKeyPem?.trim() || process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM,
        publicKeyPem: body.publicKeyPem?.trim() || process.env.VITE_UMED_PUBLIC_KEY_PEM,
        allowOverwrite: Boolean(body.allowOverwrite)
      });

      state.meta.dataVersion = version;
      state.meta.lastPublishedAt = new Date().toISOString();
      saveWorkspaceState(state);

      res.json({ success: true, ...result, state });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'تعذر نشر الإصدار محلياً'
      });
    }
  });

  app.post('/api/release/rollback', (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as { channel?: 'stable' | 'beta'; targetVersion?: string };
      const channel: 'stable' | 'beta' = body.channel === 'beta' ? 'beta' : 'stable';
      const targetVersion = body.targetVersion?.trim();
      if (!targetVersion) {
        res.status(400).json({ error: 'يجب تحديد رقم الإصدار المطلوب استعادته.' });
        return;
      }
      const restored = rollbackChannelRelease(channel, targetVersion, state.meta.dataRepo);
      state.meta.dataVersion = restored.restoredManifest.dataVersion;
      saveWorkspaceState(state);
      res.json({ success: true, ...restored, state });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'تعذر استعادة الإصدار السابق'
      });
    }
  });

  app.post('/api/release/build-zip', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const validation = validateWorkspaceData(state);
      if (!validation.valid) {
        res.status(400).json({
          error: validation.errors[0]?.messageAr || 'البيانات غير صالحة للبناء'
        });
        return;
      }
      const body = (req.body || {}) as {
        version?: string;
        channel?: 'stable' | 'beta';
        summary?: string;
        privateKeyPem?: string;
        publicKeyPem?: string;
      };
      const built = await buildSignedReleasePackage({
        state,
        version: body.version?.trim() || state.meta.dataVersion || '2026.11.0-umd',
        channel: body.channel === 'beta' ? 'beta' : 'stable',
        summary: body.summary?.trim() || 'تحديث البلوكات والمصطلحات والملحقات الطبية',
        privateKeyPem: body.privateKeyPem?.trim() || process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM,
        publicKeyPem: body.publicKeyPem?.trim() || process.env.VITE_UMED_PUBLIC_KEY_PEM,
        allowOverwrite: true
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${built.packageFileName}"`);
      res.setHeader('X-Release-Sha256', built.manifest.sha256);
      res.setHeader('X-Release-Signed', String(built.signed));
      res.send(built.zipBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر بناء حزمة التحديث'
      });
    }
  });

  // 6. Export Complete Ready-to-Push UMEDT-DATA Repository Bundle (ZIP)
  app.post('/api/export/umedt-data-repo', async (req, res) => {
    try {
      const state = loadWorkspaceState();
      const body = (req.body || {}) as {
        includeRelease?: boolean;
        version?: string;
        channel?: 'stable' | 'beta';
        summary?: string;
        privateKeyPem?: string;
        publicKeyPem?: string;
      };

      const zip = new JSZip();
      zip.file('README.md', generateUmedtDataReadme(state.meta.dataRepo));
      zip.file(
        '.github/workflows/publish-data-release.yml',
        generateUmedtDataWorkflowYml(state.meta.sourceRepo, state.meta.dataRepo)
      );
      zip.file('data/master/blocks.json', JSON.stringify(state.blocks, null, 2));
      zip.file('data/master/subjects.json', JSON.stringify(state.subjects, null, 2));
      zip.file('data/master/topics.json', JSON.stringify(state.topics, null, 2));
      zip.file('data/master/terms.json', JSON.stringify(state.terms, null, 2));
      zip.file('data/master/sentences.json', JSON.stringify(state.sentences, null, 2));
      zip.file('data/master/custom-affixes.json', JSON.stringify(state.customAffixes, null, 2));
      zip.file(
        'data/master/custom-abbreviations.json',
        JSON.stringify(state.customAbbreviations, null, 2)
      );
      zip.file('data/master/books.json', JSON.stringify(state.books || [], null, 2));
      zip.file('data/master/questions.json', JSON.stringify(state.questions, null, 2));
      zip.file('data/master/exams.json', JSON.stringify(state.exams || [], null, 2));
      zip.file('data/master/media-index.json', JSON.stringify(state.mediaAssets, null, 2));
      zip.file(
        'data/catalog.json',
        JSON.stringify(buildDataCatalogDocument(state, state.meta.dataRepo), null, 2)
      );
      const schemas = generateJsonSchemaFiles();
      for (const [schemaPath, content] of Object.entries(schemas)) {
        zip.file(schemaPath, content);
      }
      zip.file(
        'docs/UMEDT-DATA-API-CONTRACT.md',
        generateApiContractMarkdown(state.meta.dataRepo, state.meta.branch || 'main')
      );

      for (const asset of state.mediaAssets) {
        if (!asset.relativePath.startsWith('data/media/')) continue;
        const bin = readMediaBinary(asset);
        if (bin) {
          zip.file(asset.relativePath, bin);
        }
      }

      if (body.includeRelease) {
        const ch = body.channel === 'beta' ? 'beta' : 'stable';
        const built = await buildSignedReleasePackage({
          state,
          version: body.version?.trim() || state.meta.dataVersion || '2026.12.0-umd',
          channel: ch,
          summary: body.summary?.trim() || 'نشر بيانات UMEDT-DATA',
          privateKeyPem: body.privateKeyPem?.trim() || process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM,
          publicKeyPem: body.publicKeyPem?.trim() || process.env.VITE_UMED_PUBLIC_KEY_PEM,
          allowOverwrite: true
        });
        zip.file(`data/releases/${ch}/manifest.json`, built.manifestJsonText);
        zip.file(`data/releases/${ch}/CHANGELOG.md`, built.changelogMarkdown);
        zip.file(`data/releases/${ch}/history.json`, JSON.stringify(built.historyList, null, 2));
        zip.file(`data/releases/${ch}/${built.packageFileName}`, built.zipBuffer);
      }

      const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="UMEDT-DATA-repo-bundle.zip"');
      res.send(out);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تصدير حزمة المستودع'
      });
    }
  });

  // Unified Self-Describing Read API (/api/v1/*)
  app.get('/api/v1/catalog', (_req, res) => {
    const state = loadWorkspaceState();
    res.json(buildDataCatalogDocument(state, state.meta.dataRepo));
  });

  app.get('/api/v1/manifest', (req, res) => {
    const channel = req.query.channel === 'beta' ? 'beta' : 'stable';
    const manifestPath = path.resolve(process.cwd(), 'data', 'releases', channel, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        res.json(parsed);
        return;
      } catch {
        // fallback below
      }
    }
    res.status(404).json({ error: `لم يتم العثور على manifest للقناة ${channel}` });
  });

  app.get('/api/v1/collections', (_req, res) => {
    const state = loadWorkspaceState();
    const catalog = buildDataCatalogDocument(state, state.meta.dataRepo);
    res.json({
      catalogVersion: catalog.catalogVersion,
      generatedAt: catalog.generatedAt,
      collections: catalog.collections
    });
  });

  app.get('/api/v1/collections/:domain', (req, res) => {
    const domain = req.params.domain as keyof MasterDataCounts;
    const spec = COLLECTION_SPECS.find((s) => s.id === domain);
    if (!spec) {
      res.status(404).json({
        error: `النطاق غير معروف: ${req.params.domain}`,
        availableDomains: COLLECTION_SPECS.map((s) => s.id)
      });
      return;
    }

    const state = loadWorkspaceState();
    const catalog = buildDataCatalogDocument(state, state.meta.dataRepo);
    const descriptor = catalog.collections.find((c) => c.id === domain);
    let items = [...spec.getArray(state)] as Array<Record<string, unknown>>;

    const blockId = typeof req.query.blockId === 'string' ? req.query.blockId.trim() : '';
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId.trim() : '';
    const topicId = typeof req.query.topicId === 'string' ? req.query.topicId.trim() : '';
    const mediaType = typeof req.query.mediaType === 'string' ? req.query.mediaType.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    if (blockId) {
      items = items.filter(
        (it) =>
          it.blockId === blockId ||
          (Array.isArray(it.linkedBlockIds) && it.linkedBlockIds.includes(blockId)) ||
          (domain === 'blocks' && it.id === blockId)
      );
    }
    if (subjectId) {
      items = items.filter(
        (it) =>
          it.subjectId === subjectId ||
          (Array.isArray(it.linkedSubjectIds) && it.linkedSubjectIds.includes(subjectId)) ||
          (domain === 'subjects' && it.id === subjectId)
      );
    }
    if (topicId) {
      items = items.filter(
        (it) =>
          it.topicId === topicId ||
          (Array.isArray(it.topicIds) && it.topicIds.includes(topicId)) ||
          (Array.isArray(it.linkedTopicIds) && it.linkedTopicIds.includes(topicId)) ||
          (domain === 'topics' && it.id === topicId)
      );
    }
    if (mediaType) {
      items = items.filter((it) => it.mediaType === mediaType);
    }
    if (q) {
      items = items.filter((it) =>
        spec.searchableFields.some((field) => {
          const val = it[field];
          if (typeof val === 'string') return val.toLowerCase().includes(q);
          if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(q));
          return false;
        })
      );
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit);

    res.json({
      domain,
      contentType: spec.contentType,
      rendererType: spec.rendererType,
      sha256: descriptor?.sha256,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: paged,
      envelopes: paged.map((item) => wrapRecordInUnifiedEnvelope(domain, item, state))
    });
  });

  app.get('/api/v1/content/:domain/:id', (req, res) => {
    const domain = req.params.domain as keyof MasterDataCounts;
    const spec = COLLECTION_SPECS.find((s) => s.id === domain);
    if (!spec) {
      res.status(404).json({ error: `النطاق غير معروف: ${req.params.domain}` });
      return;
    }
    const state = loadWorkspaceState();
    const record = (spec.getArray(state) as Array<{ id?: string }>).find(
      (item) => item?.id === req.params.id
    );
    if (!record) {
      res.status(404).json({ error: `لم يتم العثور على السجل ${req.params.id} في ${domain}` });
      return;
    }
    res.json(wrapRecordInUnifiedEnvelope(domain, record, state));
  });

  app.get('/api/v1/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const domainFilter = typeof req.query.domain === 'string' ? req.query.domain.trim() : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    if (!q) {
      res.status(400).json({ error: 'معامل البحث q مطلوب.' });
      return;
    }

    const state = loadWorkspaceState();
    const results = [];
    for (const spec of COLLECTION_SPECS) {
      if (domainFilter && spec.id !== domainFilter) continue;
      for (const raw of spec.getArray(state) as Array<Record<string, unknown>>) {
        const matched = spec.searchableFields.some((field) => {
          const val = raw[field];
          if (typeof val === 'string') return val.toLowerCase().includes(q);
          if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(q));
          return false;
        });
        if (matched) {
          results.push(wrapRecordInUnifiedEnvelope(spec.id, raw, state));
          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }

    res.json({ query: q, total: results.length, results });
  });

  app.get('/api/v1/sync/plan', (req, res) => {
    const state = loadWorkspaceState();
    const catalog = buildDataCatalogDocument(state, state.meta.dataRepo);
    let clientHashes: Record<string, string> = {};
    if (typeof req.query.hashes === 'string' && req.query.hashes.trim()) {
      try {
        clientHashes = JSON.parse(req.query.hashes) as Record<string, string>;
      } catch {
        res.status(400).json({ error: 'صيغة JSON غير صالحة في معامل hashes.' });
        return;
      }
    }

    const changedCollections = catalog.collections.filter(
      (c) => clientHashes[c.id] !== c.sha256
    );
    const unchangedDomains = catalog.collections
      .filter((c) => clientHashes[c.id] === c.sha256)
      .map((c) => c.id);

    res.json({
      catalogVersion: catalog.catalogVersion,
      generatedAt: catalog.generatedAt,
      upToDate: changedCollections.length === 0,
      changedCount: changedCollections.length,
      changedCollections,
      unchangedDomains
    });
  });

  // Serve local data/ and docs/ directories over HTTP for verification and direct inspection
  app.use('/raw/data', express.static(path.resolve(process.cwd(), 'data')));
  app.use('/raw/docs', express.static(path.resolve(process.cwd(), 'docs')));

  // 7. Direct Atomic GitHub Push to Alssaedy50/UMEDT-DATA
  app.post('/api/github/publish-data', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).json({
          error: 'مطلوب رمز GitHub Personal Access Token (PAT) بصلاحية repo للنشر المباشر.'
        });
        return;
      }

      const state = loadWorkspaceState();
      const validation = validateWorkspaceData(state);
      if (!validation.valid) {
        res.status(400).json({
          error: validation.errors[0]?.messageAr || 'فشل التحقق من صحة البيانات قبل النشر'
        });
        return;
      }

      const body = (req.body || {}) as {
        commitMessage?: string;
        includeWorkflowUpgrade?: boolean;
        buildRelease?: boolean;
        version?: string;
        channel?: 'stable' | 'beta';
        summary?: string;
        privateKeyPem?: string;
        publicKeyPem?: string;
        allowOverwrite?: boolean;
      };

      const version = body.version?.trim() || state.meta.dataVersion || '2026.11.0-umd';
      const channel: 'stable' | 'beta' = body.channel === 'beta' ? 'beta' : 'stable';

      let releaseArtifacts:
        | {
            channel: 'stable' | 'beta';
            version: string;
            sha256: string;
            packageFileName: string;
            zipBuffer: Buffer;
            manifestJsonText: string;
            changelogMarkdown: string;
            historyJsonText: string;
          }
        | undefined;

      if (body.buildRelease) {
        const built = await buildSignedReleasePackage({
          state,
          version,
          channel,
          summary: body.summary?.trim() || `تحديث بيانات UMEDT v${version}`,
          privateKeyPem: body.privateKeyPem?.trim() || process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM,
          publicKeyPem: body.publicKeyPem?.trim() || process.env.VITE_UMED_PUBLIC_KEY_PEM,
          allowOverwrite: Boolean(body.allowOverwrite)
        });
        releaseArtifacts = {
          channel,
          version,
          sha256: built.manifest.sha256,
          packageFileName: built.packageFileName,
          zipBuffer: built.zipBuffer,
          manifestJsonText: built.manifestJsonText,
          changelogMarkdown: built.changelogMarkdown,
          historyJsonText: JSON.stringify(built.historyList, null, 2)
        };
      }

      const counts = computeWorkspaceCounts(state);
      const commitMessage =
        body.commitMessage?.trim() ||
        `feat(data): publish ${counts.blocks} blocks, ${counts.terms} terms, ${counts.mediaAssets} media (${version})`;

      const published = await publishAtomicCommitToUmedtData({
        state,
        token,
        commitMessage,
        includeWorkflowUpgrade: body.includeWorkflowUpgrade !== false,
        releaseArtifacts,
        allowOverwrite: Boolean(body.allowOverwrite)
      });

      // Keep local disk data/ synchronized after successful remote commit
      await publishLocalReleaseToDisk({
        state,
        version,
        channel,
        summary: body.summary?.trim() || `تحديث بيانات UMEDT v${version}`,
        privateKeyPem: body.privateKeyPem?.trim() || process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM,
        publicKeyPem: body.publicKeyPem?.trim() || process.env.VITE_UMED_PUBLIC_KEY_PEM,
        allowOverwrite: true
      }).catch(() => undefined);

      state.meta.dataVersion = version;
      state.meta.lastPublishedAt = new Date().toISOString();
      state.meta.lastCommitSha = published.commitSha;
      saveWorkspaceState(state);

      res.json({
        success: true,
        ...published,
        state
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'فشل النشر إلى مستودع UMEDT-DATA'
      });
    }
  });

  // 8. Safe Non-Destructive UMEDT Integration Patch (Preview, Download ZIP, or Open PR)
  app.get('/api/integration/patch-files', (_req, res) => {
    const state = loadWorkspaceState();
    const files = getUmedtIntegrationPatchFiles(state.meta.sourceRepo, state.meta.dataRepo);
    res.json({ files });
  });

  app.get('/api/integration/download-patch', async (_req, res) => {
    const state = loadWorkspaceState();
    const files = getUmedtIntegrationPatchFiles(state.meta.sourceRepo, state.meta.dataRepo);
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.path, f.content);
    }
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="UMEDT-non-destructive-sync-patch.zip"');
    res.send(out);
  });

  app.post('/api/integration/create-pr', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).json({
          error: 'مطلوب رمز GitHub Personal Access Token لفتح Pull Request آمن على UMEDT.'
        });
        return;
      }
      const state = loadWorkspaceState();
      const pr = await createIntegrationPrOnUmedt({
        sourceRepo: state.meta.sourceRepo,
        dataRepo: state.meta.dataRepo,
        token
      });
      res.json({ success: true, ...pr });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر فتح Pull Request على مستودع UMEDT'
      });
    }
  });

  // Vite middleware in dev / static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UMEDT Data Hub running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
