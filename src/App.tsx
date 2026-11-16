import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Database,
  GitBranch,
  KeyRound,
  Layers,
  Paperclip,
  Rocket,
  Share2,
  X
} from 'lucide-react';
import type {
  AcademicBookResource,
  AcademicExamPackage,
  ClinicalAbbreviation,
  DictionaryTerm,
  DiffReport,
  DualRepoStatusResponse,
  LinkedSentence,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  TopicArticle,
  UnifiedQuizQuestion,
  ValidationReport,
  WorkspaceDataState
} from './types/umedtData';
import * as hubApi from './services/hubApi';
import { OverviewSyncView } from './components/OverviewSyncView';
import { BlocksManagerView } from './components/BlocksManagerView';
import { TermsLexiconView } from './components/TermsLexiconView';
import { MediaVaultView } from './components/MediaVaultView';
import { PublishReleaseView } from './components/PublishReleaseView';
import { UmedtIntegrationView } from './components/UmedtIntegrationView';

type NavTab = 'overview' | 'blocks' | 'terms' | 'media' | 'publish' | 'integration';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'المزامنة والمستودعات', icon: Database },
  { id: 'blocks', label: 'البلوكات والمواضيع', icon: Layers },
  { id: 'terms', label: 'المصطلحات واللغويات', icon: BookOpen },
  { id: 'media', label: 'خزنة الملحقات', icon: Paperclip },
  { id: 'publish', label: 'النشر والتوقيع OTA', icon: Rocket },
  { id: 'integration', label: 'ربط مشروع UMEDT', icon: Share2 }
];

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [state, setState] = useState<WorkspaceDataState | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [repoStatus, setRepoStatus] = useState<DualRepoStatusResponse | null>(null);
  const [diffReport, setDiffReport] = useState<DiffReport | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem('umedt_hub_gh_token') || '';
    } catch {
      return '';
    }
  });
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');
  const [mediaEntityFilter, setMediaEntityFilter] = useState<{
    type: 'block' | 'subject' | 'topic' | 'term' | 'book' | 'question' | 'exam';
    id: string;
  } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const refreshStatus = useCallback(
    async (sourceRepo: string, dataRepo: string, tokenVal?: string) => {
      setLoadingStatus(true);
      try {
        const status = await hubApi.fetchGitHubStatus(sourceRepo, dataRepo, tokenVal);
        setRepoStatus(status);
      } catch (err) {
        showToast(
          'error',
          err instanceof Error ? err.message : 'تعذر الاتصال بواجهة GitHub'
        );
      } finally {
        setLoadingStatus(false);
      }
    },
    [showToast]
  );

  const refreshDiff = useCallback(async () => {
    setLoadingDiff(true);
    try {
      const res = await hubApi.fetchWorkspaceDiff(githubToken);
      setDiffReport(res.diff);
      setValidation(res.validation);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'تعذر حساب الفروقات');
    } finally {
      setLoadingDiff(false);
    }
  }, [githubToken, showToast]);

  useEffect(() => {
    hubApi
      .getWorkspace()
      .then((res) => {
        setState(res.state);
        setValidation(res.validation);
        refreshStatus(res.state.meta.sourceRepo, res.state.meta.dataRepo, githubToken);
      })
      .catch((err) => {
        showToast('error', err instanceof Error ? err.message : 'تعذر تحميل المسودة');
      });
  }, [githubToken, refreshStatus, showToast]);

  useEffect(() => {
    if (activeTab === 'publish' && state) {
      refreshDiff();
    }
  }, [activeTab, state, refreshDiff]);

  const applyUpdate = (res: { state: WorkspaceDataState; validation: ValidationReport }) => {
    setState(res.state);
    setValidation(res.validation);
  };

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tokenDraft.trim();
    setGithubToken(cleaned);
    try {
      if (cleaned) sessionStorage.setItem('umedt_hub_gh_token', cleaned);
      else sessionStorage.removeItem('umedt_hub_gh_token');
    } catch {
      // ignore storage errors
    }
    setTokenModalOpen(false);
    showToast(
      'success',
      cleaned
        ? 'تم حفظ رمز GitHub مؤقتاً في هذه الجلسة.'
        : 'تمت إزالة رمز GitHub من الجلسة.'
    );
  };

  if (!state || !validation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        جاري تهيئة مركز بيانات UMEDT-DATA...
      </div>
    );
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar (260px on desktop) */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:shrink-0 bg-white border-l border-slate-200 sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center">
          <span
            dir="ltr"
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            UMEDT Data Hub
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>البلوكات</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {validation.counts.blocks}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>المصطلحات</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {validation.counts.terms.toLocaleString('en-US')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>الملحقات</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {validation.counts.mediaAssets}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Strict 3-Zone Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
          {/* Zone 1: Brand / Contextual Title */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-bold text-slate-900 whitespace-nowrap shrink-0" dir="ltr">
              UMEDT Data Hub
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">
              {activeNavMeta.label}
            </span>
          </div>

          {/* Zone 2: Clean Text Nav Links (mobile/tablet quick switch or repo link) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              المستودعات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('blocks')}
              className="hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              البلوكات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className="hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              المصطلحات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('media')}
              className="hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              الملحقات
            </button>
            <button
              type="button"
              onClick={() => {
                setTokenDraft(githubToken);
                setTokenModalOpen(true);
              }}
              className="hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{githubToken ? 'رمز GitHub متصل' : 'ربط رمز GitHub'}</span>
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('publish')}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              نشر إلى UMEDT-DATA
            </button>
          </div>
        </header>

        {/* Mobile Tab Switcher */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id
                  ? 'bg-teal-50 text-teal-900 font-semibold'
                  : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`mx-6 mt-4 px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-[1280px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewSyncView
              state={state}
              validation={validation}
              repoStatus={repoStatus}
              loadingStatus={loadingStatus}
              busyAction={busyAction}
              onRefreshStatus={() =>
                refreshStatus(state.meta.sourceRepo, state.meta.dataRepo, githubToken)
              }
              onUpdateRepos={async (sourceRepo, dataRepo) => {
                try {
                  const res = await hubApi.updateWorkspaceMeta({ sourceRepo, dataRepo });
                  applyUpdate(res);
                  showToast('success', 'تم تحديث مسارات المستودعات بنجاح.');
                  refreshStatus(sourceRepo, dataRepo, githubToken);
                } catch (err) {
                  showToast('error', err instanceof Error ? err.message : 'تعذر حفظ المسارات');
                }
              }}
              onImportFromUmedt={async () => {
                setBusyAction('import');
                try {
                  const res = await hubApi.importFromUmedt(
                    state.meta.sourceRepo,
                    state.meta.dataRepo,
                    githubToken
                  );
                  applyUpdate(res);
                  showToast(
                    'success',
                    `تم استيراد ${res.validation.counts.blocks} بلوكات و ${res.validation.counts.terms} مصطلح و ${res.validation.counts.topics} موضوع من UMEDT.`
                  );
                } catch (err) {
                  showToast('error', err instanceof Error ? err.message : 'فشل الاستيراد');
                } finally {
                  setBusyAction(null);
                }
              }}
              onLoadFromUmedtData={async () => {
                setBusyAction('loadData');
                try {
                  const res = await hubApi.loadFromUmedtData(
                    state.meta.dataRepo,
                    state.meta.branch,
                    githubToken
                  );
                  applyUpdate(res);
                  showToast('success', 'تم جلب البيانات الحالية من مستودع UMEDT-DATA.');
                } catch (err) {
                  showToast('error', err instanceof Error ? err.message : 'فشل الجلب');
                } finally {
                  setBusyAction(null);
                }
              }}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'blocks' && (
            <BlocksManagerView
              state={state}
              onSaveBlock={async (block: MedicalBlock) => {
                const res = await hubApi.saveBlock(block);
                applyUpdate(res);
                showToast('success', 'تم حفظ البلوك الطبي في المسودة.');
              }}
              onDeleteBlock={async (id: string) => {
                const res = await hubApi.deleteBlock(id);
                applyUpdate(res);
                showToast('success', 'تم حذف البلوك.');
              }}
              onSaveSubject={async (subj: MedicalSubject) => {
                const res = await hubApi.saveSubject(subj);
                applyUpdate(res);
                showToast('success', 'تم حفظ المادة الدراسية.');
              }}
              onDeleteSubject={async (id: string) => {
                const res = await hubApi.deleteSubject(id);
                applyUpdate(res);
                showToast('success', 'تم حذف المادة.');
              }}
              onSaveTopic={async (topic: TopicArticle) => {
                const res = await hubApi.saveTopic(topic);
                applyUpdate(res);
                showToast('success', 'تم حفظ الموضوع.');
              }}
              onDeleteTopic={async (id: string) => {
                const res = await hubApi.deleteTopic(id);
                applyUpdate(res);
                showToast('success', 'تم حذف الموضوع.');
              }}
              onSaveBook={async (book: AcademicBookResource) => {
                const res = await hubApi.saveBook(book);
                applyUpdate(res);
                showToast('success', 'تم حفظ الكتاب / ملف PDF في المسودة.');
              }}
              onDeleteBook={async (id: string) => {
                const res = await hubApi.deleteBook(id);
                applyUpdate(res);
                showToast('success', 'تم حذف الكتاب.');
              }}
              onOpenMediaForEntity={(entityType, entityId) => {
                setMediaEntityFilter({ type: entityType, id: entityId });
                setActiveTab('media');
              }}
            />
          )}

          {activeTab === 'terms' && (
            <TermsLexiconView
              state={state}
              onSaveTerm={async (term: DictionaryTerm) => {
                const res = await hubApi.saveTerm(term);
                applyUpdate(res);
                showToast('success', 'تم حفظ المصطلح.');
              }}
              onDeleteTerm={async (id: string) => {
                const res = await hubApi.deleteTerm(id);
                applyUpdate(res);
                showToast('success', 'تم حذف المصطلح.');
              }}
              onSaveSentence={async (sentence: LinkedSentence) => {
                const res = await hubApi.saveSentence(sentence);
                applyUpdate(res);
                showToast('success', 'تم حفظ الجملة السريرية.');
              }}
              onDeleteSentence={async (id: string) => {
                const res = await hubApi.deleteSentence(id);
                applyUpdate(res);
                showToast('success', 'تم حذف الجملة.');
              }}
              onSaveAffix={async (affix: MorphologicalAffix) => {
                const res = await hubApi.saveAffix(affix);
                applyUpdate(res);
                showToast('success', 'تم حفظ السابقة/اللاحقة.');
              }}
              onDeleteAffix={async (id: string) => {
                const res = await hubApi.deleteAffix(id);
                applyUpdate(res);
                showToast('success', 'تم حذف السابقة/اللاحقة.');
              }}
              onSaveAbbreviation={async (abbr: ClinicalAbbreviation) => {
                const res = await hubApi.saveAbbreviation(abbr);
                applyUpdate(res);
                showToast('success', 'تم حفظ الاختصار الطبي.');
              }}
              onDeleteAbbreviation={async (id: string) => {
                const res = await hubApi.deleteAbbreviation(id);
                applyUpdate(res);
                showToast('success', 'تم حذف الاختصار.');
              }}
              onSaveQuestion={async (question: UnifiedQuizQuestion) => {
                const res = await hubApi.saveQuestion(question);
                applyUpdate(res);
                showToast('success', 'تم حفظ السؤال.');
              }}
              onDeleteQuestion={async (id: string) => {
                const res = await hubApi.deleteQuestion(id);
                applyUpdate(res);
                showToast('success', 'تم حذف السؤال.');
              }}
              onSaveExam={async (exam: AcademicExamPackage) => {
                const res = await hubApi.saveExam(exam);
                applyUpdate(res);
                showToast('success', 'تم حفظ الاختبار التقييمي.');
              }}
              onDeleteExam={async (id: string) => {
                const res = await hubApi.deleteExam(id);
                applyUpdate(res);
                showToast('success', 'تم حذف الاختبار.');
              }}
            />
          )}

          {activeTab === 'media' && (
            <MediaVaultView
              state={state}
              initialEntityFilter={mediaEntityFilter}
              onUploadMedia={async (payload) => {
                const res = await hubApi.uploadMediaAsset(payload);
                applyUpdate(res);
                showToast(
                  'success',
                  res.deduplicated
                    ? 'الملف موجود مسبقاً بنفس بصمة SHA-256 وتم تحديث ربطه دون تكرار.'
                    : 'تمت إضافة المرفق وحساب بصمة SHA-256.'
                );
              }}
              onDeleteMedia={async (id) => {
                const res = await hubApi.deleteMediaAsset(id);
                applyUpdate(res);
                showToast('success', 'تم حذف المرفق.');
              }}
            />
          )}

          {activeTab === 'publish' && (
            <PublishReleaseView
              state={state}
              validation={validation}
              diffReport={diffReport}
              loadingDiff={loadingDiff}
              githubToken={githubToken}
              onRequestTokenModal={() => {
                setTokenDraft(githubToken);
                setTokenModalOpen(true);
              }}
              onRefreshDiff={refreshDiff}
              onGenerateKeys={async () => {
                const res = await hubApi.generateReleaseKeyPair();
                showToast('success', 'تم توليد زوج مفاتيح ECDSA-P256-SHA256 جديد.');
                return res.keyPair;
              }}
              onFetchHistory={async (ch) => {
                const res = await hubApi.fetchReleaseHistory(ch);
                return res.history;
              }}
              onPublishLocal={async (opts) => {
                const res = await hubApi.publishLocalRelease(opts);
                setState(res.state);
                showToast('success', `تم اعتماد الإصدار ${res.manifest.dataVersion} محلياً في data/.`);
                refreshDiff();
                return res;
              }}
              onRollback={async (opts) => {
                const res = await hubApi.rollbackRelease(opts);
                setState(res.state);
                showToast('success', `تمت استعادة الإصدار ${res.restoredManifest.dataVersion} بنجاح.`);
                refreshDiff();
                return res;
              }}
              onDownloadReleaseZip={async (opts) => {
                const blob = await hubApi.downloadSignedReleaseZip(opts);
                triggerBlobDownload(blob, `umed2-data-${opts.version}.zip`);
                showToast('success', 'تم بناء وتنزيل حزمة OTA.');
              }}
              onDownloadRepoBundle={async (opts) => {
                const blob = await hubApi.downloadRepoBundleZip(opts);
                triggerBlobDownload(blob, 'UMEDT-DATA-repo-bundle.zip');
                showToast('success', 'تم تصدير مستودع UMEDT-DATA كاملاً.');
              }}
              onPublishToGitHub={async (opts) => {
                const res = await hubApi.publishToUmedtData(opts, githubToken);
                setState(res.state);
                showToast('success', `تم النشر إلى ${state.meta.dataRepo} بنجاح.`);
                refreshStatus(res.state.meta.sourceRepo, res.state.meta.dataRepo, githubToken);
                refreshDiff();
                return res;
              }}
            />
          )}

          {activeTab === 'integration' && (
            <UmedtIntegrationView
              state={state}
              githubToken={githubToken}
              onRequestTokenModal={() => {
                setTokenDraft(githubToken);
                setTokenModalOpen(true);
              }}
            />
          )}
        </main>
      </div>

      {/* GitHub Token Session Modal */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveToken}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">رمز الوصول GitHub (PAT)</h3>
              </div>
              <button
                type="button"
                onClick={() => setTokenModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              يُستخدم الرمز (بصلاحية <span dir="ltr" className="font-mono">repo</span>) فقط لإرسال الالتزامات المباشرة إلى مستودع{' '}
              <span dir="ltr" className="font-mono">{state.meta.dataRepo}</span> أو فتح Pull Request آمن على{' '}
              <span dir="ltr" className="font-mono">{state.meta.sourceRepo}</span>. يُحفظ مؤقتاً في ذاكرة المتصفح للجلسة الحالية فقط.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Personal Access Token
              </label>
              <input
                type="password"
                dir="ltr"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="ghp_... أو github_pat_..."
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTokenModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
              >
                حفظ للجلسة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
