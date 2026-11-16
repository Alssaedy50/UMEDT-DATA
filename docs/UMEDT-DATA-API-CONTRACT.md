# عقد واجهة القراءة الموحدة وبنية مستودع UMEDT-DATA

> هذا المستند موثّق لتسهيل ربط تطبيق **UMEDT** مستقبلاً بمستودع البيانات المستقل **Alssaedy50/UMEDT-DATA** (الفرع `main`) بحيث يقرأ جميع أنواع المحتوى الأكاديمي الحالية والمستقبلية دون الحاجة لتحديث كود التطبيق عند إضافة محتوى جديد.
> **ملاحظة:** لا يفترض هذا المستند أن تطبيق UMEDT يدعم قراءة كل الأنواع الجديدة بعد؛ بل يجهّز العقد الموحّد والبيانات لتنفيذ القارئ في UMEDT لاحقاً.

---

## 1. نقطة الدخول الموحدة (Single Discovery Entrypoint)

- **الفهرس الذاتي التعريف (Catalog):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/catalog.json`
- **بيان الإصدار السحابي (Stable Manifest):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/releases/stable/manifest.json`
- **بيان القناة التجريبية (Beta Manifest):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/releases/beta/manifest.json`

يحتوي `data/catalog.json` على وصف كامل لكل نطاق بيانات (`collections`) متضمناً:
1. `id` و`contentType` و`rendererType` (لتحديد نوع العرض برمجياً دون ربط ثابت بالملفات).
2. `rawUrl` و`apiPath` و`schemaUrl`.
3. `sha256` و`sizeBytes` و`recordCount` لدعم التحديث التدريجي (Incremental Sync).
4. `mergeStrategy` و`userProtectedFields` لضمان عدم المساس ببيانات المستخدم المحلية.
5. `relations` لربط البلوكات ← المواد ← المواضيع ← المصطلحات/الكتب/الأسئلة/الاختبارات/الوسائط.

---

## 2. جميع نطاقات المحتوى الأكاديمي (`data/master/`)

| النطاق | نوع المحتوى | الملف | `rendererType` | روابط العلاقات |
|---|---|---|---|---|
| البلوكات | `block` | `data/master/blocks.json` | `hierarchy_grid` | الجذر الأكاديمي |
| المواد | `subject` | `data/master/subjects.json` | `subject_list` | `blockId` |
| المواضيع | `topic` | `data/master/topics.json` | `rich_article` | `blockId`, `subjectId` |
| المصطلحات | `term` | `data/master/terms.json` | `lexicon_entry` | `linkedBlockIds`, `linkedTopicIds` |
| الجمل | `sentence` | `data/master/sentences.json` | `sentence_pair` | `linkedTermIds` |
| السوابق واللواحق | `affix` | `data/master/custom-affixes.json` | `morphology_rule` | مستقل |
| الاختصارات | `abbreviation` | `data/master/custom-abbreviations.json` | `abbreviation_rule` | مستقل |
| الكتب وملفات PDF | `book` | `data/master/books.json` | `book_pdf_reader` | `blockId`, `subjectId`, `topicIds`, `mediaAssetId` |
| الأسئلة التقييمية | `question` | `data/master/questions.json` | `quiz_question` | `blockId`, `subjectId`, `topicId`, `linkedTermIds` |
| الاختبارات | `exam` | `data/master/exams.json` | `exam_blueprint` | `blockId`, `subjectId`, `topicId`, `questionIds` |
| الصور والرسومات والوسائط | `media` | `data/master/media-index.json` | `media_gallery` | `linkedEntityType`, `linkedEntityId` |

جميع الملفات الثنائية القابلة للتحميل (صور، رسومات SVG، كتب وملفات PDF، صوتيات، مرفقات) تُخزَّن في `data/media/<sha256_prefix>-<filename>` وتُفهرس في `media-index.json` مع `rawUrl` و`sha256` و`sizeBytes`.

---

## 3. واجهة القراءة عبر HTTP (عند تشغيل الخادم `/api/v1`)

- `GET /api/v1/catalog` — إرجاع `DataCatalogDocument` بالكامل.
- `GET /api/v1/manifest?channel=stable|beta` — إرجاع `DataPackageManifest`.
- `GET /api/v1/collections` — قائمة كل النطاقات مع الأعداد والبصمات.
- `GET /api/v1/collections/:domain?blockId=&subjectId=&topicId=&q=&page=1&limit=50` — جلب وترشيح أي نطاق بترقيم صفحات.
- `GET /api/v1/content/:domain/:id` — إرجاع العنصر مغلفاً في `UnifiedContentEnvelope` مع الوسائط والروابط المرتبطة.
- `GET /api/v1/search?q=...` — بحث موحّد عبر النطاقات يرجع نتائج `UnifiedContentEnvelope[]`.
- `GET /api/v1/sync/plan?hashes=...` — خطة مزامنة تدريجية تُعيد فقط الملفات التي تغيرت بصمتها `sha256`.

---

## 4. آلية التوسع دون تحديث التطبيق مستقبلاً

1. **الاكتشاف التلقائي عبر `catalog.json`:** يقرأ التطبيق `catalog.json` أولاً؛ عند إضافة أي كتاب أو PDF أو موضوع أو رسم توضيحي أو اختبار أو سؤال جديد، تزداد السجلات وتتغير بصمة النطاق `sha256` فيحمّله التطبيق تلقائياً دون تعديل كود التطبيق.
2. **العرض المعتمد على `rendererType` والوصف التعريفي:** يدعم كل نوع `rendererType` موحداً، وفي حال ظهور `contentType` مستقبلي غير معروف، يعرض التطبيق عنوان السجل وملخصه ورابط التحميل `downloadUrl` عبر `generic_card` بشكل آمن.
3. **كتل المحتوى المرنة داخل المواضيع:** تدعم مقالات `topics.json` أنواع `heading`, `paragraph`, `table`, `image`, `diagram`, `pdf_viewer`, `book_reference`, `exam_link`, `audio`, `video_link`, `attachment`, `clinical_note`.

---

## 5. حماية بيانات المستخدم وسلامة الإصدارات

- **البيانات المحمية محلياً:** `favorite`, `srsData`, `studyStats`, `collections`, `bookmarks`, `notes`, `readingProgress`, `examAttempts`.
- **التحقق التشفيري:** حزمة التحديث `umed2-data-<version>.zip` محمية ببصمة `SHA-256` وتوقيع `ECDSA-P256-SHA256` عند التوقيع، مع منع الكتابة فوق رقم إصدار منشور ودعم الاستعادة (`Rollback`) عبر `history.json`.
