import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardPaste,
  Edit3,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ArchiveBox, ArchiveFileRecord } from '../data/archiveData';

export interface ParsedSupplierRow {
  supplierName: string;
  docNo: string;
  checkNo: string;
  notes: string;
}

export function parsePastedSuppliers(text: string): ParsedSupplierRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedSupplierRow[] = [];

  for (const line of lines) {
    if (line.includes('\t')) {
      // Direct Excel / Sheets copy-paste
      const parts = line.split('\t').map((p) => p.trim());
      rows.push({
        supplierName: parts[0] || '',
        docNo: parts[1] || '—',
        checkNo: parts[2] || '—',
        notes: parts.slice(3).join(' · ') || '',
      });
    } else if (line.includes(',') && !line.startsWith('"')) {
      // CSV copy
      const parts = line.split(',').map((p) => p.trim());
      rows.push({
        supplierName: parts[0] || '',
        docNo: parts[1] || '—',
        checkNo: parts[2] || '—',
        notes: parts.slice(3).join(' · ') || '',
      });
    } else if (line.includes(' | ') || line.includes(' - ')) {
      const sep = line.includes(' | ') ? ' | ' : ' - ';
      const parts = line.split(sep).map((p) => p.trim());
      rows.push({
        supplierName: parts[0] || '',
        docNo: parts[1] || '—',
        checkNo: parts[2] || '—',
        notes: parts.slice(3).join(' · ') || '',
      });
    } else {
      // Single supplier name per line
      rows.push({
        supplierName: line,
        docNo: '—',
        checkNo: '—',
        notes: '',
      });
    }
  }

  return rows.filter((r) => r.supplierName.trim().length > 0);
}

interface CreateBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  nextBoxId: number;
  onCreateBox: (newBox: ArchiveBox) => void;
}

export const CreateBoxModal: React.FC<CreateBoxModalProps> = ({
  isOpen,
  onClose,
  nextBoxId,
  onCreateBox,
}) => {
  const currentYear = new Date().getFullYear();
  const [boxNumber, setBoxNumber] = useState<number>(nextBoxId);
  const [titleAr, setTitleAr] = useState<string>(`صندوق ${nextBoxId}`);
  const [subtitleAr, setSubtitleAr] = useState<string>('بيانات الموردين والملفات المؤرشفة');
  const [primaryYear, setPrimaryYear] = useState<number>(currentYear);
  const [categoryScope, setCategoryScope] = useState<string>('موردين وشركات وتوريدات');
  const [rawPastedText, setRawPastedText] = useState<string>('');

  // Keep state synced when nextBoxId changes
  React.useEffect(() => {
    if (isOpen) {
      setBoxNumber(nextBoxId);
      setTitleAr(`صندوق ${nextBoxId}`);
      setRawPastedText('');
    }
  }, [isOpen, nextBoxId]);

  const parsedRows = useMemo(() => parsePastedSuppliers(rawPastedText), [rawPastedText]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalId = Number(boxNumber) || nextBoxId;
    const finalCode = `BOX-${String(finalId).padStart(2, '0')}`;
    const finalBarcode = `ARC-${primaryYear}-BOX${String(finalId).padStart(2, '0')}`;

    const files: ArchiveFileRecord[] = parsedRows.map((row, index) => ({
      fileNo: index + 1,
      envelopeLabel: `الظرف ${index + 1}`,
      supplierName: row.supplierName,
      docNo: row.docNo || '—',
      checkNo: row.checkNo || '—',
      year: primaryYear,
      notes: row.notes || `صندوق ${finalId}`,
    }));

    const newBox: ArchiveBox = {
      id: finalId,
      code: finalCode,
      barcodeValue: finalBarcode,
      titleAr: titleAr.trim() || `صندوق ${finalId}`,
      subtitleAr: subtitleAr.trim() || 'بيانات الموردين والملفات',
      primaryYear: Number(primaryYear) || currentYear,
      years: [Number(primaryYear) || currentYear],
      categoryScope: categoryScope.trim() || 'مستندات وتوريدات',
      files,
    };

    onCreateBox(newBox);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                إنشاء صندوق أرشيف جديد
              </h2>
              <p className="text-xs text-slate-500">
                أدخل تفاصيل الصندوق مع إمكانية لصق مجموعة موردين دفعة واحدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/60"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Box Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الصندوق:
              </label>
              <input
                type="number"
                min="1"
                value={boxNumber}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBoxNumber(val);
                  setTitleAr(`صندوق ${val}`);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-num focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم الصندوق:
              </label>
              <input
                type="text"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
                placeholder="صندوق 14"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                السنة المالية:
              </label>
              <input
                type="number"
                min="2000"
                max="2099"
                value={primaryYear}
                onChange={(e) => setPrimaryYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-num focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الكود المتولد:
              </label>
              <div
                className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-xs font-mono-num text-blue-700 font-bold truncate"
                dir="ltr"
              >
                BOX-{String(boxNumber || nextBoxId).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الوصف الفرعي:
              </label>
              <input
                type="text"
                value={subtitleAr}
                onChange={(e) => setSubtitleAr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
                placeholder="بيانات الموردين والملفات (2024)"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                نطاق التصنيف أو الملاحظات:
              </label>
              <input
                type="text"
                value={categoryScope}
                onChange={(e) => setCategoryScope(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white"
                placeholder="موردين أغذية · شيكات بنكية · عقود"
              />
            </div>
          </div>

          {/* Smart Batch Paste Area */}
          <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-blue-600" />
                <label
                  htmlFor="create-box-paste-textarea"
                  className="text-xs font-bold text-blue-950"
                >
                  لصق مجموعة موردين دفعة واحدة (من الإكسيل أو نص عادي):
                </label>
              </div>
              <span className="text-[11px] text-blue-700 font-medium">
                يدعم النسخ من Excel مباشرة (Tab-separated) أو اسم لكل سطر
              </span>
            </div>

            <textarea
              id="create-box-paste-textarea"
              value={rawPastedText}
              onChange={(e) => setRawPastedText(e.target.value)}
              rows={5}
              placeholder="الصق هنا مجموعة الموردين... مثال:
شركة الأهرام للتجارة
مؤسسة النور للصناعة
Danone Egypt Co.
Delta Food Supplies

* أو انسخ عدة أعمدة من الإكسيل (اسم المورد [Tab] رقم المستند [Tab] رقم الشيك [Tab] ملاحظات)"
              className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs leading-relaxed focus:outline-none focus:border-blue-600 font-mono"
            />

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    تم استخراج{' '}
                    <strong className="font-mono-num text-sm">{parsedRows.length}</strong> مورد
                    جاهزين للإدراج
                  </span>
                  <button
                    type="button"
                    onClick={() => setRawPastedText('')}
                    className="text-slate-500 hover:text-rose-600 text-[11px] flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    مسح القائمة
                  </button>
                </div>

                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-slate-600">
                      <tr>
                        <th className="px-3 py-1.5 w-10">#</th>
                        <th className="px-3 py-1.5">اسم المورد</th>
                        <th className="px-3 py-1.5 w-24">المستند</th>
                        <th className="px-3 py-1.5 w-24">الشيك</th>
                        <th className="px-3 py-1.5">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-1 font-mono-num text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1 font-semibold text-slate-900">
                            {r.supplierName}
                          </td>
                          <td className="px-3 py-1 font-mono-num text-slate-600">{r.docNo}</td>
                          <td className="px-3 py-1 font-mono-num text-slate-600">{r.checkNo}</td>
                          <td className="px-3 py-1 text-slate-500 truncate max-w-xs">{r.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>
                حفظ وإنشاء الصندوق (مع {parsedRows.length} مورد)
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface BatchAddSuppliersModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBox: ArchiveBox;
  onAddSuppliers: (boxId: number, newFiles: ArchiveFileRecord[]) => void;
}

export const BatchAddSuppliersModal: React.FC<BatchAddSuppliersModalProps> = ({
  isOpen,
  onClose,
  targetBox,
  onAddSuppliers,
}) => {
  const [rawText, setRawText] = useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      setRawText('');
    }
  }, [isOpen]);

  const parsedRows = useMemo(() => parsePastedSuppliers(rawText), [rawText]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (parsedRows.length === 0) return;

    const startIdx = targetBox.files.length;
    const newFiles: ArchiveFileRecord[] = parsedRows.map((r, i) => ({
      fileNo: startIdx + i + 1,
      envelopeLabel: `الظرف ${startIdx + i + 1}`,
      supplierName: r.supplierName,
      docNo: r.docNo || '—',
      checkNo: r.checkNo || '—',
      year: targetBox.primaryYear,
      notes: r.notes || `${targetBox.titleAr}`,
    }));

    onAddSuppliers(targetBox.id, newFiles);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                إضافة موردين بالنسخ واللصق إلى {targetBox.titleAr}
              </h2>
              <p className="text-xs text-slate-500">
                عدد الملفات الحالية في الصندوق:{' '}
                <span className="font-mono-num font-bold text-slate-800">
                  {targetBox.files.length} ملف
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/60"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label
              htmlFor="batch-add-textarea"
              className="block text-xs font-semibold text-slate-800"
            >
              انسخ أسماء الموردين من الإكسيل أو الملف النصي ثم الصقهم هنا:
            </label>
            <textarea
              id="batch-add-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={7}
              placeholder="الصق مجموعة الموردين هنا... (اسم لكل سطر، أو جدول إكسيل بأعمدة Tab-separated)"
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs leading-relaxed focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              autoFocus
            />
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  سيتم إضافة{' '}
                  <strong className="font-mono-num text-sm">{parsedRows.length}</strong> مورد جديد
                  إلى {targetBox.titleAr}
                </span>
                <span className="text-slate-500 text-[11px]">
                  سيبدأ الترقيم من ملف #{targetBox.files.length + 1}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-slate-600">
                    <tr>
                      <th className="px-3 py-1.5 w-10">#</th>
                      <th className="px-3 py-1.5">اسم المورد</th>
                      <th className="px-3 py-1.5 w-24">رقم المستند</th>
                      <th className="px-3 py-1.5 w-24">رقم الشيك</th>
                      <th className="px-3 py-1.5">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-1 font-mono-num text-slate-400">
                          {targetBox.files.length + i + 1}
                        </td>
                        <td className="px-3 py-1 font-semibold text-slate-900">{r.supplierName}</td>
                        <td className="px-3 py-1 font-mono-num text-slate-600">{r.docNo}</td>
                        <td className="px-3 py-1 font-mono-num text-slate-600">{r.checkNo}</td>
                        <td className="px-3 py-1 text-slate-500 truncate max-w-xs">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsedRows.length === 0 && rawText.trim() !== '' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>لم يتم التعرف على أسماء موردين صالحة في النص الملصوق.</span>
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={parsedRows.length === 0}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-sm ${
              parsedRows.length > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                : 'bg-slate-300 cursor-not-allowed opacity-60'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>تأكيد الإضافة ({parsedRows.length} مورد)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. EDIT BOX METADATA MODAL (تحرير بيانات الصندوق)
   ========================================================= */
interface EditBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  box: ArchiveBox | null;
  onSave: (updatedBox: ArchiveBox) => void;
  onDelete?: (boxId: number) => void;
  totalBoxesCount: number;
}

export const EditBoxModal: React.FC<EditBoxModalProps> = ({
  isOpen,
  onClose,
  box,
  onSave,
  onDelete,
  totalBoxesCount,
}) => {
  const [titleAr, setTitleAr] = useState<string>('');
  const [subtitleAr, setSubtitleAr] = useState<string>('');
  const [categoryScope, setCategoryScope] = useState<string>('');
  const [primaryYear, setPrimaryYear] = useState<number>(2021);
  const [code, setCode] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  React.useEffect(() => {
    if (box && isOpen) {
      setTitleAr(box.titleAr);
      setSubtitleAr(box.subtitleAr);
      setCategoryScope(box.categoryScope);
      setPrimaryYear(box.primaryYear);
      setCode(box.code);
      setConfirmDelete(false);
    }
  }, [box, isOpen]);

  if (!isOpen || !box) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ArchiveBox = {
      ...box,
      titleAr: titleAr.trim() || box.titleAr,
      subtitleAr: subtitleAr.trim() || box.subtitleAr,
      categoryScope: categoryScope.trim() || box.categoryScope,
      primaryYear: Number(primaryYear) || box.primaryYear,
      years: [Number(primaryYear) || box.primaryYear],
      code: code.trim() || box.code,
    };
    onSave(updated);
    onClose();
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (confirmDelete) {
      onDelete(box.id);
      onClose();
    } else {
      setConfirmDelete(true);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                تحرير بيانات {box.titleAr}
              </h2>
              <p className="text-xs text-slate-500">
                تعديل اسم الصندوق، التصنيف، السنة المالية، أو حذف الصندوق
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/60"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم الصندوق:
              </label>
              <input
                type="text"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                كود الصندوق (رمز الأرشيف):
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                السنة المالية:
              </label>
              <input
                type="number"
                value={primaryYear}
                onChange={(e) => setPrimaryYear(Number(e.target.value))}
                min={2000}
                max={2035}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                عدد الملفات الحالية:
              </label>
              <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 font-bold">
                {box.files.length} ملف ومورد
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              العنوان الفرعي / الوصف المختصر:
            </label>
            <input
              type="text"
              value={subtitleAr}
              onChange={(e) => setSubtitleAr(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              نطاق التصنيف أو نوع المستندات:
            </label>
            <input
              type="text"
              value={categoryScope}
              onChange={(e) => setCategoryScope(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Delete Danger Zone */}
          {onDelete && totalBoxesCount > 1 && (
            <div className="mt-5 pt-4 border-t border-rose-200/60 bg-rose-50/60 p-3.5 rounded-xl flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="font-bold text-rose-900 block">حذف هذا الصندوق:</span>
                <span className="text-rose-700 text-[11px]">
                  سيتم إزالة الصندوق وجميع الملفات التابعة له ({box.files.length} ملف).
                </span>
              </div>
              <button
                type="button"
                onClick={handleDelete}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  confirmDelete
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-white hover:bg-rose-100 text-rose-700 border border-rose-300'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmDelete ? 'اضغط لتأكيد الحذف النهائي' : 'حذف الصندوق'}</span>
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>حفظ التعديلات</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================
   4. EDIT SINGLE FILE / SUPPLIER RECORD MODAL (تحرير مورد)
   ========================================================= */
interface EditFileRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ArchiveFileRecord | null;
  boxTitle: string;
  onSave: (updatedRecord: ArchiveFileRecord) => void;
}

export const EditFileRecordModal: React.FC<EditFileRecordModalProps> = ({
  isOpen,
  onClose,
  record,
  boxTitle,
  onSave,
}) => {
  const [fileNo, setFileNo] = useState<number>(1);
  const [envelopeLabel, setEnvelopeLabel] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [docNo, setDocNo] = useState<string>('');
  const [checkNo, setCheckNo] = useState<string>('');
  const [year, setYear] = useState<number>(2021);
  const [notes, setNotes] = useState<string>('');

  React.useEffect(() => {
    if (record && isOpen) {
      setFileNo(record.fileNo);
      setEnvelopeLabel(record.envelopeLabel);
      setSupplierName(record.supplierName);
      setDocNo(record.docNo === '—' ? '' : record.docNo);
      setCheckNo(record.checkNo === '—' ? '' : record.checkNo);
      setYear(record.year);
      setNotes(record.notes);
    }
  }, [record, isOpen]);

  if (!isOpen || !record) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;

    const updated: ArchiveFileRecord = {
      fileNo: Number(fileNo) || record.fileNo,
      envelopeLabel: envelopeLabel.trim() || `الظرف ${fileNo}`,
      supplierName: supplierName.trim(),
      docNo: docNo.trim() || '—',
      checkNo: checkNo.trim() || '—',
      year: Number(year) || record.year,
      notes: notes.trim() || boxTitle,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                تعديل بيانات المورد / الملف #{record.fileNo}
              </h2>
              <p className="text-xs text-slate-500">
                الصندوق: <strong className="text-slate-800">{boxTitle}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/60"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم المورد أو الشركة أو البيان:*
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold focus:bg-white focus:outline-none focus:border-blue-600"
              placeholder="مثال: شركة النصر للتوريدات"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم المستند / السند:
              </label>
              <input
                type="text"
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="مثال: CMO003 أو —"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الشيك أو المرجع:
              </label>
              <input
                type="text"
                value={checkNo}
                onChange={(e) => setCheckNo(e.target.value)}
                placeholder="مثال: 94520 أو —"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تسمية الظرف أو الملف:
              </label>
              <input
                type="text"
                value={envelopeLabel}
                onChange={(e) => setEnvelopeLabel(e.target.value)}
                placeholder="الظرف 1"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                السنة المالية:
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2000}
                max={2035}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات وتفاصيل إضافية:
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="أي ملاحظات حول هذا المستند..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>حفظ التعديل</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================
   5. ADD SINGLE SUPPLIER MODAL (إضافة مورد مفرد)
   ========================================================= */
interface AddSingleSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBox: ArchiveBox;
  onAdd: (newRecord: ArchiveFileRecord) => void;
}

export const AddSingleSupplierModal: React.FC<AddSingleSupplierModalProps> = ({
  isOpen,
  onClose,
  targetBox,
  onAdd,
}) => {
  const [supplierName, setSupplierName] = useState<string>('');
  const [docNo, setDocNo] = useState<string>('');
  const [checkNo, setCheckNo] = useState<string>('');
  const [envelopeLabel, setEnvelopeLabel] = useState<string>('');
  const [year, setYear] = useState<number>(targetBox.primaryYear);
  const [notes, setNotes] = useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      const nextNo = targetBox.files.length + 1;
      setSupplierName('');
      setDocNo('');
      setCheckNo('');
      setEnvelopeLabel(`الظرف ${nextNo}`);
      setYear(targetBox.primaryYear);
      setNotes(targetBox.titleAr);
    }
  }, [isOpen, targetBox]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;

    const nextNo = targetBox.files.length + 1;
    const newRecord: ArchiveFileRecord = {
      fileNo: nextNo,
      envelopeLabel: envelopeLabel.trim() || `الظرف ${nextNo}`,
      supplierName: supplierName.trim(),
      docNo: docNo.trim() || '—',
      checkNo: checkNo.trim() || '—',
      year: Number(year) || targetBox.primaryYear,
      notes: notes.trim() || targetBox.titleAr,
    };

    onAdd(newRecord);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                إضافة مورد جديد إلى {targetBox.titleAr}
              </h2>
              <p className="text-xs text-slate-500">
                سيتم إدراجه كملف رقم #{targetBox.files.length + 1}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/60"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم المورد أو الشركة:*
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold focus:bg-white focus:outline-none focus:border-blue-600"
              placeholder="مثال: شركة التوحيد للتجارة"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم المستند / السند:
              </label>
              <input
                type="text"
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="مثال: CMO123"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الشيك أو المرجع:
              </label>
              <input
                type="text"
                value={checkNo}
                onChange={(e) => setCheckNo(e.target.value)}
                placeholder="مثال: 88402"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تسمية الظرف / الملف:
              </label>
              <input
                type="text"
                value={envelopeLabel}
                onChange={(e) => setEnvelopeLabel(e.target.value)}
                placeholder={`الظرف ${targetBox.files.length + 1}`}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                السنة المالية:
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2000}
                max={2035}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة المورد للصندوق</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
