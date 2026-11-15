import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Flashlight,
  Hash,
  ImagePlus,
  Link2,
  QrCode,
  ScanBarcode,
  Search,
  Smartphone,
  X,
} from 'lucide-react';
import { ArchiveBox } from '../data/archiveData';
import { normalizeDigits } from '../utils/bilingualSearch';

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

interface QuickBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: ArchiveBox[];
  findBoxByInput: (raw: string, allowNumericOnly: boolean) => { box?: ArchiveBox; fileNo?: number };
  onOpenBox: (box: ArchiveBox, options?: { focused?: boolean; fileNo?: number }) => void;
}

export const QuickBarcodeScannerModal: React.FC<QuickBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  boxes,
  findBoxByInput,
  onOpenBox,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [lastScannedRaw, setLastScannedRaw] = useState<string | null>(null);
  const [isDetectorSupported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'BarcodeDetector' in window
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchEnabled(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setInputVal('');
      setCameraError(null);
      setLastScannedRaw(null);
    }
  }, [isOpen, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleDetectedValue = useCallback(
    (rawValue: string) => {
      const cleaned = rawValue.trim();
      if (!cleaned) return;
      setLastScannedRaw(cleaned);
      setInputVal(cleaned);
      const { box, fileNo } = findBoxByInput(cleaned, true);
      if (box) {
        stopCamera();
        onOpenBox(box, { focused: true, fileNo });
        onClose();
      } else {
        setCameraError(`تم قراءة الرمز (${cleaned}) لكنه لا يطابق صندوقاً مسجلاً حالياً.`);
      }
    },
    [findBoxByInput, onClose, onOpenBox, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('المتصفح لا يدعم فتح الكاميرا هنا. يمكنك لصق الرابط أو كتابة رقم الصندوق بالأسفل.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(capabilities?.torch));

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });

      const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
      if (!DetectorCtor) {
        setCameraError('الكاميرا مفتوحة للمعاينة، لكن هذا المتصفح لا يدعم المسح التلقائي للباركود. استخدم مسح كاميرا الهاتف أو اكتب رقم/كود الصندوق مباشرة.');
        return;
      }

      const detector = new DetectorCtor({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'],
      });

      let lastCheck = 0;
      const scanFrame = async (timestamp: number) => {
        if (!streamRef.current) return;
        if (timestamp - lastCheck >= 220 && videoRef.current && videoRef.current.readyState >= 2) {
          lastCheck = timestamp;
          try {
            const barcodes = await detector.detect(videoRef.current);
            const first = barcodes.find((b) => Boolean(b.rawValue));
            if (first?.rawValue) {
              handleDetectedValue(first.rawValue);
              return;
            }
          } catch {
            // ignore transient frame read errors
          }
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      };

      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      console.warn('Camera scanner open failed:', err);
      setCameraError('تعذر الوصول إلى الكاميرا (تحقق من منح صلاحية الكاميرا للمتصفح أو استخدم الإدخال اليدوي بالأسفل).');
      stopCamera();
    }
  }, [handleDetectedValue, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const next = !torchEnabled;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);

    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!DetectorCtor) {
      setCameraError('قراءة الباركود من الصور غير مدعومة في هذا المتصفح. اكتب رقم الصندوق أو الصق الرابط بالأسفل.');
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new DetectorCtor({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'],
      });
      const results = await detector.detect(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();
      const first = results.find((r) => Boolean(r.rawValue));
      if (first?.rawValue) {
        handleDetectedValue(first.rawValue);
      } else {
        setCameraError('لم يتم العثور على رمز QR أو باركود واضح داخل الصورة المحددة.');
      }
    } catch {
      setCameraError('تعذر فحص الصورة، تأكد من اختيار صورة واضحة للباركود أو رمز QR.');
    }
  };

  const matched = useMemo(() => {
    if (!inputVal.trim()) return {};
    return findBoxByInput(inputVal, true);
  }, [inputVal, findBoxByInput]);

  const filteredBoxes = useMemo(() => {
    const q = normalizeDigits(inputVal.trim()).toLowerCase();
    if (!q) return boxes;
    if (matched.box) return [matched.box];
    return boxes.filter(
      (b) =>
        String(b.id).includes(q) ||
        b.titleAr.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.barcodeValue.toLowerCase().includes(q) ||
        b.categoryScope.toLowerCase().includes(q)
    );
  }, [boxes, inputVal, matched.box]);

  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[75] bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="الماسح السريع للصناديق والروابط والباركود"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg truncate">
                الوصول السريع للصناديق — مسح QR أو باركود أو رابط
              </h2>
              <p className="text-xs text-slate-300 truncate">
                امسح ملصق الصندوق بالكاميرا، أو أدخل رقمه / الكود / الصق الرابط المباشر
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Smart Input (Box #, Code, Barcode, URL) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (matched.box) {
                onOpenBox(matched.box, { focused: false, fileNo: matched.fileNo });
                onClose();
              } else if (filteredBoxes.length === 1) {
                onOpenBox(filteredBoxes[0], { focused: false });
                onClose();
              }
            }}
            className="space-y-2.5"
          >
            <label
              htmlFor="quick-box-lookup-input"
              className="block text-xs font-bold text-slate-700"
            >
              رقم الصندوق أو الكود أو الباركود أو الرابط المباشر:
            </label>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="quick-box-lookup-input"
                  type="text"
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    setCameraError(null);
                  }}
                  placeholder="مثال: 19 أو BOX-19 أو ARC-2017-BOX19 أو الصق رابط #/boxes/19 أو ?box=19..."
                  className="w-full pr-10 pl-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 font-mono-num"
                  autoFocus
                />
                {inputVal && (
                  <button
                    type="button"
                    onClick={() => setInputVal('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    aria-label="مسح"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {matched.box && (
                <button
                  type="submit"
                  className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>فتح</span>
                </button>
              )}
            </div>

            {/* Instant Matched Preview Card */}
            {matched.box && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white font-mono-num font-black text-xl flex items-center justify-center shrink-0">
                    {String(matched.box.id).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>تمت المطابقة المباشرة: {matched.box.titleAr}</span>
                      {matched.fileNo && (
                        <span className="font-mono-num text-blue-700">· ملف #{matched.fileNo}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-mono-num truncate">
                      {matched.box.code} · {matched.box.barcodeValue} · {matched.box.files.length} ملف
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBox(matched.box!, { focused: true, fileNo: matched.fileNo });
                      onClose();
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>وضع الجوال</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBox(matched.box!, { focused: false, fileNo: matched.fileNo });
                      onClose();
                    }}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح الصندوق</span>
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Camera QR & Barcode Live Scanner */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-900">
                  المسح بالكاميرا (QR + باركود Code-128)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isCameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>تشغيل الكاميرا للمسح</span>
                  </button>
                ) : (
                  <>
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                          torchEnabled
                            ? 'bg-amber-500 text-slate-950 border-amber-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        <Flashlight className="w-4 h-4" />
                        <span>الفلاش</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>إيقاف الكاميرا</span>
                    </button>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  title="اختيار صورة تحتوي على QR أو باركود"
                >
                  <ImagePlus className="w-4 h-4 text-slate-600" />
                  <span className="hidden sm:inline">مسح من صورة</span>
                </button>
              </div>
            </div>

            {isCameraActive && (
              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video max-h-64 w-full flex items-center justify-center border border-slate-800">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-32 border-2 border-emerald-400/90 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]" />
                </div>
                <div className="absolute bottom-2 inset-x-3 text-center">
                  <span className="inline-block px-3 py-1 rounded-lg bg-slate-950/80 text-white text-[11px] font-medium">
                    وجّه الكاميرا نحو رمز QR أو الباركود المطبوع على الصندوق
                  </span>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                {cameraError}
              </div>
            )}

            {!isCameraActive && !cameraError && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span className="flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5 text-blue-600" />
                  يدعم روابط الصناديق المباشرة (<code dir="ltr">#/boxes/19</code> و <code dir="ltr">?box=19</code>)
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-emerald-600" />
                  يدعم قارئ الباركود USB التلقائي في أي صفحة
                </span>
                {!isDetectorSupported && (
                  <span className="text-amber-700 font-medium">
                    · ملاحظة: متصفحك يعتمد على كاميرا الهاتف أو الإدخال اليدوي
                  </span>
                )}
              </div>
            )}

            {lastScannedRaw && (
              <div className="text-[11px] text-slate-500 font-mono-num truncate" dir="ltr">
                Last detected: {lastScannedRaw}
              </div>
            )}
          </div>

          {/* Quick 1-Tap Box Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                انتقال سريع بلمسة واحدة ({filteredBoxes.length} صندوق):
              </span>
              <span className="text-[11px] text-slate-500">
                اضغط على الصندوق لفتحه فوراً
              </span>
            </div>

            {filteredBoxes.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                لا يوجد صندوق يطابق «{inputVal}»
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto p-0.5">
                {filteredBoxes.map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => {
                      onOpenBox(box, { focused: false });
                      onClose();
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 bg-white text-right flex flex-col justify-between gap-1.5 transition-all cursor-pointer group min-h-[76px]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 group-hover:bg-blue-600 text-white font-mono-num text-xs font-black transition-colors">
                        {String(box.id).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] font-mono-num text-slate-500">
                        {box.primaryYear}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate">
                      {box.titleAr}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono-num">
                      <span>{box.code}</span>
                      <span className="font-bold text-blue-700">{box.files.length} ملف</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
