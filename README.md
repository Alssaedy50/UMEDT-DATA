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
