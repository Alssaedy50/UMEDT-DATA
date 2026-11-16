import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import type {
  DualRepoStatusResponse,
  MasterDataCounts,
  ValidationReport,
  WorkspaceDataState
} from '../types/umedtData';

interface OverviewSyncViewProps {
  state: WorkspaceDataState;
  validation: ValidationReport;
  repoStatus: DualRepoStatusResponse | null;
  loadingStatus: boolean;
  busyAction: string | null;
  onRefreshStatus: () => void;
  onUpdateRepos: (sourceRepo: string, dataRepo: string) => void;
  onImportFromUmedt: () => void;
  onLoadFromUmedtData: () => void;
  onNavigateTab: (tab: 'blocks' | 'terms' | 'media' | 'publish' | 'integration') => void;
}

const DOMAIN_ROWS: Array<{ key: keyof MasterDataCounts; label: string; file: string }> = [
  { key: 'blocks', label: 'البلوكات الطبية', file: 'data/master/blocks.json' },
  { key: 'subjects', label: 'المواد الدراسية', file: 'data/master/subjects.json' },
  { key: 'topics', label: 'المواضيع والمحاضرات', file: 'data/master/topics.json' },
  { key: 'terms', label: 'المصطلحات الطبية', file: 'data/master/terms.json' },
  { key: 'sentences', label: 'الجمل السريرية', file: 'data/master/sentences.json' },
  { key: 'customAffixes', label: 'السوابق واللواحق', file: 'data/master/custom-affixes.json' },
  { key: 'customAbbreviations', label: 'الاختصارات الطبية', file: 'data/master/custom-abbreviations.json' },
  { key: 'books', label: 'الكتب وملفات PDF', file: 'data/master/books.json' },
  { key: 'questions', label: 'بنك الأسئلة', file: 'data/master/questions.json' },
  { key: 'exams', label: 'الاختبارات والامتحانات', file: 'data/master/exams.json' },
  { key: 'mediaAssets', label: 'الصور والرسومات والوسائط', file: 'data/master/media-index.json' }
];

export const OverviewSyncView: React.FC<OverviewSyncViewProps> = ({
  state,
  validation,
  repoStatus,
  loadingStatus,
  busyAction,
  onRefreshStatus,
  onUpdateRepos,
  onImportFromUmedt,
  onLoadFromUmedtData,
  onNavigateTab
}) => {
  const [sourceInput, setSourceInput] = useState(state.meta.sourceRepo);
  const [dataInput, setDataInput] = useState(state.meta.dataRepo);

  const draftCounts = validation.counts;
  const dataCounts = repoStatus?.dataRepo.counts;
  const sourceCounts = repoStatus?.sourceRepo.counts;
  const totalDraft =
    draftCounts.blocks +
    draftCounts.subjects +
    draftCounts.topics +
    draftCounts.terms +
    draftCounts.sentences +
    draftCounts.customAffixes +
    draftCounts.customAbbreviations +
    (draftCounts.books || 0) +
    draftCounts.questions +
    (draftCounts.exams || 0) +
    draftCounts.mediaAssets;

  const dataRepoIsEmpty =
    dataCounts &&
    dataCounts.blocks === 0 &&
    dataCounts.terms === 0 &&
    dataCounts.topics === 0 &&
    dataCounts.sentences === 0;

  return (
    <div className="space-y-6">
      {/* Architecture banner & Repository Linking */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 text-balance">
              ربط مستودع البيانات المستقل UMEDT-DATA مع برنامج UMEDT
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-3xl leading-relaxed">
              تُدار البلوكات والمواد والمواضيع والمصطلحات والملحقات هنا وتُنشر مباشرة إلى مستودع{' '}
              <span dir="ltr" className="font-mono text-slate-900">
                {state.meta.dataRepo}
              </span>{' '}
              دون تعديل كود التطبيق أو المساس ببيانات المستخدم المحلية في{' '}
              <span dir="ltr" className="font-mono text-slate-900">
                {state.meta.sourceRepo}
              </span>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={loadingStatus}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>تحديث حالة GitHub</span>
            </button>
            <button
              type="button"
              onClick={onImportFromUmedt}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>
                {busyAction === 'import'
                  ? 'جاري الاستيراد من UMEDT...'
                  : 'استيراد البيانات من UMEDT'}
              </span>
            </button>
          </div>
        </div>

        {/* Repository coordinates form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUpdateRepos(sourceInput, dataInput);
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-5 items-end"
        >
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              المستودع الأصلي للتطبيق (الكود والبذور)
            </label>
            <input
              type="text"
              dir="ltr"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
              placeholder="Alssaedy50/UMEDT"
            />
          </div>
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              مستودع البيانات المستقل (البلوكات والمصطلحات والملحقات)
            </label>
            <input
              type="text"
              dir="ltr"
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
              placeholder="Alssaedy50/UMEDT-DATA"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              className="w-full px-4 py-2 text-sm font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              حفظ المسارات
            </button>
          </div>
        </form>
      </section>

      {/* Alert if UMEDT-DATA on GitHub is currently empty */}
      {dataRepoIsEmpty && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                مستودع UMEDT-DATA على GitHub فارغ حالياً (المصفوفات تحتوي 0 سجل)
              </p>
              <p className="text-xs text-amber-800 mt-1">
                اضغط «استيراد البيانات من UMEDT» لجلب البلوكات والمواد والمواضيع والمصطلحات والملحقات من المستودع الأصلي ثم راجعها وانشرها إلى UMEDT-DATA.
              </p>
            </div>
          </div>
          {totalDraft > 0 && (
            <button
              type="button"
              onClick={() => onNavigateTab('publish')}
              className="px-4 py-2 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              الانتقال للنشر إلى UMEDT-DATA
            </button>
          )}
        </div>
      )}

      {/* Two Repo Live Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Repo Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-500">المشروع الأصلي (الكود والتطبيق)</div>
              <h2 dir="ltr" className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {repoStatus?.sourceRepo.fullName || state.meta.sourceRepo}
              </h2>
            </div>
            <a
              href={`https://github.com/${state.meta.sourceRepo}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {repoStatus?.sourceRepo.latestCommit ? (
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono">{repoStatus.sourceRepo.defaultBranch}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-800">
                {repoStatus.sourceRepo.latestCommit.sha.slice(0, 7)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-xs">{repoStatus.sourceRepo.latestCommit.message}</span>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {loadingStatus ? 'جاري فحص المستودع...' : repoStatus?.sourceRepo.error || 'جاهز للفحص'}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">المصطلحات</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {sourceCounts ? sourceCounts.terms.toLocaleString('en-US') : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">المواضيع</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {sourceCounts ? sourceCounts.topics.toLocaleString('en-US') : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">الجمل والسوابق</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {sourceCounts
                  ? (sourceCounts.sentences + sourceCounts.customAffixes).toLocaleString('en-US')
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Data Repo Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-500">مستودع البيانات (UMEDT-DATA)</div>
              <h2 dir="ltr" className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {repoStatus?.dataRepo.fullName || state.meta.dataRepo}
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onLoadFromUmedtData}
                disabled={busyAction !== null}
                className="text-xs font-medium text-slate-700 hover:text-slate-950 underline underline-offset-4 cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'loadData' ? 'جاري الجلب...' : 'جلب إلى المسودة'}
              </button>
              <a
                href={`https://github.com/${state.meta.dataRepo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
              >
                <span>GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {repoStatus?.dataRepo.latestCommit ? (
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono">{repoStatus.dataRepo.defaultBranch}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-800">
                {repoStatus.dataRepo.latestCommit.sha.slice(0, 7)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-xs">{repoStatus.dataRepo.latestCommit.message}</span>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {loadingStatus ? 'جاري فحص المستودع...' : repoStatus?.dataRepo.error || 'جاهز للفحص'}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">البلوكات المنشورة</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {dataCounts ? dataCounts.blocks.toLocaleString('en-US') : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">المصطلحات المنشورة</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                {dataCounts ? dataCounts.terms.toLocaleString('en-US') : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">إصدار Stable</div>
              <div dir="ltr" className="text-sm font-semibold font-mono text-slate-900 truncate">
                {repoStatus?.dataRepo.stableManifest
                  ? String(repoStatus.dataRepo.stableManifest.dataVersion || 'منشور')
                  : 'غير منشور بعد'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Master Data Matrix Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              مصفوفة بيانات المسودة مقابل المستودع البعيد
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              قائمة الملفات القياسية التي يقرؤها تطبيق UMEDT من مستودع UMEDT-DATA
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {validation.valid ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>المسودة جاهزة وصحيحة بنيوياً</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>{validation.errors.length} ملاحظات تحتاج مراجعة</span>
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">النطاق</th>
                <th className="px-6 py-3">ملف المصدر في UMEDT-DATA</th>
                <th className="px-6 py-3 text-left">في المسودة الحالية</th>
                <th className="px-6 py-3 text-left">المنشور في UMEDT-DATA</th>
                <th className="px-6 py-3">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DOMAIN_ROWS.map((row) => {
                const draftVal = draftCounts[row.key];
                const remoteVal = dataCounts ? dataCounts[row.key] : null;
                const targetTab =
                  row.key === 'blocks' || row.key === 'subjects' || row.key === 'topics' || row.key === 'books'
                    ? 'blocks'
                    : row.key === 'mediaAssets'
                    ? 'media'
                    : 'terms';
                return (
                  <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900">{row.label}</td>
                    <td dir="ltr" className="px-6 py-3 font-mono text-xs text-slate-600 text-right">
                      {row.file}
                    </td>
                    <td className="px-6 py-3 font-mono tabular-nums text-left font-semibold text-slate-900">
                      {draftVal.toLocaleString('en-US')}
                    </td>
                    <td className="px-6 py-3 font-mono tabular-nums text-left text-slate-600">
                      {remoteVal !== null ? remoteVal.toLocaleString('en-US') : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        type="button"
                        onClick={() => onNavigateTab(targetTab)}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
                      >
                        إدارة وتعديل
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Unified Self-Describing Catalog & Read Contract Strip */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-900">واجهة القراءة الموحدة والاكتشاف التلقائي:</span>{' '}
            يجمع ملف <span dir="ltr" className="font-mono text-slate-800">data/catalog.json</span> جميع النطاقات الـ11 مع البصمات و<span dir="ltr" className="font-mono text-slate-800">rendererType</span> لربط UMEDT مستقبلاً دون تحديث التطبيق.
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs shrink-0" dir="ltr">
            <a
              href="/api/v1/catalog"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-teal-700 hover:underline whitespace-nowrap"
            >
              /api/v1/catalog
            </a>
            <span className="text-slate-300">|</span>
            <a
              href="/raw/data/catalog.json"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-teal-700 hover:underline whitespace-nowrap"
            >
              data/catalog.json
            </a>
            <span className="text-slate-300">|</span>
            <a
              href="/raw/docs/UMEDT-DATA-API-CONTRACT.md"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-teal-700 hover:underline whitespace-nowrap"
            >
              API Contract
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
