import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDriveUpload,
  History,
  KeyRound,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import type {
  DataPackageManifest,
  DiffReport,
  ReleaseHistoryRecord,
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
  onFetchHistory: (channel: 'stable' | 'beta') => Promise<ReleaseHistoryRecord[]>;
  onPublishLocal: (opts: {
    version: string;
    channel: 'stable' | 'beta';
    summary: string;
    privateKeyPem?: string;
    publicKeyPem?: string;
    allowOverwrite?: boolean;
  }) => Promise<{
    manifest: DataPackageManifest;
    packageFileName: string;
    historyList: ReleaseHistoryRecord[];
    signed: boolean;
  }>;
  onRollback: (opts: {
    channel: 'stable' | 'beta';
    targetVersion: string;
  }) => Promise<{
    restoredManifest: DataPackageManifest;
    historyList: ReleaseHistoryRecord[];
  }>;
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
  onFetchHistory,
  onPublishLocal,
  onRollback,
  onDownloadReleaseZip,
  onDownloadRepoBundle,
  onPublishToGitHub
}) => {
  const [version, setVersion] = useState(state.meta.dataVersion || '2026.11.0-umd');
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable');
  const [summary, setSummary] = useState('نشر وتحديث البلوكات والمصطلحات وملحقاتهما في UMEDT-DATA');
  const [commitMessage, setCommitMessage] = useState(
    'feat(data): publish blocks, terms, and media assets to UMEDT-DATA'
  );
  const [includeWorkflowUpgrade, setIncludeWorkflowUpgrade] = useState(true);
  const [buildRelease, setBuildRelease] = useState(true);
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [generatedKeyId, setGeneratedKeyId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<ReleaseHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [localResult, setLocalResult] = useState<{
    version: string;
    packageFileName: string;
    sha256: string;
    signed: boolean;
  } | null>(null);
  const [publishResult, setPublishResult] = useState<{
    commitSha: string;
    commitUrl: string;
    filesCommitted: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const items = await onFetchHistory(channel);
      setHistoryList(items);
    } catch {
      setHistoryList([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [channel, onFetchHistory]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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

  const handlePublishLocal = async () => {
    setBusy('local');
    setErrorMsg(null);
    setLocalResult(null);
    try {
      const res = await onPublishLocal({
        version,
        channel,
        summary,
        privateKeyPem: privateKeyPem.trim() || undefined,
        publicKeyPem: publicKeyPem.trim() || undefined
      });
      setHistoryList(res.historyList);
      setLocalResult({
        version: res.manifest.dataVersion,
        packageFileName: res.packageFileName,
        sha256: res.manifest.sha256,
        signed: res.signed
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل بناء الإصدار محلياً');
    } finally {
      setBusy(null);
    }
  };

  const handleRollback = async (targetVersion: string) => {
    setBusy(`rollback:${targetVersion}`);
    setErrorMsg(null);
    try {
      const res = await onRollback({ channel, targetVersion });
      setHistoryList(res.historyList);
      setVersion(res.restoredManifest.dataVersion);
      setLocalResult({
        version: res.restoredManifest.dataVersion,
        packageFileName: `umed2-data-${res.restoredManifest.dataVersion}.zip`,
        sha256: res.restoredManifest.sha256,
        signed: Boolean(res.restoredManifest.signature)
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل استعادة الإصدار السابق');
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
      await loadHistory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل النشر إلى GitHub');
    } finally {
      setBusy(null);
    }
  };

  const activeManifestVersion = historyList[0]?.version || null;

  return (
    <div className="space-y-6">
      {/* Validation Gatekeeper */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              بوابة التحقق والفروقات قبل النشر إلى UMEDT-DATA
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تتحقق البوابة من فرادة المعرفات وسلامة الربط المرجعي وعدم وجود ملفات خطرة قبل اعتماد أي إصدار أو رفعه إلى المستودع.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshDiff}
            disabled={loadingDiff}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0 whitespace-nowrap"
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
                  <th className="px-4 py-2.5 text-left">في UMEDT-DATA</th>
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
              النشر وبناء حزمة OTA الموقّعة (ECDSA-P256-SHA256)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              يمنع النظام الكتابة فوق رقم إصدار منشور مسبقاً ويدعم البناء المحلي داخل المستودع أو الرفع الذري إلى{' '}
              <span dir="ltr" className="font-mono">{state.meta.dataRepo}</span>.
            </p>
          </div>
          <div className="text-xs shrink-0">
            {githubToken ? (
              <span className="text-emerald-700 font-medium">رمز GitHub جاهز في الجلسة</span>
            ) : (
              <button
                type="button"
                onClick={onRequestTokenModal}
                className="text-amber-700 font-medium underline cursor-pointer whitespace-nowrap"
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
            <span>
              بناء ونشر ملف <span dir="ltr" className="font-mono">manifest.json</span> وحزمة{' '}
              <span dir="ltr" className="font-mono">.zip</span> في{' '}
              <span dir="ltr" className="font-mono">data/releases/{channel}/</span>
            </span>
          </label>
        </div>

        {/* Cryptographic Signing Section */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span className="text-xs font-semibold text-slate-900">
                توقيع الحزمة رقمياً (اختياري هنا أو عبر متغيرات البيئة / GitHub Actions)
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{busy === 'keys' ? 'جاري التوليد...' : 'توليد زوج مفاتيح ECDSA-P256'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                المفتاح الخاص (PKCS#8 Private Key PEM — للتوقيع المؤقت)
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

        {localResult && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 text-xs text-teal-950 space-y-1">
            <div className="font-semibold">
              تم تحديث ملفات المستودع محلياً في data/releases/{channel}/ للإصدار{' '}
              <span dir="ltr" className="font-mono">{localResult.version}</span>
            </div>
            <div dir="ltr" className="font-mono text-teal-900">
              {localResult.packageFileName} · sha256:{localResult.sha256.slice(0, 16)} ·{' '}
              {localResult.signed ? 'Signed (ECDSA-P256-SHA256)' : 'Unsigned'}
            </div>
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 shrink-0 whitespace-nowrap"
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
              onClick={handlePublishLocal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <HardDriveUpload className="w-4 h-4" />
              <span>{busy === 'local' ? 'جاري البناء...' : 'اعتماد وبناء الإصدار محلياً (data/)'}</span>
            </button>

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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل مستودع UMEDT-DATA كاملاً (.zip)</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!validation.valid || busy !== null}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Rocket className="w-4 h-4" />
            <span>{busy === 'publish' ? 'جاري النشر إلى GitHub...' : 'نشر التحديث إلى UMEDT-DATA'}</span>
          </button>
        </div>
      </form>

      {/* Release History & One-Click Rollback */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                سجل الإصدارات واستعادة النسخ السابقة ({channel})
              </h3>
              <p className="text-xs text-slate-500">
                يُحفظ السجل في <span dir="ltr" className="font-mono">data/releases/{channel}/history.json</span> مع بصمة التحقق لإمكانية الاستعادة الفورية عند فشل التحديث.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            disabled={loadingHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            <span>تحديث السجل</span>
          </button>
        </div>

        {historyList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد إصدارات مسجلة في قناة {channel} حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الإصدار</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3 text-left">الحجم</th>
                  <th className="px-4 py-3">SHA-256</th>
                  <th className="px-4 py-3">النطاقات المتغيرة</th>
                  <th className="px-4 py-3">التوقيع</th>
                  <th className="px-4 py-3">استعادة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyList.map((item, idx) => {
                  const isCurrent = idx === 0 && item.version === activeManifestVersion;
                  return (
                    <tr key={`${item.version}-${item.releasedAt}`} className="hover:bg-slate-50/70">
                      <td dir="ltr" className="px-4 py-3 font-mono font-semibold text-slate-900 text-right">
                        {item.version}
                        {isCurrent && (
                          <span className="mr-2 font-sans text-xs font-medium text-emerald-700">
                            (الفعّال)
                          </span>
                        )}
                      </td>
                      <td dir="ltr" className="px-4 py-3 font-mono text-slate-600 text-right tabular-nums">
                        {item.releasedAt.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-left text-slate-700">
                        {item.packageSizeKb} KB
                      </td>
                      <td dir="ltr" className="px-4 py-3 font-mono text-slate-600 text-right">
                        {item.sha256.slice(0, 12)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                        {item.changedDomains.length > 0 ? item.changedDomains.join('، ') : 'كامل'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.signed ? 'موقّع ECDSA' : 'تحقق SHA-256'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busy !== null || isCurrent}
                          onClick={() => handleRollback(item.version)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>
                            {busy === `rollback:${item.version}`
                              ? 'جاري الاستعادة...'
                              : isCurrent
                              ? 'الإصدار الحالي'
                              : 'استعادة هذا الإصدار'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
