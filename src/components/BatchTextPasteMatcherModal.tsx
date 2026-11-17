import React, { useState } from 'react';
import {
  ClipboardPaste,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  FileSpreadsheet,
  Check,
  Copy,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { ArchiveBox } from '../data/archiveData';
import {
  areSupplierNamesLinked,
  matchesBilingual,
  stripCodesFromSupplierName,
} from '../utils/bilingualSearch';

interface BatchTextPasteMatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: ArchiveBox[];
  onNavigateToBox: (boxId: number, fileNo?: number) => void;
  showToast: (msg: string) => void;
}

interface MatchedSupplierResult {
  rawName: string;
  cleanName: string;
  matches: Array<{
    box: ArchiveBox;
    fileNo: number;
    envelopeLabel: string;
    supplierName: string;
  }>;
}

export function BatchTextPasteMatcherModal({
  isOpen,
  onClose,
  boxes,
  onNavigateToBox,
  showToast,
}: BatchTextPasteMatcherModalProps) {
  const [pastedText, setPastedText] = useState('');
  const [results, setResults] = useState<MatchedSupplierResult[] | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  if (!isOpen) return null;

  const handleRunMatch = () => {
    const rawLines = pastedText
      .split(/\r?\n|,/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2);

    if (rawLines.length === 0) {
      showToast('يرجى لصق قائمة أسماء الموردين أولاً.');
      return;
    }

    const matchedList: MatchedSupplierResult[] = rawLines.map((line) => {
      const cleanName = stripCodesFromSupplierName(line);
      const foundMatches: Array<{
        box: ArchiveBox;
        fileNo: number;
        envelopeLabel: string;
        supplierName: string;
      }> = [];

      for (const box of boxes) {
        for (const f of box.files) {
          const isLinked =
            areSupplierNamesLinked(f.supplierName, cleanName) ||
            matchesBilingual(f.supplierName, cleanName) ||
            f.supplierName.toLowerCase().includes(cleanName.toLowerCase()) ||
            cleanName.toLowerCase().includes(f.supplierName.toLowerCase());

          if (isLinked) {
            // Avoid duplicate same box/file entries
            if (!foundMatches.some((m) => m.box.id === box.id && m.fileNo === f.fileNo)) {
              foundMatches.push({
                box,
                fileNo: f.fileNo,
                envelopeLabel: f.envelopeLabel,
                supplierName: f.supplierName,
              });
            }
          }
        }
      }

      return {
        rawName: line,
        cleanName,
        matches: foundMatches,
      };
    });

    setResults(matchedList);
    showToast(`تمت مطابقة ${matchedList.length} اسم مورد مع ملفات الصناديق بنجاح!`);
  };

  const handleExportCsv = () => {
    if (!results || results.length === 0) return;
    let csv = '\uFEFFاسم المورد المدخل,حالة المطابقة,الصندوق,رقم الظرف,اسم المورد بالأرشيف\r\n';
    for (const r of results) {
      if (r.matches.length === 0) {
        csv += `"${r.rawName}","غير مسجل","—","—","—"\r\n`;
      } else {
        for (const m of r.matches) {
          csv += `"${r.rawName}","موجود","${m.box.titleAr}","ظرف ${m.fileNo}","${m.supplierName}"\r\n`;
        }
      }
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Batch_Suppliers_Archive_Match.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير تقرير المطابقة كملف CSV بنجاح.');
  };

  const handleCopyReport = async () => {
    if (!results || results.length === 0) return;
    let text = 'تقرير مطابقة قائمة الموردين بالأرشيف:\n\n';
    for (const r of results) {
      text += `• المورد: ${r.rawName}\n`;
      if (r.matches.length === 0) {
        text += `  -> غير مسجل في الأرشيف\n`;
      } else {
        for (const m of r.matches) {
          text += `  -> متواجد في: ${m.box.titleAr} (ظرف ${m.fileNo}: ${m.supplierName})\n`;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
      showToast('تم نسخ التقرير إلى الحافظة.');
    } catch {
      showToast('تعذر النسخ.');
    }
  };

  const foundCount = results ? results.filter((r) => r.matches.length > 0).length : 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md shrink-0">
              <ClipboardPaste className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">
                لصق ومطابقة قائمة أسماء الموردين مع ملفات الصناديق
              </h3>
              <p className="text-[11px] sm:text-xs text-blue-100 truncate">
                الصق أي قائمة أسماء موردين (من Excel أو Word أو الواتساب) لمعرفة مكان كل مورد في الصناديق فوراً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              الصق أسماء الموردين هنا (اسم واحد في كل سطر، أو مفصولة بفواصل):
            </label>
            <textarea
              rows={4}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="مثال:&#10;أوراسكوم&#10;النور للخضروات&#10;دومتي&#10;محمد عزيز&#10;أميكو"
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium leading-relaxed focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleRunMatch}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer transition-all"
            >
              <Search className="w-4 h-4" />
              <span>بدء المطابقة والبحث بالأرشيف</span>
            </button>
            {results && results.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>تصدير تقرير الإكسيل (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedReport ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedReport ? 'تم النسخ' : 'نسخ التقرير'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPastedText('');
                setResults(null);
              }}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mr-auto cursor-pointer"
            >
              إعادة ضبط
            </button>
          </div>

          {/* Results Section */}
          {results && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 px-1">
                <span>
                  نتيجة المطابقة: <strong className="font-mono-num text-blue-600">{foundCount}</strong> من{' '}
                  <strong className="font-mono-num">{results.length}</strong> مورد تم العثور عليهم في الأرشيف
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-[360px] overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
                {results.map((res, idx) => {
                  const isFound = res.matches.length > 0;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isFound
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {isFound ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white block text-sm">
                            {res.rawName}
                          </span>
                          {!isFound && (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                              غير مسجل في ملفات الصناديق الحالية
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        {isFound ? (
                          res.matches.map((m, mIdx) => (
                            <button
                              key={mIdx}
                              type="button"
                              onClick={() => {
                                onNavigateToBox(m.box.id, m.fileNo);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="الانتقال الفوري لمكان المورد في الصندوق"
                            >
                              <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{m.box.titleAr} (ظرف {m.fileNo})</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ))
                        ) : (
                          <span className="text-slate-400 text-[11px]">لا يوجد تطابق</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>مطابقة فورية متعددة لقوائم الموردين النصية</span>
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
