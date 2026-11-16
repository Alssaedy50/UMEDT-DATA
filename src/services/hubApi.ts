import type {
  AcademicBookResource,
  AcademicExamPackage,
  ClinicalAbbreviation,
  DataCatalogDocument,
  DataPackageManifest,
  DictionaryTerm,
  DiffReport,
  DualRepoStatusResponse,
  LinkedSentence,
  MediaAssetRecord,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  ReleaseHistoryRecord,
  ReleaseKeyPair,
  TopicArticle,
  UnifiedQuizQuestion,
  ValidationReport,
  WorkspaceDataState
} from '../types/umedtData';

function headersWithToken(token?: string, json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token && token.trim()) h['X-GitHub-Token'] = token.trim();
  return h;
}

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function getWorkspace(): Promise<{
  state: WorkspaceDataState;
  validation: ValidationReport;
}> {
  const res = await fetch('/api/workspace', { cache: 'no-store' });
  return handleJson(res);
}

export async function updateWorkspaceMeta(
  meta: Partial<WorkspaceDataState['meta']>
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/meta', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  });
  return handleJson(res);
}

export async function fetchGitHubStatus(
  sourceRepo: string,
  dataRepo: string,
  token?: string
): Promise<DualRepoStatusResponse> {
  const params = new URLSearchParams({ sourceRepo, dataRepo });
  const res = await fetch(`/api/github/status?${params.toString()}`, {
    headers: headersWithToken(token, false),
    cache: 'no-store'
  });
  return handleJson(res);
}

export async function importFromUmedt(
  sourceRepo: string,
  dataRepo: string,
  token?: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/import-from-umedt', {
    method: 'POST',
    headers: headersWithToken(token),
    body: JSON.stringify({ sourceRepo, dataRepo })
  });
  return handleJson(res);
}

export async function loadFromUmedtData(
  dataRepo: string,
  branch: string,
  token?: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/load-from-umedt-data', {
    method: 'POST',
    headers: headersWithToken(token),
    body: JSON.stringify({ dataRepo, branch })
  });
  return handleJson(res);
}

export async function saveBlock(
  block: MedicalBlock
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block)
  });
  return handleJson(res);
}

export async function deleteBlock(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/blocks/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveSubject(
  subject: MedicalSubject
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subject)
  });
  return handleJson(res);
}

export async function deleteSubject(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/subjects/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveTopic(
  topic: TopicArticle
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topic)
  });
  return handleJson(res);
}

export async function deleteTopic(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/topics/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveTerm(
  term: DictionaryTerm
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(term)
  });
  return handleJson(res);
}

export async function deleteTerm(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/terms/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveSentence(
  sentence: LinkedSentence
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/sentences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sentence)
  });
  return handleJson(res);
}

export async function deleteSentence(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/sentences/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveAffix(
  affix: MorphologicalAffix
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/affixes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(affix)
  });
  return handleJson(res);
}

export async function deleteAffix(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/affixes/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveAbbreviation(
  abbr: ClinicalAbbreviation
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/abbreviations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(abbr)
  });
  return handleJson(res);
}

export async function deleteAbbreviation(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/abbreviations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveQuestion(
  question: UnifiedQuizQuestion
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(question)
  });
  return handleJson(res);
}

export async function deleteQuestion(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/questions/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveBook(
  book: AcademicBookResource
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(book)
  });
  return handleJson(res);
}

export async function deleteBook(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/books/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function saveExam(
  exam: AcademicExamPackage
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exam)
  });
  return handleJson(res);
}

export async function deleteExam(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/exams/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function fetchUnifiedCatalog(): Promise<DataCatalogDocument> {
  const res = await fetch('/api/v1/catalog', { cache: 'no-store' });
  return handleJson(res);
}

export async function uploadMediaAsset(payload: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  mediaType?: MediaAssetRecord['mediaType'];
  linkedEntityType?: MediaAssetRecord['linkedEntityType'];
  linkedEntityId?: string;
  captionAr?: string;
  captionEn?: string;
}): Promise<{
  asset: MediaAssetRecord;
  deduplicated: boolean;
  state: WorkspaceDataState;
  validation: ValidationReport;
}> {
  const res = await fetch('/api/workspace/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleJson(res);
}

export async function deleteMediaAsset(
  id: string
): Promise<{ state: WorkspaceDataState; validation: ValidationReport }> {
  const res = await fetch(`/api/workspace/media/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return handleJson(res);
}

export async function fetchWorkspaceDiff(
  token?: string
): Promise<{ diff: DiffReport; validation: ValidationReport }> {
  const res = await fetch('/api/workspace/diff', {
    headers: headersWithToken(token, false),
    cache: 'no-store'
  });
  return handleJson(res);
}

export async function generateReleaseKeyPair(): Promise<{ keyPair: ReleaseKeyPair }> {
  const res = await fetch('/api/release/generate-keys', { method: 'POST' });
  return handleJson(res);
}

export async function fetchReleaseHistory(channel: 'stable' | 'beta'): Promise<{
  channel: 'stable' | 'beta';
  history: ReleaseHistoryRecord[];
}> {
  const res = await fetch(`/api/release/history?channel=${encodeURIComponent(channel)}`, {
    cache: 'no-store'
  });
  return handleJson(res);
}

export async function publishLocalRelease(payload: {
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  allowOverwrite?: boolean;
}): Promise<{
  success: boolean;
  manifest: DataPackageManifest;
  packageFileName: string;
  historyList: ReleaseHistoryRecord[];
  signed: boolean;
  state: WorkspaceDataState;
}> {
  const res = await fetch('/api/release/publish-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleJson(res);
}

export async function rollbackRelease(payload: {
  channel: 'stable' | 'beta';
  targetVersion: string;
}): Promise<{
  success: boolean;
  restoredManifest: DataPackageManifest;
  changelogMarkdown: string;
  historyList: ReleaseHistoryRecord[];
  state: WorkspaceDataState;
}> {
  const res = await fetch('/api/release/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleJson(res);
}

export async function downloadSignedReleaseZip(payload: {
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
}): Promise<Blob> {
  const res = await fetch('/api/release/build-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'تعذر بناء الحزمة');
  }
  return res.blob();
}

export async function downloadRepoBundleZip(payload: {
  includeRelease: boolean;
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
}): Promise<Blob> {
  const res = await fetch('/api/export/umedt-data-repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'تعذر تصدير حزمة المستودع');
  }
  return res.blob();
}

export async function publishToUmedtData(
  payload: {
    commitMessage: string;
    includeWorkflowUpgrade: boolean;
    buildRelease: boolean;
    version: string;
    channel: 'stable' | 'beta';
    summary: string;
    privateKeyPem?: string;
    publicKeyPem?: string;
  },
  token: string
): Promise<{
  success: boolean;
  commitSha: string;
  commitUrl: string;
  filesCommitted: number;
  state: WorkspaceDataState;
}> {
  const res = await fetch('/api/github/publish-data', {
    method: 'POST',
    headers: headersWithToken(token),
    body: JSON.stringify(payload)
  });
  return handleJson(res);
}

export async function fetchIntegrationPatchFiles(): Promise<{
  files: Array<{ path: string; content: string; descriptionAr: string }>;
}> {
  const res = await fetch('/api/integration/patch-files', { cache: 'no-store' });
  return handleJson(res);
}

export async function createIntegrationPullRequest(token: string): Promise<{
  success: boolean;
  prUrl: string;
  prNumber: number;
  branchName: string;
}> {
  const res = await fetch('/api/integration/create-pr', {
    method: 'POST',
    headers: headersWithToken(token)
  });
  return handleJson(res);
}
