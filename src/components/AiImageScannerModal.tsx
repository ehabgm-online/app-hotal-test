import React, { useState, useRef } from 'react';
import { Camera, Upload, Sparkles, CheckCircle2, XCircle, Box, ArrowRight, Plus, RefreshCw, X } from 'lucide-react';
import { extractDocumentFromImage, VisionExtractedData } from '../utils/aiVisionService';
import { ArchiveBox } from '../data/archiveData';

interface AiImageScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: ArchiveBox[];
  onAddRecordToBox: (boxId: number, record: { supplierName: string; docNo: string; checkNo: string; year: number; notes: string; amountEgp?: number }) => void;
  onNavigateToBox: (boxId: number, fileNo?: number) => void;
  showToast: (msg: string) => void;
}

export function AiImageScannerModal({
  isOpen,
  onClose,
  boxes,
  onAddRecordToBox,
  onNavigateToBox,
  showToast,
}: AiImageScannerModalProps) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<VisionExtractedData | null>(null);
  const [matchedBox, setMatchedBox] = useState<{ box: ArchiveBox; matchScore: number } | null>(null);
  const [selectedTargetBoxId, setSelectedTargetBoxId] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setLoading(true);
    setExtracted(null);
    setMatchedBox(null);

    try {
      const data = await extractDocumentFromImage(file);
      if (data) {
        setExtracted(data);
        if (data.suggestedBoxNumber) {
          setSelectedTargetBoxId(data.suggestedBoxNumber);
        }

        // Check if supplier exists in boxes
        if (data.supplierName) {
          const q = data.supplierName.toLowerCase().trim();
          let found: { box: ArchiveBox; matchScore: number } | null = null;
          for (const b of boxes) {
            for (const f of b.files) {
              if (f.supplierName.toLowerCase().includes(q) || q.includes(f.supplierName.toLowerCase())) {
                found = { box: b, matchScore: 100 };
                break;
              }
            }
            if (found) break;
          }
          setMatchedBox(found);
        }
        showToast('تم فحص المستند واستخراج البيانات بدقة بالذكاء الاصطناعي!');
      } else {
        showToast('تعذر استخراج البيانات من الصورة، يرجى المحاولة بصورة أوضح.');
      }
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء معالجة الصورة.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
          break;
        }
      }
    }
  };

  const handleConfirmAdd = () => {
    if (!extracted || !extracted.supplierName) return;
    onAddRecordToBox(selectedTargetBoxId, {
      supplierName: extracted.supplierName,
      docNo: extracted.docNo || 'DOC-AI',
      checkNo: extracted.checkNo || '—',
      year: extracted.year || 2017,
      notes: extracted.notes || 'تمت الإضافة عبر فحص الصورة بالذكاء الاصطناعي',
      amountEgp: extracted.amount || undefined,
    });
    showToast(`تم حفظ ومزامنة الفاتورة والمورد سحابياً في الصندوق رقم ${selectedTargetBoxId}!`);
    onClose();
  };

  return (
    <div
      onPaste={handlePaste}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-teal-700 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md shrink-0">
              <Camera className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">فحص المستندات والفواتير بالذكاء الاصطناعي (AI OCR)</h3>
              <p className="text-[11px] sm:text-xs text-indigo-100 truncate">التقط الفاتورة أو الشيك بكاميرا الهاتف أو ارفع الصورة للمزامنة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Upload / Camera Action Buttons */}
          {!previewUrl && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 rounded-2xl p-8 text-center bg-indigo-50/50 dark:bg-indigo-950/20 cursor-pointer transition-all flex flex-col items-center justify-center gap-3"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <span className="font-bold text-sm text-slate-800 dark:text-white block mb-1">
                    انقر لرفع صورة الفاتورة أو الشيك (أو الصق صورة من الحافظة Ctrl+V)
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    يدعم صور JPG, PNG, WEBP ومستندات الفنادق والشركات
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  <Camera className="w-4 h-4 text-white" />
                  <span>التقاط بالكاميرا مباشرة 📸</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>اختيار من المعرض 📁</span>
                </button>
              </div>

              {/* Hidden Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelected}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          )}

          {/* Preview & Analysis */}
          {previewUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 flex items-center justify-center max-h-72">
                <img src={previewUrl} alt="Document Preview" className="max-h-72 object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setExtracted(null);
                    setMatchedBox(null);
                  }}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-black/70 hover:bg-black text-white text-xs font-semibold rounded-lg backdrop-blur-xs"
                >
                  فحص صورة أخرى
                </button>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 space-y-3">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      جاري فحص المستند واستخراج البيانات بالذكاء الاصطناعي...
                    </span>
                  </div>
                ) : extracted ? (
                  <div className="space-y-3">
                    {/* Editable Extracted Form */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                          اسم المورد:
                        </label>
                        <input
                          type="text"
                          value={extracted.supplierName || ''}
                          onChange={(e) => setExtracted({ ...extracted, supplierName: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                            رقم المستند / الفاتورة:
                          </label>
                          <input
                            type="text"
                            value={extracted.docNo || ''}
                            onChange={(e) => setExtracted({ ...extracted, docNo: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                            رقم الشيك:
                          </label>
                          <input
                            type="text"
                            value={extracted.checkNo || ''}
                            onChange={(e) => setExtracted({ ...extracted, checkNo: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                            السنة المالية:
                          </label>
                          <input
                            type="number"
                            value={extracted.year || 2017}
                            onChange={(e) => setExtracted({ ...extracted, year: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                            المبلغ (ج.م):
                          </label>
                          <input
                            type="number"
                            value={extracted.amount || ''}
                            placeholder="0"
                            onChange={(e) => setExtracted({ ...extracted, amount: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-emerald-600 font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Match Result Banner */}
                    {matchedBox ? (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>المورد مسجل مسبقاً في الأرشيف!</span>
                        </div>
                        <div>
                          متواجد في: <strong>{matchedBox.box.titleAr}</strong> ({matchedBox.box.subtitleAr})
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateToBox(matchedBox.box.id);
                            onClose();
                          }}
                          className="mt-1 text-emerald-700 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <span>عرض مكان المورد في الصندوق</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-2">
                        <div className="flex items-center gap-1.5 font-bold">
                          <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>المورد غير مسجل مسبقاً، يمكنك حفظه الآن:</span>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <select
                            value={selectedTargetBoxId}
                            onChange={(e) => setSelectedTargetBoxId(Number(e.target.value))}
                            aria-label="اختر الصندوق للإضافة"
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                          >
                            {boxes.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.titleAr} - {b.subtitleAr.substring(0, 30)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleConfirmAdd}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>حفظ سحابياً</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            فحص ذكي متعدد الوسائط بدقة فائقة
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
