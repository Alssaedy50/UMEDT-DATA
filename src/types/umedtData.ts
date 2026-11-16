export type LexiconCategory = 'Medical' | 'AI' | 'Programming' | 'General';
export type TopicCategory = 'Medical' | 'Technology' | 'AI' | 'History' | 'General';
export type AbbreviationCategory =
  | 'Ward & Hx'
  | 'Prescription (Rx)'
  | 'Cardiopulmonary'
  | 'Neurology & Labs';

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'image'
  | 'diagram'
  | 'video'
  | 'video_link'
  | 'audio'
  | 'attachment'
  | 'pdf_viewer'
  | 'book_reference'
  | 'exam_link'
  | 'question'
  | 'clinical_note';

export interface MedicalBlock {
  id: string;
  code: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  colorAccent: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalSubject {
  id: string;
  code: string;
  blockId?: string;
  isStandalone?: boolean;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TopicContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  titleEn?: string;
  titleAr?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
  text?: string;
  textAr?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  mediaUrl?: string;
  mediaIdbKey?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaSizeBytes?: number;
  mediaSha256?: string;
  captionEn?: string;
  captionAr?: string;
  externalUrl?: string;
  noteSeverity?: 'high-yield' | 'clinical-correlation' | 'warning' | 'exam-trap';
}

export interface TopicSection {
  id: string;
  heading?: string;
  headingEn?: string;
  headingAr?: string;
  paragraphs: string[];
  contentBlocks?: TopicContentBlock[];
}

export interface TopicImageItem {
  id: string;
  url: string;
  caption: string;
  mediaIdbKey?: string;
  externalUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface TopicLinkItem {
  id: string;
  title: string;
  url: string;
  description?: string;
  mediaType?: 'video' | 'audio' | 'pdf' | 'image' | 'link';
  mediaIdbKey?: string;
}

export interface TopicAttachmentItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeLabel: string;
  contentDataUrlOrText: string;
  mediaIdbKey?: string;
  externalUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  addedAt?: string;
}

export interface TopicArticle {
  id: string;
  title: string;
  titleEn?: string;
  titleAr?: string;
  subtitle: string;
  category: TopicCategory;
  blockId?: string;
  subjectId?: string;
  relatedTopicIds?: string[];
  author: string;
  publishedAt: string;
  readingTimeMinutes: number;
  favorite?: boolean;
  sections: TopicSection[];
  images: TopicImageItem[];
  links: TopicLinkItem[];
  attachments: TopicAttachmentItem[];
}

export interface TermExample {
  en: string;
  ar: string;
}

export interface TermMorphology {
  prefix?: { affix: string; meaningAr: string; meaningEn: string };
  root: { affix: string; meaningAr: string; meaningEn: string };
  suffix?: { affix: string; meaningAr: string; meaningEn: string };
  literalSynthesisAr: string;
}

export interface DictionaryTerm {
  id: string;
  term: string;
  termNormalized: string;
  translation: string;
  phonetic: string;
  pos: string;
  category: LexiconCategory;
  specialty?: string;
  umdCode?: string;
  keepEnglish: boolean;
  favorite?: boolean;
  collections: string[];
  ingestedAt: string;
  definitionAr: string;
  definitionEn: string;
  clinicalNote?: string;
  morphology?: TermMorphology;
  examples: TermExample[];
  relations: {
    synonyms: string[];
    broader: string[];
    related: string[];
  };
  linkedTopicIds?: string[];
  linkedSubjectIds?: string[];
  linkedBlockIds?: string[];
}

export interface LinkedSentence {
  id: string;
  en: string;
  ar: string;
  category: LexiconCategory;
  specialty?: string;
  sourceType: 'manual' | 'file' | 'long_text' | 'termux' | 'seed';
  linkedTermIds: string[];
  tags: string[];
  favorite?: boolean;
  createdAt: string;
  notes?: string;
}

export interface MorphologicalAffix {
  id: string;
  affix: string;
  cleanKey: string;
  type: 'prefix' | 'root' | 'suffix';
  meaningAr: string;
  meaningEn: string;
  combiningRule: string;
  examples: string[];
}

export interface AmbiguousCandidate {
  expansionEn: string;
  translationAr: string;
  specialty: string;
  triggers: { token: string; weight: number }[];
}

export interface ClinicalAbbreviation {
  id: string;
  abbr: string;
  isAmbiguous: boolean;
  defaultExpansionEn: string;
  defaultTranslationAr: string;
  category: AbbreviationCategory;
  priority: number;
  candidates: AmbiguousCandidate[];
}

export interface UnifiedQuizQuestion {
  id: string;
  type: 'single_choice' | 'multiple_select' | 'true_false' | 'matching' | 'fill_blank' | 'short_answer' | 'image_based';
  questionEn: string;
  questionAr?: string;
  imageUrl?: string;
  imageCaption?: string;
  options: Array<{ key: string; textEn: string; textAr?: string }>;
  correctOptionKeys: string[];
  explanationEn: string;
  explanationAr?: string;
  blockId?: string;
  subjectId?: string;
  topicId?: string;
  linkedTermIds: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  createdAt: string;
}

export interface AcademicBookResource {
  id: string;
  titleEn: string;
  titleAr: string;
  subtitleAr?: string;
  authors: string[];
  publisher?: string;
  edition?: string;
  publicationYear?: number;
  isbn?: string;
  language: 'en' | 'ar' | 'bilingual';
  resourceKind: 'textbook' | 'atlas' | 'pdf_lecture' | 'clinical_guideline' | 'study_notes' | 'slides';
  format: 'pdf' | 'epub' | 'markdown' | 'html';
  pageCount?: number;
  blockId?: string;
  subjectId?: string;
  topicIds?: string[];
  mediaAssetId?: string;
  coverMediaAssetId?: string;
  relativePath?: string;
  downloadUrl: string;
  sha256?: string;
  sizeBytes?: number;
  mimeType: string;
  tags: string[];
  descriptionEn?: string;
  descriptionAr?: string;
  publishedAt: string;
  updatedAt: string;
}

export interface AcademicExamPackage {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  examType: 'block_exam' | 'subject_quiz' | 'comprehensive' | 'osce' | 'flash_drill';
  blockId?: string;
  subjectId?: string;
  topicId?: string;
  questionIds: string[];
  durationMinutes: number;
  passingScorePercent: number;
  totalPoints: number;
  shuffleQuestions: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags: string[];
  publishedAt: string;
  updatedAt: string;
}

export interface MediaAssetRecord {
  id: string;
  fileName: string;
  relativePath: string;
  mediaType: 'image' | 'diagram' | 'pdf' | 'book' | 'audio' | 'video' | 'attachment';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  linkedEntityType: 'block' | 'subject' | 'topic' | 'term' | 'book' | 'question' | 'exam' | 'global';
  linkedEntityId?: string;
  captionAr?: string;
  captionEn?: string;
  rawUrl?: string;
  downloadable?: boolean;
  tags?: string[];
  width?: number;
  height?: number;
  pageCount?: number;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterDataCounts {
  blocks: number;
  subjects: number;
  topics: number;
  terms: number;
  sentences: number;
  customAffixes: number;
  customAbbreviations: number;
  books: number;
  questions: number;
  exams: number;
  mediaAssets: number;
}

export interface WorkspaceMeta {
  sourceRepo: string;
  dataRepo: string;
  branch: string;
  dataVersion: string;
  lastImportedFromUmedtAt: string | null;
  lastLoadedFromDataRepoAt: string | null;
  lastPublishedAt: string | null;
  lastCommitSha: string | null;
}

export interface WorkspaceDataState {
  meta: WorkspaceMeta;
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  books: AcademicBookResource[];
  questions: UnifiedQuizQuestion[];
  exams: AcademicExamPackage[];
  mediaAssets: MediaAssetRecord[];
}

export interface ValidationIssueItem {
  severity: 'error' | 'warning';
  domain: string;
  recordId?: string;
  messageAr: string;
}

export interface ValidationReport {
  valid: boolean;
  counts: MasterDataCounts;
  errors: ValidationIssueItem[];
  warnings: ValidationIssueItem[];
}

export interface DomainDiffStats {
  domain: keyof MasterDataCounts;
  labelAr: string;
  draftCount: number;
  remoteCount: number;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export interface DiffReport {
  hasChanges: boolean;
  domains: DomainDiffStats[];
  totalAdded: number;
  totalUpdated: number;
  totalRemoved: number;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  size: number;
  sha: string;
  downloadUrl: string | null;
}

export interface GitHubRepoOverview {
  fullName: string;
  exists: boolean;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string | null;
  htmlUrl: string;
  latestCommit: {
    sha: string;
    message: string;
    date: string;
    authorName: string;
  } | null;
  masterFiles: GitHubFileEntry[];
  mediaFilesCount: number;
  stableManifest: Record<string, unknown> | null;
  betaManifest: Record<string, unknown> | null;
  counts: MasterDataCounts;
  error?: string;
}

export interface DualRepoStatusResponse {
  checkedAt: string;
  sourceRepo: GitHubRepoOverview;
  dataRepo: GitHubRepoOverview;
}

export interface ReleaseKeyPair {
  keyId: string;
  algorithm: 'ECDSA-P256-SHA256';
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
  createdAt: string;
}

export interface UmedtManifestCounts {
  terms: number;
  sentences: number;
  topics: number;
  affixes: number;
  abbreviations: number;
}

export interface DataPackageManifest {
  packageId: string;
  dataVersion: string;
  minAppVersion: string;
  schemaVersion: number;
  releasedAt: string;
  channel: 'stable' | 'beta';
  downloadUrl: string;
  manifestUrl?: string;
  packageFormat?: 'zip';
  packageSizeKb?: number;
  checksum: string;
  sha256: string;
  signature: string;
  signatureAlgorithm: 'ECDSA-P256-SHA256';
  keyFingerprint: string;
  description: string;
  releaseNotes: string;
  changelog: string[];
  author: string;
  counts: UmedtManifestCounts;
  extendedCounts?: MasterDataCounts;
  filesSha256?: Record<string, string>;
  incremental?: {
    previousVersion: string | null;
    changedDomains: string[];
  };
}

export interface ReleaseHistoryRecord {
  version: string;
  channel: 'stable' | 'beta';
  releasedAt: string;
  packageFileName: string;
  sha256: string;
  packageSizeKb: number;
  signed: boolean;
  signature?: string;
  keyFingerprint?: string;
  summary: string;
  counts: UmedtManifestCounts;
  extendedCounts: MasterDataCounts;
  filesSha256: Record<string, string>;
  assetsSha256?: Record<string, string>;
  changedDomains: string[];
}

export type ContentRendererType =
  | 'hierarchy_grid'
  | 'subject_list'
  | 'rich_article'
  | 'lexicon_entry'
  | 'sentence_pair'
  | 'morphology_rule'
  | 'abbreviation_rule'
  | 'book_pdf_reader'
  | 'quiz_question'
  | 'exam_blueprint'
  | 'media_gallery'
  | 'generic_card';

export interface CatalogCollectionDescriptor {
  id: keyof MasterDataCounts;
  contentType: string;
  rendererType: ContentRendererType;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  path: string;
  rawUrl: string;
  apiPath: string;
  schemaUrl: string;
  primaryKey: 'id';
  recordCount: number;
  sha256: string;
  sizeBytes: number;
  mergeStrategy: 'merge_preserve_user_state' | 'replace_master_preserve_progress';
  userProtectedFields: string[];
  relations: Record<string, string>;
  searchableFields: string[];
  filterableFields: string[];
  updatedAt: string;
}

export interface DataCatalogDocument {
  catalogSchemaVersion: number;
  catalogVersion: string;
  schemaVersion: number;
  minAppVersion: string;
  repository: string;
  branch: string;
  generatedAt: string;
  endpoints: {
    catalogUrl: string;
    manifestStableUrl: string;
    manifestBetaUrl: string;
    masterBaseUrl: string;
    mediaBaseUrl: string;
    schemasBaseUrl: string;
    contractDocUrl: string;
    httpApiBasePath: string;
  };
  capabilities: {
    selfDescribingCollections: boolean;
    incrementalHashSync: boolean;
    cryptographicSignatureVerification: boolean;
    rollbackSupported: boolean;
    preservesLocalUserData: boolean;
  };
  contentTypesRegistry: Array<{
    contentType: string;
    rendererType: ContentRendererType;
    displayNameAr: string;
    displayNameEn: string;
    supportsDownload: boolean;
    supportsOfflineCache: boolean;
  }>;
  collections: CatalogCollectionDescriptor[];
}

export interface UnifiedContentEnvelope<T = unknown> {
  id: string;
  domain: keyof MasterDataCounts;
  contentType: string;
  rendererType: ContentRendererType;
  titleAr: string;
  titleEn: string;
  subtitle?: string;
  hierarchy: {
    blockId?: string;
    subjectId?: string;
    topicId?: string;
  };
  downloadUrl?: string;
  sha256?: string;
  media: MediaAssetRecord[];
  payload: T;
}
