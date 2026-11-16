# مستودع بيانات UMEDT الطبي (Alssaedy50/UMEDT-DATA)

هذا المستودع هو المصدر الرسمي المستقل لبيانات برنامج **UMEDT** لنشر وتحديث:
- **البلوكات والمواد والمواضيع** (`blocks.json`, `subjects.json`, `topics.json`)
- **المصطلحات والجمل والسوابق والاختصارات** (`terms.json`, `sentences.json`, `custom-affixes.json`, `custom-abbreviations.json`)
- **بنك الأسئلة والمرفقات والوسائط** (`questions.json`, `media-index.json`, `data/media/`)
- **حزم التحديث الموقعة** (`data/releases/stable/`, `data/releases/beta/`)

لا يحتوي هذا المستودع على كود تطبيق **UMEDT** أو بيانات المستخدم الشخصية (المفضلة، سجل المراجعة SRS، الملاحظات الخاصة).

## البنية المعتمدة
```text
data/
  master/
    blocks.json
    subjects.json
    topics.json
    terms.json
    sentences.json
    custom-affixes.json
    custom-abbreviations.json
    questions.json
    media-index.json
  media/
    <sha256_prefix>-<filename>
  releases/
    stable/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
    beta/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
```

## روابط القراءة المباشرة لتطبيق UMEDT
- **Manifest التحديث السحابي (OTA):**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/releases/stable/manifest.json`
- **بيانات البلوكات والمصطلحات المباشرة:**
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/blocks.json`
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/terms.json`
  `https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/media-index.json`

## مبدأ الأمان وعدم الإضرار بالمشروع الأصلي
1. جميع التحديثات تُقرأ وتُدمج عبر المعرفات الفريدة (`id`) بدون استبدال كود التطبيق أو تفضيلات المستخدم المحلية (`favorite`, `srsData`, `studyStats`).
2. المرفقات تُخزن بأسماء تتضمن بصمة `SHA-256` لمنع التكرار وتقليل حجم التنزيل.
