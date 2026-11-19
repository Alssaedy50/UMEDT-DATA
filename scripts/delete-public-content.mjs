#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = path.join(ROOT, 'data', 'master');
const DOMAIN_FILES = {
  terms: 'terms.json',
  sentences: 'sentences.json',
  topics: 'topics.json',
  customAffixes: 'custom-affixes.json',
  customAbbreviations: 'custom-abbreviations.json',
  blocks: 'blocks.json',
  subjects: 'subjects.json',
  books: 'books.json',
  questions: 'questions.json',
  exams: 'exams.json',
  mediaAssets: 'media-index.json'
};

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  args[key.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[++i]
    : '';
}
const domain = args.domain;
const id = String(args.id || '').trim();
const reason = String(args.reason || '').trim();
if (!Object.hasOwn(DOMAIN_FILES, domain) || !id || reason.length < 8 || reason.length > 500) {
  throw new Error('Usage: node scripts/delete-public-content.mjs --domain <domain> --id <exact-id> --reason <8-500 chars>');
}

function readArray(fileName) {
  const filePath = path.join(MASTER, fileName);
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`data/master/${fileName} must contain a JSON array.`);
  return parsed;
}
function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.delete-tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempPath, filePath);
}
function containsExactToken(value, tokens) {
  if (typeof value === 'string') return tokens.has(value);
  if (Array.isArray(value)) return value.some((item) => containsExactToken(item, tokens));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsExactToken(item, tokens));
  return false;
}

const registry = readArray('public-deletions.json');
if (registry.some((entry) => entry?.domain === domain && entry?.id === id)) {
  throw new Error(`Permanent tombstone already exists for ${domain}:${id}.`);
}
const targetFile = DOMAIN_FILES[domain];
const records = readArray(targetFile);
const matches = records.filter((record) => record && record.id === id);
if (matches.length !== 1) {
  throw new Error(`Expected exactly one ${domain} record with id "${id}", found ${matches.length}. No changes made.`);
}
const target = matches[0];
const tokens = new Set([id]);
if (domain === 'mediaAssets') {
  for (const key of ['relativePath', 'rawUrl', 'fileName']) {
    if (typeof target[key] === 'string' && target[key].trim()) tokens.add(target[key].trim());
  }
}

const blockers = [];
for (const [otherDomain, fileName] of Object.entries(DOMAIN_FILES)) {
  const otherRecords = readArray(fileName);
  for (const record of otherRecords) {
    if (otherDomain === domain && record?.id === id) continue;
    if (containsExactToken(record, tokens)) blockers.push(`${otherDomain}:${record?.id || '(missing id)'}`);
  }
}
if (blockers.length) {
  throw new Error(
    `Deletion blocked because this content is still referenced by: ${blockers.slice(0, 20).join(', ')}` +
    (blockers.length > 20 ? ` and ${blockers.length - 20} more` : '') +
    '. Remove/relink dependent records first. No files were changed.'
  );
}

let mediaAbsolutePath = null;
let mediaRelativePath = null;
if (domain === 'mediaAssets' && typeof target.relativePath === 'string' && target.relativePath.trim()) {
  mediaRelativePath = target.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  mediaAbsolutePath = path.resolve(ROOT, mediaRelativePath);
  if (!mediaAbsolutePath.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('Unsafe media path; refusing to remove a file outside the repository.');
  }
}

const nextRecords = records.filter((record) => record?.id !== id);
const recordSha256 = crypto.createHash('sha256').update(JSON.stringify(target)).digest('hex');
const tombstone = {
  domain,
  id,
  deletedAt: new Date().toISOString(),
  reason,
  recordSha256
};
const nextRegistry = [...registry, tombstone];

// Stage both JSON files before replacing either. The workflow commit then records the exact
// source removal and its permanent tombstone in one Git commit.
const targetPath = path.join(MASTER, targetFile);
const registryPath = path.join(MASTER, 'public-deletions.json');
const targetTemp = `${targetPath}.delete-tmp-${process.pid}`;
const registryTemp = `${registryPath}.delete-tmp-${process.pid}`;
fs.writeFileSync(targetTemp, JSON.stringify(nextRecords, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
fs.writeFileSync(registryTemp, JSON.stringify(nextRegistry, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
fs.renameSync(targetTemp, targetPath);
fs.renameSync(registryTemp, registryPath);

let removedMediaPath = null;
if (mediaAbsolutePath && fs.existsSync(mediaAbsolutePath)) {
  fs.rmSync(mediaAbsolutePath);
  removedMediaPath = mediaRelativePath;
}
const removedPackages = [];
for (const channel of ['stable', 'beta']) {
  const releaseDir = path.join(ROOT, 'data', 'releases', channel);
  if (!fs.existsSync(releaseDir)) continue;
  for (const name of fs.readdirSync(releaseDir)) {
    if (/^umed2-data-.*\.zip$/i.test(name)) {
      fs.rmSync(path.join(releaseDir, name));
      removedPackages.push(`data/releases/${channel}/${name}`);
    }
  }
}

console.log(JSON.stringify({
  success: true,
  domain,
  id,
  deletedAt: tombstone.deletedAt,
  remainingRecords: nextRecords.length,
  tombstones: nextRegistry.length,
  removedMediaPath,
  removedPackages,
  limitation: 'Current published files/assets are removed. Git history, forks, backups and files already downloaded by users are not erased.'
}, null, 2));
