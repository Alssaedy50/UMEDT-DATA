import vm from 'node:vm';
import type {
  AcademicBookResource,
  AcademicExamPackage,
  ClinicalAbbreviation,
  DictionaryTerm,
  GitHubFileEntry,
  GitHubRepoOverview,
  LinkedSentence,
  MasterDataCounts,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  MediaAssetRecord,
  TopicArticle,
  UnifiedQuizQuestion,
  WorkspaceDataState
} from '../src/types/umedtData.ts';
import { sha256Hex } from './cryptoRelease.ts';
import { readMediaBinary, saveMediaBinary } from './workspaceStore.ts';
import {
  buildDataCatalogDocument,
  generateApiContractMarkdown,
  generateJsonSchemaFiles
} from './catalogGenerator.ts';
import {
  generateUmedtDataReadme,
  generateUmedtDataWorkflowYml,
  getUmedtIntegrationPatchFiles
} from './umedtTemplates.ts';

function buildGitHubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'UMEDT-Data-Hub/1.0'
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function fetchJsonSafe<T>(url: string, token?: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: token ? buildGitHubHeaders(token) : { 'User-Agent': 'UMEDT-Data-Hub/1.0' }
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTextSafe(url: string, token?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: token ? buildGitHubHeaders(token) : { 'User-Agent': 'UMEDT-Data-Hub/1.0' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function emptyCounts(): MasterDataCounts {
  return {
    blocks: 0,
    subjects: 0,
    topics: 0,
    terms: 0,
    sentences: 0,
    customAffixes: 0,
    customAbbreviations: 0,
    books: 0,
    questions: 0,
    exams: 0,
    mediaAssets: 0
  };
}

export async function fetchRepoOverview(
  repoFullName: string,
  token?: string
): Promise<GitHubRepoOverview> {
  const cleanRepo = repoFullName.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const repoInfo = await fetchJsonSafe<{
    full_name: string;
    private: boolean;
    default_branch: string;
    description: string | null;
    pushed_at: string | null;
    html_url: string;
  }>(`https://api.github.com/repos/${cleanRepo}`, token);

  if (!repoInfo) {
    return {
      fullName: cleanRepo,
      exists: false,
      private: false,
      defaultBranch: 'main',
      description: null,
      pushedAt: null,
      htmlUrl: `https://github.com/${cleanRepo}`,
      latestCommit: null,
      masterFiles: [],
      mediaFilesCount: 0,
      stableManifest: null,
      betaManifest: null,
      counts: emptyCounts(),
      error: `تعذر الوصول إلى المستودع ${cleanRepo} عبر GitHub API (تحقق من الاسم أو الصلاحيات).`
    };
  }

  const branch = repoInfo.default_branch || 'main';
  const [commits, masterDir, mediaDir, stableManifest, betaManifest] = await Promise.all([
    fetchJsonSafe<
      Array<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>
    >(`https://api.github.com/repos/${cleanRepo}/commits?sha=${branch}&per_page=1`, token),
    fetchJsonSafe<
      Array<{
        name: string;
        path: string;
        size: number;
        sha: string;
        download_url: string | null;
        type: string;
      }>
    >(`https://api.github.com/repos/${cleanRepo}/contents/data/master?ref=${branch}`, token),
    fetchJsonSafe<Array<{ name: string; type: string }>>(
      `https://api.github.com/repos/${cleanRepo}/contents/data/media?ref=${branch}`,
      token
    ),
    fetchJsonSafe<Record<string, unknown>>(
      `https://raw.githubusercontent.com/${cleanRepo}/${branch}/data/releases/stable/manifest.json`,
      token
    ),
    fetchJsonSafe<Record<string, unknown>>(
      `https://raw.githubusercontent.com/${cleanRepo}/${branch}/data/releases/beta/manifest.json`,
      token
    )
  ]);

  const masterFiles: GitHubFileEntry[] = Array.isArray(masterDir)
    ? masterDir
        .filter((f) => f.type === 'file')
        .map((f) => ({
          name: f.name,
          path: f.path,
          size: f.size,
          sha: f.sha,
          downloadUrl: f.download_url
        }))
    : [];

  const counts = emptyCounts();
  const countMap: Array<[string, keyof MasterDataCounts]> = [
    ['blocks.json', 'blocks'],
    ['subjects.json', 'subjects'],
    ['topics.json', 'topics'],
    ['terms.json', 'terms'],
    ['sentences.json', 'sentences'],
    ['custom-affixes.json', 'customAffixes'],
    ['custom-abbreviations.json', 'customAbbreviations'],
    ['books.json', 'books'],
    ['questions.json', 'questions'],
    ['exams.json', 'exams'],
    ['media-index.json', 'mediaAssets']
  ];

  await Promise.all(
    countMap.map(async ([fileName, key]) => {
      const entry = masterFiles.find((f) => f.name === fileName);
      if (!entry) return;
      const rawUrl =
        entry.downloadUrl ||
        `https://raw.githubusercontent.com/${cleanRepo}/${branch}/data/master/${fileName}`;
      const arr = await fetchJsonSafe<unknown[]>(rawUrl, token);
      if (Array.isArray(arr)) {
        counts[key] = arr.length;
      }
    })
  );

  const mediaFilesCount = Array.isArray(mediaDir)
    ? mediaDir.filter((f) => f.type === 'file' && f.name !== '.gitkeep').length
    : 0;

  if (counts.mediaAssets === 0 && mediaFilesCount > 0) {
    counts.mediaAssets = mediaFilesCount;
  }

  const latest = Array.isArray(commits) && commits[0] ? commits[0] : null;

  return {
    fullName: repoInfo.full_name,
    exists: true,
    private: repoInfo.private,
    defaultBranch: branch,
    description: repoInfo.description,
    pushedAt: repoInfo.pushed_at,
    htmlUrl: repoInfo.html_url,
    latestCommit: latest
      ? {
          sha: latest.sha,
          message: latest.commit.message,
          date: latest.commit.author.date,
          authorName: latest.commit.author.name
        }
      : null,
    masterFiles,
    mediaFilesCount,
    stableManifest,
    betaManifest,
    counts
  };
}

function extractTsExportLiteral<T>(source: string, exportName: string, openChar: '[' | '{'): T | null {
  const marker = `export const ${exportName}`;
  const idx = source.indexOf(marker);
  const altMarker = `const ${exportName}`;
  const startPos = idx >= 0 ? idx : source.indexOf(altMarker);
  if (startPos < 0) return null;

  const eqIdx = source.indexOf('=', startPos);
  if (eqIdx < 0) return null;
  const openIdx = source.indexOf(openChar, eqIdx);
  if (openIdx < 0) return null;

  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;

  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      continue;
    }
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(openIdx, i + 1);
        try {
          return vm.runInNewContext(`(${literal})`, Object.create(null)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function inferTopicHierarchy(
  topic: TopicArticle,
  blockIds: Set<string>
): { blockId: string; subjectId: string } {
  if (topic.blockId && topic.subjectId && blockIds.has(topic.blockId)) {
    return { blockId: topic.blockId, subjectId: topic.subjectId };
  }
  const idLower = (topic.id || '').toLowerCase();
  const combined = `${topic.title || ''} ${topic.subtitle || ''} ${topic.author || ''}`.toLowerCase();
  if (
    idLower.startsWith('topic-heme') ||
    combined.includes('hematology') ||
    combined.includes('anemia') ||
    combined.includes('leukemia')
  ) {
    return { blockId: 'block-hematology', subjectId: 'subj-hematology' };
  }
  if (
    idLower.startsWith('pt-parasito') ||
    combined.includes('parasitol') ||
    combined.includes('helminth') ||
    combined.includes('nematode') ||
    combined.includes('cestode') ||
    combined.includes('trematode')
  ) {
    return { blockId: 'block-infectious', subjectId: 'subj-parasitology' };
  }
  if (topic.category === 'Medical') {
    return { blockId: 'block-clinical-medicine', subjectId: 'subj-cardiology' };
  }
  return { blockId: 'block-informatics', subjectId: 'subj-medical-ai' };
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

export async function importSeedFromUmedtRepo(
  sourceRepo: string,
  dataRepo: string,
  currentState: WorkspaceDataState,
  token?: string
): Promise<WorkspaceDataState> {
  const cleanSource = sourceRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const baseRaw = `https://raw.githubusercontent.com/${cleanSource}/main`;

  const [
    termsRaw,
    sentencesRaw,
    topicsRaw,
    affixesRaw,
    abbrsRaw,
    hierarchyTs
  ] = await Promise.all([
    fetchJsonSafe<DictionaryTerm[]>(`${baseRaw}/data/master/terms.json`, token),
    fetchJsonSafe<LinkedSentence[]>(`${baseRaw}/data/master/sentences.json`, token),
    fetchJsonSafe<TopicArticle[]>(`${baseRaw}/data/master/topics.json`, token),
    fetchJsonSafe<MorphologicalAffix[]>(`${baseRaw}/data/master/custom-affixes.json`, token),
    fetchJsonSafe<ClinicalAbbreviation[]>(`${baseRaw}/data/master/custom-abbreviations.json`, token),
    fetchTextSafe(`${baseRaw}/src/services/learningHierarchyService.ts`, token)
  ]);

  const extractedBlocks = hierarchyTs
    ? extractTsExportLiteral<MedicalBlock[]>(hierarchyTs, 'INITIAL_MEDICAL_BLOCKS', '[') || []
    : [];
  const extractedSubjects = hierarchyTs
    ? extractTsExportLiteral<MedicalSubject[]>(hierarchyTs, 'INITIAL_MEDICAL_SUBJECTS', '[') || []
    : [];
  const curatedTitles = hierarchyTs
    ? extractTsExportLiteral<Record<string, { titleEn: string; titleAr: string }>>(
        hierarchyTs,
        'CURATED_TOPIC_ENGLISH_TITLES',
        '{'
      ) || {}
    : {};

  const blockIds = new Set(extractedBlocks.map((b) => b.id));
  const mediaAssetsMap = new Map<string, MediaAssetRecord>();
  const nowIso = new Date().toISOString();

  const hydratedTopics: TopicArticle[] = (Array.isArray(topicsRaw) ? topicsRaw : []).map((tp) => {
    const inferred = inferTopicHierarchy(tp, blockIds);
    const curated = curatedTitles[tp.id];
    const nextTopic: TopicArticle = {
      ...tp,
      blockId: tp.blockId || inferred.blockId,
      subjectId: tp.subjectId || inferred.subjectId,
      titleEn: tp.titleEn || curated?.titleEn || tp.title,
      titleAr: tp.titleAr || curated?.titleAr || tp.title,
      sections: Array.isArray(tp.sections) ? tp.sections : [],
      images: Array.isArray(tp.images) ? tp.images : [],
      links: Array.isArray(tp.links) ? tp.links : [],
      attachments: Array.isArray(tp.attachments) ? tp.attachments : []
    };

    // Extract topic images and attachments into unified mediaAssets registry
    for (const img of nextTopic.images) {
      if (!img?.url) continue;
      const parsed = img.url.startsWith('data:') ? parseDataUrl(img.url) : null;
      if (parsed) {
        const ext = parsed.mimeType.split('/')[1]?.split('+')[0] || 'png';
        const fname = img.fileName || `${img.id || 'image'}.${ext}`;
        const saved = saveMediaBinary(fname, parsed.mimeType, parsed.buffer);
        if (!mediaAssetsMap.has(saved.sha256)) {
          mediaAssetsMap.set(saved.sha256, {
            id: `media-${saved.sha256.slice(0, 12)}`,
            fileName: fname,
            relativePath: saved.relativePath,
            mediaType: 'image',
            mimeType: parsed.mimeType,
            sizeBytes: saved.sizeBytes,
            sha256: saved.sha256,
            linkedEntityType: 'topic',
            linkedEntityId: nextTopic.id,
            captionAr: img.caption,
            rawUrl: `https://raw.githubusercontent.com/${dataRepo}/main/${saved.relativePath}`,
            createdAt: nowIso,
            updatedAt: nowIso
          });
        }
      } else {
        const hash = sha256Hex(`url:${img.url}`);
        if (!mediaAssetsMap.has(hash)) {
          mediaAssetsMap.set(hash, {
            id: img.id || `media-${hash.slice(0, 12)}`,
            fileName: img.fileName || `${img.id || 'diagram'}.url`,
            relativePath: img.url,
            mediaType: 'image',
            mimeType: img.mimeType || 'image/jpeg',
            sizeBytes: img.sizeBytes || 0,
            sha256: hash,
            linkedEntityType: 'topic',
            linkedEntityId: nextTopic.id,
            captionAr: img.caption,
            rawUrl: img.url,
            createdAt: nowIso,
            updatedAt: nowIso
          });
        }
      }
    }

    for (const att of nextTopic.attachments) {
      if (!att) continue;
      const content = att.contentDataUrlOrText || '';
      const parsed = content.startsWith('data:') ? parseDataUrl(content) : null;
      const buffer = parsed ? parsed.buffer : Buffer.from(content, 'utf8');
      const mime = parsed?.mimeType || att.mimeType || 'text/plain';
      const saved = saveMediaBinary(att.fileName || `${att.id}.txt`, mime, buffer);
      if (!mediaAssetsMap.has(saved.sha256)) {
        mediaAssetsMap.set(saved.sha256, {
          id: att.id || `att-${saved.sha256.slice(0, 12)}`,
          fileName: att.fileName,
          relativePath: saved.relativePath,
          mediaType: mime.includes('pdf') ? 'pdf' : 'attachment',
          mimeType: mime,
          sizeBytes: saved.sizeBytes,
          sha256: saved.sha256,
          linkedEntityType: 'topic',
          linkedEntityId: nextTopic.id,
          captionAr: `مرفق: ${att.fileName}`,
          rawUrl: `https://raw.githubusercontent.com/${dataRepo}/main/${saved.relativePath}`,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
    }

    return nextTopic;
  });

  // Extract inline questions if any exist inside topic contentBlocks
  const extractedQuestions: UnifiedQuizQuestion[] = [];
  for (const tp of hydratedTopics) {
    for (const sec of tp.sections) {
      for (const cb of sec.contentBlocks || []) {
        const anyCb = cb as unknown as { inlineQuestion?: UnifiedQuizQuestion };
        if (anyCb.inlineQuestion && anyCb.inlineQuestion.id) {
          extractedQuestions.push(anyCb.inlineQuestion);
        }
      }
    }
  }

  return {
    meta: {
      ...currentState.meta,
      sourceRepo: cleanSource,
      dataRepo,
      lastImportedFromUmedtAt: nowIso
    },
    blocks: extractedBlocks,
    subjects: extractedSubjects,
    topics: hydratedTopics,
    terms: Array.isArray(termsRaw) ? termsRaw : [],
    sentences: Array.isArray(sentencesRaw) ? sentencesRaw : [],
    customAffixes: Array.isArray(affixesRaw) ? affixesRaw : [],
    customAbbreviations: Array.isArray(abbrsRaw) ? abbrsRaw : [],
    books: currentState.books || [],
    questions: extractedQuestions.length > 0 ? extractedQuestions : currentState.questions || [],
    exams: currentState.exams || [],
    mediaAssets: Array.from(mediaAssetsMap.values())
  };
}

export async function fetchRemoteMasterData(
  dataRepo: string,
  branch = 'main',
  token?: string
): Promise<Partial<WorkspaceDataState>> {
  const cleanData = dataRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const baseRaw = `https://raw.githubusercontent.com/${cleanData}/${branch}/data/master`;

  const [
    blocks,
    subjects,
    topics,
    terms,
    sentences,
    customAffixes,
    customAbbreviations,
    books,
    questions,
    exams,
    mediaAssets
  ] = await Promise.all([
    fetchJsonSafe<MedicalBlock[]>(`${baseRaw}/blocks.json`, token),
    fetchJsonSafe<MedicalSubject[]>(`${baseRaw}/subjects.json`, token),
    fetchJsonSafe<TopicArticle[]>(`${baseRaw}/topics.json`, token),
    fetchJsonSafe<DictionaryTerm[]>(`${baseRaw}/terms.json`, token),
    fetchJsonSafe<LinkedSentence[]>(`${baseRaw}/sentences.json`, token),
    fetchJsonSafe<MorphologicalAffix[]>(`${baseRaw}/custom-affixes.json`, token),
    fetchJsonSafe<ClinicalAbbreviation[]>(`${baseRaw}/custom-abbreviations.json`, token),
    fetchJsonSafe<AcademicBookResource[]>(`${baseRaw}/books.json`, token),
    fetchJsonSafe<UnifiedQuizQuestion[]>(`${baseRaw}/questions.json`, token),
    fetchJsonSafe<AcademicExamPackage[]>(`${baseRaw}/exams.json`, token),
    fetchJsonSafe<MediaAssetRecord[]>(`${baseRaw}/media-index.json`, token)
  ]);

  return {
    blocks: Array.isArray(blocks) ? blocks : [],
    subjects: Array.isArray(subjects) ? subjects : [],
    topics: Array.isArray(topics) ? topics : [],
    terms: Array.isArray(terms) ? terms : [],
    sentences: Array.isArray(sentences) ? sentences : [],
    customAffixes: Array.isArray(customAffixes) ? customAffixes : [],
    customAbbreviations: Array.isArray(customAbbreviations) ? customAbbreviations : [],
    books: Array.isArray(books) ? books : [],
    questions: Array.isArray(questions) ? questions : [],
    exams: Array.isArray(exams) ? exams : [],
    mediaAssets: Array.isArray(mediaAssets) ? mediaAssets : []
  };
}

interface GitBlobPayload {
  path: string;
  content: string | Buffer;
  encoding: 'utf-8' | 'base64';
}

async function ghApi<T>(
  url: string,
  token: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...buildGitHubHeaders(token),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `GitHub API error (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) msg = `${msg}: ${parsed.message}`;
    } catch {
      if (text) msg = `${msg}: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function publishAtomicCommitToUmedtData(options: {
  state: WorkspaceDataState;
  token: string;
  commitMessage: string;
  includeWorkflowUpgrade: boolean;
  releaseArtifacts?: {
    channel: 'stable' | 'beta';
    version: string;
    sha256: string;
    packageFileName: string;
    zipBuffer: Buffer;
    manifestJsonText: string;
    changelogMarkdown: string;
    historyJsonText: string;
  };
  allowOverwrite?: boolean;
}): Promise<{
  commitSha: string;
  commitUrl: string;
  filesCommitted: number;
}> {
  const { state, token, commitMessage, includeWorkflowUpgrade, releaseArtifacts } = options;
  const repo = state.meta.dataRepo.trim();
  const branch = state.meta.branch || 'main';
  const apiBase = `https://api.github.com/repos/${repo}`;

  // 0. Verify write permissions and protect against overwriting an already-published version
  const repoMeta = await ghApi<{ permissions?: { push?: boolean } }>(apiBase, token);
  if (repoMeta.permissions && repoMeta.permissions.push === false) {
    throw new Error(
      `الرمز المقدم لا يملك صلاحية الكتابة (push) على المستودع ${repo}.`
    );
  }

  if (releaseArtifacts && !options.allowOverwrite) {
    const existingRemoteManifest = await fetchJsonSafe<{
      dataVersion?: string;
      sha256?: string;
    }>(
      `https://raw.githubusercontent.com/${repo}/${branch}/data/releases/${releaseArtifacts.channel}/manifest.json`,
      token
    );
    if (
      existingRemoteManifest?.dataVersion === releaseArtifacts.version &&
      existingRemoteManifest.sha256 &&
      existingRemoteManifest.sha256 !== releaseArtifacts.sha256
    ) {
      throw new Error(
        `الإصدار ${releaseArtifacts.version} منشور مسبقاً على ${repo} ببصمة مختلفة. يرجى ترقية رقم الإصدار لمنع الكتابة فوق إصدار معتمد.`
      );
    }
  }

  const schemas = generateJsonSchemaFiles();
  const files: GitBlobPayload[] = [
    { path: 'data/master/blocks.json', content: JSON.stringify(state.blocks, null, 2), encoding: 'utf-8' },
    { path: 'data/master/subjects.json', content: JSON.stringify(state.subjects, null, 2), encoding: 'utf-8' },
    { path: 'data/master/topics.json', content: JSON.stringify(state.topics, null, 2), encoding: 'utf-8' },
    { path: 'data/master/terms.json', content: JSON.stringify(state.terms, null, 2), encoding: 'utf-8' },
    { path: 'data/master/sentences.json', content: JSON.stringify(state.sentences, null, 2), encoding: 'utf-8' },
    { path: 'data/master/custom-affixes.json', content: JSON.stringify(state.customAffixes, null, 2), encoding: 'utf-8' },
    {
      path: 'data/master/custom-abbreviations.json',
      content: JSON.stringify(state.customAbbreviations, null, 2),
      encoding: 'utf-8'
    },
    { path: 'data/master/books.json', content: JSON.stringify(state.books || [], null, 2), encoding: 'utf-8' },
    { path: 'data/master/questions.json', content: JSON.stringify(state.questions, null, 2), encoding: 'utf-8' },
    { path: 'data/master/exams.json', content: JSON.stringify(state.exams || [], null, 2), encoding: 'utf-8' },
    { path: 'data/master/media-index.json', content: JSON.stringify(state.mediaAssets, null, 2), encoding: 'utf-8' },
    {
      path: 'data/catalog.json',
      content: JSON.stringify(buildDataCatalogDocument(state, repo), null, 2),
      encoding: 'utf-8'
    },
    ...Object.entries(schemas).map(([schemaPath, content]) => ({
      path: schemaPath,
      content,
      encoding: 'utf-8' as const
    })),
    {
      path: 'docs/UMEDT-DATA-API-CONTRACT.md',
      content: generateApiContractMarkdown(repo, branch),
      encoding: 'utf-8'
    }
  ];

  if (includeWorkflowUpgrade) {
    files.push({
      path: 'README.md',
      content: generateUmedtDataReadme(repo),
      encoding: 'utf-8'
    });
    files.push({
      path: '.github/workflows/publish-data-release.yml',
      content: generateUmedtDataWorkflowYml(state.meta.sourceRepo, repo),
      encoding: 'utf-8'
    });
  }

  for (const asset of state.mediaAssets) {
    if (!asset.relativePath.startsWith('data/media/')) continue;
    const bin = readMediaBinary(asset);
    if (bin) {
      files.push({
        path: asset.relativePath,
        content: bin,
        encoding: 'base64'
      });
    }
  }

  if (releaseArtifacts) {
    const relPrefix = `data/releases/${releaseArtifacts.channel}`;
    files.push({
      path: `${relPrefix}/manifest.json`,
      content: releaseArtifacts.manifestJsonText,
      encoding: 'utf-8'
    });
    files.push({
      path: `${relPrefix}/CHANGELOG.md`,
      content: releaseArtifacts.changelogMarkdown,
      encoding: 'utf-8'
    });
    files.push({
      path: `${relPrefix}/history.json`,
      content: releaseArtifacts.historyJsonText,
      encoding: 'utf-8'
    });
    files.push({
      path: `${relPrefix}/${releaseArtifacts.packageFileName}`,
      content: releaseArtifacts.zipBuffer,
      encoding: 'base64'
    });
  }

  // 1. Get HEAD ref & base tree
  const ref = await ghApi<{ object: { sha: string } }>(
    `${apiBase}/git/ref/heads/${branch}`,
    token
  );
  const headCommitSha = ref.object.sha;
  const headCommit = await ghApi<{ tree: { sha: string } }>(
    `${apiBase}/git/commits/${headCommitSha}`,
    token
  );

  // 2. Create blobs sequentially in small batches to respect GitHub rate limits
  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const file of files) {
    const encodedContent =
      file.encoding === 'base64'
        ? Buffer.isBuffer(file.content)
          ? file.content.toString('base64')
          : Buffer.from(file.content).toString('base64')
        : String(file.content);

    const blob = await ghApi<{ sha: string }>(`${apiBase}/git/blobs`, token, 'POST', {
      content: encodedContent,
      encoding: file.encoding
    });
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  // 3. Create tree, commit, and update branch ref
  const tree = await ghApi<{ sha: string }>(`${apiBase}/git/trees`, token, 'POST', {
    base_tree: headCommit.tree.sha,
    tree: treeItems
  });

  const commit = await ghApi<{ sha: string; html_url: string }>(
    `${apiBase}/git/commits`,
    token,
    'POST',
    {
      message: commitMessage,
      tree: tree.sha,
      parents: [headCommitSha]
    }
  );

  await ghApi(`${apiBase}/git/refs/heads/${branch}`, token, 'PATCH', {
    sha: commit.sha,
    force: false
  });

  return {
    commitSha: commit.sha,
    commitUrl: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}`,
    filesCommitted: files.length
  };
}

export async function createIntegrationPrOnUmedt(options: {
  sourceRepo: string;
  dataRepo: string;
  token: string;
}): Promise<{ prUrl: string; prNumber: number; branchName: string }> {
  const { sourceRepo, dataRepo, token } = options;
  const apiBase = `https://api.github.com/repos/${sourceRepo}`;
  const repoInfo = await ghApi<{ default_branch: string }>(apiBase, token);
  const baseBranch = repoInfo.default_branch || 'main';

  const ref = await ghApi<{ object: { sha: string } }>(
    `${apiBase}/git/ref/heads/${baseBranch}`,
    token
  );
  const baseSha = ref.object.sha;
  const baseCommit = await ghApi<{ tree: { sha: string } }>(
    `${apiBase}/git/commits/${baseSha}`,
    token
  );

  const branchName = `chore/umedt-data-integration-${Date.now()}`;
  await ghApi(`${apiBase}/git/refs`, token, 'POST', {
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });

  const patchFiles = getUmedtIntegrationPatchFiles(sourceRepo, dataRepo);
  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const pf of patchFiles) {
    const blob = await ghApi<{ sha: string }>(`${apiBase}/git/blobs`, token, 'POST', {
      content: pf.content,
      encoding: 'utf-8'
    });
    treeItems.push({
      path: pf.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  const tree = await ghApi<{ sha: string }>(`${apiBase}/git/trees`, token, 'POST', {
    base_tree: baseCommit.tree.sha,
    tree: treeItems
  });

  const commit = await ghApi<{ sha: string }>(`${apiBase}/git/commits`, token, 'POST', {
    message: `feat(data-sync): integrate non-destructive UMEDT-DATA client (${dataRepo})`,
    tree: tree.sha,
    parents: [baseSha]
  });

  await ghApi(`${apiBase}/git/refs/heads/${branchName}`, token, 'PATCH', {
    sha: commit.sha,
    force: false
  });

  const pr = await ghApi<{ html_url: string; number: number }>(
    `${apiBase}/pulls`,
    token,
    'POST',
    {
      title: `ربط مستودع البيانات المستقل ${dataRepo} (بدون المساس بالكود أو بيانات المستخدم)`,
      head: branchName,
      base: baseBranch,
      body: [
        `يضيف هذا الطلب الموحّد عميل \`src/services/umedtDataRepoClient.ts\` وتوثيق \`docs/UMEDT-DATA_SEPARATION.md\`.`,
        `- يقرأ البلوكات والمواد والمواضيع والمصطلحات والملحقات من \`${dataRepo}\`.`,
        `- يحافظ على \`favorite\` و \`srsData\` و \`studyStats\` المحلية للمستخدم دون أي استبدال أو تلف.`
      ].join('\n')
    }
  );

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
    branchName
  };
}
