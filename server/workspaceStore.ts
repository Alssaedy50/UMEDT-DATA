import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  MasterDataCounts,
  MediaAssetRecord,
  ReleaseHistoryRecord,
  WorkspaceDataState
} from '../src/types/umedtData.ts';

import {
  buildDataCatalogDocument,
  generateApiContractMarkdown,
  generateJsonSchemaFiles
} from './catalogGenerator.ts';

const REPO_ROOT = process.cwd();
// Set UMEDT_WORKSPACE_DIR to a persistent mounted directory on ephemeral/serverless hosts.
const CACHE_ROOT = process.env.UMEDT_WORKSPACE_DIR?.trim()
  ? path.resolve(process.env.UMEDT_WORKSPACE_DIR.trim())
  : path.resolve(REPO_ROOT, '.umedt-hub-cache');
const WORKSPACE_FILE = path.join(CACHE_ROOT, 'workspace.json');
const CACHE_MEDIA_DIR = path.join(CACHE_ROOT, 'media');

const DATA_DIR = path.resolve(REPO_ROOT, 'data');
const DATA_MASTER_DIR = path.resolve(REPO_ROOT, 'data', 'master');
const DATA_MEDIA_DIR = path.resolve(REPO_ROOT, 'data', 'media');
const DATA_RELEASES_DIR = path.resolve(REPO_ROOT, 'data', 'releases');
const DOCS_SCHEMAS_DIR = path.resolve(REPO_ROOT, 'docs', 'schemas');

export const OFFICIAL_DATA_REPO = 'Alssaedy50/UMEDT-DATA';
export const OFFICIAL_SOURCE_REPO = 'Alssaedy50/UMEDT';

export function ensureCacheDirs(): void {
  for (const dir of [
    CACHE_ROOT,
    CACHE_MEDIA_DIR,
    DATA_DIR,
    DATA_MASTER_DIR,
    DATA_MEDIA_DIR,
    DOCS_SCHEMAS_DIR,
    path.join(DATA_RELEASES_DIR, 'stable'),
    path.join(DATA_RELEASES_DIR, 'beta')
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function createDefaultWorkspaceState(): WorkspaceDataState {
  return {
    meta: {
      sourceRepo: OFFICIAL_SOURCE_REPO,
      dataRepo: OFFICIAL_DATA_REPO,
      branch: 'main',
      dataVersion: '2026.11.0-umd',
      lastImportedFromUmedtAt: null,
      lastLoadedFromDataRepoAt: null,
      lastPublishedAt: null,
      lastCommitSha: null
    },
    blocks: [],
    subjects: [],
    topics: [],
    terms: [],
    sentences: [],
    customAffixes: [],
    customAbbreviations: [],
    books: [],
    questions: [],
    exams: [],
    mediaAssets: []
  };
}

function readJsonArrayFromMaster<T>(fileName: string): T[] {
  const filePath = path.join(DATA_MASTER_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadFromRepoMasterFiles(): Partial<WorkspaceDataState> {
  return {
    blocks: readJsonArrayFromMaster('blocks.json'),
    subjects: readJsonArrayFromMaster('subjects.json'),
    topics: readJsonArrayFromMaster('topics.json'),
    terms: readJsonArrayFromMaster('terms.json'),
    sentences: readJsonArrayFromMaster('sentences.json'),
    customAffixes: readJsonArrayFromMaster('custom-affixes.json'),
    customAbbreviations: readJsonArrayFromMaster('custom-abbreviations.json'),
    books: readJsonArrayFromMaster('books.json'),
    questions: readJsonArrayFromMaster('questions.json'),
    exams: readJsonArrayFromMaster('exams.json'),
    mediaAssets: readJsonArrayFromMaster('media-index.json')
  };
}

function migrateLegacyRepoName(repo: string | undefined): string {
  const trimmed = (repo || '').trim();
  if (!trimmed || trimmed === 'Alssaedy50/UMEDT_DATA') {
    return OFFICIAL_DATA_REPO;
  }
  return trimmed;
}

export function loadWorkspaceState(): WorkspaceDataState {
  ensureCacheDirs();
  const def = createDefaultWorkspaceState();
  if (!fs.existsSync(WORKSPACE_FILE)) {
    const repoMaster = loadFromRepoMasterFiles();
    const initial: WorkspaceDataState = {
      ...def,
      blocks: repoMaster.blocks || [],
      subjects: repoMaster.subjects || [],
      topics: repoMaster.topics || [],
      terms: repoMaster.terms || [],
      sentences: repoMaster.sentences || [],
      customAffixes: repoMaster.customAffixes || [],
      customAbbreviations: repoMaster.customAbbreviations || [],
      books: repoMaster.books || [],
      questions: repoMaster.questions || [],
      exams: repoMaster.exams || [],
      mediaAssets: repoMaster.mediaAssets || []
    };
    saveWorkspaceState(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(WORKSPACE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceDataState>;
    const migratedDataRepo = migrateLegacyRepoName(parsed.meta?.dataRepo);
    const mediaAssets = (Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets : []).map((m) => ({
      ...m,
      rawUrl:
        typeof m.rawUrl === 'string'
          ? m.rawUrl.replace('/Alssaedy50/UMEDT_DATA/', `/${OFFICIAL_DATA_REPO}/`)
          : m.rawUrl
    }));

    const repoFallback = loadFromRepoMasterFiles();
    const state: WorkspaceDataState = {
      meta: {
        ...def.meta,
        ...(parsed.meta || {}),
        dataRepo: migratedDataRepo,
        sourceRepo: parsed.meta?.sourceRepo?.trim() || OFFICIAL_SOURCE_REPO
      },
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
      customAffixes: Array.isArray(parsed.customAffixes) ? parsed.customAffixes : [],
      customAbbreviations: Array.isArray(parsed.customAbbreviations)
        ? parsed.customAbbreviations
        : [],
      books: Array.isArray(parsed.books) ? parsed.books : repoFallback.books || [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : repoFallback.exams || [],
      mediaAssets
    };

    const totalInCache =
      state.blocks.length +
      state.subjects.length +
      state.topics.length +
      state.terms.length +
      state.sentences.length;

    if (totalInCache === 0) {
      state.blocks = repoFallback.blocks || [];
      state.subjects = repoFallback.subjects || [];
      state.topics = repoFallback.topics || [];
      state.terms = repoFallback.terms || [];
      state.sentences = repoFallback.sentences || [];
      state.customAffixes = repoFallback.customAffixes || [];
      state.customAbbreviations = repoFallback.customAbbreviations || [];
      state.books = repoFallback.books || [];
      state.questions = repoFallback.questions || [];
      state.exams = repoFallback.exams || [];
      state.mediaAssets = repoFallback.mediaAssets || [];
    }

    if (parsed.meta?.dataRepo !== migratedDataRepo) {
      saveWorkspaceState(state);
    }
    return state;
  } catch (error) {
    // Never overwrite an unreadable workspace with defaults. Preserve the original bytes for recovery.
    let backupPath: string | null = null;
    try {
      if (fs.existsSync(WORKSPACE_FILE)) {
        backupPath = `${WORKSPACE_FILE}.recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.copyFileSync(WORKSPACE_FILE, backupPath, fs.constants.COPYFILE_EXCL);
      }
    } catch {
      backupPath = null;
    }
    throw new Error(
      `تعذر قراءة مساحة العمل المحلية. لم يتم استبدال البيانات الافتراضية فوق الملف الأصلي.${backupPath ? ` تم حفظ نسخة استرداد في: ${backupPath}` : ''} السبب: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function saveWorkspaceState(state: WorkspaceDataState): WorkspaceDataState {
  ensureCacheDirs();
  const tempFile = `${WORKSPACE_FILE}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(state, null, 2);
  fs.writeFileSync(tempFile, serialized, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempFile, WORKSPACE_FILE);
  return state;
}

export function writeMasterFilesToRepoDisk(state: WorkspaceDataState): Record<string, string> {
  ensureCacheDirs();
  const files: Record<string, unknown> = {
    'blocks.json': state.blocks,
    'subjects.json': state.subjects,
    'topics.json': state.topics,
    'terms.json': state.terms,
    'sentences.json': state.sentences,
    'custom-affixes.json': state.customAffixes,
    'custom-abbreviations.json': state.customAbbreviations,
    'books.json': state.books || [],
    'questions.json': state.questions,
    'exams.json': state.exams || [],
    'media-index.json': state.mediaAssets
  };

  const hashes: Record<string, string> = {};
  for (const [name, payload] of Object.entries(files)) {
    const jsonText = JSON.stringify(payload, null, 2);
    fs.writeFileSync(path.join(DATA_MASTER_DIR, name), jsonText, 'utf8');
    hashes[name] = crypto.createHash('sha256').update(jsonText).digest('hex');
  }
  return hashes;
}

export function writeCatalogAndDocsToRepoDisk(state: WorkspaceDataState): void {
  ensureCacheDirs();
  const catalog = buildDataCatalogDocument(state, state.meta.dataRepo);
  fs.writeFileSync(
    path.join(DATA_DIR, 'catalog.json'),
    JSON.stringify(catalog, null, 2),
    'utf8'
  );
  const schemas = generateJsonSchemaFiles();
  for (const [relPath, content] of Object.entries(schemas)) {
    fs.writeFileSync(path.resolve(REPO_ROOT, relPath), content, 'utf8');
  }
  fs.writeFileSync(
    path.resolve(REPO_ROOT, 'docs', 'UMEDT-DATA-API-CONTRACT.md'),
    generateApiContractMarkdown(state.meta.dataRepo, state.meta.branch || 'main'),
    'utf8'
  );
}

export function loadReleaseHistory(channel: 'stable' | 'beta'): ReleaseHistoryRecord[] {
  ensureCacheDirs();
  const historyPath = path.join(DATA_RELEASES_DIR, channel, 'history.json');
  if (!fs.existsSync(historyPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ReleaseHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveReleaseHistory(
  channel: 'stable' | 'beta',
  history: ReleaseHistoryRecord[]
): void {
  ensureCacheDirs();
  const historyPath = path.join(DATA_RELEASES_DIR, channel, 'history.json');
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

export function writeReleaseArtifactsToRepoDisk(options: {
  channel: 'stable' | 'beta';
  packageFileName: string;
  zipBuffer: Buffer;
  manifestJsonText: string;
  changelogMarkdown: string;
  history: ReleaseHistoryRecord[];
}): void {
  ensureCacheDirs();
  const channelDir = path.join(DATA_RELEASES_DIR, options.channel);
  const pkgPath = path.join(channelDir, options.packageFileName);
  const manifestPath = path.join(channelDir, 'manifest.json');
  const changelogPath = path.join(channelDir, 'CHANGELOG.md');
  const historyPath = path.join(channelDir, 'history.json');

  // Snapshot existing manifest & changelog for atomic rollback if disk write fails
  const prevManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
  const prevChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : null;
  const prevHistory = fs.existsSync(historyPath) ? fs.readFileSync(historyPath, 'utf8') : null;

  try {
    fs.writeFileSync(pkgPath, options.zipBuffer);
    fs.writeFileSync(manifestPath, options.manifestJsonText, 'utf8');
    fs.writeFileSync(changelogPath, options.changelogMarkdown, 'utf8');
    fs.writeFileSync(historyPath, JSON.stringify(options.history, null, 2), 'utf8');
  } catch (err) {
    if (prevManifest !== null) fs.writeFileSync(manifestPath, prevManifest, 'utf8');
    if (prevChangelog !== null) fs.writeFileSync(changelogPath, prevChangelog, 'utf8');
    if (prevHistory !== null) fs.writeFileSync(historyPath, prevHistory, 'utf8');
    throw err;
  }
}

export function computeWorkspaceCounts(state: Pick<
  WorkspaceDataState,
  | 'blocks'
  | 'subjects'
  | 'topics'
  | 'terms'
  | 'sentences'
  | 'customAffixes'
  | 'customAbbreviations'
  | 'books'
  | 'questions'
  | 'exams'
  | 'mediaAssets'
>): MasterDataCounts {
  return {
    blocks: state.blocks.length,
    subjects: state.subjects.length,
    topics: state.topics.length,
    terms: state.terms.length,
    sentences: state.sentences.length,
    customAffixes: state.customAffixes.length,
    customAbbreviations: state.customAbbreviations.length,
    books: (state.books || []).length,
    questions: state.questions.length,
    exams: (state.exams || []).length,
    mediaAssets: state.mediaAssets.length
  };
}

export function sanitizeMediaFileName(name: string): string {
  const base = path.basename(name || 'attachment.bin').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return base.replace(/^-+|-+$/g, '') || 'attachment.bin';
}

export function saveMediaBinary(
  fileName: string,
  _mimeType: string,
  buffer: Buffer
): { sha256: string; relativePath: string; diskPath: string; sizeBytes: number } {
  ensureCacheDirs();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeName = sanitizeMediaFileName(fileName);
  const storedName = `${sha256.slice(0, 12)}-${safeName}`;
  const relativePath = `data/media/${storedName}`;
  const cacheDiskPath = path.join(CACHE_MEDIA_DIR, storedName);
  const repoDiskPath = path.join(DATA_MEDIA_DIR, storedName);
  fs.writeFileSync(cacheDiskPath, buffer);
  fs.writeFileSync(repoDiskPath, buffer);
  return {
    sha256,
    relativePath,
    diskPath: repoDiskPath,
    sizeBytes: buffer.byteLength
  };
}

export function readMediaBinary(asset: MediaAssetRecord): Buffer | null {
  ensureCacheDirs();
  const baseName = path.basename(asset.relativePath);
  const repoPath = path.join(DATA_MEDIA_DIR, baseName);
  if (fs.existsSync(repoPath)) {
    return fs.readFileSync(repoPath);
  }
  const cachePath = path.join(CACHE_MEDIA_DIR, baseName);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }
  return null;
}

export function deleteMediaBinaryIfUnused(
  asset: MediaAssetRecord,
  remainingAssets: MediaAssetRecord[]
): void {
  const stillReferenced = remainingAssets.some((a) => a.relativePath === asset.relativePath);
  if (stillReferenced) return;
  const baseName = path.basename(asset.relativePath);
  for (const p of [path.join(DATA_MEDIA_DIR, baseName), path.join(CACHE_MEDIA_DIR, baseName)]) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}
