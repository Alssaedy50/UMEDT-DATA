import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceScript = path.join(repoRoot, 'scripts', 'delete-public-content.mjs');
const domainFiles = [
  'terms.json', 'sentences.json', 'topics.json', 'custom-affixes.json',
  'custom-abbreviations.json', 'blocks.json', 'subjects.json', 'books.json',
  'questions.json', 'exams.json', 'media-index.json'
];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'umedt-delete-test-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'master'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'releases', 'stable'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'releases', 'beta'), { recursive: true });
  fs.copyFileSync(sourceScript, path.join(root, 'scripts', 'delete-public-content.mjs'));
  for (const file of domainFiles) fs.writeFileSync(path.join(root, 'data', 'master', file), '[]\n');
  fs.writeFileSync(path.join(root, 'data', 'master', 'public-deletions.json'), '[]\n');
  return root;
}
function writeJson(root, file, value) {
  fs.writeFileSync(path.join(root, 'data', 'master', file), JSON.stringify(value, null, 2) + '\n');
}
function run(root, id) {
  return spawnSync(process.execPath, [
    path.join(root, 'scripts', 'delete-public-content.mjs'),
    '--domain', 'terms', '--id', id, '--reason', 'Validated test deletion'
  ], { encoding: 'utf8' });
}

const root = fixture();
try {
  writeJson(root, 'terms.json', [{ id: 'remove-me', term: 'Remove me' }, { id: 'keep-me', term: 'Keep me' }]);
  fs.writeFileSync(path.join(root, 'data', 'releases', 'stable', 'umed2-data-old.zip'), 'old');
  fs.writeFileSync(path.join(root, 'data', 'releases', 'beta', 'umed2-data-old.zip'), 'old');
  const success = run(root, 'remove-me');
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data', 'master', 'terms.json'), 'utf8')).map((x) => x.id), ['keep-me']);
  const tombstones = JSON.parse(fs.readFileSync(path.join(root, 'data', 'master', 'public-deletions.json'), 'utf8'));
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].domain, 'terms');
  assert.equal(tombstones[0].id, 'remove-me');
  assert.equal(fs.existsSync(path.join(root, 'data', 'releases', 'stable', 'umed2-data-old.zip')), false);
  assert.equal(fs.existsSync(path.join(root, 'data', 'releases', 'beta', 'umed2-data-old.zip')), false);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const blockedRoot = fixture();
try {
  writeJson(blockedRoot, 'terms.json', [{ id: 'referenced-term', term: 'Referenced term' }]);
  writeJson(blockedRoot, 'sentences.json', [{ id: 'sentence-1', linkedTermIds: ['referenced-term'] }]);
  const before = fs.readFileSync(path.join(blockedRoot, 'data', 'master', 'terms.json'), 'utf8');
  const blocked = run(blockedRoot, 'referenced-term');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr + blocked.stdout, /Deletion blocked/);
  assert.equal(fs.readFileSync(path.join(blockedRoot, 'data', 'master', 'terms.json'), 'utf8'), before);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(blockedRoot, 'data', 'master', 'public-deletions.json'), 'utf8')), []);
} finally {
  fs.rmSync(blockedRoot, { recursive: true, force: true });
}

console.log('Public content deletion tests passed.');
