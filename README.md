# مستودع بيانات UMEDT الطبي والأكاديمي (Alssaedy50/UMEDT-DATA)

هذا المستودع هو المصدر الرسمي المستقل لبيانات برنامج **UMEDT** لنشر وتحديث جميع أنواع المحتوى الأكاديمي:
- **البلوكات والمواد والمواضيع** (`blocks.json`, `subjects.json`, `topics.json`)
- **المصطلحات والجمل والسوابق والاختصارات** (`terms.json`, `sentences.json`, `custom-affixes.json`, `custom-abbreviations.json`)
- **الكتب وملفات PDF والملازم** (`books.json`)
- **بنك الأسئلة والاختبارات التقييمية** (`questions.json`, `exams.json`)
- **الصور والرسومات التوضيحية والملحقات** (`media-index.json`, `data/media/`)
- **الفهرس الذاتي التعريف ومخططات القراءة الموحدة** (`data/catalog.json`, `docs/schemas/`, `docs/UMEDT-DATA-API-CONTRACT.md`)
- **حزم التحديث الموقعة** (`data/releases/stable/`, `data/releases/beta/`)

لا يحتوي هذا المستودع على كود تطبيق **UMEDT** أو بيانات المستخدم الشخصية (المفضلة، سجل المراجعة SRS، الملاحظات الخاصة).

## البنية المعتمدة
```text
data/
  catalog.json
  master/
    blocks.json
    subjects.json
    topics.json
    terms.json
    sentences.json
    custom-affixes.json
    custom-abbreviations.json
    books.json
    questions.json
    exams.json
    media-index.json
  media/
    <sha256_prefix>-<filename>
  releases/
    stable/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
      history.json
    beta/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
      history.json
docs/
  UMEDT-DATA-API-CONTRACT.md
  schemas/
    catalog.schema.json
    manifest.schema.json
    content-entities.schema.json
```

## روابط القراءة المباشرة والموحدة
- **نقطة الاكتشاف الموحدة (Catalog v2):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/catalog.json`
- **Manifest التحديث السحابي (OTA):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/releases/stable/manifest.json`
- **عقد القراءة الموحّد ومخططات JSON Schema:**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/docs/UMEDT-DATA-API-CONTRACT.md`

## مبدأ الأمان وعدم الإضرار بالمشروع الأصلي
1. جميع التحديثات تُقرأ وتُدمج عبر المعرفات الفريدة (`id`) بدون استبدال كود التطبيق أو تفضيلات المستخدم المحلية (`favorite`, `srsData`, `studyStats`).
2. المرفقات تُخزن بأسماء تتضمن بصمة `SHA-256` لمنع التكرار وتقليل حجم التنزيل.


## Release integrity and publishing

The release workflow builds the package from this repository's complete data tree (all 11 `data/master/*.json` collections, the catalog, schemas, API contract, and every repository-owned file in `data/media/`). It does not use the legacy five-collection publisher in the UMEDT application repository.

Before publishing, configure these GitHub repository settings:

- Actions secret `UMED_PUBLISHER_PRIVATE_KEY_PEM`: the permanent ECDSA P-256 PKCS#8 private key.
- Actions variable `VITE_UMED_PUBLIC_KEY_PEM`: the matching ECDSA P-256 SPKI public key. This must be the same trusted public key embedded in the UMEDT app build.

Never commit the private key. The workflow intentionally fails rather than publish an unsigned package when either key is missing or the key pair does not match. If the old private key is lost, key rotation requires updating the trusted public key in UMEDT and rebuilding the app before publishing with the replacement pair.

Run `npm run validate:data` to validate JSON collections, unique IDs, relationships, catalog descriptors, manifest hashes, and local media files. Run `npm run build:release -- --channel stable` only in an environment with the permanent signing keys configured. The release workflow performs these checks automatically.

Set `UMEDT_WORKSPACE_DIR` to a persistent mounted directory when hosting the Data Hub on an ephemeral/serverless filesystem; otherwise its local workspace cache may not survive a redeploy.
