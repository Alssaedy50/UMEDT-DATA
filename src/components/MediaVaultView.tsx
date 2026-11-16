import React, { useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Music, Paperclip, Trash2, Upload } from 'lucide-react';
import type { MediaAssetRecord, WorkspaceDataState } from '../types/umedtData';

interface MediaVaultViewProps {
  state: WorkspaceDataState;
  initialEntityFilter?: {
    type: 'block' | 'subject' | 'topic' | 'term' | 'book' | 'question' | 'exam';
    id: string;
  } | null;
  onUploadMedia: (payload: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
    mediaType?: MediaAssetRecord['mediaType'];
    linkedEntityType?: MediaAssetRecord['linkedEntityType'];
    linkedEntityId?: string;
    captionAr?: string;
  }) => Promise<void>;
  onDeleteMedia: (id: string) => Promise<void>;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const MediaVaultView: React.FC<MediaVaultViewProps> = ({
  state,
  initialEntityFilter,
  onUploadMedia,
  onDeleteMedia
}) => {
  const [linkedType, setLinkedType] = useState<MediaAssetRecord['linkedEntityType']>(
    initialEntityFilter?.type || 'topic'
  );
  const [linkedId, setLinkedId] = useState<string>(initialEntityFilter?.id || '');
  const [selectedMediaType, setSelectedMediaType] = useState<string>('auto');
  const [captionAr, setCaptionAr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  const entityOptions = useMemo(() => {
    if (linkedType === 'block') {
      return state.blocks.map((b) => ({ id: b.id, label: b.titleAr || b.titleEn }));
    }
    if (linkedType === 'subject') {
      return state.subjects.map((s) => ({ id: s.id, label: s.titleAr || s.titleEn }));
    }
    if (linkedType === 'topic') {
      return state.topics.map((t) => ({ id: t.id, label: t.titleAr || t.title }));
    }
    if (linkedType === 'book') {
      return (state.books || []).map((b) => ({ id: b.id, label: b.titleAr || b.titleEn }));
    }
    if (linkedType === 'question') {
      return state.questions.map((q) => ({ id: q.id, label: q.questionAr || q.questionEn }));
    }
    if (linkedType === 'exam') {
      return (state.exams || []).map((ex) => ({ id: ex.id, label: ex.titleAr || ex.titleEn }));
    }
    if (linkedType === 'term') {
      return state.terms.slice(0, 150).map((t) => ({ id: t.id, label: `${t.term} — ${t.translation}` }));
    }
    return [];
  }, [linkedType, state]);

  const filteredAssets = useMemo(() => {
    if (filterType === 'all') return state.mediaAssets;
    return state.mediaAssets.filter((m) => m.mediaType === filterType);
  }, [state.mediaAssets, filterType]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
          reader.readAsDataURL(file);
        });
        await onUploadMedia({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64,
          mediaType:
            selectedMediaType === 'auto'
              ? undefined
              : (selectedMediaType as MediaAssetRecord['mediaType']),
          linkedEntityType: linkedType,
          linkedEntityId: linkedType === 'global' ? undefined : linkedId || undefined,
          captionAr: captionAr.trim() || file.name
        });
      }
      setCaptionAr('');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">خزنة الملحقات والوسائط (SHA-256)</h1>
          <p className="text-xs text-slate-500 mt-1">
            تُحفظ الصور، ملفات PDF، المقاطع الصوتية، والمخططات داخل <span dir="ltr" className="font-mono">data/media/</span> وتُفهرس في <span dir="ltr" className="font-mono">media-index.json</span> مع منع التكرار التلقائي.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">تصنيف الملف</label>
            <select
              value={selectedMediaType}
              onChange={(e) => setSelectedMediaType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="auto">اكتشاف تلقائي</option>
              <option value="image">صورة طبية</option>
              <option value="diagram">رسم وتخطيط توضيحي (SVG/Diagram)</option>
              <option value="pdf">ملف PDF / ملزمة</option>
              <option value="book">كتاب دراسي</option>
              <option value="audio">مقطع صوتي</option>
              <option value="video">فيديو تعليمي</option>
              <option value="attachment">مرفق عام</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">نوع الارتباط</label>
            <select
              value={linkedType}
              onChange={(e) => {
                setLinkedType(e.target.value as MediaAssetRecord['linkedEntityType']);
                setLinkedId('');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="topic">موضوع / محاضرة</option>
              <option value="block">بلوك طبي</option>
              <option value="subject">مادة دراسية</option>
              <option value="book">كتاب / مرجع PDF</option>
              <option value="question">سؤال تقييمي</option>
              <option value="exam">اختبار</option>
              <option value="term">مصطلح طبي</option>
              <option value="global">مرفق عام</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">العنصر المرتبط</label>
            <select
              disabled={linkedType === 'global'}
              value={linkedId}
              onChange={(e) => setLinkedId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
            >
              <option value="">اختياري — غير محدد</option>
              {entityOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">وصف المرفق</label>
            <input
              type="text"
              value={captionAr}
              onChange={(e) => setCaptionAr(e.target.value)}
              placeholder="مثال: مخطط دورة حياة الطفيل أو ملخص PDF"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer">
          <Upload className="w-6 h-6 text-teal-700 mb-2" />
          <span className="text-sm font-semibold text-slate-800">
            {uploading ? 'جاري فحص البصمة وحفظ المرفقات...' : 'اضغط لاختيار صور أو PDF أو صوتيات لإضافتها إلى UMEDT-DATA'}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            يدعم JPG, PNG, WebP, SVG, PDF, MP3, WAV, JSON, TXT — حد آمن وخالٍ من التنفيذيات
          </span>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf,audio/*,.txt,.md,.json,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </section>

      {/* Media Registry */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            الملحقات المسجلة ({filteredAssets.length})
          </h2>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {[
              ['all', 'الكل'],
              ['diagram', 'الرسومات والمخططات'],
              ['image', 'الصور'],
              ['pdf', 'PDF'],
              ['book', 'الكتب'],
              ['audio', 'الصوتيات'],
              ['attachment', 'مرفقات أخرى']
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterType(k)}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  filterType === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            لا توجد ملحقات مسجلة بعد. ارفع ملفات جديدة أو استورد المواضيع من UMEDT.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAssets.map((asset) => {
              const Icon =
                asset.mediaType === 'image' || asset.mediaType === 'diagram'
                  ? ImageIcon
                  : asset.mediaType === 'audio'
                  ? Music
                  : asset.mediaType === 'pdf' || asset.mediaType === 'book'
                  ? FileText
                  : Paperclip;
              const previewSrc = asset.relativePath.startsWith('data/media/')
                ? `/api/workspace/media/${encodeURIComponent(asset.id)}/file`
                : asset.rawUrl || '';

              return (
                <div
                  key={asset.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {(asset.mediaType === 'image' || asset.mediaType === 'diagram') && previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={asset.captionAr || asset.fileName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {asset.fileName}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">{formatSize(asset.sizeBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {asset.linkedEntityType}
                          {asset.linkedEntityId ? `: ${asset.linkedEntityId}` : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono text-slate-600">
                          sha256:{asset.sha256.slice(0, 12)}
                        </span>
                      </div>
                      <div dir="ltr" className="text-xs font-mono text-slate-400 truncate mt-0.5 text-right">
                        {asset.relativePath}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {previewSrc && (
                      <a
                        href={previewSrc}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 rounded-md hover:bg-teal-100"
                      >
                        معاينة
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteMedia(asset.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                      title="حذف المرفق"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
