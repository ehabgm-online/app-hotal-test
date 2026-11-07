import React from 'react';
import { ArchiveBox } from '../data/archiveData';
import { BoxQrCode, Code128Barcode } from './BoxCodes';

export type PrintMode =
  | 'single-sticker'
  | 'all-stickers'
  | 'all-stickers-compact'
  | 'box-manifest';

interface PrintSheetProps {
  mode: PrintMode;
  boxes: ArchiveBox[];
  activeBox: ArchiveBox;
  getBoxUrl: (boxId: number) => string;
}

export const PrintSheet: React.FC<PrintSheetProps> = ({
  mode,
  boxes,
  activeBox,
  getBoxUrl,
}) => {
  // 1. Box Official Manifest Table
  if (mode === 'box-manifest') {
    const url = getBoxUrl(activeBox.id);
    return (
      <div className="hidden print:block bg-white text-slate-900 p-6 space-y-5" dir="rtl">
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
                <td className="border border-slate-300 px-3 py-2 text-slate-700">{f.envelopeLabel}</td>
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

  // 2. Comprehensive A4 Box Physical Sticker / Index Sheet (Single or All)
  const targetBoxes = mode === 'single-sticker' ? [activeBox] : boxes;
  const isCompact = mode === 'all-stickers-compact';

  return (
    <div className="hidden print:block bg-white text-slate-900 p-2 sm:p-4" dir="rtl">
      <div
        className={
          mode === 'single-sticker'
            ? 'max-w-4xl mx-auto space-y-6'
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
              className={`border-[4px] border-slate-950 rounded-3xl bg-white print-break-inside-avoid flex flex-col justify-between ${
                mode === 'single-sticker'
                  ? 'p-6 gap-4 min-h-[270mm] print:page-break-after-always shadow-none'
                  : isCompact
                  ? 'p-3.5 gap-2.5'
                  : 'p-6 gap-4 min-h-[300px]'
              }`}
            >
              {/* Top Row: Extra-Large Box Number Block + Box Details + QR */}
              <div className="flex items-stretch justify-between gap-4 border-b-3 border-slate-900 pb-4">
                {/* Massive Box Number Badge for Visibility */}
                <div className="bg-slate-950 text-white rounded-2xl p-4 flex flex-col items-center justify-center shrink-0 min-w-[140px] text-center shadow-md">
                  <div className="text-xs font-bold tracking-widest text-slate-300 uppercase">
                    صندوق أرشيف
                  </div>
                  <div className="text-7xl font-black font-mono-num leading-none my-1">
                    {String(box.id).padStart(2, '0')}
                  </div>
                  <div className="text-sm font-bold font-mono-num text-amber-400">
                    {box.code}
                  </div>
                </div>

                {/* Box Meta & Details */}
                <div className="flex-1 flex flex-col justify-center space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-slate-100 text-slate-900 px-2.5 py-0.5 rounded-md border border-slate-300">
                      SMART DOCS E-ARCHIVE
                    </span>
                    <span className="text-xs font-mono-num font-bold text-slate-700">
                      السنة المالية: {box.years.join(' / ')}
                    </span>
                  </div>

                  <div className="text-2xl sm:text-3xl font-black font-display text-slate-950 leading-tight">
                    {box.titleAr}
                  </div>

                  <div className="text-xs font-semibold text-slate-800">
                    {box.categoryScope}
                  </div>

                  <div className="text-xs font-bold text-slate-900 pt-1">
                    إجمالي الملفات والموردين:{' '}
                    <span className="font-mono-num text-sm text-blue-800 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {box.files.length} ملف
                    </span>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="shrink-0 flex flex-col items-center justify-center p-2.5 border-2 border-slate-400 rounded-2xl bg-white text-center shadow-sm">
                  <BoxQrCode value={url} size={mode === 'single-sticker' ? 120 : 100} />
                  <div className="text-[10px] font-bold text-slate-800 mt-1">
                    امسح لتصفح الملفات
                  </div>
                </div>
              </div>

              {/* Middle Section: Complete List of ALL Suppliers for this Box (Ensures 100% visibility on A4 box sticker) */}
              {mode === 'single-sticker' && (
                <div className="flex-1 my-2 overflow-hidden flex flex-col">
                  <div className="text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between border-b border-slate-300 pb-1">
                    <span>فهرس جميع الموردين والمستندات داخل الصندوق ({box.files.length} مورد):</span>
                    <span className="text-[11px] text-slate-500">متوافق مع لصق صندوق الأرشيف</span>
                  </div>
                  <div className="border border-slate-300 rounded-xl overflow-hidden bg-slate-50/50 flex-1">
                    <table className="w-full text-right text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                          <th className="px-2 py-1.5 w-10 text-center border-l border-slate-300">#</th>
                          <th className="px-2.5 py-1.5 w-24 border-l border-slate-300">الظرف / الملف</th>
                          <th className="px-3 py-1.5 border-l border-slate-300">اسم المورد / الجهة</th>
                          <th className="px-2.5 py-1.5 w-28 border-l border-slate-300">رقم المستند</th>
                          <th className="px-2.5 py-1.5 w-24 border-l border-slate-300">الشيك / السنة</th>
                          <th className="px-2.5 py-1.5">ملاحظات</th>
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
                            <td className="px-2 py-1 font-mono-num text-center font-bold text-slate-700 border-l border-slate-200">
                              {f.fileNo}
                            </td>
                            <td className="px-2.5 py-1 font-medium text-slate-800 border-l border-slate-200 truncate max-w-[100px]">
                              {f.envelopeLabel}
                            </td>
                            <td className="px-3 py-1 font-bold text-slate-950 border-l border-slate-200 truncate max-w-[200px]">
                              {f.supplierName}
                            </td>
                            <td className="px-2.5 py-1 font-mono-num text-slate-800 border-l border-slate-200">
                              {f.docNo}
                            </td>
                            <td className="px-2.5 py-1 font-mono-num text-slate-800 border-l border-slate-200">
                              {f.checkNo !== '—' ? f.checkNo : f.year}
                            </td>
                            <td className="px-2.5 py-1 text-slate-600 truncate max-w-[150px]">
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t-2 border-slate-300">
                <div className="w-full sm:max-w-md">
                  <Code128Barcode
                    value={box.barcodeValue}
                    height={mode === 'single-sticker' ? 44 : 52}
                    showLabel={true}
                  />
                </div>

                <div className="text-[10px] sm:text-[11px] font-mono-num text-slate-700 bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 truncate max-w-full sm:max-w-xs text-center" dir="ltr">
                  {url}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
