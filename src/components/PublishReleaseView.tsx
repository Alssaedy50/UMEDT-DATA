import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Rocket,
  ShieldCheck
} from 'lucide-react';
import type {
  DiffReport,
  ReleaseKeyPair,
  ValidationReport,
  WorkspaceDataState
} from '../types/umedtData';

interface PublishReleaseViewProps {
  state: WorkspaceDataState;
  validation: ValidationReport;
  diffReport: DiffReport | null;
  loadingDiff: boolean;
  githubToken: string;
  onRequestTokenModal: () => void;
  onRefreshDiff: () => void;
  onGenerateKeys: () => Promise<ReleaseKeyPair>;
  onDownloadReleaseZip: (opts: {
    version: string;
    channel: 'stable' | 'beta';
    summary: string;
    privateKeyPem?: string;
    publicKeyPem?: string;
  }) => Promise<void>;
  onDownloadRepoBundle: (opts: {
    includeRelease: boolean;
    version: string;
    channel: 'stable' | 'beta';
    summary: string;
    privateKeyPem?: string;
    publicKeyPem?: string;
  }) => Promise<void>;
  onPublishToGitHub: (opts: {
    commitMessage: string;
    includeWorkflowUpgrade: boolean;
    buildRelease: boolean;
    version: string;
    channel: 'stable' | 'beta';
    summary: string;
    privateKeyPem?: string;
    publicKeyPem?: string;
  }) => Promise<{ commitSha: string; commitUrl: string; filesCommitted: number }>;
}

export const PublishReleaseView: React.FC<PublishReleaseViewProps> = ({
  state,
  validation,
  diffReport,
  loadingDiff,
  githubToken,
  onRequestTokenModal,
  onRefreshDiff,
  onGenerateKeys,
  onDownloadReleaseZip,
  onDownloadRepoBundle,
  onPublishToGitHub
}) => {
  const [version, setVersion] = useState(state.meta.dataVersion || '2026.11.0-umd');
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable');
  const [summary, setSummary] = useState('نشر وتحديث البلوكات والمصطلحات وملحقاتهما في UMEDT_DATA');
  const [commitMessage, setCommitMessage] = useState(
    'feat(data): publish blocks, terms, and media assets to UMEDT_DATA'
  );
  const [includeWorkflowUpgrade, setIncludeWorkflowUpgrade] = useState(true);
  const [buildRelease, setBuildRelease] = useState(true);
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [generatedKeyId, setGeneratedKeyId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    commitSha: string;
    commitUrl: string;
    filesCommitted: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerateKeys = async () => {
    setBusy('keys');
    setErrorMsg(null);
    try {
      const kp = await onGenerateKeys();
      setPrivateKeyPem(kp.privateKeyPem);
      setPublicKeyPem(kp.publicKeyPem);
      setGeneratedKeyId(`${kp.keyId} (${kp.fingerprintSha256.slice(0, 12)})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر توليد المفاتيح');
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubToken.trim()) {
      onRequestTokenModal();
      return;
    }
    setBusy('publish');
    setErrorMsg(null);
    setPublishResult(null);
    try {
      const res = await onPublishToGitHub({
        commitMessage,
        includeWorkflowUpgrade,
        buildRelease,
        version,
        channel,
        summary,
        privateKeyPem: privateKeyPem.trim() || undefined,
        publicKeyPem: publicKeyPem.trim() || undefined
      });
      setPublishResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل النشر إلى GitHub');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Validation Gatekeeper */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              بوابة التحقق والفروقات قبل النشر إلى UMEDT_DATA
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تتحقق البوابة من فرادة المعرفات وسلامة الربط المرجعي وعدم وجود ملفات خطرة قبل رفع أي التزام إلى المستودع.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshDiff}
            disabled={loadingDiff}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDiff ? 'animate-spin' : ''}`} />
            <span>فحص الفروقات مع GitHub</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs pt-2">
          {validation.valid ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>التحقق البنيوي ناجح (0 أخطاء حرجة)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>يوجد {validation.errors.length} أخطاء تمنع النشر</span>
            </span>
          )}
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-600 tabular-nums">
            {validation.warnings.length} تنبيهات غير حرجة
          </span>
        </div>

        {validation.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
            {validation.errors.map((err, i) => (
              <div key={i} className="text-xs text-red-800">
                • {err.messageAr}
              </div>
            ))}
          </div>
        )}

        {diffReport && (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">النطاق</th>
                  <th className="px-4 py-2.5 text-left">المسودة</th>
                  <th className="px-4 py-2.5 text-left">في UMEDT_DATA</th>
                  <th className="px-4 py-2.5 text-left">إضافة</th>
                  <th className="px-4 py-2.5 text-left">تحديث</th>
                  <th className="px-4 py-2.5 text-left">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                {diffReport.domains.map((d) => (
                  <tr key={d.domain}>
                    <td className="px-4 py-2 font-sans font-medium text-slate-900">{d.labelAr}</td>
                    <td className="px-4 py-2 text-left">{d.draftCount}</td>
                    <td className="px-4 py-2 text-left text-slate-500">{d.remoteCount}</td>
                    <td className="px-4 py-2 text-left text-emerald-700">+{d.added}</td>
                    <td className="px-4 py-2 text-left text-amber-700">~{d.updated}</td>
                    <td className="px-4 py-2 text-left text-red-700">-{d.removed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Publish & Sign Form */}
      <form onSubmit={handlePublish} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              النشر المباشر وتوقيع حزمة OTA (ECDSA-P256-SHA256)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              يرسل التزاماً ذرياً واحداً إلى <span dir="ltr" className="font-mono">{state.meta.dataRepo}</span> دون المساس بمستودع التطبيق الأصلي.
            </p>
          </div>
          <div className="text-xs">
            {githubToken ? (
              <span className="text-emerald-700 font-medium">رمز GitHub جاهز في الجلسة</span>
            ) : (
              <button
                type="button"
                onClick={onRequestTokenModal}
                className="text-amber-700 font-medium underline cursor-pointer"
              >
                إدخال رمز GitHub للنشر المباشر
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">إصدار البيانات</label>
            <input
              required
              dir="ltr"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">القناة (Channel)</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value === 'beta' ? 'beta' : 'stable')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="stable">stable (الرسمي)</option>
              <option value="beta">beta (التجريبي)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">رسالة الالتزام (Commit)</label>
            <input
              required
              dir="ltr"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ملخص التحديث (Release Notes)</label>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex flex-wrap gap-6 text-xs text-slate-700">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeWorkflowUpgrade}
              onChange={(e) => setIncludeWorkflowUpgrade(e.target.checked)}
            />
            <span>تحديث README و GitHub Actions Workflow لدعم البلوكات والملحقات</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={buildRelease}
              onChange={(e) => setBuildRelease(e.target.checked)}
            />
            <span>بناء ونشر ملف <span dir="ltr" className="font-mono">manifest.json</span> وحزمة <span dir="ltr" className="font-mono">.zip</span> في <span dir="ltr" className="font-mono">data/releases/{channel}/</span></span>
          </label>
        </div>

        {/* Cryptographic Signing Section */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span className="text-xs font-semibold text-slate-900">
                توقيع الحزمة رقمياً (اختياري هنا أو عبر GitHub Actions)
              </span>
              {generatedKeyId && (
                <span dir="ltr" className="text-xs font-mono text-slate-500">
                  · {generatedKeyId}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerateKeys}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{busy === 'keys' ? 'جاري التوليد...' : 'توليد زوج مفاتيح ECDSA-P256'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                المفتاح الخاص (PKCS#8 Private Key PEM — للتوقيع المحلي المؤقت)
              </label>
              <textarea
                rows={3}
                dir="ltr"
                value={privateKeyPem}
                onChange={(e) => setPrivateKeyPem(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                المفتاح العام (SPKI Public Key PEM — يُضاف في إعدادات UMEDT)
              </label>
              <textarea
                rows={3}
                dir="ltr"
                value={publicKeyPem}
                onChange={(e) => setPublicKeyPem(e.target.value)}
                placeholder="-----BEGIN PUBLIC KEY-----"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        {publishResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-emerald-900 space-y-1">
              <div className="font-semibold">
                تم النشر بنجاح إلى مستودع {state.meta.dataRepo} ({publishResult.filesCommitted} ملفات)
              </div>
              <div dir="ltr" className="font-mono text-emerald-800">
                Commit: {publishResult.commitSha}
              </div>
            </div>
            <a
              href={publishResult.commitUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 shrink-0"
            >
              <span>عرض الالتزام على GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!validation.valid || busy !== null}
              onClick={async () => {
                setBusy('zip');
                try {
                  await onDownloadReleaseZip({
                    version,
                    channel,
                    summary,
                    privateKeyPem: privateKeyPem.trim() || undefined,
                    publicKeyPem: publicKeyPem.trim() || undefined
                  });
                } finally {
                  setBusy(null);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل حزمة OTA (.zip)</span>
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('bundle');
                try {
                  await onDownloadRepoBundle({
                    includeRelease: buildRelease,
                    version,
                    channel,
                    summary,
                    privateKeyPem: privateKeyPem.trim() || undefined,
                    publicKeyPem: publicKeyPem.trim() || undefined
                  });
                } finally {
                  setBusy(null);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل مستودع UMEDT_DATA كاملاً (.zip)</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!validation.valid || busy !== null}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" />
            <span>{busy === 'publish' ? 'جاري النشر إلى GitHub...' : 'نشر التحديث إلى UMEDT_DATA'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
