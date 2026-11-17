import React, { useState, useMemo, useEffect } from 'react';
import { X, ClipboardPaste, Search, MapPin, CheckCircle2, XCircle, ExternalLink, Sparkles, Plus } from 'lucide-react';
import { ArchiveBox } from '../data/archiveData';
import { areSupplierNamesLinked, matchesBilingual } from '../utils/bilingualSearch';

interface BatchTextPasteMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: ArchiveBox[];
  onNavigateToBox: (boxId: number, fileNo?: number) => void;
  onAddRecordToBox: (
    boxId: number,
    record: { supplierName: string; docNo: string; checkNo: string; year: number; notes: string; amountEgp?: number }
  ) => Promise<void> | void;
  showToast: (msg: string) => void;
}

export function BatchTextPasteMatchModal({
  isOpen,
  onClose,
  boxes,
  onNavigateToBox,
  onAddRecordToBox,
  showToast,
}: BatchTextPasteMatchModalProps) {
  const [pastedText, setPastedText] = useState('');
  const [targetBoxId, setTargetBoxId] = useState<number>(() => boxes[0]?.id || 1);

  useEffect(() => {
    if (!boxes.some((b) => b.id === targetBoxId) && boxes.length > 0) {
      setTargetBoxId(boxes[0].id);
    }
  }, [boxes, targetBoxId]);

  if (!isOpen) return null;

  // Split pasted text by newlines, commas, semicolons, or bullet points
  const parsedSuppliers = useMemo(() => {
    const raw = pastedText.trim();
    if (!raw) return [];
    const lines = raw
      .split(/[\r\n,؛|•\t]+/)
      .map((l) => l.replace(/^\d+[\.\-\)]\s*/, '').trim())
      .filter((l) => l.length >= 2);

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of lines) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(item);
      }
    }
    return list;
  }, [pastedText]);

  // Match each parsed supplier name against all archive boxes
  const matchedResults = useMemo(() => {
    return parsedSuppliers.map((supName) => {
      const locations: Array<{ box: ArchiveBox; matchedFiles: Array<{ fileNo: number; supplierName: string }> }> = [];

      for (const box of boxes) {
        const matchedFiles = box.files.filter(
          (f) => areSupplierNamesLinked(f.supplierName, supName) || matchesBilingual(f.supplierName, supName)
        );
        if (matchedFiles.length > 0) {
          locations.push({
            box,
            matchedFiles: matchedFiles.map((f) => ({ fileNo: f.fileNo, supplierName: f.supplierName })),
          });
        }
      }

      return {
        supplierName: supName,
        locations,
        isFound: locations.length > 0,
      };
    });
  }, [parsedSuppliers, boxes]);

  const foundCount = matchedResults.filter((r) => r.isFound).length;
  const missingCount = matchedResults.length - foundCount;

  const handleSaveMissingAsSingle = async (supName: string) => {
    await onAddRecordToBox(targetBoxId, {
      supplierName: supName,
      docNo: 'DOC-PASTE',
      checkNo: '—',
      year: 2017,
      notes: 'تمت الإضافة عبر لصق ومطابقة قائمة الموردين النصية',
    });
    showToast(`تمت إضافة "${supName}" إلى الصندوق ${targetBoxId} بنجاح!`);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <ClipboardPaste className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-base">لصق ومطابقة قائمة موردين نصية (Batch Text Match)</h3>
              <p className="text-xs text-slate-400">الصق أسماء الموردين من أي جدول أو رسالة لمعرفة أماكن تواجدهم في الصناديق</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              الصق أسماء الموردين هنا (كل اسم في سطر مستقل أو مفصولين بفواصل):
            </label>
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="مثال:&#10;أوراسكوم للتجارة&#10;النور للخضروات&#10;دومتي للصناعات الغذائية&#10;أميكو مصر"
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:outline-none focus:border-blue-600 leading-relaxed"
            />
          </div>

          {parsedSuppliers.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2 text-xs flex-wrap px-1">
                <span className="font-bold text-slate-700">
                  تم رصد <strong className="font-mono-num text-blue-700">{parsedSuppliers.length}</strong> مورد في النص:
                </span>
                <div className="flex items-center gap-2 font-mono-num font-bold text-[11px]">
                  <span className="text-emerald-700">متواجد بالأرشيف: {foundCount}</span>
                  <span>·</span>
                  <span className="text-amber-700">غير مسجل: {missingCount}</span>
                </div>
              </div>

              {/* Match Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {matchedResults.map((res, idx) => (
                  <div
                    key={`${res.supplierName}-${idx}`}
                    className="p-3 bg-white dark:bg-slate-800/50 hover:bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate">{res.supplierName}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {res.isFound ? (
                        <div className="flex flex-wrap gap-1">
                          {res.locations.map((loc) => (
                            <button
                              key={loc.box.id}
                              type="button"
                              onClick={() => {
                                onNavigateToBox(loc.box.id, loc.matchedFiles[0]?.fileNo);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>{loc.box.titleAr} (ظرف {loc.matchedFiles[0]?.fileNo})</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                            غير مسجل
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleSaveMissingAsSingle(res.supplierName)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="إضافة هذا المورد للصندوق المختار"
                          >
                            <Plus className="w-3 h-3" />
                            <span>حفظ</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Target Box Selector for saving missing items */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 shrink-0">الصندوق المستهدف للحفظ:</span>
                <select
                  value={targetBoxId}
                  onChange={(e) => setTargetBoxId(Number(e.target.value))}
                  aria-label="اختر الصندوق للحفظ"
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr} — {(b.subtitleAr || b.categoryScope || '').substring(0, 30)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            مطابقة فورية وثنائية اللغة لأسماء الموردين
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
