import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import type {
  DataPackageManifest,
  DiffReport,
  DomainDiffStats,
  MasterDataCounts,
  ReleaseHistoryRecord,
  ReleaseKeyPair,
  UmedtManifestCounts,
  ValidationIssueItem,
  ValidationReport,
  WorkspaceDataState
} from '../src/types/umedtData.ts';
import {
  computeWorkspaceCounts,
  loadReleaseHistory,
  OFFICIAL_DATA_REPO,
  saveReleaseHistory,
  writeCatalogAndDocsToRepoDisk,
  writeMasterFilesToRepoDisk,
  writeReleaseArtifactsToRepoDisk
} from './workspaceStore.ts';
import { buildDataCatalogDocument } from './catalogGenerator.ts';

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.wasm',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.apk',
  '.dex',
  '.html',
  '.htm',
  '.scr',
  '.com'
]);

const VALID_AFFIX_TYPES = new Set(['prefix', 'root', 'suffix']);

export function normalizeTermKey(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

export function sha256Hex(bytes: Uint8Array | Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function validateWorkspaceData(state: WorkspaceDataState): ValidationReport {
  const errors: ValidationIssueItem[] = [];
  const warnings: ValidationIssueItem[] = [];
  const counts = computeWorkspaceCounts(state);

  const checkUniqueIds = (records: Array<{ id?: string }>, domain: string, labelAr: string) => {
    const seen = new Set<string>();
    for (const rec of records) {
      const id = typeof rec?.id === 'string' ? rec.id.trim() : '';
      if (!id) {
        errors.push({
          severity: 'error',
          domain,
          messageAr: `سجل في ${labelAr} يفتقد معرف (id) صالح.`
        });
        continue;
      }
      if (seen.has(id)) {
        errors.push({
          severity: 'error',
          domain,
          recordId: id,
          messageAr: `معرف مكرر "${id}" في ${labelAr}.`
        });
      }
      seen.add(id);
    }
    return seen;
  };

  const blockIds = checkUniqueIds(state.blocks, 'blocks', 'البلوكات');
  const subjectIds = checkUniqueIds(state.subjects, 'subjects', 'المواد الدراسية');
  const topicIds = checkUniqueIds(state.topics, 'topics', 'المواضيع');
  checkUniqueIds(state.terms, 'terms', 'المصطلحات');
  checkUniqueIds(state.sentences, 'sentences', 'الجمل السريرية');
  checkUniqueIds(state.customAffixes, 'customAffixes', 'اللواحق والسوابق');
  checkUniqueIds(state.customAbbreviations, 'customAbbreviations', 'الاختصارات الطبية');
  checkUniqueIds(state.books || [], 'books', 'الكتب وملفات PDF');
  const questionIds = checkUniqueIds(state.questions, 'questions', 'الأسئلة التقييمية');
  checkUniqueIds(state.exams || [], 'exams', 'الاختبارات والامتحانات');
  const mediaIds = checkUniqueIds(state.mediaAssets, 'mediaAssets', 'المرفقات والوسائط');

  const totalRecords =
    counts.blocks +
    counts.subjects +
    counts.topics +
    counts.terms +
    counts.sentences +
    counts.customAffixes +
    counts.customAbbreviations +
    counts.books +
    counts.questions +
    counts.exams;

  if (totalRecords === 0) {
    errors.push({
      severity: 'error',
      domain: 'workspace',
      messageAr: 'المسودة فارغة بالكامل؛ يجب استيراد البيانات أو إضافة سجل واحد على الأقل قبل النشر.'
    });
  }

  // UMEDT Term contract checks
  const termKeys = new Map<string, string>();
  for (const t of state.terms) {
    if (!t.term || !t.term.trim()) {
      errors.push({
        severity: 'error',
        domain: 'terms',
        recordId: t.id,
        messageAr: `المصطلح (${t.id}) لا يحتوي على نص إنجليزي 'term'.`
      });
      continue;
    }
    if (!t.translation || !t.translation.trim()) {
      errors.push({
        severity: 'error',
        domain: 'terms',
        recordId: t.id,
        messageAr: `المصطلح "${t.term}" يفتقد الترجمة العربية 'translation'.`
      });
    }
    const key = normalizeTermKey(t.term);
    if (!key) {
      errors.push({
        severity: 'error',
        domain: 'terms',
        recordId: t.id,
        messageAr: `المصطلح "${t.term}" ينتج مفتاحاً فارغاً بعد التطبيع.`
      });
      continue;
    }
    const prevId = termKeys.get(key);
    if (prevId) {
      warnings.push({
        severity: 'warning',
        domain: 'terms',
        recordId: t.id,
        messageAr: `تطابق معجمي محتمل للمصطلح "${t.term}" مع السجل ${prevId}.`
      });
    } else {
      termKeys.set(key, t.id);
    }
  }

  // UMEDT Sentence contract checks
  for (const s of state.sentences) {
    if (!s.en?.trim() || !s.ar?.trim()) {
      errors.push({
        severity: 'error',
        domain: 'sentences',
        recordId: s.id,
        messageAr: `الجملة (${s.id}) تفتقد النص الإنجليزي 'en' أو العربي 'ar'.`
      });
    }
  }

  // UMEDT Topic contract checks
  for (const tp of state.topics) {
    if (!tp.title?.trim() || !Array.isArray(tp.sections)) {
      errors.push({
        severity: 'error',
        domain: 'topics',
        recordId: tp.id,
        messageAr: `الموضوع (${tp.id}) يفتقد 'title' أو مصفوفة 'sections'.`
      });
    }
    if (tp.blockId && !blockIds.has(tp.blockId)) {
      warnings.push({
        severity: 'warning',
        domain: 'topics',
        recordId: tp.id,
        messageAr: `الموضوع "${tp.titleAr || tp.title}" يشير إلى بلوك غير موجود (${tp.blockId}).`
      });
    }
    if (tp.subjectId && !subjectIds.has(tp.subjectId)) {
      warnings.push({
        severity: 'warning',
        domain: 'topics',
        recordId: tp.id,
        messageAr: `الموضوع "${tp.titleAr || tp.title}" يشير إلى مادة غير موجودة (${tp.subjectId}).`
      });
    }
  }

  // UMEDT Affix & Abbreviation contract checks
  for (const af of state.customAffixes) {
    if (!af.affix?.trim() || !af.meaningAr?.trim() || !VALID_AFFIX_TYPES.has(af.type)) {
      errors.push({
        severity: 'error',
        domain: 'customAffixes',
        recordId: af.id,
        messageAr: `السابقة/اللاحقة (${af.id}) تفتقد حقول UMEDT الأساسية.`
      });
    }
  }

  for (const ab of state.customAbbreviations) {
    if (!ab.abbr?.trim() || !ab.defaultExpansionEn?.trim() || !ab.defaultTranslationAr?.trim()) {
      errors.push({
        severity: 'error',
        domain: 'customAbbreviations',
        recordId: ab.id,
        messageAr: `الاختصار (${ab.id}) يفتقد حقول UMEDT الأساسية.`
      });
    }
  }

  // Subjects -> Blocks referential check
  for (const subj of state.subjects) {
    if (!subj.isStandalone && subj.blockId && !blockIds.has(subj.blockId)) {
      warnings.push({
        severity: 'warning',
        domain: 'subjects',
        recordId: subj.id,
        messageAr: `المادة "${subj.titleAr || subj.titleEn}" تشير إلى بلوك غير موجود (${subj.blockId}).`
      });
    }
  }

  // Academic Books & PDFs checks
  for (const bk of state.books || []) {
    if (!bk.titleEn?.trim() && !bk.titleAr?.trim()) {
      errors.push({
        severity: 'error',
        domain: 'books',
        recordId: bk.id,
        messageAr: `الكتاب (${bk.id}) لا يحتوي على عنوان عربي أو إنجليزي.`
      });
    }
    if (!bk.downloadUrl?.trim()) {
      errors.push({
        severity: 'error',
        domain: 'books',
        recordId: bk.id,
        messageAr: `الكتاب "${bk.titleAr || bk.titleEn}" يفتقد رابط التحميل (downloadUrl).`
      });
    }
    if (bk.blockId && !blockIds.has(bk.blockId)) {
      warnings.push({
        severity: 'warning',
        domain: 'books',
        recordId: bk.id,
        messageAr: `الكتاب "${bk.titleAr || bk.titleEn}" يشير إلى بلوك غير موجود (${bk.blockId}).`
      });
    }
    if (bk.mediaAssetId && !mediaIds.has(bk.mediaAssetId)) {
      warnings.push({
        severity: 'warning',
        domain: 'books',
        recordId: bk.id,
        messageAr: `الكتاب "${bk.titleAr || bk.titleEn}" يشير إلى ملف وسائط غير موجود (${bk.mediaAssetId}).`
      });
    }
  }

  // Exams checks
  for (const ex of state.exams || []) {
    if (!ex.titleEn?.trim() && !ex.titleAr?.trim()) {
      errors.push({
        severity: 'error',
        domain: 'exams',
        recordId: ex.id,
        messageAr: `الاختبار (${ex.id}) لا يحتوي على عنوان.`
      });
    }
    if (!Array.isArray(ex.questionIds) || ex.questionIds.length === 0) {
      warnings.push({
        severity: 'warning',
        domain: 'exams',
        recordId: ex.id,
        messageAr: `الاختبار "${ex.titleAr || ex.titleEn}" لا يحتوي على أسئلة مرتبطة بعد.`
      });
    } else {
      for (const qId of ex.questionIds) {
        if (!questionIds.has(qId)) {
          warnings.push({
            severity: 'warning',
            domain: 'exams',
            recordId: ex.id,
            messageAr: `الاختبار "${ex.titleAr || ex.titleEn}" يشير إلى سؤال غير موجود (${qId}).`
          });
        }
      }
    }
  }

  // Media security checks
  for (const asset of state.mediaAssets) {
    const rel = (asset.relativePath || '').replace(/\\/g, '/');
    if (rel.includes('..') || rel.startsWith('/')) {
      errors.push({
        severity: 'error',
        domain: 'mediaAssets',
        recordId: asset.id,
        messageAr: `مسار مرفق غير آمن (Path Traversal): ${asset.relativePath}`
      });
    }
    const ext = `.${(asset.fileName.split('.').pop() || '').toLowerCase()}`;
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      errors.push({
        severity: 'error',
        domain: 'mediaAssets',
        recordId: asset.id,
        messageAr: `امتداد ملف مرفوض أمنياً: ${asset.fileName}`
      });
    }
    if (ext === '.svg' && asset.mimeType !== 'image/svg+xml') {
      errors.push({
        severity: 'error',
        domain: 'mediaAssets',
        recordId: asset.id,
        messageAr: `يجب أن يكون MIME type لملف SVG هو image/svg+xml: ${asset.fileName}`
      });
    }
    if (ext === '.svg' && asset.sizeBytes > 2 * 1024 * 1024) {
      errors.push({
        severity: 'error',
        domain: 'mediaAssets',
        recordId: asset.id,
        messageAr: `حجم SVG يتجاوز الحد الآمن البالغ 2 MB: ${asset.fileName}`
      });
    }
    if (
      asset.linkedEntityType === 'topic' &&
      asset.linkedEntityId &&
      !topicIds.has(asset.linkedEntityId)
    ) {
      warnings.push({
        severity: 'warning',
        domain: 'mediaAssets',
        recordId: asset.id,
        messageAr: `المرفق "${asset.fileName}" مرتبط بموضوع غير موجود (${asset.linkedEntityId}).`
      });
    }
  }

  return {
    valid: errors.length === 0,
    counts,
    errors,
    warnings
  };
}

function stableStringify(obj: unknown): string {
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  }
  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(obj);
}

function computeCollectionDiff(
  domain: keyof MasterDataCounts,
  labelAr: string,
  draftList: Array<{ id: string }>,
  remoteList: Array<{ id: string }>
): DomainDiffStats {
  const remoteMap = new Map<string, string>();
  for (const item of remoteList) {
    if (item?.id) remoteMap.set(item.id, sha256Hex(stableStringify(item)));
  }
  const draftIds = new Set<string>();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of draftList) {
    if (!item?.id) continue;
    draftIds.add(item.id);
    const remoteHash = remoteMap.get(item.id);
    if (!remoteHash) {
      added += 1;
    } else if (remoteHash !== sha256Hex(stableStringify(item))) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  let removed = 0;
  for (const id of remoteMap.keys()) {
    if (!draftIds.has(id)) removed += 1;
  }
  return {
    domain,
    labelAr,
    draftCount: draftList.length,
    remoteCount: remoteList.length,
    added,
    updated,
    removed,
    unchanged
  };
}

export function computeDiffAgainstRemote(
  draft: WorkspaceDataState,
  remote: Partial<WorkspaceDataState>
): DiffReport {
  const domains: DomainDiffStats[] = [
    computeCollectionDiff('blocks', 'البلوكات الطبية', draft.blocks, remote.blocks || []),
    computeCollectionDiff('subjects', 'المواد الدراسية', draft.subjects, remote.subjects || []),
    computeCollectionDiff('topics', 'المواضيع والمحاضرات', draft.topics, remote.topics || []),
    computeCollectionDiff('terms', 'المصطلحات الطبية', draft.terms, remote.terms || []),
    computeCollectionDiff('sentences', 'الجمل السريرية', draft.sentences, remote.sentences || []),
    computeCollectionDiff(
      'customAffixes',
      'السوابق واللواحق',
      draft.customAffixes,
      remote.customAffixes || []
    ),
    computeCollectionDiff(
      'customAbbreviations',
      'الاختصارات السريرية',
      draft.customAbbreviations,
      remote.customAbbreviations || []
    ),
    computeCollectionDiff('books', 'الكتب وملفات PDF', draft.books || [], remote.books || []),
    computeCollectionDiff('questions', 'بنك الأسئلة', draft.questions, remote.questions || []),
    computeCollectionDiff('exams', 'الاختبارات والامتحانات', draft.exams || [], remote.exams || []),
    computeCollectionDiff('mediaAssets', 'الملحقات والوسائط', draft.mediaAssets, remote.mediaAssets || [])
  ];

  const totalAdded = domains.reduce((acc, d) => acc + d.added, 0);
  const totalUpdated = domains.reduce((acc, d) => acc + d.updated, 0);
  const totalRemoved = domains.reduce((acc, d) => acc + d.removed, 0);

  return {
    hasChanges: totalAdded + totalUpdated + totalRemoved > 0,
    domains,
    totalAdded,
    totalUpdated,
    totalRemoved
  };
}

function formatPem(base64: string, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  const lines = base64.match(/.{1,64}/g) || [base64];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, '')
    .replace(/-----END [A-Z0-9 ]+-----/g, '')
    .replace(/\s+/g, '');
  const buf = Buffer.from(cleaned, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function generateEcdsaSigningKeyPair(): Promise<ReleaseKeyPair> {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spki = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKeyPem = formatPem(Buffer.from(spki).toString('base64'), 'PUBLIC KEY');
  const privateKeyPem = formatPem(Buffer.from(pkcs8).toString('base64'), 'PRIVATE KEY');
  const fingerprintSha256 = sha256Hex(Buffer.from(spki));
  return {
    keyId: `umed-key-${fingerprintSha256.slice(0, 8)}`,
    algorithm: 'ECDSA-P256-SHA256',
    publicKeyPem,
    privateKeyPem,
    fingerprintSha256,
    createdAt: new Date().toISOString()
  };
}

export async function signBytesWithPrivateKey(
  bytes: Uint8Array,
  privateKeyPem: string
): Promise<string> {
  const pkcs8 = pemToArrayBuffer(privateKeyPem);
  const key = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    slice
  );
  return Buffer.from(sig).toString('base64');
}

export async function verifyBytesWithPublicKey(
  bytes: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string
): Promise<boolean> {
  try {
    const spki = pemToArrayBuffer(publicKeyPem);
    const key = await globalThis.crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const slice = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const sigBuf = Buffer.from(signatureBase64, 'base64');
    return await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      sigBuf,
      slice
    );
  } catch {
    return false;
  }
}

export function computeDomainFilesSha256(state: WorkspaceDataState): Record<string, string> {
  return {
    'blocks.json': sha256Hex(JSON.stringify(state.blocks, null, 2)),
    'subjects.json': sha256Hex(JSON.stringify(state.subjects, null, 2)),
    'topics.json': sha256Hex(JSON.stringify(state.topics, null, 2)),
    'terms.json': sha256Hex(JSON.stringify(state.terms, null, 2)),
    'sentences.json': sha256Hex(JSON.stringify(state.sentences, null, 2)),
    'custom-affixes.json': sha256Hex(JSON.stringify(state.customAffixes, null, 2)),
    'custom-abbreviations.json': sha256Hex(JSON.stringify(state.customAbbreviations, null, 2)),
    'books.json': sha256Hex(JSON.stringify(state.books || [], null, 2)),
    'questions.json': sha256Hex(JSON.stringify(state.questions, null, 2)),
    'exams.json': sha256Hex(JSON.stringify(state.exams || [], null, 2)),
    'media-index.json': sha256Hex(JSON.stringify(state.mediaAssets, null, 2))
  };
}

export function assertVersionNotPublished(
  channel: 'stable' | 'beta',
  targetVersion: string,
  allowOverwrite = false
): void {
  if (allowOverwrite) return;
  const history = loadReleaseHistory(channel);
  if (history.some((h) => h.version === targetVersion)) {
    throw new Error(
      `الإصدار "${targetVersion}" منشور مسبقاً في قناة ${channel}. يرجى ترقية رقم الإصدار لمنع الكتابة فوق إصدار معتمد.`
    );
  }
}

export function formatReleaseChangelogMarkdown(entries: ReleaseHistoryRecord[]): string {
  const lines: string[] = [
    '# سجل إصدارات بيانات UMEDT-DATA (Changelog)',
    '',
    'يحتوي هذا الملف على سجل الإصدارات المنشورة والمتوافقة مع تطبيق UMEDT.'
  ];
  for (const item of entries) {
    lines.push(
      '',
      `## v${item.version} (${item.channel}) — ${item.releasedAt}`,
      `- **الملخص:** ${item.summary}`,
      `- **الحزمة:** \`${item.packageFileName}\` (${item.packageSizeKb} KB)`,
      `- **SHA-256:** \`${item.sha256}\``,
      `- **التوقيع الرقمي:** ${item.signed ? 'موقّع (ECDSA-P256-SHA256)' : 'حزمة متوافقة غير موقّعة'}`,
      `- **النطاقات المتغيرة:** ${item.changedDomains.length > 0 ? item.changedDomains.join(', ') : 'إصدار أولي / كامل'}`,
      `- **السجلات:** ${item.extendedCounts.blocks} بلوك · ${item.extendedCounts.subjects} مادة · ${item.counts.topics} موضوع · ${item.counts.terms} مصطلح · ${item.counts.sentences} جملة · ${item.counts.affixes} لاحقة · ${item.counts.abbreviations} اختصار · ${item.extendedCounts.books || 0} كتاب · ${item.extendedCounts.questions || 0} سؤال · ${item.extendedCounts.exams || 0} اختبار · ${item.extendedCounts.mediaAssets} مرفق`
    );
  }
  return lines.join('\n') + '\n';
}

export async function buildSignedReleasePackage(options: {
  state: WorkspaceDataState;
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  dataRepo?: string;
  allowOverwrite?: boolean;
}): Promise<{
  packageFileName: string;
  zipBuffer: Buffer;
  manifest: DataPackageManifest;
  manifestJsonText: string;
  changelogMarkdown: string;
  historyRecord: ReleaseHistoryRecord;
  historyList: ReleaseHistoryRecord[];
  signed: boolean;
}> {
  const { state, version, channel, summary } = options;
  const cleanVersion = version.trim();
  const dataRepo = (options.dataRepo || state.meta.dataRepo || OFFICIAL_DATA_REPO).trim();
  const extendedCounts = computeWorkspaceCounts(state);
  const counts: UmedtManifestCounts = {
    terms: extendedCounts.terms,
    sentences: extendedCounts.sentences,
    topics: extendedCounts.topics,
    affixes: extendedCounts.customAffixes,
    abbreviations: extendedCounts.customAbbreviations
  };

  const existingHistory = loadReleaseHistory(channel);
  assertVersionNotPublished(channel, cleanVersion, options.allowOverwrite);

  const filesSha256 = computeDomainFilesSha256(state);
  const prevRelease = existingHistory[0] || null;
  const changedDomains = prevRelease
    ? Object.keys(filesSha256).filter((k) => filesSha256[k] !== prevRelease.filesSha256?.[k])
    : Object.keys(filesSha256);

  const packageFileName = `umed2-data-${cleanVersion}.zip`;
  const rawReleaseBase = `https://raw.githubusercontent.com/${dataRepo}/main/data/releases/${channel}`;
  const downloadUrl = `${rawReleaseBase}/${packageFileName}`;
  const manifestUrl = `${rawReleaseBase}/manifest.json`;
  const releasedAt = new Date().toISOString();

  // Build ZIP 100% compatible with UMEDT's inspectAndExtractSafeZipPackage & assemblePackageFromZipJsonMap:
  // - Entry count = 10 (<= 64 maxEntryCount)
  // - Depth = 1 (<= 4 maxPathDepth)
  // - Uses exact filenames UMEDT looks for: manifest.json, terms.json, sentences.json, topics.json, affixes.json, abbreviations.json
  // - Also includes blocks.json, subjects.json, questions.json, media-index.json for hierarchical sync
  const zip = new JSZip();

  const innerManifestBase = {
    packageId: `umed2-pkg-${cleanVersion}`,
    dataVersion: cleanVersion,
    minAppVersion: '2.4.0',
    schemaVersion: 2,
    releasedAt,
    channel,
    downloadUrl,
    manifestUrl,
    packageFormat: 'zip' as const,
    description: summary,
    releaseNotes: summary,
    changelog: [
      `${summary}`,
      `تحديث ${extendedCounts.blocks} بلوكات، ${counts.topics} موضوعاً، ${counts.terms} مصطلحاً، و ${extendedCounts.mediaAssets} مرفقاً.`
    ],
    author: 'UMEDT Data Hub',
    counts,
    extendedCounts,
    filesSha256,
    incremental: {
      previousVersion: prevRelease ? prevRelease.version : null,
      changedDomains
    }
  };

  zip.file('manifest.json', JSON.stringify(innerManifestBase, null, 2));
  zip.file('catalog.json', JSON.stringify(buildDataCatalogDocument(state, dataRepo), null, 2));
  zip.file('terms.json', JSON.stringify(state.terms, null, 2));
  zip.file('sentences.json', JSON.stringify(state.sentences, null, 2));
  zip.file('topics.json', JSON.stringify(state.topics, null, 2));
  zip.file('affixes.json', JSON.stringify(state.customAffixes, null, 2));
  zip.file('abbreviations.json', JSON.stringify(state.customAbbreviations, null, 2));
  zip.file('blocks.json', JSON.stringify(state.blocks, null, 2));
  zip.file('subjects.json', JSON.stringify(state.subjects, null, 2));
  zip.file('books.json', JSON.stringify(state.books || [], null, 2));
  zip.file('questions.json', JSON.stringify(state.questions, null, 2));
  zip.file('exams.json', JSON.stringify(state.exams || [], null, 2));
  zip.file('media-index.json', JSON.stringify(state.mediaAssets, null, 2));

  const zipUint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  const zipBuffer = Buffer.from(zipUint8);
  const digest = sha256Hex(zipBuffer);
  const packageSizeKb = Math.max(1, Number((zipBuffer.byteLength / 1024).toFixed(1)));

  let signature = '';
  let keyFingerprint = '';
  let signed = false;

  if (options.privateKeyPem && options.privateKeyPem.trim()) {
    signature = await signBytesWithPrivateKey(zipUint8, options.privateKeyPem);
    signed = true;
    if (options.publicKeyPem && options.publicKeyPem.trim()) {
      const spki = pemToArrayBuffer(options.publicKeyPem);
      keyFingerprint = sha256Hex(Buffer.from(spki));
    }
  }

  const manifest: DataPackageManifest = {
    ...innerManifestBase,
    packageSizeKb,
    checksum: digest,
    sha256: digest,
    signature,
    signatureAlgorithm: 'ECDSA-P256-SHA256',
    keyFingerprint
  };

  const manifestJsonText = JSON.stringify(manifest, null, 2);

  const historyRecord: ReleaseHistoryRecord = {
    version: cleanVersion,
    channel,
    releasedAt,
    packageFileName,
    sha256: digest,
    packageSizeKb,
    signed,
    signature,
    keyFingerprint,
    summary,
    counts,
    extendedCounts,
    filesSha256,
    changedDomains
  };

  const historyList = [
    historyRecord,
    ...existingHistory.filter((h) => h.version !== cleanVersion)
  ];
  const changelogMarkdown = formatReleaseChangelogMarkdown(historyList);

  return {
    packageFileName,
    zipBuffer,
    manifest,
    manifestJsonText,
    changelogMarkdown,
    historyRecord,
    historyList,
    signed
  };
}

export async function publishLocalReleaseToDisk(options: {
  state: WorkspaceDataState;
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  allowOverwrite?: boolean;
}): Promise<{
  manifest: DataPackageManifest;
  packageFileName: string;
  historyList: ReleaseHistoryRecord[];
  signed: boolean;
}> {
  const validation = validateWorkspaceData(options.state);
  if (!validation.valid) {
    throw new Error(
      validation.errors[0]?.messageAr || 'البيانات غير صالحة للنشر المحلي'
    );
  }

  const built = await buildSignedReleasePackage(options);
  writeMasterFilesToRepoDisk(options.state);
  writeCatalogAndDocsToRepoDisk(options.state);
  writeReleaseArtifactsToRepoDisk({
    channel: options.channel,
    packageFileName: built.packageFileName,
    zipBuffer: built.zipBuffer,
    manifestJsonText: built.manifestJsonText,
    changelogMarkdown: built.changelogMarkdown,
    history: built.historyList
  });

  return {
    manifest: built.manifest,
    packageFileName: built.packageFileName,
    historyList: built.historyList,
    signed: built.signed
  };
}

export function rollbackChannelRelease(
  channel: 'stable' | 'beta',
  targetVersion: string,
  dataRepo = OFFICIAL_DATA_REPO
): {
  restoredManifest: DataPackageManifest;
  changelogMarkdown: string;
  historyList: ReleaseHistoryRecord[];
} {
  const history = loadReleaseHistory(channel);
  const target = history.find((h) => h.version === targetVersion);
  if (!target) {
    throw new Error(`الإصدار ${targetVersion} غير موجود في سجل قناة ${channel}.`);
  }

  const channelDir = path.resolve(process.cwd(), 'data', 'releases', channel);
  const pkgPath = path.join(channelDir, target.packageFileName);
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`ملف الحزمة ${target.packageFileName} مفقود ولا يمكن استعادته.`);
  }

  const zipBytes = fs.readFileSync(pkgPath);
  const actualSha = sha256Hex(zipBytes);
  if (actualSha !== target.sha256) {
    throw new Error(
      `فشل التحقق من بصمة SHA-256 للحزمة المحفوظة ${target.packageFileName} (ملف تالف).`
    );
  }

  const rawReleaseBase = `https://raw.githubusercontent.com/${dataRepo}/main/data/releases/${channel}`;
  const restoredManifest: DataPackageManifest = {
    packageId: `umed2-pkg-${target.version}`,
    dataVersion: target.version,
    minAppVersion: '2.4.0',
    schemaVersion: 2,
    releasedAt: target.releasedAt,
    channel,
    downloadUrl: `${rawReleaseBase}/${target.packageFileName}`,
    manifestUrl: `${rawReleaseBase}/manifest.json`,
    packageFormat: 'zip',
    packageSizeKb: target.packageSizeKb,
    checksum: target.sha256,
    sha256: target.sha256,
    signature: target.signature || '',
    signatureAlgorithm: 'ECDSA-P256-SHA256',
    keyFingerprint: target.keyFingerprint || '',
    description: `استعادة الإصدار السابق v${target.version}: ${target.summary}`,
    releaseNotes: target.summary,
    changelog: [`استعادة الإصدار المعتمد ${target.version}`],
    author: 'UMEDT Data Hub (Rollback)',
    counts: target.counts,
    extendedCounts: target.extendedCounts,
    filesSha256: target.filesSha256
  };

  // Reorder history so restored version is at top without deleting newer entries for audit
  const reordered = [target, ...history.filter((h) => h.version !== target.version)];
  const changelogMarkdown = formatReleaseChangelogMarkdown(reordered);

  fs.writeFileSync(
    path.join(channelDir, 'manifest.json'),
    JSON.stringify(restoredManifest, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(channelDir, 'CHANGELOG.md'), changelogMarkdown, 'utf8');
  saveReleaseHistory(channel, reordered);

  return {
    restoredManifest,
    changelogMarkdown,
    historyList: reordered
  };
}
