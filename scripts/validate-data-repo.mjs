#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const CHANNEL_DIR = path.join(ROOT, 'data', 'releases', process.env.UMED_RELEASE_CHANNEL === 'beta' ? 'beta' : 'stable');
const FILES = {
  blocks: 'blocks.json',
  subjects: 'subjects.json',
  topics: 'topics.json',
  terms: 'terms.json',
  sentences: 'sentences.json',
  customAffixes: 'custom-affixes.json',
  customAbbreviations: 'custom-abbreviations.json',
  books: 'books.json',
  questions: 'questions.json',
  exams: 'exams.json',
  mediaAssets: 'media-index.json'
};
const args = new Set(process.argv.slice(2));
const skipRelease = args.has('--skip-release-artifact-check') || args.has('--pre-release');
const requireSigned = args.has('--require-signed');
const errors = [];
const warnings = [];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipEntries(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found');
  const total = view.getUint16(eocd + 10, true);
  if (total > 64) throw new Error('ZIP entry count exceeds UMEDT limit (64)');
  let cursor = view.getUint32(eocd + 16, true);
  const entries = new Map();
  let totalUncompressed = 0;
  for (let index = 0; index < total; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.startsWith('/') || name.split('/').includes('..') || /^[A-Za-z]:/.test(name)) {
      throw new Error('Unsafe ZIP entry path: ' + name);
    }
    if (name.split('/').length > 4) throw new Error('ZIP entry path depth exceeds UMEDT limit: ' + name);
    if (uncompressedSize > 20 * 1024 * 1024) throw new Error('ZIP entry exceeds UMEDT per-file limit: ' + name);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 50 * 1024 * 1024) throw new Error('ZIP archive exceeds UMEDT total extraction limit');
    if (compressedSize > 0 && uncompressedSize > 2048 && uncompressedSize / compressedSize > 80) throw new Error('ZIP compression ratio exceeds UMEDT limit: ' + name);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Invalid local ZIP header: ' + name);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!content) throw new Error('Unsupported ZIP compression method ' + method + ' for ' + name);
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc) throw new Error('ZIP size/CRC mismatch: ' + name);
    entries.set(name, content);
  }
  return entries;
}

function validateRelations(data) {
  const ids = (key) => new Set((data[key] || []).map((item) => item.id));
  const blocks = ids('blocks'), subjects = ids('subjects'), topics = ids('topics');
  const terms = ids('terms'), questions = ids('questions'), media = ids('mediaAssets');
  const check = (records, field, allowed, domain) => {
    for (const record of records || []) {
      const value = record[field];
      if (typeof value === 'string' && value && !allowed.has(value)) fail(domain + '.' + record.id + ' references missing ' + field + ': ' + value);
      if (Array.isArray(value)) for (const id of value) if (!allowed.has(id)) fail(domain + '.' + record.id + ' references missing ' + field + ': ' + id);
    }
  };
  check(data.subjects, 'blockId', blocks, 'subjects');
  check(data.topics, 'blockId', blocks, 'topics');
  check(data.topics, 'subjectId', subjects, 'topics');
  check(data.books, 'blockId', blocks, 'books');
  check(data.books, 'subjectId', subjects, 'books');
  check(data.books, 'topicIds', topics, 'books');
  check(data.books, 'mediaAssetId', media, 'books');
  check(data.questions, 'blockId', blocks, 'questions');
  check(data.questions, 'subjectId', subjects, 'questions');
  check(data.questions, 'topicId', topics, 'questions');
  check(data.questions, 'linkedTermIds', terms, 'questions');
  check(data.exams, 'blockId', blocks, 'exams');
  check(data.exams, 'subjectId', subjects, 'exams');
  check(data.exams, 'topicId', topics, 'exams');
  check(data.exams, 'questionIds', questions, 'exams');
  check(data.sentences, 'linkedTermIds', terms, 'sentences');
  for (const term of data.terms || []) {
    check([term], 'linkedBlockIds', blocks, 'terms');
    check([term], 'linkedSubjectIds', subjects, 'terms');
    check([term], 'linkedTopicIds', topics, 'terms');
  }
}

const data = {};
const counts = {};
const fileHashes = {};
for (const [domain, fileName] of Object.entries(FILES)) {
  const filePath = 'data/master/' + fileName;
  if (!fs.existsSync(path.join(ROOT, filePath))) { fail('Missing required master file: ' + filePath); continue; }
  let parsed;
  try { parsed = readJson(filePath); } catch (error) { fail('Invalid JSON in ' + filePath + ': ' + error.message); continue; }
  if (!Array.isArray(parsed)) { fail(filePath + ' must contain a JSON array'); continue; }
  const seen = new Set();
  for (const item of parsed) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) fail(filePath + ' contains a record without a valid id');
    else if (seen.has(item.id)) fail(filePath + ' contains duplicate id: ' + item.id);
    else seen.add(item.id);
  }
  data[domain] = parsed;
  counts[domain] = parsed.length;
  fileHashes[fileName] = sha256(Buffer.from(JSON.stringify(parsed, null, 2), 'utf8'));
}

let catalog, manifest;
try { catalog = readJson('data/catalog.json'); } catch (error) { fail('Invalid data/catalog.json: ' + error.message); }
try { manifest = readJson('data/releases/' + (process.env.UMED_RELEASE_CHANNEL === 'beta' ? 'beta' : 'stable') + '/manifest.json'); }
catch (error) { fail('Invalid release manifest: ' + error.message); }

if (catalog && manifest) {
  if (!Array.isArray(catalog.collections)) fail('Catalog collections must be an array');
  else {
    const byId = new Map(catalog.collections.map((entry) => [entry.id, entry]));
    for (const [domain, fileName] of Object.entries(FILES)) {
      const descriptor = byId.get(domain);
      if (!descriptor) { fail('Catalog is missing collection descriptor: ' + domain); continue; }
      if (descriptor.path !== 'data/master/' + fileName) fail('Catalog path mismatch for ' + domain);
      if (descriptor.recordCount !== counts[domain]) fail('Catalog recordCount mismatch for ' + domain);
      if (descriptor.sha256 !== fileHashes[fileName]) fail('Catalog SHA-256 mismatch for ' + domain);
      if (!descriptor.rawUrl || !descriptor.schemaUrl) fail('Catalog URLs missing for ' + domain);
    }
    if (catalog.collections.length !== Object.keys(FILES).length) fail('Catalog must contain exactly ' + Object.keys(FILES).length + ' master collections');
  }
  if (catalog.repository !== 'Alssaedy50/UMEDT-DATA') fail('Catalog repository identity is incorrect');
  if (catalog.catalogVersion !== manifest.dataVersion) fail('Catalog version does not match stable manifest version');
  if (!manifest.dataVersion || !manifest.sha256 || !manifest.downloadUrl) fail('Manifest is missing required release metadata');
  for (const [fileName, digest] of Object.entries(fileHashes)) {
    if (manifest.filesSha256?.[fileName] !== digest) fail('Manifest filesSha256 mismatch for ' + fileName);
  }
  for (const [domain, count] of Object.entries(counts)) {
    if (manifest.extendedCounts && manifest.extendedCounts[domain] !== count) fail('Manifest extendedCounts mismatch for ' + domain);
  }
}

validateRelations(data);

let localMediaCount = 0;
let externalMediaCount = 0;
for (const asset of data.mediaAssets || []) {
  if (!asset || typeof asset.id !== 'string') continue;
  if (typeof asset.relativePath === 'string' && asset.relativePath.startsWith('data/media/')) {
    localMediaCount++;
    const absolute = path.resolve(ROOT, asset.relativePath);
    if (!absolute.startsWith(path.resolve(ROOT, 'data/media') + path.sep)) { fail('Unsafe media path: ' + asset.relativePath); continue; }
    if (!fs.existsSync(absolute)) { fail('Missing local media file: ' + asset.relativePath); continue; }
    const bytes = fs.readFileSync(absolute);
    if (asset.sizeBytes !== bytes.length) fail('Media size mismatch: ' + asset.relativePath);
    if (asset.sha256 !== sha256(bytes)) fail('Media SHA-256 mismatch: ' + asset.relativePath);
    if (path.extname(asset.fileName || absolute).toLowerCase() === '.svg') {
      const svg = bytes.toString('utf8');
      if (asset.mimeType !== 'image/svg+xml') fail('SVG MIME type must be image/svg+xml: ' + asset.id);
      if (bytes.length > 2 * 1024 * 1024) fail('SVG exceeds 2 MB: ' + asset.id);
      if (!/<svg\\b[\\s\\S]*<\\/svg\\s*>/i.test(svg) || /<script\\b|<foreignObject\\b|\\son[a-z0-9_-]+\\s*=|javascript:|@import/i.test(svg)) {
        fail('SVG contains invalid or active content: ' + asset.relativePath);
      }
    }
  } else if (/^https?:\/\//i.test(asset.rawUrl || asset.relativePath || '')) {
    externalMediaCount++;
    if (!asset.rawUrl) warn('External media has no rawUrl: ' + asset.id);
  } else {
    fail('Media asset has neither a safe local path nor an HTTP URL: ' + asset.id);
  }
}
for (const schemaFile of ['docs/schemas/catalog.schema.json','docs/schemas/manifest.schema.json','docs/schemas/content-entities.schema.json']) {
  try { readJson(schemaFile); } catch (error) { fail('Invalid schema ' + schemaFile + ': ' + error.message); }
}

if (!skipRelease && manifest) {
  const packageName = path.basename(new URL(manifest.downloadUrl).pathname);
  const packagePath = path.join(CHANNEL_DIR, packageName);
  if (!fs.existsSync(packagePath)) fail('Release package is missing: ' + packagePath);
  else {
    const bytes = fs.readFileSync(packagePath);
    const digest = sha256(bytes);
    if (digest !== manifest.sha256 || digest !== manifest.checksum) fail('Release ZIP SHA-256 does not match manifest');
    if (Math.abs(bytes.length / 1024 - manifest.packageSizeKb) > 0.2) fail('Release packageSizeKb does not match actual package size');
    try {
      const entries = readZipEntries(bytes);
      for (const fileName of Object.values(FILES)) {
        const entryName = 'data/master/' + fileName;
        if (!entries.has(entryName)) fail('Release ZIP missing ' + entryName);
        else {
          try {
            const zippedArray = JSON.parse(entries.get(entryName).toString('utf8'));
            if (!Array.isArray(zippedArray) || sha256(Buffer.from(JSON.stringify(zippedArray, null, 2), 'utf8')) !== fileHashes[fileName]) {
              fail('Release ZIP collection content/hash mismatch: ' + entryName);
            }
          } catch (error) { fail('Invalid JSON in release ZIP ' + entryName + ': ' + error.message); }
        }
      }
      for (const asset of data.mediaAssets || []) {
        if (asset.relativePath?.startsWith('data/media/')) {
          if (!entries.has(asset.relativePath)) fail('Release ZIP missing media asset ' + asset.relativePath);
          else if (sha256(entries.get(asset.relativePath)) !== asset.sha256) fail('Release ZIP media SHA-256 mismatch: ' + asset.relativePath);
          if (manifest.assetsSha256?.[asset.relativePath] !== asset.sha256) fail('Manifest assetsSha256 mismatch: ' + asset.relativePath);
        }
      }
      if (!entries.has('data/catalog.json')) fail('Release ZIP missing data/catalog.json');
      if (!entries.has('manifest.json')) fail('Release ZIP missing inner manifest.json');
      else {
        const inner = JSON.parse(entries.get('manifest.json').toString('utf8'));
        if (inner.dataVersion !== manifest.dataVersion) fail('Inner ZIP manifest version does not match outer manifest');
      }
      const requiredAliases = ['terms.json','sentences.json','topics.json','affixes.json','abbreviations.json'];
      for (const alias of requiredAliases) if (!entries.has(alias)) fail('Release ZIP missing legacy compatibility file ' + alias);
    } catch (error) { fail('Release ZIP is invalid: ' + error.message); }
    if (!manifest.signature || !manifest.keyFingerprint) {
      if (requireSigned) fail('Release is unsigned: signature/keyFingerprint are required');
      else warn('Current stable release is unsigned; production app signature verification will reject it when a trusted public key is configured.');
    } else {
      const publicPem = process.env.VITE_UMED_PUBLIC_KEY_PEM || process.env.UMED_PUBLISHER_PUBLIC_KEY_PEM || '';
      if (publicPem) {
        try {
          const publicKey = crypto.createPublicKey(publicPem);
          const fingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' })).slice(0, 16);
          if (fingerprint !== manifest.keyFingerprint) fail('Manifest keyFingerprint does not match configured public key');
          if (!crypto.verify('sha256', fs.readFileSync(packagePath), publicKey, Buffer.from(manifest.signature, 'base64'))) fail('Release signature verification failed');
        } catch (error) { fail('Could not verify release signature: ' + error.message); }
      } else if (requireSigned) fail('VITE_UMED_PUBLIC_KEY_PEM is required to verify a signed release');
      else warn('Signed release exists but no public key was provided to the validator.');
    }
  }
}

if (errors.length) {
  console.error('UMEDT-DATA validation FAILED');
  for (const error of errors) console.error('ERROR: ' + error);
  for (const warning of warnings) console.warn('WARNING: ' + warning);
  process.exit(1);
}
console.log('UMEDT-DATA validation PASSED');
console.log('Counts:', JSON.stringify(counts));
console.log('Local media files:', localMediaCount, '| external media references:', externalMediaCount);
for (const warning of warnings) console.warn('WARNING: ' + warning);
