import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, GitPullRequest, Shield } from 'lucide-react';
import type { WorkspaceDataState } from '../types/umedtData';
import { createIntegrationPullRequest, fetchIntegrationPatchFiles } from '../services/hubApi';

interface UmedtIntegrationViewProps {
  state: WorkspaceDataState;
  githubToken: string;
  onRequestTokenModal: () => void;
}

export const UmedtIntegrationView: React.FC<UmedtIntegrationViewProps> = ({
  state,
  githubToken,
  onRequestTokenModal
}) => {
  const [files, setFiles] = useState<
    Array<{ path: string; content: string; descriptionAr: string }>
  >([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [prBusy, setPrBusy] = useState(false);
  const [prResult, setPrResult] = useState<{
    prUrl: string;
    prNumber: number;
    branchName: string;
  } | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrationPatchFiles()
      .then((res) => {
        setFiles(res.files);
        if (res.files[0]) setSelectedPath(res.files[0].path);
      })
      .catch(() => {
        setFiles([]);
      });
  }, [state.meta.dataRepo, state.meta.sourceRepo]);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleCreatePr = async () => {
    if (!githubToken.trim()) {
      onRequestTokenModal();
      return;
    }
    setPrBusy(true);
    setPrError(null);
    setPrResult(null);
    try {
      const res = await createIntegrationPullRequest(githubToken);
      setPrResult(res);
    } catch (err) {
      setPrError(err instanceof Error ? err.message : 'تعذر فتح Pull Request');
    } finally {
      setPrBusy(false);
    }
  };

  const manifestUrl = `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/data/releases/stable/manifest.json`;
  const blocksUrl = `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/data/master/blocks.json`;
  const termsUrl = `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/data/master/terms.json`;
  const mediaIndexUrl = `https://raw.githubusercontent.com/${state.meta.dataRepo}/main/data/master/media-index.json`;

  return (
    <div className="space-y-6">
      {/* Architecture Separation Contract */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              ربط مستودع {state.meta.sourceRepo} بقراءة البيانات من {state.meta.dataRepo}
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              تبقى جميع واجهات تطبيق UMEDT وبيانات المستخدم المحلية (المفضلة، SRS، الملاحظات الشخصية) داخل المشروع الأصلي دون أي تعديل هدّام، بينما تُجلب البلوكات والمصطلحات والملحقات من مستودع البيانات المستقل.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="/api/integration/download-patch"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل حزمة الربط (.zip)</span>
            </a>
            <button
              type="button"
              onClick={handleCreatePr}
              disabled={prBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <GitPullRequest className="w-4 h-4" />
              <span>{prBusy ? 'جاري إنشاء Pull Request...' : 'فتح Pull Request آمن على UMEDT'}</span>
            </button>
          </div>
        </div>

        {prError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
            {prError}
          </div>
        )}

        {prResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-emerald-900">
              تم فتح Pull Request رقم <span className="font-mono font-bold">#{prResult.prNumber}</span> على فرع{' '}
              <span dir="ltr" className="font-mono">{prResult.branchName}</span> دون المساس بفرع main.
            </div>
            <a
              href={prResult.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100"
            >
              <span>مراجعة Pull Request</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Live Endpoints Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Shield className="w-4 h-4 text-teal-700" />
              <span>ضمان حماية الأكواد والبيانات المحلية</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
              <li>• لا يكتب مستودع UMEDT_DATA أي كود React أو Android داخل UMEDT.</li>
              <li>• الدمج يعتمد على المعرّف الفريد <span dir="ltr" className="font-mono">id</span> ويُبقي حقول <span dir="ltr" className="font-mono">favorite</span> و <span dir="ltr" className="font-mono">srsData</span> المحلية سليمة.</li>
              <li>• يمكن التراجع عن أي تحديث بيانات دون إعادة بناء APK أو المساس بالشفرة البرمجية.</li>
            </ul>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-900">
              الروابط الرسمية التي يقرؤها تطبيق UMEDT
            </div>
            <div dir="ltr" className="space-y-1.5 text-xs font-mono text-slate-600 break-all">
              <div>
                <span className="text-slate-400">Manifest: </span>
                {manifestUrl}
              </div>
              <div>
                <span className="text-slate-400">Blocks: </span>
                {blocksUrl}
              </div>
              <div>
                <span className="text-slate-400">Terms: </span>
                {termsUrl}
              </div>
              <div>
                <span className="text-slate-400">Media: </span>
                {mediaIndexUrl}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Preview for Integration Files */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                dir="ltr"
                onClick={() => setSelectedPath(f.path)}
                className={`px-3 py-1.5 text-xs font-mono rounded-md cursor-pointer ${
                  activeFile?.path === f.path
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.path}
              </button>
            ))}
          </div>

          {activeFile && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ' : 'نسخ الكود'}</span>
            </button>
          )}
        </div>

        {activeFile && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-slate-600">{activeFile.descriptionAr}</p>
            <pre
              dir="ltr"
              className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[460px] leading-relaxed text-left"
            >
              <code>{activeFile.content}</code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
