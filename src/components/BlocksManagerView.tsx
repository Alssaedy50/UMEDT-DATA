import React, { useMemo, useState } from 'react';
import { Book, BookOpen, FolderPlus, Layers, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import type {
  AcademicBookResource,
  MediaAssetRecord,
  MedicalBlock,
  MedicalSubject,
  TopicArticle,
  TopicCategory,
  WorkspaceDataState
} from '../types/umedtData';

interface BlocksManagerViewProps {
  state: WorkspaceDataState;
  onSaveBlock: (block: MedicalBlock) => Promise<void>;
  onDeleteBlock: (id: string) => Promise<void>;
  onSaveSubject: (subject: MedicalSubject) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
  onSaveTopic: (topic: TopicArticle) => Promise<void>;
  onDeleteTopic: (id: string) => Promise<void>;
  onSaveBook: (book: AcademicBookResource) => Promise<void>;
  onDeleteBook: (id: string) => Promise<void>;
  onOpenMediaForEntity: (entityType: 'block' | 'subject' | 'topic' | 'book', entityId: string) => void;
}

const ACCENT_OPTIONS = ['rose', 'emerald', 'sky', 'amber', 'indigo', 'teal'];
const TOPIC_CATEGORIES: TopicCategory[] = ['Medical', 'Technology', 'AI', 'History', 'General'];

export const BlocksManagerView: React.FC<BlocksManagerViewProps> = ({
  state,
  onSaveBlock,
  onDeleteBlock,
  onSaveSubject,
  onDeleteSubject,
  onSaveTopic,
  onDeleteTopic,
  onSaveBook,
  onDeleteBook,
  onOpenMediaForEntity
}) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string>(state.blocks[0]?.id || 'all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [contentViewMode, setContentViewMode] = useState<'topics' | 'books'>('topics');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [editingBlock, setEditingBlock] = useState<MedicalBlock | null>(null);
  const [editingSubject, setEditingSubject] = useState<MedicalSubject | null>(null);
  const [editingTopic, setEditingTopic] = useState<TopicArticle | null>(null);
  const [editingBook, setEditingBook] = useState<AcademicBookResource | null>(null);
  const [topicBodyDraft, setTopicBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const activeSubjects = useMemo(() => {
    if (selectedBlockId === 'all') return state.subjects;
    return state.subjects.filter((s) => s.blockId === selectedBlockId);
  }, [state.subjects, selectedBlockId]);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.topics.filter((t) => {
      if (selectedBlockId !== 'all' && t.blockId !== selectedBlockId) return false;
      if (selectedSubjectId !== 'all' && t.subjectId !== selectedSubjectId) return false;
      if (!q) return true;
      return (
        (t.titleAr || '').toLowerCase().includes(q) ||
        (t.titleEn || '').toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [state.topics, selectedBlockId, selectedSubjectId, searchQuery]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (state.books || []).filter((b) => {
      if (selectedBlockId !== 'all' && b.blockId !== selectedBlockId) return false;
      if (selectedSubjectId !== 'all' && b.subjectId !== selectedSubjectId) return false;
      if (!q) return true;
      return (
        (b.titleAr || '').toLowerCase().includes(q) ||
        (b.titleEn || '').toLowerCase().includes(q) ||
        (b.authors || []).some((a) => a.toLowerCase().includes(q)) ||
        b.id.toLowerCase().includes(q)
      );
    });
  }, [state.books, selectedBlockId, selectedSubjectId, searchQuery]);

  const pdfMediaAssets = useMemo(
    () =>
      state.mediaAssets.filter(
        (m) => m.mediaType === 'pdf' || m.mediaType === 'book' || m.mimeType.includes('pdf')
      ),
    [state.mediaAssets]
  );

  const mediaByEntity = useMemo(() => {
    const map = new Map<string, MediaAssetRecord[]>();
    for (const m of state.mediaAssets) {
      if (!m.linkedEntityId) continue;
      const key = `${m.linkedEntityType}:${m.linkedEntityId}`;
      const list = map.get(key) || [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [state.mediaAssets]);

  const openNewBlock = () => {
    const num = state.blocks.length + 1;
    const today = new Date().toISOString().slice(0, 10);
    setEditingBlock({
      id: `block-custom-${Date.now()}`,
      code: `BLK-${String(num).padStart(2, '0')}`,
      titleEn: '',
      titleAr: '',
      descriptionEn: '',
      descriptionAr: '',
      colorAccent: 'teal',
      order: num,
      createdAt: today,
      updatedAt: today
    });
  };

  const openNewSubject = () => {
    const num = state.subjects.length + 1;
    const today = new Date().toISOString().slice(0, 10);
    setEditingSubject({
      id: `subj-custom-${Date.now()}`,
      code: `SUBJ-${100 + num}`,
      blockId: selectedBlockId !== 'all' ? selectedBlockId : state.blocks[0]?.id || '',
      isStandalone: false,
      titleEn: '',
      titleAr: '',
      descriptionEn: '',
      descriptionAr: '',
      order: num,
      createdAt: today,
      updatedAt: today
    });
  };

  const openNewTopic = () => {
    const defaultBlock = selectedBlockId !== 'all' ? selectedBlockId : state.blocks[0]?.id || '';
    const defaultSubj =
      selectedSubjectId !== 'all'
        ? selectedSubjectId
        : state.subjects.find((s) => s.blockId === defaultBlock)?.id || state.subjects[0]?.id || '';
    setTopicBodyDraft('');
    setEditingTopic({
      id: `topic-${Date.now()}`,
      title: '',
      titleEn: '',
      titleAr: '',
      subtitle: '',
      category: 'Medical',
      blockId: defaultBlock,
      subjectId: defaultSubj,
      author: 'هيئة التحرير السريري',
      publishedAt: new Date().toISOString().slice(0, 10),
      readingTimeMinutes: 5,
      sections: [],
      images: [],
      links: [],
      attachments: []
    });
  };

  const openNewBook = () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultBlock = selectedBlockId !== 'all' ? selectedBlockId : state.blocks[0]?.id || '';
    const defaultSubj =
      selectedSubjectId !== 'all'
        ? selectedSubjectId
        : state.subjects.find((s) => s.blockId === defaultBlock)?.id || state.subjects[0]?.id || '';
    setEditingBook({
      id: `book-${Date.now()}`,
      titleEn: '',
      titleAr: '',
      authors: ['هيئة التأليف الأكاديمية - UMEDT'],
      edition: '2026 Edition',
      publicationYear: 2026,
      language: 'bilingual',
      resourceKind: 'study_notes',
      format: 'pdf',
      pageCount: 12,
      blockId: defaultBlock,
      subjectId: defaultSubj,
      topicIds: [],
      downloadUrl: '',
      mimeType: 'application/pdf',
      tags: [],
      descriptionAr: '',
      descriptionEn: '',
      publishedAt: today,
      updatedAt: today
    });
  };

  const openEditTopic = (tp: TopicArticle) => {
    const joined = (tp.sections || [])
      .map((s) => `${s.heading ? `## ${s.heading}\n` : ''}${(s.paragraphs || []).join('\n\n')}`)
      .join('\n\n');
    setTopicBodyDraft(joined);
    setEditingTopic(tp);
  };

  const handleSaveTopicForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTopic) return;
    setSaving(true);
    try {
      const blocks = topicBodyDraft
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const nextSections =
        blocks.length > 0
          ? [
              {
                id: editingTopic.sections[0]?.id || `sec-${Date.now()}`,
                heading: editingTopic.titleEn || editingTopic.titleAr || editingTopic.title,
                paragraphs: blocks
              }
            ]
          : editingTopic.sections;

      await onSaveTopic({
        ...editingTopic,
        title: editingTopic.titleAr || editingTopic.titleEn || editingTopic.title,
        sections: nextSections
      });
      setEditingTopic(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">إدارة البلوكات والمواد والمواضيع</h1>
          <p className="text-xs text-slate-500 mt-1">
            تنظيم البنية الهرمية للمناهج الطبية وربطها بالمرفقات لنشرها في <span dir="ltr" className="font-mono">blocks.json</span> و <span dir="ltr" className="font-mono">topics.json</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openNewBlock}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة بلوك</span>
          </button>
          <button
            type="button"
            onClick={openNewSubject}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>إضافة مادة</span>
          </button>
          <button
            type="button"
            onClick={openNewTopic}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>إضافة موضوع</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setContentViewMode('books');
              openNewBook();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Book className="w-4 h-4" />
            <span>إضافة كتاب / PDF</span>
          </button>
        </div>
      </div>

      {/* Master-Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Blocks Column */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              البلوكات ({state.blocks.length})
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedBlockId('all');
                setSelectedSubjectId('all');
              }}
              className={`text-xs font-medium cursor-pointer ${
                selectedBlockId === 'all' ? 'text-teal-700 underline' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              عرض الكل
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {state.blocks.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                لا توجد بلوكات بعد. استورد البيانات من UMEDT أو أضف بلوكاً جديداً.
              </div>
            ) : (
              state.blocks.map((blk) => {
                const isSelected = selectedBlockId === blk.id;
                const subjCount = state.subjects.filter((s) => s.blockId === blk.id).length;
                const topicCount = state.topics.filter((t) => t.blockId === blk.id).length;
                const attCount = (mediaByEntity.get(`block:${blk.id}`) || []).length;
                return (
                  <div
                    key={blk.id}
                    className={`p-4 transition-colors ${
                      isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBlockId(blk.id);
                          setSelectedSubjectId('all');
                        }}
                        className="text-right flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {blk.titleAr || blk.titleEn}
                        </div>
                        <div dir="ltr" className="text-xs font-mono text-slate-500 mt-0.5 text-right">
                          {blk.code} · {blk.titleEn}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-2 tabular-nums">
                          <span>{subjCount} مواد</span>
                          <span aria-hidden="true">·</span>
                          <span>{topicCount} موضوع</span>
                          <span aria-hidden="true">·</span>
                          <span>{attCount} ملحقات</span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="إرفاق ملف للبلوك"
                          onClick={() => onOpenMediaForEntity('block', blk.id)}
                          className="p-1.5 text-slate-500 hover:text-teal-700 rounded-md hover:bg-white cursor-pointer"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="تعديل البلوك"
                          onClick={() => setEditingBlock(blk)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-white cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="حذف البلوك"
                          onClick={() => onDeleteBlock(blk.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-white cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Subjects & Topics Column */}
        <div className="lg:col-span-8 space-y-5">
          {/* Subjects Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">
                  المواد الدراسية ({activeSubjects.length})
                </span>
              </div>
              {selectedSubjectId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedSubjectId('all')}
                  className="text-xs text-teal-700 hover:underline cursor-pointer"
                >
                  عرض جميع المواد
                </button>
              )}
            </div>

            {activeSubjects.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد مواد مرتبطة بهذا البلوك.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeSubjects.map((subj) => {
                  const active = selectedSubjectId === subj.id;
                  return (
                    <div
                      key={subj.id}
                      className={`border rounded-lg p-3 transition-colors ${
                        active
                          ? 'border-teal-700 bg-teal-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectId(active ? 'all' : subj.id)}
                          className="text-right flex-1 cursor-pointer"
                        >
                          <div className="text-sm font-semibold text-slate-900">
                            {subj.titleAr || subj.titleEn}
                          </div>
                          <div dir="ltr" className="text-xs font-mono text-slate-500 mt-0.5 text-right">
                            {subj.code} · {subj.titleEn}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingSubject(subj)}
                            className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
                            title="تعديل المادة"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(subj.id)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="حذف المادة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Topics or Books Panel */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setContentViewMode('topics')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer tabular-nums whitespace-nowrap ${
                    contentViewMode === 'topics'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  المواضيع والمحاضرات ({filteredTopics.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContentViewMode('books')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer tabular-nums whitespace-nowrap ${
                    contentViewMode === 'books'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الكتب وملفات PDF ({filteredBooks.length})
                </button>
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  contentViewMode === 'topics'
                    ? 'بحث بعنوان الموضوع أو المعرّف...'
                    : 'بحث بعنوان الكتاب أو المؤلف...'
                }
                className="w-full sm:w-64 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
              />
            </div>

            {contentViewMode === 'topics' ? (
              filteredTopics.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد مواضيع مطابقة للتصفية الحالية.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredTopics.map((tp) => {
                    const mediaCount =
                      (mediaByEntity.get(`topic:${tp.id}`) || []).length +
                      (tp.images?.length || 0) +
                      (tp.attachments?.length || 0);
                    return (
                      <div
                        key={tp.id}
                        className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {tp.titleAr || tp.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                            <span dir="ltr" className="font-mono text-slate-700">
                              {tp.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{tp.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{tp.sections?.length || 0} أقسام</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{mediaCount} مرفقات وصور</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenMediaForEntity('topic', tp.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>إرفاق</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditTopic(tp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 rounded-md hover:bg-teal-100 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>تحرير</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTopic(tp.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                            title="حذف الموضوع"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : filteredBooks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                لا توجد كتب أو ملفات PDF مسجلة لهذا النطاق. اضغط «إضافة كتاب / PDF» لإضافة مرجع جديد.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBooks.map((bk) => {
                  const localFileUrl = bk.mediaAssetId
                    ? `/api/workspace/media/${encodeURIComponent(bk.mediaAssetId)}/file`
                    : bk.relativePath?.startsWith('data/media/')
                    ? `/raw/${bk.relativePath}`
                    : bk.downloadUrl;
                  return (
                    <div
                      key={bk.id}
                      className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {bk.titleAr || bk.titleEn}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                          <span dir="ltr" className="font-mono text-slate-700">
                            {bk.format.toUpperCase()}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{bk.resourceKind}</span>
                          {bk.pageCount ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{bk.pageCount} صفحات</span>
                            </>
                          ) : null}
                          {bk.sizeBytes ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {(bk.sizeBytes / 1024).toFixed(1)} KB
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {localFileUrl && (
                          <a
                            href={localFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 whitespace-nowrap"
                          >
                            <span>فتح PDF</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingBook(bk)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 rounded-md hover:bg-teal-100 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>تحرير</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBook(bk.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                          title="حذف الكتاب"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Block Modal */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveBlock(editingBlock);
                setEditingBlock(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير بيانات البلوك الطبي</h3>
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المعرف (ID)</label>
                <input
                  required
                  dir="ltr"
                  value={editingBlock.id}
                  onChange={(e) => setEditingBlock({ ...editingBlock, id: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الرمز (Code)</label>
                <input
                  required
                  dir="ltr"
                  value={editingBlock.code}
                  onChange={(e) => setEditingBlock({ ...editingBlock, code: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالعربية</label>
              <input
                required
                value={editingBlock.titleAr}
                onChange={(e) => setEditingBlock({ ...editingBlock, titleAr: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالإنجليزية</label>
              <input
                required
                dir="ltr"
                value={editingBlock.titleEn}
                onChange={(e) => setEditingBlock({ ...editingBlock, titleEn: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الوصف بالعربية</label>
              <textarea
                rows={2}
                value={editingBlock.descriptionAr}
                onChange={(e) =>
                  setEditingBlock({ ...editingBlock, descriptionAr: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الترتيب</label>
                <input
                  type="number"
                  value={editingBlock.order}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, order: Number(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اللون المميز</label>
                <select
                  value={editingBlock.colorAccent}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, colorAccent: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {ACCENT_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBlock(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ البلوك'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subject Modal */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveSubject(editingSubject);
                setEditingSubject(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير بيانات المادة الدراسية</h3>
              <button
                type="button"
                onClick={() => setEditingSubject(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المعرف (ID)</label>
                <input
                  required
                  dir="ltr"
                  value={editingSubject.id}
                  onChange={(e) => setEditingSubject({ ...editingSubject, id: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">البلوك التابع له</label>
                <select
                  value={editingSubject.blockId || ''}
                  onChange={(e) =>
                    setEditingSubject({ ...editingSubject, blockId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">مستقل (بدون بلوك)</option>
                  {state.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr || b.titleEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالعربية</label>
                <input
                  required
                  value={editingSubject.titleAr}
                  onChange={(e) =>
                    setEditingSubject({ ...editingSubject, titleAr: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالإنجليزية</label>
                <input
                  required
                  dir="ltr"
                  value={editingSubject.titleEn}
                  onChange={(e) =>
                    setEditingSubject({ ...editingSubject, titleEn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSubject(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ المادة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Topic Modal */}
      {editingTopic && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTopicForm}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير الموضوع والمحتوى السريري</h3>
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المعرف (ID)</label>
                <input
                  required
                  dir="ltr"
                  value={editingTopic.id}
                  onChange={(e) => setEditingTopic({ ...editingTopic, id: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">البلوك</label>
                <select
                  value={editingTopic.blockId || ''}
                  onChange={(e) => setEditingTopic({ ...editingTopic, blockId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">غير محدد</option>
                  {state.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr || b.titleEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">التصنيف</label>
                <select
                  value={editingTopic.category}
                  onChange={(e) =>
                    setEditingTopic({
                      ...editingTopic,
                      category: e.target.value as TopicCategory
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {TOPIC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالعربية</label>
                <input
                  required
                  value={editingTopic.titleAr || editingTopic.title}
                  onChange={(e) =>
                    setEditingTopic({
                      ...editingTopic,
                      titleAr: e.target.value,
                      title: e.target.value
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالإنجليزية</label>
                <input
                  dir="ltr"
                  value={editingTopic.titleEn || ''}
                  onChange={(e) => setEditingTopic({ ...editingTopic, titleEn: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">العنوان الفرعي</label>
              <input
                dir="ltr"
                value={editingTopic.subtitle}
                onChange={(e) => setEditingTopic({ ...editingTopic, subtitle: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                فقرات المحتوى (افصل بين الفقرات بسطر فارغ)
              </label>
              <textarea
                rows={7}
                value={topicBodyDraft}
                onChange={(e) => setTopicBodyDraft(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg leading-relaxed"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الموضوع'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Book / PDF Resource Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveBook(editingBook);
                setEditingBook(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير مرجع / كتاب / ملف PDF</h3>
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المعرف (ID)</label>
                <input
                  required
                  dir="ltr"
                  value={editingBook.id}
                  onChange={(e) => setEditingBook({ ...editingBook, id: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">النوع الأكاديمي</label>
                <select
                  value={editingBook.resourceKind}
                  onChange={(e) =>
                    setEditingBook({
                      ...editingBook,
                      resourceKind: e.target.value as AcademicBookResource['resourceKind']
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="textbook">كتاب مرجعي (Textbook)</option>
                  <option value="atlas">أطلس صور ورسومات (Atlas)</option>
                  <option value="pdf_lecture">محاضرة PDF</option>
                  <option value="clinical_guideline">بروتوكول سريري</option>
                  <option value="study_notes">ملزمة دراسية</option>
                  <option value="slides">شرائح عرض</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">البلوك</label>
                <select
                  value={editingBook.blockId || ''}
                  onChange={(e) => setEditingBook({ ...editingBook, blockId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">عام / بدون بلوك</option>
                  {state.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr || b.titleEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالعربية</label>
                <input
                  required
                  value={editingBook.titleAr}
                  onChange={(e) => setEditingBook({ ...editingBook, titleAr: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالإنجليزية</label>
                <input
                  required
                  dir="ltr"
                  value={editingBook.titleEn}
                  onChange={(e) => setEditingBook({ ...editingBook, titleEn: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ربط بملف PDF من خزنة الوسائط (يملأ رابط التحميل والبصمة تلقائياً)
              </label>
              <select
                value={editingBook.mediaAssetId || ''}
                onChange={(e) => {
                  const selected = pdfMediaAssets.find((m) => m.id === e.target.value);
                  if (selected) {
                    setEditingBook({
                      ...editingBook,
                      mediaAssetId: selected.id,
                      relativePath: selected.relativePath,
                      downloadUrl:
                        selected.rawUrl ||
                        `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/${selected.relativePath}`,
                      sha256: selected.sha256,
                      sizeBytes: selected.sizeBytes,
                      mimeType: selected.mimeType || 'application/pdf'
                    });
                  } else {
                    setEditingBook({ ...editingBook, mediaAssetId: '' });
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">— اختر ملفاً مرفوعاً أو أدخل رابطاً يدوياً بالأسفل —</option>
                {pdfMediaAssets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fileName} ({(m.sizeBytes / 1024).toFixed(1)} KB)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رابط التحميل المباشر (downloadUrl)</label>
              <input
                required
                dir="ltr"
                value={editingBook.downloadUrl}
                onChange={(e) => setEditingBook({ ...editingBook, downloadUrl: e.target.value })}
                placeholder="https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">عدد الصفحات</label>
                <input
                  type="number"
                  value={editingBook.pageCount || 1}
                  onChange={(e) =>
                    setEditingBook({ ...editingBook, pageCount: Number(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الطبعة</label>
                <input
                  dir="ltr"
                  value={editingBook.edition || ''}
                  onChange={(e) => setEditingBook({ ...editingBook, edition: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اللغة</label>
                <select
                  value={editingBook.language}
                  onChange={(e) =>
                    setEditingBook({
                      ...editingBook,
                      language: e.target.value as AcademicBookResource['language']
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="bilingual">ثنائي اللغة</option>
                  <option value="ar">العربية</option>
                  <option value="en">الإنجليزية</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الكتاب / PDF'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
