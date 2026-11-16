#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const readArg = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const hasArg = (name) => args.includes(name);
const channel = readArg('--channel') === 'beta' ? 'beta' : 'stable';
const outputDir = path.join(ROOT, 'data', 'releases', channel);
const manifestPath = path.join(outputDir, 'manifest.json');
const historyPath = path.join(outputDir, 'history.json');
const changelogPath = path.join(outputDir, 'CHANGELOG.md');
const catalogPath = path.join(ROOT, 'data', 'catalog.json');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const jsonText = (value) => JSON.stringify(value, null, 2);
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const masterFiles = ['blocks.json','subjects.json','topics.json','terms.json','sentences.json','custom-affixes.json','custom-abbreviations.json','books.json','questions.json','exams.json','media-index.json'];
const domainByFile = {
  'blocks.json':'blocks','subjects.json':'subjects','topics.json':'topics','terms.json':'terms',
  'sentences.json':'sentences','custom-affixes.json':'customAffixes','custom-abbreviations.json':'customAbbreviations',
  'books.json':'books','questions.json':'questions','exams.json':'exams','media-index.json':'mediaAssets'
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  const ordered = [...entries.entries()].sort(([a],[b]) => a.localeCompare(b));
  for (const [name, source] of ordered) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(source) ? source : Buffer.from(source);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(8,8); local.writeUInt16LE(0,10); local.writeUInt16LE(0x21,12);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(compressed.length,18); local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(nameBytes.length,26); local.writeUInt16LE(0,28);
    localParts.push(local,nameBytes,compressed);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8); central.writeUInt16LE(8,10); central.writeUInt16LE(0,12); central.writeUInt16LE(0x21,14);
    central.writeUInt32LE(crc,16); central.writeUInt32LE(compressed.length,20); central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(nameBytes.length,28); central.writeUInt16LE(0,30); central.writeUInt16LE(0,32);
    central.writeUInt16LE(0,34); central.writeUInt16LE(0,36); central.writeUInt32LE(0,38); central.writeUInt32LE(offset,42);
    nameBytes.copy(central,46); centralParts.push(central);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const localBuffer = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(0,4); end.writeUInt16LE(0,6);
  end.writeUInt16LE(ordered.length,8); end.writeUInt16LE(ordered.length,10);
  end.writeUInt32LE(centralBuffer.length,12); end.writeUInt32LE(localBuffer.length,16); end.writeUInt16LE(0,20);
  return Buffer.concat([localBuffer,centralBuffer,end]);
}

function verifyZip(bytes) {
  const signature = bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (signature < 0) throw new Error('Generated ZIP is missing its EOCD record');
  const total = bytes.readUInt16LE(signature + 10);
  let cursor = bytes.readUInt32LE(signature + 16);
  const names = new Set();
  for (let i=0;i<total;i++) {
    if (bytes.readUInt32LE(cursor)!==0x02014b50) throw new Error('Generated ZIP central directory is corrupt');
    const method=bytes.readUInt16LE(cursor+10), csize=bytes.readUInt32LE(cursor+20), usize=bytes.readUInt32LE(cursor+24);
    const nlen=bytes.readUInt16LE(cursor+28), elen=bytes.readUInt16LE(cursor+30), clen=bytes.readUInt16LE(cursor+32), lo=bytes.readUInt32LE(cursor+42);
    const name=bytes.subarray(cursor+46,cursor+46+nlen).toString('utf8'); names.add(name);
    const lnl=bytes.readUInt16LE(lo+26), lel=bytes.readUInt16LE(lo+28), start=lo+30+lnl+lel;
    const packed=bytes.subarray(start,start+csize);
    const content=method===0?packed:method===8?zlib.inflateRawSync(packed):null;
    if(!content || content.length!==usize || crc32(content)!==bytes.readUInt32LE(cursor+16)) throw new Error('ZIP entry failed CRC/size validation: '+name);
    cursor+=46+nlen+elen+clen;
  }
  for(const file of masterFiles) if(!names.has('data/master/'+file)) throw new Error('ZIP missing data/master/'+file);
  for(const alias of ['terms.json','sentences.json','topics.json','affixes.json','abbreviations.json']) if(!names.has(alias)) throw new Error('ZIP missing legacy alias '+alias);
  if(!names.has('data/catalog.json') || !names.has('manifest.json')) throw new Error('ZIP missing catalog or inner manifest');
  return names;
}

const oldManifest = fs.existsSync(manifestPath) ? readJson('data/releases/'+channel+'/manifest.json') : {};
const currentVersion = String(oldManifest.dataVersion || '2026.11.0-umd');
const targetVersion = readArg('--version') || (() => {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-[a-z0-9.-]+)?$/i);
  if (!match) throw new Error('Cannot auto-increment current data version: '+currentVersion);
  const suffix = channel === 'beta' ? '-beta' : '-umd';
  return match[1]+'.'+match[2]+'.'+(Number(match[3])+1)+suffix;
})();
if (targetVersion === currentVersion) throw new Error('Refusing to reuse the currently published dataVersion: '+targetVersion);
if (oldManifest.dataVersion && targetVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) <= 0) {
  throw new Error('Target dataVersion must be newer than current release '+currentVersion);
}

const privatePem = process.env.UMED_PUBLISHER_PRIVATE_KEY_PEM || '';
const publicPem = process.env.VITE_UMED_PUBLIC_KEY_PEM || process.env.UMED_PUBLISHER_PUBLIC_KEY_PEM || '';
if (!privatePem.trim() || !publicPem.trim()) throw new Error('Permanent signing keys are required: set UMED_PUBLISHER_PRIVATE_KEY_PEM secret and VITE_UMED_PUBLIC_KEY_PEM variable. Unsigned releases are prohibited.');

const privateKey = crypto.createPrivateKey(privatePem);
const publicKey = crypto.createPublicKey(publicPem);
if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Private key must be ECDSA P-256 PKCS#8');
if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Public key must be ECDSA P-256 SPKI');
const publicDer = publicKey.export({type:'spki',format:'der'});
const keyFingerprint = sha256(publicDer).slice(0,16);

const catalog = readJson('data/catalog.json');
const now = new Date().toISOString();
const arrays = {};
const counts = {};
const filesSha256 = {};
for (const fileName of masterFiles) {
  const filePath = 'data/master/'+fileName;
  const parsed = readJson(filePath);
  if (!Array.isArray(parsed)) throw new Error(filePath+' must contain a JSON array');
  arrays[domainByFile[fileName]] = parsed;
  counts[domainByFile[fileName]] = parsed.length;
  filesSha256[fileName] = sha256(Buffer.from(jsonText(parsed),'utf8'));
}
if (!Array.isArray(catalog.collections)) throw new Error('Catalog collections array is missing');
for (const [fileName, domain] of Object.entries(domainByFile)) {
  const descriptor = catalog.collections.find((entry)=>entry.id===domain);
  if (!descriptor) throw new Error('Catalog descriptor missing: '+domain);
  descriptor.recordCount = counts[domain];
  descriptor.sha256 = filesSha256[fileName];
  descriptor.sizeBytes = Buffer.byteLength(jsonText(arrays[domain]),'utf8');
  descriptor.updatedAt = now;
}
catalog.catalogVersion = targetVersion;
catalog.generatedAt = now;

const localAssets = [];
for (const asset of arrays.mediaAssets) {
  if (!asset.relativePath?.startsWith('data/media/')) continue;
  const absolute = path.resolve(ROOT, asset.relativePath);
  if (!absolute.startsWith(path.resolve(ROOT,'data/media')+path.sep) || !fs.existsSync(absolute)) throw new Error('Missing or unsafe local media: '+asset.relativePath);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== asset.sizeBytes || sha256(bytes)!==asset.sha256) throw new Error('Media integrity mismatch: '+asset.relativePath);
  localAssets.push(asset);
}
const mediaSha256 = Object.fromEntries(localAssets.map((asset)=>[asset.relativePath,asset.sha256]));

const countsLegacy = {
  terms: counts.terms, sentences: counts.sentences, topics: counts.topics,
  affixes: counts.customAffixes, abbreviations: counts.customAbbreviations
};
const previousHashes = oldManifest.filesSha256 || {};
const changedDomains = Object.keys(filesSha256).filter((name)=>previousHashes[name]!==filesSha256[name]);
const previousMedia = oldManifest.mediaSha256 || {};
for (const [file,digest] of Object.entries(mediaSha256)) if (previousMedia[file]!==digest) changedDomains.push(file);

const packageName = 'umed2-data-'+targetVersion+'.zip';
const rawBase = 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main';
const releaseBase = rawBase+'/data/releases/'+channel;
const innerManifest = {
  packageId:'umed2-pkg-'+targetVersion, dataVersion:targetVersion, minAppVersion:'2.4.0',
  schemaVersion:2, releasedAt:now, channel, signatureAlgorithm:'ECDSA-P256-SHA256',
  keyFingerprint, description:readArg('--summary') || 'UMEDT complete academic data release',
  releaseNotes:readArg('--summary') || 'UMEDT complete academic data release',
  changelog:changedDomains, author:'UMEDT-DATA Release Automation',
  downloadUrl:releaseBase+'/'+packageName, counts:countsLegacy, extendedCounts:counts,
  filesSha256, mediaSha256
};

const entries = new Map();
entries.set('manifest.json',Buffer.from(jsonText(innerManifest),'utf8'));
entries.set('terms.json',Buffer.from(jsonText(arrays.terms),'utf8'));
entries.set('sentences.json',Buffer.from(jsonText(arrays.sentences),'utf8'));
entries.set('topics.json',Buffer.from(jsonText(arrays.topics),'utf8'));
entries.set('affixes.json',Buffer.from(jsonText(arrays.customAffixes),'utf8'));
entries.set('abbreviations.json',Buffer.from(jsonText(arrays.customAbbreviations),'utf8'));
entries.set('data/catalog.json',Buffer.from(jsonText(catalog),'utf8'));
for(const fileName of masterFiles) entries.set('data/master/'+fileName,Buffer.from(jsonText(arrays[domainByFile[fileName]]),'utf8'));
for(const fileName of ['catalog.schema.json','manifest.schema.json','content-entities.schema.json']) {
  const filePath='docs/schemas/'+fileName;
  entries.set(filePath,fs.readFileSync(path.join(ROOT,filePath)));
}
entries.set('docs/UMEDT-DATA-API-CONTRACT.md',fs.readFileSync(path.join(ROOT,'docs/UMEDT-DATA-API-CONTRACT.md')));
entries.set('README.md',fs.readFileSync(path.join(ROOT,'README.md')));
for(const asset of localAssets) entries.set(asset.relativePath,fs.readFileSync(path.join(ROOT,asset.relativePath)));

const zipBytes = createZip(entries);
if(zipBytes.length > 25*1024*1024) throw new Error('Release ZIP exceeds UMEDT 25 MB download limit');
const zipNames = verifyZip(zipBytes);
const signature = crypto.sign('sha256',zipBytes,{key:privateKey});
if(!crypto.verify('sha256',zipBytes,publicKey,signature)) throw new Error('ECDSA signature self-verification failed');
const digest = sha256(zipBytes);
const packageSizeKb = Number((zipBytes.length/1024).toFixed(1));
const manifest = {
  ...innerManifest, manifestUrl:releaseBase+'/manifest.json', packageFormat:'zip',
  packageSizeKb, checksum:digest, sha256:digest, signature:signature.toString('base64'),
  keyFingerprint, assetsSha256:mediaSha256
};
const history = fs.existsSync(historyPath) ? readJson('data/releases/'+channel+'/history.json') : [];
if (!Array.isArray(history)) throw new Error('Release history must be a JSON array');
const historyRecord = {
  version:targetVersion,channel,releasedAt:now,packageFileName:packageName,sha256:digest,
  packageSizeKb,signed:true,signature:manifest.signature,keyFingerprint,summary:manifest.description,
  counts:countsLegacy,extendedCounts:counts,filesSha256,changedDomains
};
const nextHistory = [historyRecord,...history.filter((item)=>item.version!==targetVersion)].slice(0,30);
const oldChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath,'utf8') : '# UMEDT-DATA Changelog\n';
const newSection = [
  '## v'+targetVersion+' ('+channel+') — '+now,
  '- Summary: '+manifest.description,
  '- Package: `'+packageName+'` ('+packageSizeKb+' KB)',
  '- SHA-256: `'+digest+'`',
  '- Signature: ECDSA-P256-SHA256; key fingerprint `'+keyFingerprint+'`',
  '- Changed domains: '+(changedDomains.join(', ') || 'metadata-only'),
  '- Records: '+Object.entries(counts).map(([key,value])=>key+'='+value).join(', '),
  ''
].join('\n');
const changelog = oldChangelog.replace(/^# UMEDT-DATA Changelog\s*/,'# UMEDT-DATA Changelog\n\n')+'\n'+newSection;
const versionFloor = {dataVersion:targetVersion,channel,updatedAt:now};

if (!hasArg('--dry-run')) {
  fs.mkdirSync(outputDir,{recursive:true});
  fs.writeFileSync(catalogPath,jsonText(catalog)+'\n');
  fs.writeFileSync(path.join(outputDir,packageName),zipBytes);
  fs.writeFileSync(manifestPath,jsonText(manifest)+'\n');
  fs.writeFileSync(historyPath,jsonText(nextHistory)+'\n');
  fs.writeFileSync(changelogPath,changelog);
  fs.writeFileSync(path.join(outputDir,'version-floor.json'),jsonText(versionFloor)+'\n');
}
console.log(JSON.stringify({
  success:true,dryRun:hasArg('--dry-run'),channel,version:targetVersion,
  packageName,packageBytes:zipBytes.length,packageSha256:digest,signatureAlgorithm:'ECDSA-P256-SHA256',
  keyFingerprint,collections:Object.keys(arrays).length,counts,localMediaFiles:localAssets.length,
  zipEntryCount:zipNames.size,changedDomains
},null,2));
