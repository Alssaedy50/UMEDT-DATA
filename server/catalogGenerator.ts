import crypto from 'node:crypto';
import type {
  AcademicBookResource,
  AcademicExamPackage,
  CatalogCollectionDescriptor,
  ClinicalAbbreviation,
  ContentRendererType,
  DataCatalogDocument,
  DictionaryTerm,
  LinkedSentence,
  MasterDataCounts,
  MediaAssetRecord,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  TopicArticle,
  UnifiedContentEnvelope,
  UnifiedQuizQuestion,
  WorkspaceDataState
} from '../src/types/umedtData.ts';

function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

interface CollectionSpec {
  id: keyof MasterDataCounts;
  contentType: string;
  rendererType: ContentRendererType;
  fileName: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  mergeStrategy: 'merge_preserve_user_state' | 'replace_master_preserve_progress';
  userProtectedFields: string[];
  relations: Record<string, string>;
  searchableFields: string[];
  filterableFields: string[];
  getArray: (s: WorkspaceDataState) => unknown[];
}

export const COLLECTION_SPECS: CollectionSpec[] = [
  {
    id: 'blocks',
    contentType: 'block',
    rendererType: 'hierarchy_grid',
    fileName: 'blocks.json',
    titleAr: 'البلوكات الطبية والأكاديمية',
    titleEn: 'Academic & Medical Blocks',
    descriptionAr: 'الوحدات الدراسية الكبرى التي تجمع المواد والمواضيع والكتب والاختبارات.',
    mergeStrategy: 'replace_master_preserve_progress',
    userProtectedFields: ['studyStats', 'bookmarks'],
    relations: { subjects: 'subjects.blockId', topics: 'topics.blockId', books: 'books.blockId', exams: 'exams.blockId' },
    searchableFields: ['id', 'code', 'titleEn', 'titleAr', 'descriptionAr'],
    filterableFields: ['id', 'code'],
    getArray: (s) => s.blocks
  },
  {
    id: 'subjects',
    contentType: 'subject',
    rendererType: 'subject_list',
    fileName: 'subjects.json',
    titleAr: 'المواد والتخصصات الدراسية',
    titleEn: 'Subjects & Disciplines',
    descriptionAr: 'المواد العلمية والتخصصات المرتبطة بالبلوكات أو المستقلة.',
    mergeStrategy: 'replace_master_preserve_progress',
    userProtectedFields: ['studyStats', 'bookmarks'],
    relations: { blockId: 'blocks.id', topics: 'topics.subjectId', books: 'books.subjectId', exams: 'exams.subjectId' },
    searchableFields: ['id', 'code', 'titleEn', 'titleAr'],
    filterableFields: ['blockId', 'isStandalone'],
    getArray: (s) => s.subjects
  },
  {
    id: 'topics',
    contentType: 'topic',
    rendererType: 'rich_article',
    fileName: 'topics.json',
    titleAr: 'المواضيع والمحاضرات السريرية',
    titleEn: 'Topics & Clinical Articles',
    descriptionAr: 'مقالات ومحاضرات منظمة تحتوي أقساماً وجداول ومخططات وصوراً ومرفقات قابلة للتنزيل.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['favorite', 'notes', 'bookmarks', 'studyStats'],
    relations: { blockId: 'blocks.id', subjectId: 'subjects.id', relatedTopicIds: 'topics.id' },
    searchableFields: ['id', 'title', 'titleEn', 'titleAr', 'subtitle', 'category'],
    filterableFields: ['blockId', 'subjectId', 'category'],
    getArray: (s) => s.topics
  },
  {
    id: 'terms',
    contentType: 'term',
    rendererType: 'lexicon_entry',
    fileName: 'terms.json',
    titleAr: 'المعجم الطبي والمصطلحات',
    titleEn: 'Medical Lexicon Terms',
    descriptionAr: 'مصطلحات ثنائية اللغة مع الصوتيّات والتحليل الصرفي والأمثلة والربط المرجعي.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['favorite', 'srsData', 'collections', 'studyCount', 'lastStudiedAt'],
    relations: { linkedBlockIds: 'blocks.id', linkedSubjectIds: 'subjects.id', linkedTopicIds: 'topics.id' },
    searchableFields: ['id', 'term', 'termNormalized', 'translation', 'umdCode', 'specialty'],
    filterableFields: ['category', 'specialty', 'linkedBlockIds'],
    getArray: (s) => s.terms
  },
  {
    id: 'sentences',
    contentType: 'sentence',
    rendererType: 'sentence_pair',
    fileName: 'sentences.json',
    titleAr: 'الجمل السريرية المربوطة',
    titleEn: 'Clinical Sentences',
    descriptionAr: 'جمل وتراكيب سريرية إنجليزية مع الترجمة العربية وروابط المصطلحات.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['favorite', 'srsData', 'studyCount'],
    relations: { linkedTermIds: 'terms.id' },
    searchableFields: ['id', 'en', 'ar', 'specialty', 'tags'],
    filterableFields: ['category', 'specialty'],
    getArray: (s) => s.sentences
  },
  {
    id: 'customAffixes',
    contentType: 'affix',
    rendererType: 'morphology_rule',
    fileName: 'custom-affixes.json',
    titleAr: 'السوابق والجذور واللواحق الطبية',
    titleEn: 'Morphological Affixes',
    descriptionAr: 'قواعد البناء الصرفي اللاتيني واليوناني للمصطلحات الطبية.',
    mergeStrategy: 'replace_master_preserve_progress',
    userProtectedFields: ['favorite'],
    relations: {},
    searchableFields: ['id', 'affix', 'cleanKey', 'meaningAr', 'meaningEn'],
    filterableFields: ['type'],
    getArray: (s) => s.customAffixes
  },
  {
    id: 'customAbbreviations',
    contentType: 'abbreviation',
    rendererType: 'abbreviation_rule',
    fileName: 'custom-abbreviations.json',
    titleAr: 'الاختصارات والرموز السريرية',
    titleEn: 'Clinical Abbreviations',
    descriptionAr: 'الاختصارات الطبية الشائعة والملتبسة مع السياقات والتخصصات.',
    mergeStrategy: 'replace_master_preserve_progress',
    userProtectedFields: ['favorite'],
    relations: {},
    searchableFields: ['id', 'abbr', 'defaultExpansionEn', 'defaultTranslationAr'],
    filterableFields: ['category', 'isAmbiguous'],
    getArray: (s) => s.customAbbreviations
  },
  {
    id: 'books',
    contentType: 'book',
    rendererType: 'book_pdf_reader',
    fileName: 'books.json',
    titleAr: 'الكتب الدراسية وملفات PDF والملازم',
    titleEn: 'Academic Books & PDFs',
    descriptionAr: 'مراجع وكتب وأطالس وملازم PDF مهيكلة مع روابط التحميل المباشر وبصمة SHA-256.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['bookmarks', 'readingProgress', 'favorite', 'notes'],
    relations: { blockId: 'blocks.id', subjectId: 'subjects.id', topicIds: 'topics.id', mediaAssetId: 'mediaAssets.id' },
    searchableFields: ['id', 'titleEn', 'titleAr', 'authors', 'isbn', 'tags'],
    filterableFields: ['blockId', 'subjectId', 'resourceKind', 'format', 'language'],
    getArray: (s) => s.books || []
  },
  {
    id: 'questions',
    contentType: 'question',
    rendererType: 'quiz_question',
    fileName: 'questions.json',
    titleAr: 'بنك الأسئلة التقييمية',
    titleEn: 'Assessment Question Bank',
    descriptionAr: 'أسئلة متعددة الأنواع مع خيارات وشروحات ثنائية اللغة مرتبطة بالبلوكات والمواضيع.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['userAttempts', 'bookmark', 'srsData'],
    relations: { blockId: 'blocks.id', subjectId: 'subjects.id', topicId: 'topics.id', linkedTermIds: 'terms.id' },
    searchableFields: ['id', 'questionEn', 'questionAr', 'explanationAr'],
    filterableFields: ['blockId', 'subjectId', 'topicId', 'type', 'difficulty'],
    getArray: (s) => s.questions
  },
  {
    id: 'exams',
    contentType: 'exam',
    rendererType: 'exam_blueprint',
    fileName: 'exams.json',
    titleAr: 'الاختبارات والامتحانات المجمّعة',
    titleEn: 'Exams & Assessments',
    descriptionAr: 'حزم امتحانية زمنية وتقييمات شاملة مبنية فوق بنك الأسئلة.',
    mergeStrategy: 'merge_preserve_user_state',
    userProtectedFields: ['examAttempts', 'bestScore', 'lastAttemptAt'],
    relations: { blockId: 'blocks.id', subjectId: 'subjects.id', topicId: 'topics.id', questionIds: 'questions.id' },
    searchableFields: ['id', 'titleEn', 'titleAr', 'descriptionAr', 'tags'],
    filterableFields: ['blockId', 'subjectId', 'topicId', 'examType', 'difficulty'],
    getArray: (s) => s.exams || []
  },
  {
    id: 'mediaAssets',
    contentType: 'media',
    rendererType: 'media_gallery',
    fileName: 'media-index.json',
    titleAr: 'فهرس الوسائط والصور والرسومات والمرفقات',
    titleEn: 'Media, Diagrams & Attachments Index',
    descriptionAr: 'فهرس موحد لكل الصور والرسومات التوضيحية وملفات PDF والصوتيات والمرفقات القابلة للتحميل.',
    mergeStrategy: 'replace_master_preserve_progress',
    userProtectedFields: ['localCachedPath'],
    relations: { linkedEntityId: 'polymorphic(block|subject|topic|term|book|question|exam)' },
    searchableFields: ['id', 'fileName', 'captionAr', 'captionEn', 'tags'],
    filterableFields: ['mediaType', 'linkedEntityType', 'linkedEntityId', 'mimeType'],
    getArray: (s) => s.mediaAssets
  }
];

export function buildDataCatalogDocument(
  state: WorkspaceDataState,
  dataRepoOverride?: string
): DataCatalogDocument {
  const repo = (dataRepoOverride || state.meta.dataRepo || 'Alssaedy50/UMEDT-DATA').trim();
  const branch = (state.meta.branch || 'main').trim();
  const rawBase = `https://raw.githubusercontent.com/${repo}/${branch}`;
  const now = new Date().toISOString();

  const collections: CatalogCollectionDescriptor[] = COLLECTION_SPECS.map((spec) => {
    const arr = spec.getArray(state);
    const jsonText = JSON.stringify(arr, null, 2);
    return {
      id: spec.id,
      contentType: spec.contentType,
      rendererType: spec.rendererType,
      titleAr: spec.titleAr,
      titleEn: spec.titleEn,
      descriptionAr: spec.descriptionAr,
      path: `data/master/${spec.fileName}`,
      rawUrl: `${rawBase}/data/master/${spec.fileName}`,
      apiPath: `/api/v1/collections/${spec.id}`,
      schemaUrl: `${rawBase}/docs/schemas/content-entities.schema.json#/$defs/${spec.contentType}`,
      primaryKey: 'id',
      recordCount: arr.length,
      sha256: sha256Text(jsonText),
      sizeBytes: Buffer.byteLength(jsonText, 'utf8'),
      mergeStrategy: spec.mergeStrategy,
      userProtectedFields: spec.userProtectedFields,
      relations: spec.relations,
      searchableFields: spec.searchableFields,
      filterableFields: spec.filterableFields,
      updatedAt: now
    };
  });

  return {
    catalogSchemaVersion: 2,
    catalogVersion: state.meta.dataVersion || '2026.11.0-umd',
    schemaVersion: 2,
    minAppVersion: '2.4.0',
    repository: repo,
    branch,
    generatedAt: now,
    endpoints: {
      catalogUrl: `${rawBase}/data/catalog.json`,
      manifestStableUrl: `${rawBase}/data/releases/stable/manifest.json`,
      manifestBetaUrl: `${rawBase}/data/releases/beta/manifest.json`,
      masterBaseUrl: `${rawBase}/data/master`,
      mediaBaseUrl: `${rawBase}/data/media`,
      schemasBaseUrl: `${rawBase}/docs/schemas`,
      contractDocUrl: `${rawBase}/docs/UMEDT-DATA-API-CONTRACT.md`,
      httpApiBasePath: '/api/v1'
    },
    capabilities: {
      selfDescribingCollections: true,
      incrementalHashSync: true,
      cryptographicSignatureVerification: true,
      rollbackSupported: true,
      preservesLocalUserData: true
    },
    contentTypesRegistry: [
      { contentType: 'block', rendererType: 'hierarchy_grid', displayNameAr: 'بلوك دراسي', displayNameEn: 'Academic Block', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'subject', rendererType: 'subject_list', displayNameAr: 'مادة علمية', displayNameEn: 'Subject', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'topic', rendererType: 'rich_article', displayNameAr: 'موضوع / محاضرة', displayNameEn: 'Topic Article', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'term', rendererType: 'lexicon_entry', displayNameAr: 'مصطلح طبي', displayNameEn: 'Medical Term', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'sentence', rendererType: 'sentence_pair', displayNameAr: 'جملة سريرية', displayNameEn: 'Clinical Sentence', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'affix', rendererType: 'morphology_rule', displayNameAr: 'سابقة / لاحقة', displayNameEn: 'Morphological Affix', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'abbreviation', rendererType: 'abbreviation_rule', displayNameAr: 'اختصار سريري', displayNameEn: 'Clinical Abbreviation', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'book', rendererType: 'book_pdf_reader', displayNameAr: 'كتاب / مرجع PDF', displayNameEn: 'Book / PDF Document', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'pdf', rendererType: 'book_pdf_reader', displayNameAr: 'ملف PDF', displayNameEn: 'PDF Document', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'image', rendererType: 'media_gallery', displayNameAr: 'صورة طبية', displayNameEn: 'Medical Image', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'diagram', rendererType: 'media_gallery', displayNameAr: 'رسم وتخطيط توضيحي', displayNameEn: 'Diagram / Flowchart', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'audio', rendererType: 'media_gallery', displayNameAr: 'مقطع صوتي', displayNameEn: 'Audio Clip', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'attachment', rendererType: 'media_gallery', displayNameAr: 'مرفق قابل للتحميل', displayNameEn: 'Attachment', supportsDownload: true, supportsOfflineCache: true },
      { contentType: 'question', rendererType: 'quiz_question', displayNameAr: 'سؤال تقييمي', displayNameEn: 'Quiz Question', supportsDownload: false, supportsOfflineCache: true },
      { contentType: 'exam', rendererType: 'exam_blueprint', displayNameAr: 'اختبار متكامل', displayNameEn: 'Exam Package', supportsDownload: false, supportsOfflineCache: true }
    ],
    collections
  };
}

export function wrapRecordInUnifiedEnvelope(
  domain: keyof MasterDataCounts,
  rawRecord: unknown,
  state: WorkspaceDataState
): UnifiedContentEnvelope {
  const rec = rawRecord as Record<string, unknown>;
  const id = String(rec.id || '');
  const spec = COLLECTION_SPECS.find((s) => s.id === domain);
  const linkedMedia = state.mediaAssets.filter(
    (m) => m.linkedEntityId === id || m.id === rec.mediaAssetId
  );

  switch (domain) {
    case 'blocks': {
      const b = rawRecord as MedicalBlock;
      return {
        id: b.id,
        domain,
        contentType: 'block',
        rendererType: 'hierarchy_grid',
        titleAr: b.titleAr,
        titleEn: b.titleEn,
        subtitle: b.code,
        hierarchy: { blockId: b.id },
        media: linkedMedia,
        payload: b
      };
    }
    case 'subjects': {
      const s = rawRecord as MedicalSubject;
      return {
        id: s.id,
        domain,
        contentType: 'subject',
        rendererType: 'subject_list',
        titleAr: s.titleAr,
        titleEn: s.titleEn,
        subtitle: s.code,
        hierarchy: { blockId: s.blockId, subjectId: s.id },
        media: linkedMedia,
        payload: s
      };
    }
    case 'topics': {
      const t = rawRecord as TopicArticle;
      return {
        id: t.id,
        domain,
        contentType: 'topic',
        rendererType: 'rich_article',
        titleAr: t.titleAr || t.title,
        titleEn: t.titleEn || t.title,
        subtitle: t.subtitle,
        hierarchy: { blockId: t.blockId, subjectId: t.subjectId, topicId: t.id },
        media: linkedMedia,
        payload: t
      };
    }
    case 'terms': {
      const tm = rawRecord as DictionaryTerm;
      return {
        id: tm.id,
        domain,
        contentType: 'term',
        rendererType: 'lexicon_entry',
        titleAr: tm.translation,
        titleEn: tm.term,
        subtitle: tm.specialty || tm.category,
        hierarchy: {
          blockId: tm.linkedBlockIds?.[0],
          subjectId: tm.linkedSubjectIds?.[0],
          topicId: tm.linkedTopicIds?.[0]
        },
        media: linkedMedia,
        payload: tm
      };
    }
    case 'sentences': {
      const s = rawRecord as LinkedSentence;
      return {
        id: s.id,
        domain,
        contentType: 'sentence',
        rendererType: 'sentence_pair',
        titleAr: s.ar,
        titleEn: s.en,
        subtitle: s.specialty || s.category,
        hierarchy: {},
        media: linkedMedia,
        payload: s
      };
    }
    case 'customAffixes': {
      const af = rawRecord as MorphologicalAffix;
      return {
        id: af.id,
        domain,
        contentType: 'affix',
        rendererType: 'morphology_rule',
        titleAr: af.meaningAr,
        titleEn: `${af.affix} (${af.meaningEn})`,
        subtitle: af.type,
        hierarchy: {},
        media: [],
        payload: af
      };
    }
    case 'customAbbreviations': {
      const ab = rawRecord as ClinicalAbbreviation;
      return {
        id: ab.id,
        domain,
        contentType: 'abbreviation',
        rendererType: 'abbreviation_rule',
        titleAr: ab.defaultTranslationAr,
        titleEn: `${ab.abbr} — ${ab.defaultExpansionEn}`,
        subtitle: ab.category,
        hierarchy: {},
        media: [],
        payload: ab
      };
    }
    case 'books': {
      const bk = rawRecord as AcademicBookResource;
      return {
        id: bk.id,
        domain,
        contentType: 'book',
        rendererType: 'book_pdf_reader',
        titleAr: bk.titleAr,
        titleEn: bk.titleEn,
        subtitle: bk.authors.join(', '),
        hierarchy: { blockId: bk.blockId, subjectId: bk.subjectId, topicId: bk.topicIds?.[0] },
        downloadUrl: bk.downloadUrl,
        sha256: bk.sha256,
        media: linkedMedia,
        payload: bk
      };
    }
    case 'questions': {
      const q = rawRecord as UnifiedQuizQuestion;
      return {
        id: q.id,
        domain,
        contentType: 'question',
        rendererType: 'quiz_question',
        titleAr: q.questionAr || q.questionEn,
        titleEn: q.questionEn,
        subtitle: q.type,
        hierarchy: { blockId: q.blockId, subjectId: q.subjectId, topicId: q.topicId },
        media: linkedMedia,
        payload: q
      };
    }
    case 'exams': {
      const ex = rawRecord as AcademicExamPackage;
      return {
        id: ex.id,
        domain,
        contentType: 'exam',
        rendererType: 'exam_blueprint',
        titleAr: ex.titleAr,
        titleEn: ex.titleEn,
        subtitle: `${ex.questionIds.length} questions · ${ex.durationMinutes} min`,
        hierarchy: { blockId: ex.blockId, subjectId: ex.subjectId, topicId: ex.topicId },
        media: linkedMedia,
        payload: ex
      };
    }
    case 'mediaAssets': {
      const m = rawRecord as MediaAssetRecord;
      return {
        id: m.id,
        domain,
        contentType: m.mediaType,
        rendererType: 'media_gallery',
        titleAr: m.captionAr || m.fileName,
        titleEn: m.captionEn || m.fileName,
        subtitle: `${m.mimeType} · ${m.sizeBytes} bytes`,
        hierarchy: {
          blockId: m.linkedEntityType === 'block' ? m.linkedEntityId : undefined,
          subjectId: m.linkedEntityType === 'subject' ? m.linkedEntityId : undefined,
          topicId: m.linkedEntityType === 'topic' ? m.linkedEntityId : undefined
        },
        downloadUrl: m.rawUrl,
        sha256: m.sha256,
        media: [m],
        payload: m
      };
    }
    default:
      return {
        id,
        domain,
        contentType: spec?.contentType || 'generic',
        rendererType: spec?.rendererType || 'generic_card',
        titleAr: String(rec.titleAr || rec.title || id),
        titleEn: String(rec.titleEn || rec.title || id),
        hierarchy: {},
        media: linkedMedia,
        payload: rawRecord
      };
  }
}

export function generateJsonSchemaFiles(): Record<string, string> {
  const catalogSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/docs/schemas/catalog.schema.json',
    title: 'UMEDT-DATA Unified Catalog Schema v2',
    type: 'object',
    required: ['catalogSchemaVersion', 'catalogVersion', 'schemaVersion', 'repository', 'branch', 'endpoints', 'collections'],
    properties: {
      catalogSchemaVersion: { type: 'integer', minimum: 2 },
      catalogVersion: { type: 'string' },
      schemaVersion: { type: 'integer' },
      minAppVersion: { type: 'string' },
      repository: { type: 'string' },
      branch: { type: 'string' },
      generatedAt: { type: 'string', format: 'date-time' },
      endpoints: {
        type: 'object',
        required: ['catalogUrl', 'manifestStableUrl', 'masterBaseUrl', 'mediaBaseUrl']
      },
      collections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'contentType', 'rendererType', 'path', 'rawUrl', 'primaryKey', 'recordCount', 'sha256', 'mergeStrategy']
        }
      }
    }
  };

  const manifestSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/docs/schemas/manifest.schema.json',
    title: 'UMEDT-DATA Release Manifest Schema v2',
    type: 'object',
    required: ['packageId', 'dataVersion', 'minAppVersion', 'schemaVersion', 'releasedAt', 'channel', 'downloadUrl', 'checksum', 'sha256', 'counts'],
    properties: {
      packageId: { type: 'string' },
      dataVersion: { type: 'string' },
      minAppVersion: { type: 'string' },
      schemaVersion: { type: 'integer', minimum: 2 },
      releasedAt: { type: 'string', format: 'date-time' },
      channel: { enum: ['stable', 'beta'] },
      downloadUrl: { type: 'string', format: 'uri' },
      checksum: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      signature: { type: 'string' },
      signatureAlgorithm: { enum: ['ECDSA-P256-SHA256'] },
      counts: {
        type: 'object',
        required: ['terms', 'sentences', 'topics', 'affixes', 'abbreviations']
      },
      extendedCounts: { type: 'object' },
      filesSha256: { type: 'object', additionalProperties: { type: 'string' } },
      incremental: {
        type: 'object',
        properties: {
          previousVersion: { type: ['string', 'null'] },
          changedDomains: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  };

  const entitiesSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/docs/schemas/content-entities.schema.json',
    title: 'UMEDT-DATA Academic Content Entities Schema v2',
    $defs: {
      block: {
        type: 'object',
        required: ['id', 'code', 'titleEn', 'titleAr', 'order'],
        properties: { id: { type: 'string' }, code: { type: 'string' }, titleEn: { type: 'string' }, titleAr: { type: 'string' }, order: { type: 'integer' } }
      },
      subject: {
        type: 'object',
        required: ['id', 'code', 'titleEn', 'titleAr', 'order'],
        properties: { id: { type: 'string' }, code: { type: 'string' }, blockId: { type: 'string' }, titleEn: { type: 'string' }, titleAr: { type: 'string' } }
      },
      topic: {
        type: 'object',
        required: ['id', 'title', 'category', 'sections'],
        properties: { id: { type: 'string' }, title: { type: 'string' }, blockId: { type: 'string' }, subjectId: { type: 'string' }, sections: { type: 'array' } }
      },
      term: {
        type: 'object',
        required: ['id', 'term', 'translation'],
        properties: { id: { type: 'string' }, term: { type: 'string' }, translation: { type: 'string' } }
      },
      sentence: {
        type: 'object',
        required: ['id', 'en', 'ar'],
        properties: { id: { type: 'string' }, en: { type: 'string' }, ar: { type: 'string' } }
      },
      affix: {
        type: 'object',
        required: ['id', 'affix', 'type', 'meaningAr'],
        properties: { id: { type: 'string' }, affix: { type: 'string' }, type: { enum: ['prefix', 'root', 'suffix'] }, meaningAr: { type: 'string' } }
      },
      abbreviation: {
        type: 'object',
        required: ['id', 'abbr', 'defaultExpansionEn', 'defaultTranslationAr'],
        properties: { id: { type: 'string' }, abbr: { type: 'string' }, defaultExpansionEn: { type: 'string' }, defaultTranslationAr: { type: 'string' } }
      },
      book: {
        type: 'object',
        required: ['id', 'titleEn', 'titleAr', 'resourceKind', 'format', 'downloadUrl', 'mimeType'],
        properties: {
          id: { type: 'string' },
          titleEn: { type: 'string' },
          titleAr: { type: 'string' },
          authors: { type: 'array', items: { type: 'string' } },
          resourceKind: { enum: ['textbook', 'atlas', 'pdf_lecture', 'clinical_guideline', 'study_notes', 'slides'] },
          format: { enum: ['pdf', 'epub', 'markdown', 'html'] },
          downloadUrl: { type: 'string' },
          sha256: { type: 'string' },
          sizeBytes: { type: 'integer' }
        }
      },
      question: {
        type: 'object',
        required: ['id', 'type', 'questionEn', 'options', 'correctOptionKeys'],
        properties: {
          id: { type: 'string' },
          type: { enum: ['single_choice', 'multiple_select', 'true_false', 'matching', 'fill_blank', 'short_answer', 'image_based'] },
          questionEn: { type: 'string' },
          options: { type: 'array' },
          correctOptionKeys: { type: 'array', items: { type: 'string' } }
        }
      },
      exam: {
        type: 'object',
        required: ['id', 'titleEn', 'titleAr', 'examType', 'questionIds', 'durationMinutes', 'passingScorePercent'],
        properties: {
          id: { type: 'string' },
          titleEn: { type: 'string' },
          titleAr: { type: 'string' },
          examType: { enum: ['block_exam', 'subject_quiz', 'comprehensive', 'osce', 'flash_drill'] },
          questionIds: { type: 'array', items: { type: 'string' } },
          durationMinutes: { type: 'integer' },
          passingScorePercent: { type: 'number' }
        }
      },
      media: {
        type: 'object',
        required: ['id', 'fileName', 'relativePath', 'mediaType', 'mimeType', 'sizeBytes', 'sha256'],
        properties: {
          id: { type: 'string' },
          fileName: { type: 'string' },
          relativePath: { type: 'string' },
          mediaType: { enum: ['image', 'diagram', 'pdf', 'book', 'audio', 'video', 'attachment'] },
          mimeType: { type: 'string' },
          sizeBytes: { type: 'integer' },
          sha256: { type: 'string' },
          rawUrl: { type: 'string' }
        }
      }
    }
  };

  return {
    'docs/schemas/catalog.schema.json': JSON.stringify(catalogSchema, null, 2),
    'docs/schemas/manifest.schema.json': JSON.stringify(manifestSchema, null, 2),
    'docs/schemas/content-entities.schema.json': JSON.stringify(entitiesSchema, null, 2)
  };
}

export function generateApiContractMarkdown(
  dataRepo = 'Alssaedy50/UMEDT-DATA',
  branch = 'main'
): string {
  const rawBase = `https://raw.githubusercontent.com/${dataRepo}/${branch}`;
  return `# عقد واجهة القراءة الموحدة وبنية مستودع UMEDT-DATA

> هذا المستند موثّق لتسهيل ربط تطبيق **UMEDT** مستقبلاً بمستودع البيانات المستقل **${dataRepo}** (الفرع \`${branch}\`) بحيث يقرأ جميع أنواع المحتوى الأكاديمي الحالية والمستقبلية دون الحاجة لتحديث كود التطبيق عند إضافة محتوى جديد.
> **ملاحظة:** لا يفترض هذا المستند أن تطبيق UMEDT يدعم قراءة كل الأنواع الجديدة بعد؛ بل يجهّز العقد الموحّد والبيانات لتنفيذ القارئ في UMEDT لاحقاً.

---

## 1. نقطة الدخول الموحدة (Single Discovery Entrypoint)

- **الفهرس الذاتي التعريف (Catalog):**
  \`${rawBase}/data/catalog.json\`
- **بيان الإصدار السحابي (Stable Manifest):**
  \`${rawBase}/data/releases/stable/manifest.json\`
- **بيان القناة التجريبية (Beta Manifest):**
  \`${rawBase}/data/releases/beta/manifest.json\`

يحتوي \`data/catalog.json\` على وصف كامل لكل نطاق بيانات (\`collections\`) متضمناً:
1. \`id\` و\`contentType\` و\`rendererType\` (لتحديد نوع العرض برمجياً دون ربط ثابت بالملفات).
2. \`rawUrl\` و\`apiPath\` و\`schemaUrl\`.
3. \`sha256\` و\`sizeBytes\` و\`recordCount\` لدعم التحديث التدريجي (Incremental Sync).
4. \`mergeStrategy\` و\`userProtectedFields\` لضمان عدم المساس ببيانات المستخدم المحلية.
5. \`relations\` لربط البلوكات ← المواد ← المواضيع ← المصطلحات/الكتب/الأسئلة/الاختبارات/الوسائط.

---

## 2. جميع نطاقات المحتوى الأكاديمي (\`data/master/\`)

| النطاق | نوع المحتوى | الملف | \`rendererType\` | روابط العلاقات |
|---|---|---|---|---|
| البلوكات | \`block\` | \`data/master/blocks.json\` | \`hierarchy_grid\` | الجذر الأكاديمي |
| المواد | \`subject\` | \`data/master/subjects.json\` | \`subject_list\` | \`blockId\` |
| المواضيع | \`topic\` | \`data/master/topics.json\` | \`rich_article\` | \`blockId\`, \`subjectId\` |
| المصطلحات | \`term\` | \`data/master/terms.json\` | \`lexicon_entry\` | \`linkedBlockIds\`, \`linkedTopicIds\` |
| الجمل | \`sentence\` | \`data/master/sentences.json\` | \`sentence_pair\` | \`linkedTermIds\` |
| السوابق واللواحق | \`affix\` | \`data/master/custom-affixes.json\` | \`morphology_rule\` | مستقل |
| الاختصارات | \`abbreviation\` | \`data/master/custom-abbreviations.json\` | \`abbreviation_rule\` | مستقل |
| الكتب وملفات PDF | \`book\` | \`data/master/books.json\` | \`book_pdf_reader\` | \`blockId\`, \`subjectId\`, \`topicIds\`, \`mediaAssetId\` |
| الأسئلة التقييمية | \`question\` | \`data/master/questions.json\` | \`quiz_question\` | \`blockId\`, \`subjectId\`, \`topicId\`, \`linkedTermIds\` |
| الاختبارات | \`exam\` | \`data/master/exams.json\` | \`exam_blueprint\` | \`blockId\`, \`subjectId\`, \`topicId\`, \`questionIds\` |
| الصور والرسومات والوسائط | \`media\` | \`data/master/media-index.json\` | \`media_gallery\` | \`linkedEntityType\`, \`linkedEntityId\` |

جميع الملفات الثنائية القابلة للتحميل (صور، رسومات SVG، كتب وملفات PDF، صوتيات، مرفقات) تُخزَّن في \`data/media/<sha256_prefix>-<filename>\` وتُفهرس في \`media-index.json\` مع \`rawUrl\` و\`sha256\` و\`sizeBytes\`.

---

## 3. واجهة القراءة عبر HTTP (عند تشغيل الخادم \`/api/v1\`)

- \`GET /api/v1/catalog\` — إرجاع \`DataCatalogDocument\` بالكامل.
- \`GET /api/v1/manifest?channel=stable|beta\` — إرجاع \`DataPackageManifest\`.
- \`GET /api/v1/collections\` — قائمة كل النطاقات مع الأعداد والبصمات.
- \`GET /api/v1/collections/:domain?blockId=&subjectId=&topicId=&q=&page=1&limit=50\` — جلب وترشيح أي نطاق بترقيم صفحات.
- \`GET /api/v1/content/:domain/:id\` — إرجاع العنصر مغلفاً في \`UnifiedContentEnvelope\` مع الوسائط والروابط المرتبطة.
- \`GET /api/v1/search?q=...\` — بحث موحّد عبر النطاقات يرجع نتائج \`UnifiedContentEnvelope[]\`.
- \`GET /api/v1/sync/plan?hashes=...\` — خطة مزامنة تدريجية تُعيد فقط الملفات التي تغيرت بصمتها \`sha256\`.

---

## 4. آلية التوسع دون تحديث التطبيق مستقبلاً

1. **الاكتشاف التلقائي عبر \`catalog.json\`:** يقرأ التطبيق \`catalog.json\` أولاً؛ عند إضافة أي كتاب أو PDF أو موضوع أو رسم توضيحي أو اختبار أو سؤال جديد، تزداد السجلات وتتغير بصمة النطاق \`sha256\` فيحمّله التطبيق تلقائياً دون تعديل كود التطبيق.
2. **العرض المعتمد على \`rendererType\` والوصف التعريفي:** يدعم كل نوع \`rendererType\` موحداً، وفي حال ظهور \`contentType\` مستقبلي غير معروف، يعرض التطبيق عنوان السجل وملخصه ورابط التحميل \`downloadUrl\` عبر \`generic_card\` بشكل آمن.
3. **كتل المحتوى المرنة داخل المواضيع:** تدعم مقالات \`topics.json\` أنواع \`heading\`, \`paragraph\`, \`table\`, \`image\`, \`diagram\`, \`pdf_viewer\`, \`book_reference\`, \`exam_link\`, \`audio\`, \`video_link\`, \`attachment\`, \`clinical_note\`.

---

## 5. حماية بيانات المستخدم وسلامة الإصدارات

- **البيانات المحمية محلياً:** \`favorite\`, \`srsData\`, \`studyStats\`, \`collections\`, \`bookmarks\`, \`notes\`, \`readingProgress\`, \`examAttempts\`.
- **التحقق التشفيري:** حزمة التحديث \`umed2-data-<version>.zip\` محمية ببصمة \`SHA-256\` وتوقيع \`ECDSA-P256-SHA256\` عند التوقيع، مع منع الكتابة فوق رقم إصدار منشور ودعم الاستعادة (\`Rollback\`) عبر \`history.json\`.
`;
}
