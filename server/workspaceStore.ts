import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  MasterDataCounts,
  MediaAssetRecord,
  WorkspaceDataState
} from '../src/types/umedtData.ts';

const CACHE_ROOT = path.resolve(process.cwd(), '.umedt-hub-cache');
const WORKSPACE_FILE = path.join(CACHE_ROOT, 'workspace.json');
const MEDIA_DIR = path.join(CACHE_ROOT, 'media');

export function ensureCacheDirs(): void {
  if (!fs.existsSync(CACHE_ROOT)) {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
  }
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export function createDefaultWorkspaceState(): WorkspaceDataState {
  return {
    meta: {
      sourceRepo: 'Alssaedy50/UMEDT',
      dataRepo: 'Alssaedy50/UMEDT_DATA',
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
    questions: [],
    mediaAssets: []
  };
}

export function loadWorkspaceState(): WorkspaceDataState {
  ensureCacheDirs();
  if (!fs.existsSync(WORKSPACE_FILE)) {
    const initial = createDefaultWorkspaceState();
    saveWorkspaceState(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(WORKSPACE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceDataState>;
    const def = createDefaultWorkspaceState();
    return {
      meta: { ...def.meta, ...(parsed.meta || {}) },
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
      customAffixes: Array.isArray(parsed.customAffixes) ? parsed.customAffixes : [],
      customAbbreviations: Array.isArray(parsed.customAbbreviations)
        ? parsed.customAbbreviations
        : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      mediaAssets: Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets : []
    };
  } catch {
    const fallback = createDefaultWorkspaceState();
    saveWorkspaceState(fallback);
    return fallback;
  }
}

export function saveWorkspaceState(state: WorkspaceDataState): WorkspaceDataState {
  ensureCacheDirs();
  fs.writeFileSync(WORKSPACE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
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
  | 'questions'
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
    questions: state.questions.length,
    mediaAssets: state.mediaAssets.length
  };
}

export function sanitizeMediaFileName(name: string): string {
  const base = path.basename(name || 'attachment.bin').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return base.replace(/^-+|-+$/g, '') || 'attachment.bin';
}

export function saveMediaBinary(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): { sha256: string; relativePath: string; diskPath: string; sizeBytes: number } {
  ensureCacheDirs();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeName = sanitizeMediaFileName(fileName);
  const storedName = `${sha256.slice(0, 12)}-${safeName}`;
  const relativePath = `data/media/${storedName}`;
  const diskPath = path.join(MEDIA_DIR, storedName);
  fs.writeFileSync(diskPath, buffer);
  return {
    sha256,
    relativePath,
    diskPath,
    sizeBytes: buffer.byteLength
  };
}

export function readMediaBinary(asset: MediaAssetRecord): Buffer | null {
  ensureCacheDirs();
  const baseName = path.basename(asset.relativePath);
  const diskPath = path.join(MEDIA_DIR, baseName);
  if (fs.existsSync(diskPath)) {
    return fs.readFileSync(diskPath);
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
  const diskPath = path.join(MEDIA_DIR, baseName);
  if (fs.existsSync(diskPath)) {
    fs.unlinkSync(diskPath);
  }
}
