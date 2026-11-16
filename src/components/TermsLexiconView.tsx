import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  ClinicalAbbreviation,
  DictionaryTerm,
  LexiconCategory,
  LinkedSentence,
  MorphologicalAffix,
  UnifiedQuizQuestion,
  WorkspaceDataState
} from '../types/umedtData';

interface TermsLexiconViewProps {
  state: WorkspaceDataState;
  onSaveTerm: (term: DictionaryTerm) => Promise<void>;
  onDeleteTerm: (id: string) => Promise<void>;
  onSaveSentence: (sentence: LinkedSentence) => Promise<void>;
  onDeleteSentence: (id: string) => Promise<void>;
  onSaveAffix: (affix: MorphologicalAffix) => Promise<void>;
  onDeleteAffix: (id: string) => Promise<void>;
  onSaveAbbreviation: (abbr: ClinicalAbbreviation) => Promise<void>;
  onDeleteAbbreviation: (id: string) => Promise<void>;
  onSaveQuestion: (question: UnifiedQuizQuestion) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
}

type SubTab = 'terms' | 'sentences' | 'affixes' | 'abbreviations' | 'questions';

const PAGE_SIZE = 50;

export const TermsLexiconView: React.FC<TermsLexiconViewProps> = ({
  state,
  onSaveTerm,
  onDeleteTerm,
  onSaveSentence,
  onDeleteSentence,
  onSaveAffix,
  onDeleteAffix,
  onSaveAbbreviation,
  onDeleteAbbreviation,
  onSaveQuestion,
  onDeleteQuestion
}) => {
  const [subTab, setSubTab] = useState<SubTab>('terms');
  const [query, setQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const [editingTerm, setEditingTerm] = useState<DictionaryTerm | null>(null);
  const [editingSentence, setEditingSentence] = useState<LinkedSentence | null>(null);
  const [editingAffix, setEditingAffix] = useState<MorphologicalAffix | null>(null);
  const [editingAbbr, setEditingAbbr] = useState<ClinicalAbbreviation | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<UnifiedQuizQuestion | null>(null);

  const filteredTerms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.terms.filter((t) => {
      if (blockFilter !== 'all' && !(t.linkedBlockIds || []).includes(blockFilter)) return false;
      if (!q) return true;
      return (
        t.term.toLowerCase().includes(q) ||
        t.translation.toLowerCase().includes(q) ||
        (t.umdCode || '').toLowerCase().includes(q) ||
        (t.specialty || '').toLowerCase().includes(q)
      );
    });
  }, [state.terms, query, blockFilter]);

  const filteredSentences = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.sentences;
    return state.sentences.filter(
      (s) => s.en.toLowerCase().includes(q) || s.ar.toLowerCase().includes(q)
    );
  }, [state.sentences, query]);

  const filteredAffixes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.customAffixes;
    return state.customAffixes.filter(
      (a) =>
        a.affix.toLowerCase().includes(q) ||
        a.meaningAr.toLowerCase().includes(q) ||
        a.meaningEn.toLowerCase().includes(q)
    );
  }, [state.customAffixes, query]);

  const filteredAbbrs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.customAbbreviations;
    return state.customAbbreviations.filter(
      (a) =>
        a.abbr.toLowerCase().includes(q) ||
        a.defaultExpansionEn.toLowerCase().includes(q) ||
        a.defaultTranslationAr.toLowerCase().includes(q)
    );
  }, [state.customAbbreviations, query]);

  const filteredQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.questions;
    return state.questions.filter(
      (item) =>
        item.questionEn.toLowerCase().includes(q) ||
        (item.questionAr || '').toLowerCase().includes(q)
    );
  }, [state.questions, query]);

  const activeListLength =
    subTab === 'terms'
      ? filteredTerms.length
      : subTab === 'sentences'
      ? filteredSentences.length
      : subTab === 'affixes'
      ? filteredAffixes.length
      : subTab === 'abbreviations'
      ? filteredAbbrs.length
      : filteredQuestions.length;

  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;

  const openAddModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (subTab === 'terms') {
      setEditingTerm({
        id: `m-${Date.now()}`,
        term: '',
        termNormalized: '',
        translation: '',
        phonetic: '',
        pos: 'Noun',
        category: 'Medical',
        specialty: 'General Medicine',
        umdCode: '',
        keepEnglish: true,
        collections: [],
        ingestedAt: today,
        definitionAr: '',
        definitionEn: '',
        examples: [],
        relations: { synonyms: [], broader: [], related: [] },
        linkedBlockIds: blockFilter !== 'all' ? [blockFilter] : []
      });
    } else if (subTab === 'sentences') {
      setEditingSentence({
        id: `ph-${Date.now()}`,
        en: '',
        ar: '',
        category: 'Medical',
        sourceType: 'manual',
        linkedTermIds: [],
        tags: [],
        createdAt: today
      });
    } else if (subTab === 'affixes') {
      setEditingAffix({
        id: `af-${Date.now()}`,
        affix: '',
        cleanKey: '',
        type: 'prefix',
        meaningAr: '',
        meaningEn: '',
        combiningRule: '',
        examples: []
      });
    } else if (subTab === 'abbreviations') {
      setEditingAbbr({
        id: `ab-${Date.now()}`,
        abbr: '',
        isAmbiguous: false,
        defaultExpansionEn: '',
        defaultTranslationAr: '',
        category: 'Ward & Hx',
        priority: 80,
        candidates: []
      });
    } else {
      setEditingQuestion({
        id: `q-${Date.now()}`,
        type: 'single_choice',
        questionEn: '',
        questionAr: '',
        options: [
          { key: 'A', textEn: '' },
          { key: 'B', textEn: '' },
          { key: 'C', textEn: '' },
          { key: 'D', textEn: '' }
        ],
        correctOptionKeys: ['A'],
        explanationEn: '',
        explanationAr: '',
        linkedTermIds: [],
        createdAt: today
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar & Sub-tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {(
              [
                ['terms', `المصطلحات (${state.terms.length})`],
                ['sentences', `الجمل (${state.sentences.length})`],
                ['affixes', `السوابق واللواحق (${state.customAffixes.length})`],
                ['abbreviations', `الاختصارات (${state.customAbbreviations.length})`],
                ['questions', `الأسئلة (${state.questions.length})`]
              ] as Array<[SubTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSubTab(key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  subTab === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سجل جديد</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="ابحث بالمصطلح الإنجليزي، الترجمة العربية، كود UMD، أو التخصص..."
              className="w-full pr-9 pl-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
            />
          </div>
          {subTab === 'terms' && (
            <select
              value={blockFilter}
              onChange={(e) => {
                setBlockFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-700"
            >
              <option value="all">كل البلوكات</option>
              {state.blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.titleAr || b.titleEn}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {subTab === 'terms' && (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">المصطلح الإنجليزي</th>
                  <th className="px-4 py-3">الترجمة العربية</th>
                  <th className="px-4 py-3">التخصص / الكود</th>
                  <th className="px-4 py-3">التصنيف</th>
                  <th className="px-4 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTerms.slice(startIdx, startIdx + PAGE_SIZE).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td dir="ltr" className="px-4 py-2.5 font-medium text-slate-900 text-right">
                      <div>{t.term}</div>
                      {t.phonetic && (
                        <div className="text-xs font-mono text-slate-400">{t.phonetic}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">{t.translation}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      <span>{t.specialty || '—'}</span>
                      {t.umdCode && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span dir="ltr" className="font-mono text-slate-700">
                            {t.umdCode}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{t.category}</td>
                    <td className="px-4 py-2.5 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingTerm(t)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                        title="تعديل"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTerm(t.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'sentences' && (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الجملة السريرية (EN)</th>
                  <th className="px-4 py-3">الترجمة العربية</th>
                  <th className="px-4 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSentences.slice(startIdx, startIdx + PAGE_SIZE).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td dir="ltr" className="px-4 py-3 text-xs text-slate-800 text-right max-w-md">
                      {s.en}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-md">{s.ar}</td>
                    <td className="px-4 py-3 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingSentence(s)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSentence(s.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'affixes' && (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">السابقة / الجذر / اللاحقة</th>
                  <th className="px-4 py-3">النوع</th>
                  <th className="px-4 py-3">المعنى العربي</th>
                  <th className="px-4 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAffixes.slice(startIdx, startIdx + PAGE_SIZE).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td dir="ltr" className="px-4 py-2.5 font-mono font-semibold text-slate-900 text-right">
                      {a.affix}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{a.type}</td>
                    <td className="px-4 py-2.5 text-slate-800">{a.meaningAr}</td>
                    <td className="px-4 py-2.5 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingAffix(a)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAffix(a.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'abbreviations' && (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الاختصار</th>
                  <th className="px-4 py-3">التفصيل الإنجليزي</th>
                  <th className="px-4 py-3">الترجمة العربية</th>
                  <th className="px-4 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAbbrs.slice(startIdx, startIdx + PAGE_SIZE).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td dir="ltr" className="px-4 py-2.5 font-mono font-bold text-slate-900 text-right">
                      {a.abbr}
                    </td>
                    <td dir="ltr" className="px-4 py-2.5 text-xs text-slate-700 text-right">
                      {a.defaultExpansionEn}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">{a.defaultTranslationAr}</td>
                    <td className="px-4 py-2.5 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingAbbr(a)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAbbreviation(a.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'questions' && (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">السؤال</th>
                  <th className="px-4 py-3">النوع</th>
                  <th className="px-4 py-3">الإجابة الصحيحة</th>
                  <th className="px-4 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuestions.slice(startIdx, startIdx + PAGE_SIZE).map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 text-xs text-slate-900 max-w-lg">
                      {q.questionEn}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{q.type}</td>
                    <td className="px-4 py-2.5 text-xs font-mono font-semibold text-teal-800">
                      {q.correctOptionKeys.join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingQuestion(q)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion(q.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeListLength === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              لا توجد سجلات مطابقة في هذا القسم. استورد البيانات من UMEDT أو أضف سجلاً جديداً.
            </div>
          )}
        </div>

        {/* Pagination */}
        {activeListLength > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span>
              عرض {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, activeListLength)} من{' '}
              {activeListLength}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="font-mono">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Term Editor Modal */}
      {editingTerm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveTerm(editingTerm);
                setEditingTerm(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير المصطلح الطبي</h3>
              <button
                type="button"
                onClick={() => setEditingTerm(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">المصطلح (EN)</label>
                <input
                  required
                  dir="ltr"
                  value={editingTerm.term}
                  onChange={(e) => setEditingTerm({ ...editingTerm, term: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الترجمة (AR)</label>
                <input
                  required
                  value={editingTerm.translation}
                  onChange={(e) => setEditingTerm({ ...editingTerm, translation: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">التخصص</label>
                <input
                  value={editingTerm.specialty || ''}
                  onChange={(e) => setEditingTerm({ ...editingTerm, specialty: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">كود UMD</label>
                <input
                  dir="ltr"
                  value={editingTerm.umdCode || ''}
                  onChange={(e) => setEditingTerm({ ...editingTerm, umdCode: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">التصنيف</label>
                <select
                  value={editingTerm.category}
                  onChange={(e) =>
                    setEditingTerm({
                      ...editingTerm,
                      category: e.target.value as LexiconCategory
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Medical">Medical</option>
                  <option value="AI">AI</option>
                  <option value="Programming">Programming</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">التعريف العربي</label>
              <textarea
                rows={2}
                value={editingTerm.definitionAr}
                onChange={(e) => setEditingTerm({ ...editingTerm, definitionAr: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">التعريف الإنجليزي</label>
              <textarea
                rows={2}
                dir="ltr"
                value={editingTerm.definitionEn}
                onChange={(e) => setEditingTerm({ ...editingTerm, definitionEn: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {state.blocks.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  ربط المصطلح بالبلوكات الطبية
                </label>
                <div className="flex flex-wrap gap-2">
                  {state.blocks.map((b) => {
                    const checked = (editingTerm.linkedBlockIds || []).includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const prev = editingTerm.linkedBlockIds || [];
                            const next = e.target.checked
                              ? Array.from(new Set([...prev, b.id]))
                              : prev.filter((id) => id !== b.id);
                            setEditingTerm({ ...editingTerm, linkedBlockIds: next });
                          }}
                        />
                        <span>{b.titleAr || b.titleEn}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTerm(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ المصطلح'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sentence Modal */}
      {editingSentence && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveSentence(editingSentence);
                setEditingSentence(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير الجملة السريرية</h3>
              <button
                type="button"
                onClick={() => setEditingSentence(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">النص الإنجليزي</label>
              <textarea
                required
                dir="ltr"
                rows={3}
                value={editingSentence.en}
                onChange={(e) => setEditingSentence({ ...editingSentence, en: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الترجمة العربية</label>
              <textarea
                required
                rows={3}
                value={editingSentence.ar}
                onChange={(e) => setEditingSentence({ ...editingSentence, ar: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSentence(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Affix Modal */}
      {editingAffix && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveAffix({
                  ...editingAffix,
                  cleanKey: editingAffix.affix.replace(/[^a-zA-Z]/g, '').toLowerCase()
                });
                setEditingAffix(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير السابقة / اللاحقة</h3>
              <button
                type="button"
                onClick={() => setEditingAffix(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">اللاحقة (EN)</label>
                <input
                  required
                  dir="ltr"
                  value={editingAffix.affix}
                  onChange={(e) => setEditingAffix({ ...editingAffix, affix: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">النوع</label>
                <select
                  value={editingAffix.type}
                  onChange={(e) =>
                    setEditingAffix({
                      ...editingAffix,
                      type: e.target.value as MorphologicalAffix['type']
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="prefix">prefix</option>
                  <option value="root">root</option>
                  <option value="suffix">suffix</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">المعنى العربي</label>
              <input
                required
                value={editingAffix.meaningAr}
                onChange={(e) => setEditingAffix({ ...editingAffix, meaningAr: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">المعنى الإنجليزي</label>
              <input
                dir="ltr"
                value={editingAffix.meaningEn}
                onChange={(e) => setEditingAffix({ ...editingAffix, meaningEn: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAffix(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Abbreviation Modal */}
      {editingAbbr && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveAbbreviation(editingAbbr);
                setEditingAbbr(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير الاختصار الطبي</h3>
              <button
                type="button"
                onClick={() => setEditingAbbr(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الرمز</label>
                <input
                  required
                  dir="ltr"
                  value={editingAbbr.abbr}
                  onChange={(e) => setEditingAbbr({ ...editingAbbr, abbr: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">التفصيل الإنجليزي</label>
                <input
                  required
                  dir="ltr"
                  value={editingAbbr.defaultExpansionEn}
                  onChange={(e) =>
                    setEditingAbbr({ ...editingAbbr, defaultExpansionEn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الترجمة العربية</label>
              <input
                required
                value={editingAbbr.defaultTranslationAr}
                onChange={(e) =>
                  setEditingAbbr({ ...editingAbbr, defaultTranslationAr: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAbbr(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSaveQuestion(editingQuestion);
                setEditingQuestion(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">تحرير سؤال تقييمي</h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">نص السؤال (EN)</label>
              <textarea
                required
                dir="ltr"
                rows={2}
                value={editingQuestion.questionEn}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, questionEn: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">الخيارات</label>
              {editingQuestion.options.map((opt, idx) => (
                <div key={opt.key} className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold w-6 text-center">{opt.key}</span>
                  <input
                    dir="ltr"
                    value={opt.textEn}
                    onChange={(e) => {
                      const next = [...editingQuestion.options];
                      next[idx] = { ...opt, textEn: e.target.value };
                      setEditingQuestion({ ...editingQuestion, options: next });
                    }}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                الإجابة الصحيحة (مثلاً A)
              </label>
              <input
                dir="ltr"
                value={editingQuestion.correctOptionKeys.join(',')}
                onChange={(e) =>
                  setEditingQuestion({
                    ...editingQuestion,
                    correctOptionKeys: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
