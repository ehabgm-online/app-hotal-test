import React from 'react';
import { ArchiveBox, MASTER_USER_SUPPLIERS } from '../data/archiveData';
import { BoxQrCode, Code128Barcode } from './BoxCodes';
import { getBilingualFileLabel, matchesBilingual } from '../utils/bilingualSearch';

export type PrintMode =
  | 'single-sticker'
  | 'all-stickers'
  | 'all-stickers-compact'
  | 'box-manifest'
  | 'suppliers-audit'
  | 'extraction-plan';

export interface SupplierAuditLocation {
  boxId: number;
  boxTitle: string;
  boxCode: string;
  fileNo: number;
  envelopeLabel: string;
  docNo: string;
  checkNo: string;
  year: number;
  notes?: string;
}

export interface SupplierAuditItem {
  supplierName: string;
  secondaryName?: string;
  isFound: boolean;
  totalFiles: number;
  locations: SupplierAuditLocation[];
}

interface PrintSheetProps {
  mode: PrintMode;
  boxes: ArchiveBox[];
  activeBox: ArchiveBox;
  getBoxUrl: (boxId: number) => string;
  suppliersList?: SupplierAuditItem[];
}

export const PrintSheet: React.FC<PrintSheetProps> = React.memo(({
  mode,
  boxes,
  activeBox,
  getBoxUrl,
  suppliersList,
}) => {
  const safeBoxes = Array.isArray(boxes) ? boxes : [];
  const safeActiveBox = activeBox || safeBoxes[0];
  if (!safeActiveBox) return null;

  // 1. Box Official Manifest Table
  if (mode === 'box-manifest') {
    const url = getBoxUrl(safeActiveBox.id);
    return (
      <div className="hidden print:block [content-visibility:auto] bg-white text-slate-900 p-6 space-y-5" dir="rtl">
        <div className="border-2 border-slate-900 rounded-2xl p-5 flex items-center justify-between gap-6">
          <div className="space-y-1.5 flex-1">
            <div className="text-xs font-bold text-slate-600 tracking-wider">
              SMART DOCS E-ARCHIVE · كشف محتويات صندوق أرشيف رسمي
            </div>
            <div className="flex items-center gap-4">
              <span className="text-5xl font-black font-mono-num text-slate-900 bg-slate-100 border border-slate-400 px-4 py-1.5 rounded-xl">
                {String(activeBox.id).padStart(2, '0')}
              </span>
              <div>
                <h1 className="text-2xl font-extrabold font-display text-slate-900">
                  {activeBox.titleAr} — {activeBox.subtitleAr}
                </h1>
                <p className="text-xs text-slate-700 mt-1">
                  الكود: <span className="font-mono-num font-bold">{activeBox.code}</span> · السنة
                  المالية:{' '}
                  <span className="font-mono-num font-bold">
                    {activeBox.years.join(' / ')}
                  </span>{' '}
                  · إجمالي الملفات:{' '}
                  <span className="font-mono-num font-bold">
                    {activeBox.files.length} ملف
                  </span>
                </p>
              </div>
            </div>
            <div className="pt-2 max-w-[260px]">
              <Code128Barcode value={activeBox.barcodeValue} height={38} />
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-center border border-slate-300 rounded-xl p-2.5 bg-white text-center">
            <BoxQrCode value={url} size={115} />
            <span className="text-[11px] font-mono-num font-bold text-slate-800 mt-1">
              {activeBox.code}
            </span>
          </div>
        </div>

        <table className="w-full text-right text-xs border-collapse border border-slate-400">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-400 text-slate-900 font-bold">
              <th className="border border-slate-400 px-3 py-2 w-12 text-center">#</th>
              <th className="border border-slate-400 px-3 py-2 w-32">الظرف / الملف</th>
              <th className="border border-slate-400 px-3 py-2">اسم المورد / الشركة / البيان</th>
              <th className="border border-slate-400 px-3 py-2 w-32">رقم المستند</th>
              <th className="border border-slate-400 px-3 py-2 w-32">الشيك / السنة</th>
              <th className="border border-slate-400 px-3 py-2">ملاحظات إضافية</th>
            </tr>
          </thead>
          <tbody>
            {activeBox.files.map((f) => (
              <tr key={f.fileNo} className="border-b border-slate-200 print-break-inside-avoid">
                <td className="border border-slate-300 px-3 py-2 font-mono-num text-center font-semibold">
                  {f.fileNo}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700">
                  {getBilingualFileLabel(f.envelopeLabel, f.fileNo).combined}
                </td>
                <td className="border border-slate-300 px-3 py-2 font-bold text-slate-900">
                  {f.supplierName}
                </td>
                <td className="border border-slate-300 px-3 py-2 font-mono-num font-semibold text-slate-800">
                  {f.docNo}
                </td>
                <td className="border border-slate-300 px-3 py-2 font-mono-num font-semibold text-slate-800">
                  {f.checkNo !== '—' ? f.checkNo : f.year}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-600">{f.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 2. Suppliers Audit Manifest Table (كشف حصر وتدقيق الموردين)
  if (mode === 'suppliers-audit') {
    const list = suppliersList || [];
    const foundCount = list.filter((s) => s.isFound).length;
    const missingCount = list.filter((s) => !s.isFound).length;
    const totalFiles = list.reduce((acc, s) => acc + s.totalFiles, 0);

    return (
      <div className="hidden print:block bg-white text-slate-900 p-6 space-y-4 font-sans" dir="rtl">
        {/* Document Header */}
        <div className="border-2 border-slate-900 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              SMART DOCS E-ARCHIVE · تقرير التدقيق والمطابقة الأرشيفية
            </div>
            <h1 className="text-xl font-black text-slate-950 font-display">
              كشف حصر وتدقيق قائمة الموردين والشركات بالأرشيف الإلكتروني
            </h1>
            <p className="text-xs text-slate-600">
              بيان بالموردين المستخرجين من المستندات ومطابقة أماكن تواجدهم الفعلية بالصناديق (1 إلى 13).
            </p>
          </div>
          <div className="text-left text-xs font-mono-num space-y-0.5 border-r pr-4 border-slate-200 shrink-0">
            <div><strong>تاريخ التقرير:</strong> {new Date().toLocaleDateString('ar-EG')}</div>
            <div><strong>حالة النظام:</strong> مزامنة سحابية نشطة</div>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="border border-slate-300 rounded-lg p-2 bg-slate-50">
            <div className="text-slate-500 text-[10px]">إجمالي الموردين بالكشف</div>
            <div className="text-base font-bold font-mono-num text-slate-900">{list.length} مورد</div>
          </div>
          <div className="border border-emerald-300 rounded-lg p-2 bg-emerald-50 text-emerald-900">
            <div className="text-emerald-700 text-[10px]">متواجدون بالصناديق (✓ أخضر)</div>
            <div className="text-base font-bold font-mono-num text-emerald-700">{foundCount} مورد ({totalFiles} ملف)</div>
          </div>
          <div className="border border-rose-300 rounded-lg p-2 bg-rose-50 text-rose-900">
            <div className="text-rose-700 text-[10px]">غير متواجدين (✕ أحمر)</div>
            <div className="text-base font-bold font-mono-num text-rose-700">{missingCount} مورد</div>
          </div>
          <div className="border border-blue-300 rounded-lg p-2 bg-blue-50 text-blue-900">
            <div className="text-blue-700 text-[10px]">نسبة التغطية الأرشيفية</div>
            <div className="text-base font-bold font-mono-num text-blue-700">
              {list.length > 0 ? Math.round((foundCount / list.length) * 100) : 0}%
            </div>
          </div>
        </div>

        {/* Audit Table */}
        <table className="w-full text-right text-[11px] border-collapse border border-slate-400">
          <thead className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold">
            <tr>
              <th className="border border-slate-400 px-2 py-1.5 text-center w-8">م</th>
              <th className="border border-slate-400 px-2.5 py-1.5 w-56">اسم المورد / الشركة</th>
              <th className="border border-slate-400 px-2.5 py-1.5 w-44">الاسم المعرّب / التجاري</th>
              <th className="border border-slate-400 px-2 py-1.5 text-center w-28">حالة الأرشفة</th>
              <th className="border border-slate-400 px-2.5 py-1.5">مكان التواجد في الصناديق والظروف</th>
              <th className="border border-slate-400 px-2 py-1.5 text-center w-16">إجمالي الملفات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item, idx) => (
              <tr
                key={idx}
                className={`border-b border-slate-300 print-break-inside-avoid ${
                  item.isFound ? 'bg-white' : 'bg-rose-50/40'
                }`}
              >
                <td className="border border-slate-300 px-2 py-1 text-center font-mono-num font-bold text-slate-600">
                  {idx + 1}
                </td>
                <td className="border border-slate-300 px-2.5 py-1 font-bold text-slate-950">
                  {item.supplierName}
                </td>
                <td className="border border-slate-300 px-2.5 py-1 text-slate-700">
                  {item.secondaryName || '—'}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                  {item.isFound ? (
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px]">
                      ✓ متواجد
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px]">
                      ✕ غير متواجد
                    </span>
                  )}
                </td>
                <td className="border border-slate-300 px-2.5 py-1 text-slate-800 font-mono-num">
                  {item.locations.length === 0 ? (
                    <span className="text-rose-600 italic">غير مسجل بأي صندوق حالياً (مفقود)</span>
                  ) : (
                    <div className="space-y-0.5">
                      {item.locations.map((loc, lIdx) => (
                        <span key={lIdx} className="inline-block ml-1.5 mb-0.5 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          <strong>{loc.boxTitle}</strong> ({loc.envelopeLabel})
                          {loc.docNo && loc.docNo !== '—' ? ` · سند: ${loc.docNo}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center font-mono-num font-bold">
                  {item.totalFiles > 0 ? item.totalFiles : 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer with sign-off */}
        <div className="pt-4 border-t border-slate-300 flex items-center justify-between text-xs text-slate-600">
          <div>تم إعداد الكشف والتدقيق إلكترونياً عبر منصة الأرشيف الذكي Smart Docs E-Archive</div>
          <div className="flex items-center gap-8">
            <div>توقيع مسؤول الأرشيف: .........................</div>
            <div>اعتماد الإدارة: .........................</div>
          </div>
        </div>
      </div>
    );
  }

  // 2.5 Box-by-Box Supplier Extraction Plan (خطة استخراج الموردين لكل صندوق)
  if (mode === 'extraction-plan') {
    return (
      <div className="hidden print:block bg-white text-slate-900 p-6 space-y-8" dir="rtl">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              SMART DOCS E-ARCHIVE · خطة استخراج وتدقيق الموردين لكل صندوق
            </div>
            <h1 className="text-xl font-black text-slate-950 font-display">
              بيان تفصيلي بمتطلبات واستخراج الموردين المطلوبين من كل صندوق (1 إلى 13)
            </h1>
            <p className="text-xs text-slate-600">
              قائمة تفصيلية توضح لكل صندوق أرقام الظروف والمستندات للموردين المطابقين للقائمة الرئيسية المعتمدة.
            </p>
          </div>
          <div className="text-left text-xs font-mono-num space-y-0.5 border-r pr-4 border-slate-200 shrink-0">
            <div><strong>تاريخ التقرير:</strong> {new Date().toLocaleDateString('ar-EG')}</div>
            <div><strong>إجمالي الصناديق:</strong> {boxes.length} صندوق</div>
          </div>
        </div>

        {/* Per-Box Extraction Plan */}
        <div className="space-y-8">
          {boxes.map((box) => {
            const requiredFiles = box.files.filter((f) =>
              MASTER_USER_SUPPLIERS.some((uSup) => matchesBilingual(f.supplierName, uSup))
            );

            return (
              <div key={box.id} className="border-2 border-slate-800 rounded-xl p-5 space-y-3 print-break-inside-avoid">
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-slate-950 text-white font-black font-mono-num text-lg flex items-center justify-center">
                      {String(box.id).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-display font-extrabold text-base text-slate-950">
                        {box.titleAr} ({box.code})
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        السنة المالية: {box.years.join(' / ')} · إجمالي الملفات في الصندوق: {box.files.length} · <strong className="text-emerald-700">المطلوب استخراجه من هذا الصندوق: {requiredFiles.length} مورد</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-mono-num bg-emerald-50 text-emerald-900 border border-emerald-300 px-3 py-1 rounded-lg font-bold">
                    ✓ متطلبات الاستخراج: {requiredFiles.length}
                  </div>
                </div>

                {requiredFiles.length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg">
                    لا توجد موردين مطابِقين للقائمة الرئيسية مستخرجين من هذا الصندوق.
                  </div>
                ) : (
                  <table className="w-full text-right text-[11px] border-collapse border border-slate-400">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold">
                        <th className="border border-slate-400 px-2 py-1 text-center w-8">م</th>
                        <th className="border border-slate-400 px-2 py-1 w-24">الظرف / الملف</th>
                        <th className="border border-slate-400 px-3 py-1">اسم المورد المطلوب استخراجه</th>
                        <th className="border border-slate-400 px-2 py-1 w-28">رقم المستند</th>
                        <th className="border border-slate-400 px-2 py-1 w-24">الشيك / السنة</th>
                        <th className="border border-slate-400 px-2 py-1">ملاحظات الصندوق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requiredFiles.map((f, idx) => (
                        <tr key={f.fileNo} className="border-b border-slate-300 bg-white">
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono-num font-bold text-slate-700">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 font-mono-num font-bold text-slate-900">
                            {f.envelopeLabel}
                          </td>
                          <td className="border border-slate-300 px-3 py-1 font-bold text-slate-950">
                            {f.supplierName}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 font-mono-num text-slate-800">
                            {f.docNo}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 font-mono-num text-slate-800">
                            {f.checkNo !== '—' ? f.checkNo : f.year}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-slate-600">
                            {f.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer sign-off */}
        <div className="pt-6 border-t border-slate-300 flex items-center justify-between text-xs text-slate-600 print-break-inside-avoid">
          <div>خطة استخراج الموردين من الصناديق (1 إلى 13) · Smart Docs E-Archive</div>
          <div className="flex items-center gap-8">
            <div>توقيع أمين الأرشيف: .........................</div>
            <div>اعتماد الإدارة المالية: .........................</div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Comprehensive A4 Box Physical Sticker / Index Sheet (Single or All)
  const targetBoxes = mode === 'single-sticker' ? [activeBox] : boxes;
  const isCompact = mode === 'all-stickers-compact';

  return (
    <div className="hidden print:block bg-white text-slate-900 p-0 m-0" dir="rtl">
      <div
        className={
          mode === 'single-sticker'
            ? 'max-w-[210mm] mx-auto space-y-0'
            : isCompact
            ? 'grid grid-cols-2 gap-3'
            : 'space-y-6'
        }
      >
        {targetBoxes.map((box) => {
          const url = getBoxUrl(box.id);

          return (
            <div
              key={box.id}
              className={`border-[4px] border-slate-950 rounded-2xl bg-white print-break-inside-avoid flex flex-col justify-between ${
                mode === 'single-sticker'
                  ? 'p-5 gap-3 h-[272mm] max-h-[278mm] overflow-hidden print:page-break-after-always shadow-none'
                  : isCompact
                  ? 'p-3.5 gap-2.5'
                  : 'p-6 gap-4 min-h-[300px]'
              }`}
            >
              {/* Top Row: Extra-Large Box Number Block + Box Details + QR */}
              <div className="flex items-stretch justify-between gap-3 border-b-3 border-slate-900 pb-3">
                {/* Massive Box Number Badge for Visibility */}
                <div className="bg-slate-950 text-white rounded-xl p-3 flex flex-col items-center justify-center shrink-0 min-w-[120px] text-center shadow-sm">
                  <div className="text-[11px] font-bold tracking-widest text-slate-300 uppercase">
                    صندوق أرشيف
                  </div>
                  <div className="text-6xl font-black font-mono-num leading-none my-1">
                    {String(box.id).padStart(2, '0')}
                  </div>
                  <div className="text-xs font-bold font-mono-num text-amber-400">
                    {box.code}
                  </div>
                </div>

                {/* Box Meta & Details */}
                <div className="flex-1 flex flex-col justify-center space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-300">
                      SMART DOCS E-ARCHIVE
                    </span>
                    <span className="text-xs font-mono-num font-bold text-slate-700">
                      السنة المالية: {box.years.join(' / ')}
                    </span>
                  </div>

                  <div className="text-2xl font-black font-display text-slate-950 leading-tight truncate">
                    {box.titleAr}
                  </div>

                  <div className="text-xs font-semibold text-slate-800 truncate">
                    {box.categoryScope}
                  </div>

                  <div className="text-xs font-bold text-slate-900 pt-0.5">
                    إجمالي الملفات والموردين:{' '}
                    <span className="font-mono-num text-xs text-blue-800 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {box.files.length} ملف
                    </span>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="shrink-0 flex flex-col items-center justify-center p-2 border-2 border-slate-400 rounded-xl bg-white text-center shadow-sm">
                  <BoxQrCode value={url} size={mode === 'single-sticker' ? 95 : 100} />
                  <div className="text-[9px] font-bold text-slate-800 mt-0.5">
                    امسح لتصفح الملفات
                  </div>
                </div>
              </div>

              {/* Middle Section: Complete List of ALL Suppliers for this Box (Strictly fits on single A4 page) */}
              {mode === 'single-sticker' && (
                <div className="flex-1 my-1 overflow-hidden flex flex-col">
                  <div className="text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between border-b border-slate-300 pb-0.5">
                    <span>فهرس جميع الموردين والمستندات داخل الصندوق ({box.files.length} مورد):</span>
                    <span className="text-[10px] text-slate-500">مخصص للَصق على الصندوق</span>
                  </div>
                  <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50 flex-1">
                    <table className="w-full text-right text-[10px] leading-tight border-collapse">
                      <thead>
                        <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                          <th className="px-1.5 py-1 w-8 text-center border-l border-slate-300">#</th>
                          <th className="px-2 py-1 w-20 border-l border-slate-300">الظرف / الملف</th>
                          <th className="px-2.5 py-1 border-l border-slate-300">اسم المورد / الجهة</th>
                          <th className="px-2 py-1 w-24 border-l border-slate-300">رقم المستند</th>
                          <th className="px-2 py-1 w-20 border-l border-slate-300">الشيك / السنة</th>
                          <th className="px-2 py-1">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {box.files.map((f, idx) => (
                          <tr
                            key={f.fileNo}
                            className={`border-b border-slate-200 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                            }`}
                          >
                            <td className="px-1.5 py-0.5 font-mono-num text-center font-bold text-slate-700 border-l border-slate-200">
                              {f.fileNo}
                            </td>
                            <td className="px-2 py-0.5 font-medium text-slate-800 border-l border-slate-200 truncate max-w-[95px]">
                              {getBilingualFileLabel(f.envelopeLabel, f.fileNo).combined}
                            </td>
                            <td className="px-2.5 py-0.5 font-bold text-slate-950 border-l border-slate-200 truncate max-w-[180px]">
                              {f.supplierName}
                            </td>
                            <td className="px-2 py-0.5 font-mono-num text-slate-800 border-l border-slate-200">
                              {f.docNo}
                            </td>
                            <td className="px-2 py-0.5 font-mono-num text-slate-800 border-l border-slate-200">
                              {f.checkNo !== '—' ? f.checkNo : f.year}
                            </td>
                            <td className="px-2 py-0.5 text-slate-600 truncate max-w-[120px]">
                              {f.notes}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bottom Row: Wide 1D Barcode (Code-128) + Deep Link */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t-2 border-slate-300">
                <div className="w-full sm:max-w-sm">
                  <Code128Barcode
                    value={box.barcodeValue}
                    height={mode === 'single-sticker' ? 36 : 52}
                    showLabel={true}
                  />
                </div>

                <div className="text-[10px] font-mono-num text-slate-700 bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1 truncate max-w-full sm:max-w-xs text-center" dir="ltr">
                  {url}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
