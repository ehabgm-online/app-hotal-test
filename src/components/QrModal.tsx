import React, { useState } from 'react';
import { X, Printer, Copy, Check, Download, ExternalLink } from 'lucide-react';
import { ArchiveBox } from '../data/archiveData';
import { BoxQrCode, Code128Barcode } from './BoxCodes';

interface QrModalProps {
  box: ArchiveBox | null;
  onClose: () => void;
  getBoxUrl: (boxId: number) => string;
  onPrintSingle: (boxId: number) => void;
  onOpenBox: (boxId: number) => void;
}

export const QrModal: React.FC<QrModalProps> = ({
  box,
  onClose,
  getBoxUrl,
  onPrintSingle,
  onOpenBox,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  if (!box) return null;

  const boxUrl = getBoxUrl(box.id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(boxUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${box.code}_QR_Code.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`رمز الاستجابة السريعة والباركود - ${box.titleAr}`}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900">
              ملصق التعريف الذكي — {box.titleAr}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {box.code} · السنة المالية {box.years.join(' / ')} · {box.files.length} ملف مؤرشف
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Sticker Preview Surface */}
          <div className="border-[3px] border-slate-900 rounded-xl p-5 bg-white space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Massive High-Visibility Box Number Badge */}
              <div className="bg-slate-900 text-white rounded-xl p-3 flex flex-col items-center justify-center shrink-0 min-w-[110px] text-center shadow-sm">
                <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">صندوق</span>
                <span className="text-5xl font-black font-mono-num leading-none my-1">
                  {String(box.id).padStart(2, '0')}
                </span>
                <span className="text-xs font-bold font-mono-num text-amber-400">{box.code}</span>
              </div>

              <div className="space-y-1.5 text-center sm:text-right flex-1 min-w-0">
                <div className="text-[11px] font-mono-num font-semibold text-blue-700">
                  SMART DOCS E-ARCHIVE
                </div>
                <div className="text-xl font-extrabold font-display text-slate-900">
                  {box.titleAr}
                </div>
                <p className="text-xs text-slate-600 line-clamp-1">{box.categoryScope}</p>
                <p className="text-xs text-slate-500">
                  السنة: <span className="font-mono-num font-semibold text-slate-800">{box.years.join(' / ')}</span>{' '}
                  · المحتوى:{' '}
                  <span className="font-mono-num font-semibold text-slate-800">{box.files.length} ملف</span>
                </p>
              </div>

              <div className="shrink-0 p-2 border border-slate-200 rounded-xl bg-white text-center">
                <BoxQrCode
                  value={boxUrl}
                  size={110}
                  onDataUrlReady={(url) => setQrDataUrl(url)}
                />
                <div className="text-[9px] text-slate-500 mt-1">مسح بالهاتف</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col items-center">
              <div className="w-full max-w-[240px]">
                <Code128Barcode value={box.barcodeValue} height={44} />
              </div>
            </div>
          </div>

          {/* Direct Link Bar */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              الرابط المباشر لمحتويات الصندوق (عند مسح رمز QR):
            </label>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono-num text-slate-700 truncate"
                dir="ltr"
              >
                {boxUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>نسخ الرابط</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onPrintSingle(box.id)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة ملصق الصندوق</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>حفظ صورة QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenBox(box.id);
                onClose();
              }}
              className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-slate-500" />
              <span>فتح الصندوق</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
