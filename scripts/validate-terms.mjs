import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const termsPath = path.join(root, 'data/master/terms.json');
const catalogPath = path.join(root, 'data/catalog.json');
const raw = fs.readFileSync(termsPath, 'utf8');
const terms = JSON.parse(raw);
if (!Array.isArray(terms)) throw new Error('terms.json must be a JSON array');

const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[’‘]/g, "'")
  .replace(/[‐‑‒–—]/g, '-')
  .replace(/[^a-z0-9'-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const termTokenPattern = /^[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF()[\]{}.,'’+\-/]+$/;
const required = ['id','term','translation','definitionEn','definitionAr','exampleEn','exampleAr'];
const optional = ['pronunciation'];
const ids = new Set();
const keys = new Map();
const errors = [];

for (let i = 0; i < terms.length; i++) {
  const t = terms[i];
  const label = `terms[${i}]`;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errors.push(`${label}: expected object`);
    continue;
  }
  for (const field of required) {
    if (typeof t[field] !== 'string' || !t[field].trim()) errors.push(`${label}: missing ${field}`);
  }
  if (typeof t.id === 'string') {
    if (ids.has(t.id)) errors.push(`${label}: duplicate id ${t.id}`);
    ids.add(t.id);
  }
  if (typeof t.term === 'string') {
    const termWords = t.term.trim().split(/\s+/);
    if (termWords.length > 6 || termWords.some((word) => !termTokenPattern.test(word))) errors.push(`${label}: term must be a medical term of up to six words, not a sentence: ${t.term}`);
    const key = normalize(t.term);
    if (!key) errors.push(`${label}: empty normalized term`);
    if (keys.has(key)) errors.push(`${label}: duplicate term ${t.term} conflicts with record ${keys.get(key)}`);
    else keys.set(key, t.id || label);
  }
  if (typeof t.translation === 'string' && !/[\u0600-\u06FF]/.test(t.translation)) {
    errors.push(`${label}: translation must contain Arabic script`);
  }
  if (typeof t.translation === 'string' && /^(مصطلح طبي|ترجمة عربية|غير معروف)$/i.test(t.translation.trim())) {
    errors.push(`${label}: generic placeholder translation is not accepted`);
  }
  if (typeof t.definitionEn === 'string' && /^clinical medical term:/i.test(t.definitionEn.trim())) {
    errors.push(`${label}: generic English definition placeholder is not accepted`);
  }
  if (typeof t.definitionAr === 'string' && /^مصطلح طبي سريري يعني/i.test(t.definitionAr.trim())) {
    errors.push(`${label}: generic Arabic definition placeholder is not accepted`);
  }
  if (t.term && t.translation && normalize(t.term) === normalize(t.translation)) {
    errors.push(`${label}: English term and Arabic translation must not be identical`);
  }
  if (t.morphology !== undefined) {
    const m = t.morphology;
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      errors.push(`${label}: morphology must be an object`);
    } else {
      const validPart = (part) => part && typeof part === 'object' &&
        typeof part.affix === 'string' && part.affix.trim() &&
        typeof part.meaningAr === 'string' && part.meaningAr.trim() &&
        typeof part.meaningEn === 'string' && part.meaningEn.trim();
      if (m.parts !== undefined) {
        if (!Array.isArray(m.parts) || m.parts.length === 0) errors.push(`${label}: morphology.parts must be a non-empty array`);
        else m.parts.forEach((part, partIndex) => {
          if (!validPart(part) || (part.role !== undefined && (typeof part.role !== 'string' || !part.role.trim()))) {
            errors.push(`${label}: invalid morphology.parts[${partIndex}]`);
          }
        });
      } else if (!validPart(m.root)) {
        errors.push(`${label}: morphology requires a valid parts array or legacy root`);
      }
      for (const key of ['prefix', 'root', 'suffix']) {
        if (m[key] !== undefined && !validPart(m[key])) errors.push(`${label}: morphology.${key} requires affix, meaningAr and meaningEn`);
      }
      if (typeof m.literalSynthesisAr !== 'string' || !m.literalSynthesisAr.trim()) {
        errors.push(`${label}: morphology.literalSynthesisAr is required`);
      }
      const allowedMorph = new Set(['parts','prefix', 'root', 'suffix', 'literalSynthesisAr']);
      for (const key of Object.keys(m)) if (!allowedMorph.has(key)) errors.push(`${label}: unsupported morphology field ${key}`);
    }
  }
  const allowed = new Set([...required, ...optional, 'createdAt', 'updatedAt', 'morphology']);
  for (const key of Object.keys(t)) if (!allowed.has(key)) errors.push(`${label}: unsupported field ${key}`);
}
if (errors.length) {
  console.error(errors.map(x => '- ' + x).join('\n'));
  process.exit(1);
}

const sha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (!Array.isArray(catalog.collections)) throw new Error('catalog.json missing collections');
if (catalog.collections.length !== 1 || catalog.collections[0].id !== 'terms') {
  throw new Error('Catalog must expose exactly one collection: terms');
}
const collection = catalog.collections[0];
collection.recordCount = terms.length;
collection.sha256 = sha256;
collection.sizeBytes = Buffer.byteLength(raw, 'utf8');
collection.updatedAt = new Date().toISOString();
catalog.generatedAt = new Date().toISOString();
catalog.catalogVersion = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Validated ${terms.length} terms; SHA-256 ${sha256}`);
