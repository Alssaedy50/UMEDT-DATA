import crypto from 'node:crypto';
import JSZip from 'jszip';
import type {
  DataPackageManifest,
  DiffReport,
  DomainDiffStats,
  MasterDataCounts,
  ReleaseKeyPair,
  ValidationIssueItem,
  ValidationReport,
  WorkspaceDataState
} from '../src/types/umedtData.ts';
import { computeWorkspaceCounts, readMediaBinary } from './workspaceStore.ts';

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
  checkUniqueIds(state.questions, 'questions', 'الأسئلة التقييمية');
  checkUniqueIds(state.mediaAssets, 'mediaAssets', 'المرفقات والوسائط');

  const totalRecords =
    counts.blocks +
    counts.subjects +
    counts.topics +
    counts.terms +
    counts.sentences +
    counts.customAffixes +
    counts.customAbbreviations +
    counts.questions;

  if (totalRecords === 0) {
    errors.push({
      severity: 'error',
      domain: 'workspace',
      messageAr: 'المسودة فارغة بالكامل؛ يجب استيراد البيانات أو إضافة سجل واحد على الأقل قبل النشر.'
    });
  }

  // Normalized term uniqueness
  const termKeys = new Map<string, string>();
  for (const t of state.terms) {
    if (!t.term || !t.term.trim()) {
      errors.push({
        severity: 'error',
        domain: 'terms',
        recordId: t.id,
        messageAr: `المصطلح (${t.id}) لا يحتوي على نص إنجليزي.`
      });
      continue;
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

  // Referential checks: subjects -> blocks
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

  // Referential checks: topics -> blocks & subjects
  for (const tp of state.topics) {
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

  // Media security checks (path traversal & dangerous extensions)
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
    computeCollectionDiff('questions', 'بنك الأسئلة', draft.questions, remote.questions || []),
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

export async function buildSignedReleasePackage(options: {
  state: WorkspaceDataState;
  version: string;
  channel: 'stable' | 'beta';
  summary: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  dataRepo?: string;
}): Promise<{
  packageFileName: string;
  zipBuffer: Buffer;
  manifest: DataPackageManifest;
  manifestJsonText: string;
  changelogMarkdown: string;
  signed: boolean;
}> {
  const { state, version, channel, summary } = options;
  const dataRepo = (options.dataRepo || state.meta.dataRepo || 'Alssaedy50/UMEDT_DATA').trim();
  const counts = computeWorkspaceCounts(state);
  const packageFileName = `umed2-data-${version}.zip`;
  const rawReleaseBase = `https://raw.githubusercontent.com/${dataRepo}/main/data/releases/${channel}`;
  const downloadUrl = `${rawReleaseBase}/${packageFileName}`;
  const manifestUrl = `${rawReleaseBase}/manifest.json`;
  const publishedAt = new Date().toISOString();

  const zip = new JSZip();
  zip.file('data/blocks.json', JSON.stringify(state.blocks, null, 2));
  zip.file('data/subjects.json', JSON.stringify(state.subjects, null, 2));
  zip.file('data/topics.json', JSON.stringify(state.topics, null, 2));
  zip.file('data/terms.json', JSON.stringify(state.terms, null, 2));
  zip.file('data/sentences.json', JSON.stringify(state.sentences, null, 2));
  zip.file('data/custom-affixes.json', JSON.stringify(state.customAffixes, null, 2));
  zip.file('data/custom-abbreviations.json', JSON.stringify(state.customAbbreviations, null, 2));
  zip.file('data/questions.json', JSON.stringify(state.questions, null, 2));
  zip.file('data/media-index.json', JSON.stringify(state.mediaAssets, null, 2));

  // Include local binary attachments under media/
  for (const asset of state.mediaAssets) {
    const bin = readMediaBinary(asset);
    if (bin) {
      const zipPath = asset.relativePath.replace(/^data\//, '');
      zip.file(zipPath, bin);
    }
  }

  const prelimManifest = {
    packageId: `umed2-pkg-${version}`,
    dataVersion: version,
    minAppVersion: '2.4.0',
    schemaVersion: 2,
    publishedAt,
    channel,
    downloadUrl,
    manifestUrl,
    packageFormat: 'zip' as const,
    summary,
    author: 'UMEDT Data Hub',
    counts
  };

  zip.file('manifest.json', JSON.stringify(prelimManifest, null, 2));

  const zipUint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  const zipBuffer = Buffer.from(zipUint8);
  const digest = sha256Hex(zipBuffer);

  let signature = '';
  let keyFingerprintSha256 = '';
  let signed = false;

  if (options.privateKeyPem && options.privateKeyPem.trim()) {
    signature = await signBytesWithPrivateKey(zipUint8, options.privateKeyPem);
    signed = true;
    if (options.publicKeyPem && options.publicKeyPem.trim()) {
      const spki = pemToArrayBuffer(options.publicKeyPem);
      keyFingerprintSha256 = sha256Hex(Buffer.from(spki));
    }
  }

  const manifest: DataPackageManifest = {
    ...prelimManifest,
    checksum: digest,
    sha256: digest,
    signature,
    signatureAlgorithm: 'ECDSA-P256-SHA256',
    keyFingerprintSha256,
    fileSizeBytes: zipBuffer.byteLength
  };

  const manifestJsonText = JSON.stringify(manifest, null, 2);
  const changelogMarkdown = [
    `# UMEDT Data Release ${version} (${channel})`,
    '',
    `- **Published At:** ${publishedAt}`,
    `- **Summary:** ${summary}`,
    `- **Package:** \`${packageFileName}\` (${(zipBuffer.byteLength / 1024).toFixed(1)} KB)`,
    `- **SHA-256:** \`${digest}\``,
    `- **Signed:** ${signed ? `Yes (${keyFingerprintSha256.slice(0, 16)}...)` : 'Unsigned preview bundle'}`,
    '',
    '## Included Counts',
    `- Blocks: ${counts.blocks}`,
    `- Subjects: ${counts.subjects}`,
    `- Topics: ${counts.topics}`,
    `- Terms: ${counts.terms}`,
    `- Sentences: ${counts.sentences}`,
    `- Affixes: ${counts.customAffixes}`,
    `- Abbreviations: ${counts.customAbbreviations}`,
    `- Questions: ${counts.questions}`,
    `- Media Attachments: ${counts.mediaAssets}`
  ].join('\n');

  return {
    packageFileName,
    zipBuffer,
    manifest,
    manifestJsonText,
    changelogMarkdown,
    signed
  };
}
