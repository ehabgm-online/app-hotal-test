import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Plus,
  RefreshCw,
  X,
  RotateCw,
  Contrast,
  Search,
  Copy,
  Check,
  FileText,
  PenTool,
  ListChecks,
  Sun,
  Languages,
  Trash2,
  Tag,
  Boxes,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import {
  extractDocumentsFromImages,
  preprocessImageForVision,
  VisionEnhancementPreset,
  VisionExtractedData,
  VisionScanMode,
} from '../utils/aiVisionService';
import { ArchiveBox } from '../data/archiveData';
import {
  areSupplierNamesLinked,
  getCanonicalSupplierKey,
  matchesBilingual,
  stripCodesFromSupplierName,
} from '../utils/bilingualSearch';

interface AiImageScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: ArchiveBox[];
  onAddRecordToBox: (
    boxId: number,
    record: {
      supplierName: string;
      docNo: string;
      checkNo: string;
      year: number;
      notes: string;
      amountEgp?: number;
    }
  ) => Promise<void> | void;
  onAddBatchRecordsToBox?: (
    boxId: number,
    records: Array<{
      supplierName: string;
      docNo: string;
      checkNo: string;
      year: number;
      notes: string;
      amountEgp?: number;
    }>
  ) => Promise<void>;
  onNavigateToBox: (boxId: number, fileNo?: number) => void;
  onSearchFromScan?: (queryText: string) => void;
  showToast: (msg: string) => void;
}

interface QueuedScanImage {
  id: string;
  file: File;
  rawPreviewUrl: string;
  processedPreviewUrl?: string;
  rotateDeg: 0 | 90 | 180 | 270;
}

const SCAN_MODES: Array<{ id: VisionScanMode; label: string; hint: string }> = [
  { id: 'auto', label: 'تلقائي ذكي', hint: 'مطبوع أو خط يد أو كشف متعدد' },
  { id: 'handwriting', label: 'خط اليد والملاحظات', hint: 'أظرف وكشوف مكتوبة باليد' },
  { id: 'invoice', label: 'كشف متعدد الموردين 📋', hint: 'استخراج وتحديد مكان كل مورد بالصناديق' },
  { id: 'check', label: 'شيك بنكي', hint: 'اسم المستفيد، البنك، الرقم والمبلغ' },
];

const ENHANCE_PRESETS: Array<{ id: VisionEnhancementPreset; label: string; hint: string }> = [
  { id: 'scan-crisp', label: 'توضيح ذكي', hint: 'رفع تباين الحبر والنصوص' },
  { id: 'handwriting-ink', label: 'عزل خط اليد', hint: 'تفريغ الخلفية لإبراز خط اليد الباهت' },
  { id: 'shadow-remove', label: 'إزالة الظلال', hint: 'إزالة ظل التصوير مع الحفاظ على الأختام' },
  { id: 'original', label: 'أصلي', hint: 'بدون تعديل' },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  'handwritten-note': 'مذكرة / ظرف بخط اليد',
  'bank-check': 'شيك بنكي / إشعار صرف',
  'printed-invoice': 'فاتورة أو مستند مطبوع',
  'envelope-manifest': 'كشف محتويات ظرف / كشف موردين متعدد',
  mixed: 'مستند مختلط (مطبوع + خط يد)',
};

const LANG_LABELS: Record<string, string> = {
  ar: 'عربي',
  en: 'English',
  mixed: 'عربي + English',
};

const QUALITY_LABELS: Record<string, { label: string; cls: string }> = {
  clear: { label: 'وضوح عالٍ', cls: 'bg-emerald-100 text-emerald-800' },
  moderate: { label: 'وضوح متوسط', cls: 'bg-amber-100 text-amber-800' },
  challenging: { label: 'خط صعب — يُنصح بالمراجعة', cls: 'bg-rose-100 text-rose-800' },
};

export function AiImageScannerModal({
  isOpen,
  onClose,
  boxes,
  onAddRecordToBox,
  onAddBatchRecordsToBox,
  onNavigateToBox,
  onSearchFromScan,
  showToast,
}: AiImageScannerModalProps) {
  const [loading, setLoading] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [queuedImages, setQueuedImages] = useState<QueuedScanImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [scanMode, setScanMode] = useState<VisionScanMode>('auto');
  const [enhancePreset, setEnhancePreset] = useState<VisionEnhancementPreset>('scan-crisp');
  const [brightnessBoost, setBrightnessBoost] = useState(false);
  const [extracted, setExtracted] = useState<VisionExtractedData | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedTargetBoxId, setSelectedTargetBoxId] = useState<number>(() => boxes[0]?.id || 1);
  const [selectedBatchIndices, setSelectedBatchIndices] = useState<Set<number>>(new Set());
  const [textViewTab, setTextViewTab] = useState<'full' | 'ar' | 'en'>('full');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const queuedImagesRef = useRef<QueuedScanImage[]>([]);

  useEffect(() => {
    queuedImagesRef.current = queuedImages;
  }, [queuedImages]);

  useEffect(() => {
    return () => {
      queuedImagesRef.current.forEach((img) => URL.revokeObjectURL(img.rawPreviewUrl));
    };
  }, []);

  useEffect(() => {
    if (!boxes.some((b) => b.id === selectedTargetBoxId) && boxes.length > 0) {
      setSelectedTargetBoxId(boxes[0].id);
    }
  }, [boxes, selectedTargetBoxId]);

  const knownSuppliersHint = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const box of boxes) {
      for (const file of box.files) {
        const clean = stripCodesFromSupplierName(file.supplierName).trim();
        if (!clean || clean.length < 3) continue;
        const key = clean.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push(clean);
          if (list.length >= 120) return list;
        }
      }
    }
    return list;
  }, [boxes]);

  // Helper to find archive locations for ANY supplier name across ALL boxes
  const findArchiveLocationsForSupplier = (supplierName: string) => {
    const q = supplierName.trim();
    if (!q || q.length < 2) return [];
    const results: Array<{ box: ArchiveBox; fileCount: number; firstFileNo?: number }> = [];
    for (const box of boxes) {
      const matchedFiles = box.files.filter(
        (f) => areSupplierNamesLinked(f.supplierName, q) || matchesBilingual(f.supplierName, q)
      );
      if (matchedFiles.length > 0) {
        results.push({
          box,
          fileCount: matchedFiles.length,
          firstFileNo: matchedFiles[0]?.fileNo,
        });
      }
    }
    return results;
  };

  const matchedLocations = useMemo(() => {
    if (!extracted?.supplierName) return [];
    return findArchiveLocationsForSupplier(extracted.supplierName);
  }, [extracted?.supplierName, boxes]);

  if (!isOpen) return null;

  const activeImage = queuedImages[activeImageIndex] || queuedImages[0] || null;

  const refreshLivePreview = async (
    imgList: QueuedScanImage[],
    presetOverride?: VisionEnhancementPreset,
    boostOverride?: boolean
  ) => {
    const preset = presetOverride ?? enhancePreset;
    const boost = boostOverride ?? brightnessBoost;
    const updated = await Promise.all(
      imgList.map(async (item) => {
        try {
          const { dataUrl } = await preprocessImageForVision(item.file, {
            rotateDeg: item.rotateDeg,
            preset,
            brightnessBoost: boost,
          });
          return { ...item, processedPreviewUrl: dataUrl };
        } catch {
          return item;
        }
      })
    );
    setQueuedImages(updated);
    return updated;
  };

  const runExtraction = async (
    imgList: QueuedScanImage[],
    modeOverride?: VisionScanMode,
    presetOverride?: VisionEnhancementPreset,
    boostOverride?: boolean
  ) => {
    if (imgList.length === 0) return;
    const effectiveMode = modeOverride ?? scanMode;
    const effectivePreset =
      presetOverride ??
      (effectiveMode === 'handwriting' && enhancePreset === 'original'
        ? 'handwriting-ink'
        : enhancePreset);
    const effectiveBoost = boostOverride ?? brightnessBoost;

    setLoading(true);
    setScanError(null);

    try {
      const payload = imgList.map((item) => ({
        file: item.file,
        options: {
          rotateDeg: item.rotateDeg,
          preset: effectivePreset,
          brightnessBoost: effectiveBoost,
        },
      }));

      const { extractedData, processedPreviewUrls } = await extractDocumentsFromImages(
        payload,
        effectiveMode,
        knownSuppliersHint
      );

      setQueuedImages((prev) =>
        prev.map((item, idx) =>
          processedPreviewUrls[idx]
            ? { ...item, processedPreviewUrl: processedPreviewUrls[idx] }
            : item
        )
      );

      if (extractedData) {
        setExtracted(extractedData);

        if (
          extractedData.suggestedBoxNumber &&
          boxes.some((b) => b.id === extractedData.suggestedBoxNumber)
        ) {
          setSelectedTargetBoxId(extractedData.suggestedBoxNumber);
        } else if (boxes.length > 0) {
          setSelectedTargetBoxId(boxes[0].id);
        }

        if (extractedData.extractedItems && extractedData.extractedItems.length > 0) {
          setSelectedBatchIndices(new Set(extractedData.extractedItems.map((_, idx) => idx)));
        } else {
          setSelectedBatchIndices(new Set());
        }

        showToast(
          extractedData.extractedItems && extractedData.extractedItems.length > 0
            ? `تم استخراج ${extractedData.extractedItems.length} مورد/بند من الصورة وتحديد مواقعهم بالصناديق!`
            : 'تم فحص الصورة وتحليل المحتوى بدقة.'
        );
      } else {
        setScanError(
          'تعذر استخراج البيانات من الصورة، جرب اختيار «عزل خط اليد» أو «توضيح ذكي» وإعادة الفحص.'
        );
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || 'حدث خطأ أثناء معالجة الصورة.';
      setScanError(errMsg);
      showToast(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const addFilesAndScan = async (files: FileList | File[], append = false) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const existing = append ? queuedImages : [];
    const remainingSlots = Math.max(0, 4 - existing.length);
    const accepted = imageFiles.slice(0, remainingSlots);

    if (!append) {
      queuedImages.forEach((img) => URL.revokeObjectURL(img.rawPreviewUrl));
      setExtracted(null);
      setScanError(null);
    } else if (accepted.length === 0) {
      showToast('الحد الأقصى 4 صور في الفحص الواحد.');
      return;
    }

    const created: QueuedScanImage[] = accepted.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      rawPreviewUrl: URL.createObjectURL(file),
      rotateDeg: 0,
    }));

    const nextList = [...existing, ...created];
    setQueuedImages(nextList);
    setActiveImageIndex(append ? existing.length : 0);
    await runExtraction(nextList, scanMode, enhancePreset, brightnessBoost);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, append = false) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void addFilesAndScan(files, append);
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      void addFilesAndScan(pastedFiles, queuedImages.length > 0 && queuedImages.length < 4);
    }
  };

  const handleResetAll = () => {
    queuedImages.forEach((img) => URL.revokeObjectURL(img.rawPreviewUrl));
    setQueuedImages([]);
    setActiveImageIndex(0);
    setExtracted(null);
    setScanError(null);
    setSelectedBatchIndices(new Set());
  };

  const handleRemoveImage = (idx: number) => {
    const target = queuedImages[idx];
    if (target) URL.revokeObjectURL(target.rawPreviewUrl);
    const next = queuedImages.filter((_, i) => i !== idx);
    setQueuedImages(next);
    if (next.length === 0) {
      setExtracted(null);
      setScanError(null);
      setActiveImageIndex(0);
    } else {
      setActiveImageIndex(Math.min(activeImageIndex, next.length - 1));
    }
  };

  const handleRotateActive = async () => {
    if (!activeImage || loading) return;
    const nextDeg = (((activeImage.rotateDeg + 90) % 360) as 0 | 90 | 180 | 270);
    const nextList = queuedImages.map((item, idx) =>
      idx === activeImageIndex ? { ...item, rotateDeg: nextDeg } : item
    );
    const refreshed = await refreshLivePreview(nextList);
    void runExtraction(refreshed);
  };

  const handleSelectPreset = async (preset: VisionEnhancementPreset) => {
    setEnhancePreset(preset);
    if (queuedImages.length > 0) {
      await refreshLivePreview(queuedImages, preset, brightnessBoost);
    }
  };

  const handleToggleBrightness = async () => {
    const next = !brightnessBoost;
    setBrightnessBoost(next);
    if (queuedImages.length > 0) {
      await refreshLivePreview(queuedImages, enhancePreset, next);
    }
  };

  const handleCombineBilingualSupplierName = () => {
    if (!extracted) return;
    const ar = (extracted.supplierNameAr || '').trim();
    const en = (extracted.supplierNameEn || '').trim();
    if (ar && en && ar.toLowerCase() !== en.toLowerCase()) {
      setExtracted({ ...extracted, supplierName: `${ar} - ${en}` });
    } else if (ar || en) {
      setExtracted({ ...extracted, supplierName: ar || en });
    }
  };

  const handleConfirmAdd = async () => {
    const chosenName = (
      extracted?.supplierName ||
      extracted?.supplierNameAr ||
      extracted?.supplierNameEn ||
      ''
    ).trim();
    if (!extracted || !chosenName) {
      showToast('يرجى التأكد من وجود اسم المورد قبل الحفظ.');
      return;
    }
    const extraParts: string[] = [];
    if (extracted.bankName) extraParts.push(`بنك: ${extracted.bankName}`);
    if (extracted.documentDate) extraParts.push(`تاريخ: ${extracted.documentDate}`);
    if (extracted.envelopeOrFileHint) extraParts.push(extracted.envelopeOrFileHint);
    const finalNotes = [extracted.notes, ...extraParts].filter(Boolean).join(' · ');

    await onAddRecordToBox(selectedTargetBoxId, {
      supplierName: chosenName,
      docNo: extracted.docNo || 'DOC-AI',
      checkNo: extracted.checkNo || '—',
      year: extracted.year || 2017,
      notes: finalNotes || 'تمت الإضافة عبر فحص المستند / الكشف بالذكاء الاصطناعي',
      amountEgp: typeof extracted.amount === 'number' && extracted.amount > 0 ? extracted.amount : undefined,
    });
    onClose();
  };

  const handleSaveBatchItems = async () => {
    if (!extracted?.extractedItems || extracted.extractedItems.length === 0) return;
    const chosen = extracted.extractedItems.filter((_, idx) => selectedBatchIndices.has(idx));
    if (chosen.length === 0) {
      showToast('اختر بنداً واحداً على الأقل للحفظ.');
      return;
    }

    setSavingBatch(true);
    try {
      const formatted = chosen.map((item) => {
        const displaySup =
          item.supplierNameAr && item.supplierNameEn && item.supplierNameAr !== item.supplierNameEn
            ? `${item.supplierNameAr} - ${item.supplierNameEn}`
            : item.supplierName;
        return {
          supplierName: displaySup.trim(),
          docNo: item.docNo || extracted.docNo || 'DOC-AI',
          checkNo: item.checkNo || '—',
          year: item.year || extracted.year || 2017,
          notes: item.notes || 'مستخرج من كشف متعدد الموردين بالذكاء الاصطناعي',
          amountEgp: typeof item.amount === 'number' && item.amount > 0 ? item.amount : undefined,
        };
      });

      if (onAddBatchRecordsToBox) {
        await onAddBatchRecordsToBox(selectedTargetBoxId, formatted);
      } else {
        for (const rec of formatted) {
          await onAddRecordToBox(selectedTargetBoxId, rec);
        }
      }
      onClose();
    } finally {
      setSavingBatch(false);
    }
  };

  const activeTranscriptText =
    textViewTab === 'ar'
      ? extracted?.arabicText || ''
      : textViewTab === 'en'
      ? extracted?.englishText || ''
      : extracted?.rawTranscribedText || '';

  const handleCopyActiveTranscript = async () => {
    const txt = activeTranscriptText.trim();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 1800);
      showToast('تم نسخ النص المستخرج إلى الحافظة.');
    } catch {
      showToast('تعذر النسخ التلقائي.');
    }
  };

  return (
    <div
      onPaste={handlePaste}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[94dvh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-4 sm:px-6 flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                البحث واستخراج الكشوف متعددة الموردين بالصورة (Multi-Supplier OCR &amp; Match)
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                استخراج كافة أسماء الموردين من صورة الكشف ومعرفة أماكن تواجدهم في صناديق الأرشيف فوراً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 text-slate-200" />
          </button>
        </div>

        {/* Scan Mode + Pixel Preprocessing Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {SCAN_MODES.map((m) => {
              const active = scanMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setScanMode(m.id);
                    const nextPreset: VisionEnhancementPreset =
                      m.id === 'handwriting' ? 'handwriting-ink' : enhancePreset;
                    if (m.id === 'handwriting') setEnhancePreset('handwriting-ink');
                    if (m.id === 'invoice') setEnhancePreset('scan-crisp');
                    if (queuedImages.length > 0 && !loading) {
                      void runExtraction(queuedImages, m.id, nextPreset, brightnessBoost);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                  }`}
                  title={m.hint}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 ml-1">
              <Contrast className="w-3.5 h-3.5" />
              <span>معالجة الصورة:</span>
            </span>
            {ENHANCE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void handleSelectPreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  enhancePreset === p.id
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title={p.hint}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleToggleBrightness()}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                brightnessBoost
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="زيادة سطوع الصور الملتقطة في إضاءة ضعيفة"
            >
              <Sun className="w-3 h-3" />
              <span>إضاءة +</span>
            </button>
          </div>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelected(e, false)}
          className="hidden"
        />
        <input
          ref={addMoreFileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelected(e, true)}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelected(e, queuedImages.length > 0)}
          className="hidden"
        />

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {queuedImages.length === 0 ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 dark:border-blue-800 hover:border-blue-500 rounded-2xl p-9 text-center bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer transition-colors flex flex-col items-center justify-center gap-3.5"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <span className="font-bold text-base text-slate-900 dark:text-white block mb-1">
                    ارفع صورة كشف أو قائمة موردين متعددة (أو الصق صورة الكشف بـ Ctrl+V)
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl mx-auto block">
                    سيقوم الذكاء الاصطناعي بقراءة كل الأسماء المستخرجة والبحث عنها فوراً ليخبرك بكل صندوق وملف متواجدة فيه!
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
                >
                  <Camera className="w-4 h-4" />
                  <span>التقاط صورة الكشف بالكاميرا 📸</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs sm:text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>اختر صورة كشف أو فاتورة من الجهاز 📁</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Image Lab Preview & Text Explorer */}
              <div className="lg:col-span-5 space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center min-h-[220px] max-h-[320px]">
                  {activeImage && (
                    <img
                      src={activeImage.processedPreviewUrl || activeImage.rawPreviewUrl}
                      alt={`معاينة المستند ${activeImageIndex + 1}`}
                      className="max-h-[320px] w-auto object-contain"
                    />
                  )}
                  {loading && (
                    <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-white">
                      <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
                      <span className="text-xs font-semibold">
                        جاري استخراج أسماء الموردين وتحديد أماكنهم بالصناديق...
                      </span>
                    </div>
                  )}
                </div>

                {/* Multi-Image Thumbnails Strip */}
                <div className="flex items-center gap-2 flex-wrap">
                  {queuedImages.map((img, idx) => (
                    <div key={img.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => setActiveImageIndex(idx)}
                        className={`w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                          idx === activeImageIndex
                            ? 'border-blue-600 ring-2 ring-blue-200'
                            : 'border-slate-200 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={img.processedPreviewUrl || img.rawPreviewUrl}
                          alt={`صفحة ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      {queuedImages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer shadow-xs"
                          aria-label="إزالة الصورة"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {queuedImages.length < 4 && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => addMoreFileInputRef.current?.click()}
                      className="h-12 px-2.5 rounded-lg border border-dashed border-slate-300 hover:border-blue-500 text-slate-600 hover:text-blue-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      title="إضافة صفحة أخرى للكشف"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صفحة ({queuedImages.length}/4)</span>
                    </button>
                  )}
                </div>

                {/* Image Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleRotateActive()}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="font-mono-num">
                      تدوير 90° ({activeImage?.rotateDeg || 0}°)
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void runExtraction(queuedImages)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>إعادة الفحص والبحث</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer mr-auto whitespace-nowrap"
                  >
                    صورة جديدة
                  </button>
                </div>

                {/* Full Transcript Box */}
                {extracted && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                        {[
                          { id: 'full' as const, label: 'النص الكامل' },
                          { id: 'ar' as const, label: 'العربي' },
                          { id: 'en' as const, label: 'English' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setTextViewTab(tab.id)}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                              textViewTab === tab.id
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyActiveTranscript()}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTranscript ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedTranscript ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      dir={textViewTab === 'en' ? 'ltr' : 'rtl'}
                      value={activeTranscriptText}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (textViewTab === 'ar') setExtracted({ ...extracted, arabicText: val });
                        else if (textViewTab === 'en') setExtracted({ ...extracted, englishText: val });
                        else setExtracted({ ...extracted, rawTranscribedText: val });
                      }}
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />

                    {onSearchFromScan && activeTranscriptText.trim() && (
                      <button
                        type="button"
                        onClick={() => onSearchFromScan(activeTranscriptText.trim())}
                        className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>بحث شامل بالأرشيف بهذا النص</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Multi-Supplier Manifest & Box Location Finder */}
              <div className="lg:col-span-7 space-y-3.5">
                {loading && !extracted ? (
                  <div className="py-20 text-center space-y-3 bg-slate-50 rounded-xl border border-slate-200">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <div className="text-xs font-semibold text-slate-700">
                      جاري استخراج أسماء الموردين والبحث عن مواقعهم في كافة الصناديق...
                    </div>
                  </div>
                ) : extracted ? (
                  <div className="space-y-4">
                    {/* Summary Header */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 font-bold text-blue-900">
                          <Boxes className="w-4 h-4 text-blue-600" />
                          <span>
                            تم رصد واستخراج <span className="font-mono-num text-sm font-black">{extracted.extractedItems?.length || 1}</span> مورد / بند في الصورة
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px]">
                          {DOC_TYPE_LABELS[extracted.documentType || 'envelope-manifest'] || 'كشف موردين'}
                        </span>
                      </div>
                      {extracted.documentSummaryAr && (
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {extracted.documentSummaryAr}
                        </p>
                      )}
                    </div>

                    {/* Main Manifest Table with Box Locations */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <div className="bg-slate-100 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>قائمة الموردين المستخرجة وموقع كل مورد في صناديق الأرشيف:</span>
                        {extracted.extractedItems && extracted.extractedItems.length > 0 && (
                          <button
                            type="button"
                            disabled={savingBatch || selectedBatchIndices.size === 0}
                            onClick={() => void handleSaveBatchItems()}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shadow-xs"
                          >
                            {savingBatch
                              ? 'جاري الحفظ...'
                              : `حفظ المحدد (${selectedBatchIndices.size}) بالصندوق`}
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                        {extracted.extractedItems && extracted.extractedItems.length > 0 ? (
                          extracted.extractedItems.map((item, idx) => {
                            const checked = selectedBatchIndices.has(idx);
                            const supName = item.supplierName || item.supplierNameAr || 'مورد غير محدد';
                            const locs = findArchiveLocationsForSupplier(supName);
                            const isFound = locs.length > 0;

                            return (
                              <div
                                key={`${supName}-${idx}`}
                                className="p-3 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedBatchIndices((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx);
                                        else next.add(idx);
                                        return next;
                                      });
                                    }}
                                    className="mt-1 rounded border-slate-300 text-blue-600 shrink-0 cursor-pointer"
                                  />
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                                      <span>{supName}</span>
                                      {item.supplierNameAr && item.supplierNameEn && item.supplierNameAr !== item.supplierNameEn && (
                                        <span className="text-[11px] text-blue-600 font-normal">
                                          ({item.supplierNameAr})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono-num flex items-center gap-2 flex-wrap">
                                      {item.docNo ? <span>مستند: {item.docNo}</span> : null}
                                      {item.checkNo && item.checkNo !== '—' ? <span>شيك: {item.checkNo}</span> : null}
                                      {item.amount ? <span className="text-emerald-700 font-bold">{item.amount.toLocaleString()} ج.م</span> : null}
                                    </div>
                                  </div>
                                </div>

                                {/* Archive Box Location Badge */}
                                <div className="flex flex-col sm:items-end gap-1 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                  {isFound ? (
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span>موجود في {locs.length} صندوق:</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {locs.map((loc) => (
                                          <button
                                            key={loc.box.id}
                                            type="button"
                                            onClick={() => {
                                              onNavigateToBox(loc.box.id, loc.firstFileNo);
                                              onClose();
                                            }}
                                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                            title="الانتقال الفوري لمكان المورد في الصندوق"
                                          >
                                            <span>{loc.box.titleAr}</span>
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                                        غير مسجل بالأرشيف
                                      </span>
                                      {onSearchFromScan && (
                                        <button
                                          type="button"
                                          onClick={() => onSearchFromScan(supName)}
                                          className="px-2 py-1 rounded bg-slate-900 hover:bg-blue-600 text-white text-[11px] font-semibold cursor-pointer"
                                        >
                                          بحث شامل
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          // Single Extracted Supplier Fallback
                          <div className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="font-bold text-slate-900 text-base">
                                  {extracted.supplierName || 'مورد مستخرج'}
                                </h4>
                                <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                                  {extracted.docNo ? `مستند: ${extracted.docNo} · ` : ''}
                                  {extracted.checkNo && extracted.checkNo !== '—' ? `شيك: ${extracted.checkNo} · ` : ''}
                                  {extracted.amount ? `${extracted.amount.toLocaleString()} ج.م` : ''}
                                </p>
                              </div>
                              {matchedLocations.length > 0 ? (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
                                  موجود في {matchedLocations.length} صندوق
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold text-xs">
                                  مورد جديد
                                </span>
                              )}
                            </div>

                            {matchedLocations.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {matchedLocations.map((loc) => (
                                  <button
                                    key={loc.box.id}
                                    type="button"
                                    onClick={() => {
                                      onNavigateToBox(loc.box.id, loc.firstFileNo);
                                      onClose();
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <span>انتقال إلى {loc.box.titleAr}</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Target Box & Save Single / Batch Record */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <select
                        value={selectedTargetBoxId}
                        onChange={(e) => setSelectedTargetBoxId(Number(e.target.value))}
                        aria-label="اختر الصندوق للحفظ"
                        className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
                      >
                        {boxes.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.titleAr} — {(b.subtitleAr || b.categoryScope || '').substring(0, 32)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleConfirmAdd()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>حفظ المورد الأساسي بالصندوق</span>
                      </button>
                    </div>
                  </div>
                ) : scanError ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>تعذر استخراج البيانات من الصورة</span>
                    </div>
                    <p className="leading-relaxed">{scanError}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleResetAll}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer"
                      >
                        اختيار صورة أخرى
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>استخراج الكشوف المتعددة ومعرفة أماكن الموردين في الصناديق بالذكاء الاصطناعي</span>
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
