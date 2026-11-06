import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Menu,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  ARCHIVE_BOXES,
  AVAILABLE_YEARS,
  ArchiveBox,
  ArchiveFileRecord,
  MASTER_PDF_PATH,
  normalizeArabicSearch,
} from './data/archiveData';
import { BoxQrCode, Code128Barcode } from './components/BoxCodes';
import { PrintMode, PrintSheet } from './components/PrintSheet';
import { QrModal } from './components/QrModal';
import { downloadStandaloneHtml } from './utils/singleFileExporter';

type ActiveSection = 'dashboard' | 'search' | 'boxes' | 'qrcodes';
type YearFilter = 'all' | number;
type IntraSearchScope = 'current-box' | 'same-year';

interface FlattenedRecord extends ArchiveFileRecord {
  boxId: number;
  boxCode: string;
  boxTitle: string;
  boxCategory: string;
}

export function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [selectedBoxId, setSelectedBoxId] = useState<number>(1);
  const [highlightedFileNo, setHighlightedFileNo] = useState<number | null>(null);

  // Search states
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [searchBoxFilter, setSearchBoxFilter] = useState<number | 'all'>('all');
  const [intraBoxQuery, setIntraBoxQuery] = useState<string>('');
  const [intraSearchScope, setIntraSearchScope] = useState<IntraSearchScope>('current-box');

  // UI & Print states
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [qrModalBox, setQrModalBox] = useState<ArchiveBox | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('all-stickers');
  const [printTargetBoxId, setPrintTargetBoxId] = useState<number>(1);
  const [copiedBoxId, setCopiedBoxId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openedViaQrBanner, setOpenedViaQrBanner] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Handle ?box=N deep-link from QR Code scans
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const boxParam = params.get('box');
    if (boxParam) {
      const parsedId = Number(boxParam);
      const exists = ARCHIVE_BOXES.some((b) => b.id === parsedId);
      if (exists) {
        setSelectedBoxId(parsedId);
        setActiveSection('boxes');
        setOpenedViaQrBanner(parsedId);
      }
    }
  }, []);

  const getBoxDirectUrl = (boxId: number): string => {
    const cleanBase = `${window.location.origin}${window.location.pathname}`;
    return `${cleanBase}?box=${boxId}`;
  };

  // Flatten all 291 records for global analytics & instant search
  const allFlattenedRecords = useMemo<FlattenedRecord[]>(() => {
    const list: FlattenedRecord[] = [];
    for (const box of ARCHIVE_BOXES) {
      for (const file of box.files) {
        list.push({
          ...file,
          boxId: box.id,
          boxCode: box.code,
          boxTitle: box.titleAr,
          boxCategory: box.categoryScope,
        });
      }
    }
    return list;
  }, []);

  // Filtered boxes according to selected YearFilter
  const yearFilteredBoxes = useMemo<ArchiveBox[]>(() => {
    if (yearFilter === 'all') return ARCHIVE_BOXES;
    return ARCHIVE_BOXES.filter((b) => b.years.includes(yearFilter));
  }, [yearFilter]);

  // Filtered flattened records according to selected YearFilter
  const yearFilteredRecords = useMemo<FlattenedRecord[]>(() => {
    if (yearFilter === 'all') return allFlattenedRecords;
    return allFlattenedRecords.filter((r) => r.year === yearFilter);
  }, [allFlattenedRecords, yearFilter]);

  // Unique supplier count
  const uniqueSuppliersCount = useMemo<number>(() => {
    const set = new Set<string>();
    for (const rec of yearFilteredRecords) {
      set.add(normalizeArabicSearch(rec.supplierName));
    }
    return set.size;
  }, [yearFilteredRecords]);

  // Active box object
  const activeBox = useMemo<ArchiveBox>(() => {
    return ARCHIVE_BOXES.find((b) => b.id === selectedBoxId) || ARCHIVE_BOXES[0];
  }, [selectedBoxId]);

  const printTargetBox = useMemo<ArchiveBox>(() => {
    return ARCHIVE_BOXES.find((b) => b.id === printTargetBoxId) || activeBox;
  }, [printTargetBoxId, activeBox]);

  // Global Smart Search results
  const smartSearchResults = useMemo<FlattenedRecord[]>(() => {
    const q = normalizeArabicSearch(globalSearchQuery);
    return yearFilteredRecords.filter((rec) => {
      if (searchBoxFilter !== 'all' && rec.boxId !== searchBoxFilter) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeArabicSearch(rec.supplierName).includes(q) ||
        normalizeArabicSearch(rec.docNo).includes(q) ||
        normalizeArabicSearch(rec.checkNo).includes(q) ||
        normalizeArabicSearch(rec.envelopeLabel).includes(q) ||
        normalizeArabicSearch(rec.notes).includes(q) ||
        normalizeArabicSearch(rec.boxTitle).includes(q) ||
        normalizeArabicSearch(rec.boxCode).includes(q)
      );
    });
  }, [globalSearchQuery, yearFilteredRecords, searchBoxFilter]);

  // Dashboard inline preview search results (top 8 matches when typing on dashboard)
  const dashboardQuickResults = useMemo<FlattenedRecord[]>(() => {
    const q = normalizeArabicSearch(globalSearchQuery);
    if (!q) return [];
    return smartSearchResults.slice(0, 8);
  }, [globalSearchQuery, smartSearchResults]);

  // Intra-box or Same-Year search inside Box Management view
  const boxViewRecords = useMemo<FlattenedRecord[]>(() => {
    const q = normalizeArabicSearch(intraBoxQuery);
    const targetYear = yearFilter !== 'all' ? yearFilter : activeBox.primaryYear;

    const basePool: FlattenedRecord[] =
      intraSearchScope === 'current-box'
        ? allFlattenedRecords.filter(
            (r) => r.boxId === activeBox.id && (yearFilter === 'all' || r.year === yearFilter)
          )
        : allFlattenedRecords.filter((r) => r.year === targetYear);

    if (!q) return basePool;

    return basePool.filter(
      (rec) =>
        normalizeArabicSearch(rec.supplierName).includes(q) ||
        normalizeArabicSearch(rec.docNo).includes(q) ||
        normalizeArabicSearch(rec.checkNo).includes(q) ||
        normalizeArabicSearch(rec.envelopeLabel).includes(q) ||
        normalizeArabicSearch(rec.notes).includes(q)
    );
  }, [intraBoxQuery, intraSearchScope, activeBox, allFlattenedRecords, yearFilter]);

  // Navigation helpers
  const navigateToBox = (boxId: number, fileNoToHighlight?: number) => {
    setSelectedBoxId(boxId);
    setIntraSearchScope('current-box');
    setIntraBoxQuery('');
    setHighlightedFileNo(fileNoToHighlight ?? null);
    setActiveSection('boxes');
    setMobileSidebarOpen(false);

    const url = new URL(window.location.href);
    url.searchParams.set('box', String(boxId));
    window.history.replaceState({}, '', url.toString());
  };

  const triggerPrint = (mode: PrintMode, boxId?: number) => {
    if (boxId) {
      setPrintTargetBoxId(boxId);
    } else {
      setPrintTargetBoxId(activeBox.id);
    }
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleCopyBoxUrl = async (boxId: number) => {
    try {
      await navigator.clipboard.writeText(getBoxDirectUrl(boxId));
      setCopiedBoxId(boxId);
      showToast(`تم نسخ الرابط المباشر لـ صندوق ${boxId}`);
      setTimeout(() => setCopiedBoxId(null), 2000);
    } catch {
      showToast('تعذر نسخ الرابط تلقائياً');
    }
  };

  const handleExportCsv = (records: FlattenedRecord[], filename: string) => {
    const headers = [
      'رقم الصندوق',
      'كود الصندوق',
      'رقم الملف',
      'الظرف / الملف',
      'اسم المورد / البيان',
      'رقم المستند',
      'رقم الشيك',
      'السنة',
      'ملاحظات',
    ];
    const csvRows = [
      headers.join(','),
      ...records.map((r) =>
        [
          r.boxTitle,
          r.boxCode,
          r.fileNo,
          `"${r.envelopeLabel.replace(/"/g, '""')}"`,
          `"${r.supplierName.replace(/"/g, '""')}"`,
          `"${r.docNo.replace(/"/g, '""')}"`,
          `"${r.checkNo.replace(/"/g, '""')}"`,
          r.year,
          `"${r.notes.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تصدير ملف البيانات بنجاح (CSV)');
  };

  const handleDownloadSingleHtml = () => {
    downloadStandaloneHtml();
    showToast('تم تحميل ملف HTML المستقل الكامل بنجاح');
  };

  const sectionTitles: Record<ActiveSection, string> = {
    dashboard: 'لوحة التحكم الرئيسية',
    search: 'البحث الذكي في الموردين والمستندات',
    boxes: `إدارة الصناديق · ${activeBox.titleAr}`,
    qrcodes: 'مركز رموز QR وطباعة ملصقات الباركود',
  };

  const maxFilesInAnyBox = useMemo(
    () => Math.max(...ARCHIVE_BOXES.map((b) => b.files.length), 1),
    []
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row" dir="rtl">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Architectural Dark/Blue RTL Sidebar */}
      <aside
        className={`no-print fixed lg:sticky top-0 right-0 z-50 h-screen w-[272px] bg-[#0B1426] text-slate-200 flex flex-col justify-between border-l border-slate-800/90 shrink-0 transition-transform duration-200 ease-out ${
          mobileSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Brand Header */}
          <div className="px-5 py-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-white text-base tracking-tight leading-snug">
                  Smart Docs
                </div>
                <div className="text-xs text-slate-400">نظام الأرشفة الإلكتروني</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="إغلاق القائمة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Navigation */}
          <div className="p-3.5 space-y-1">
            <button
              type="button"
              onClick={() => {
                setActiveSection('dashboard');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>لوحة التحكم</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('search');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'search'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Search className="w-4 h-4 shrink-0" />
                <span>البحث الذكي الشامل</span>
              </span>
              <span className="text-xs font-mono-num opacity-80">{yearFilteredRecords.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('boxes');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'boxes'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Boxes className="w-4 h-4 shrink-0" />
                <span>إدارة الصناديق</span>
              </span>
              <span className="text-xs font-mono-num opacity-80">13</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('qrcodes');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'qrcodes'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <QrCode className="w-4 h-4 shrink-0" />
                <span>رموز QR والباركود</span>
              </span>
            </button>
          </div>

          {/* Direct Box Index in Sidebar */}
          <div className="px-3.5 pt-3 pb-4 border-t border-slate-800/80 flex-1 overflow-y-auto">
            <div className="px-2 pb-2 text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>فهرس الصناديق السريع</span>
              <span className="font-mono-num">1–13</span>
            </div>
            <div className="space-y-0.5">
              {ARCHIVE_BOXES.map((box) => {
                const isSelected = activeSection === 'boxes' && selectedBoxId === box.id;
                const matchesYear = yearFilter === 'all' || box.years.includes(yearFilter);
                return (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => navigateToBox(box.id)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-300 font-semibold'
                        : matchesYear
                        ? 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        : 'text-slate-500 hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="truncate">{box.titleAr}</span>
                    <span className="font-mono-num text-[11px] text-slate-400 shrink-0">
                      {box.files.length} ملف
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sidebar Footer Actions */}
          <div className="p-4 border-t border-slate-800/80 space-y-2 bg-[#08101E]">
            <a
              href={MASTER_PDF_PATH}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 px-3 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>ملف PDF المرجعي الأصلي</span>
            </a>
            <button
              type="button"
              onClick={handleDownloadSingleHtml}
              className="w-full py-2 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>تحميل ملف HTML واحد</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: 3 clean zones */}
        <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Mobile Menu + Contextual Title */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 truncate whitespace-nowrap">
              {sectionTitles[activeSection]}
            </h1>
          </div>

          {/* Zone 2: Segmented Year Filter */}
          <div
            className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
            role="group"
            aria-label="تصفية حسب السنة المالية"
          >
            <button
              type="button"
              onClick={() => setYearFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                yearFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              كل السنوات
            </button>
            {AVAILABLE_YEARS.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setYearFilter(yr)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono-num font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  yearFilter === yr
                    ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => triggerPrint('all-stickers')}
              className="px-3.5 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة ملصقات كل الصناديق (1–13) للصق</span>
            </button>
          </div>
        </header>

        {/* Mobile Year Filter Strip */}
        <div className="no-print md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">السنة المالية:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYearFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                yearFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              الكل
            </button>
            {AVAILABLE_YEARS.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setYearFilter(yr)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono-num font-medium whitespace-nowrap ${
                  yearFilter === yr ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="no-print fixed bottom-5 left-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* QR Scan Deep-Link Contextual Banner */}
        {openedViaQrBanner !== null && activeSection === 'boxes' && (
          <div className="no-print mx-4 sm:mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-blue-900">
              <QrCode className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                تم فتح <strong>صندوق {openedViaQrBanner}</strong> مباشرة عبر الرابط الذكي لرمز الاستجابة
                السريعة (QR).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenedViaQrBanner(null)}
              className="text-blue-600 hover:text-blue-900 p-1 cursor-pointer"
              aria-label="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Viewport Sections */}
        <main className="no-print flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          {/* =========================================================
              1. DASHBOARD VIEW
             ========================================================= */}
          {activeSection === 'dashboard' && (
            <>
              {/* Colored Architectural KPI Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500">إجمالي الصناديق المؤرشفة</div>
                    <div className="text-3xl font-extrabold font-mono-num text-slate-900 mt-1.5">
                      {yearFilteredBoxes.length}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      الصناديق 1 إلى 13 · مطابقة تامة للملف المرجعي
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Boxes className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500">إجمالي الملفات والظروف</div>
                    <div className="text-3xl font-extrabold font-mono-num text-slate-900 mt-1.5">
                      {yearFilteredRecords.length}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      مستند وظرف مفهرس بأرقام الملفات والشيكات
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500">إجمالي الموردين والجهات</div>
                    <div className="text-3xl font-extrabold font-mono-num text-slate-900 mt-1.5">
                      {uniqueSuppliersCount}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      شركة ومورد وجهة حكومية مسجلة بدون تكرار
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500">السنوات المالية المشمولة</div>
                    <div className="text-2xl font-extrabold font-mono-num text-slate-900 mt-2">
                      {yearFilter === 'all' ? '2017 · 2019 · 2021' : yearFilter}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      رموز QR وباركود جاهزة للطباعة واللصق
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Warehouse Sticker Print Banner for Distant Shelf Visibility */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border border-slate-700 shadow-sm">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                      ملصقات الأرشيف والمستودع
                    </span>
                    <span className="text-xs text-slate-300">
                      خط كبير جداً للتعرف على الصناديق من مسافة بعيدة (5–10 أمتار)
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                    طباعة باركود ورموز QR لجميع الصناديق (1 إلى 13) دفعة واحدة
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                    تم تصميم الملصقات خصيصاً للصقها على واجهة الصناديق الكرتونية، برقم صندوق عملاق
                    وعالي التباين، مع باركود Code-128 قياسي لقارئ الباركود، ورمز QR مباشر يفتح قائمة
                    الموردين والملفات فوراً على الهاتف.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => triggerPrint('all-stickers')}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة ملصقات كل الصناديق (كبيرة)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPrint('all-stickers-compact')}
                    className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>طباعة مدمجة (Compact)</span>
                  </button>
                </div>
              </div>

              {/* Instant Smart Search Hub on Dashboard */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                      البحث الذكي الفوري عن مورد أو شركة أو مستند
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      اكتب اسم أي مورد أو شركة ليظهر لك فوراً رقم الصندوق ورقم الظرف وكود المستند ورقم الشيك
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('search')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer"
                  >
                    فتح صفحة البحث المتقدم ←
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    placeholder="ابحث باسم المورد أو الشركة أو الكود (مثال: Domty، المعادي، بتروتريد، Mohamed Aziz، CMO003، Aramex)..."
                    className="w-full pr-11 pl-24 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
                  />
                  {globalSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchQuery('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-200/70 rounded-md cursor-pointer"
                    >
                      مسح
                    </button>
                  )}
                </div>

                {/* Live Inline Results when user types on Dashboard */}
                {globalSearchQuery.trim() !== '' && (
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>
                        نتائج البحث الفوري:{' '}
                        <strong className="font-mono-num text-slate-900">
                          {smartSearchResults.length}
                        </strong>{' '}
                        ملف مطابق
                        {yearFilter !== 'all' ? ` في سنة ${yearFilter}` : ''}
                      </span>
                      {smartSearchResults.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setActiveSection('search')}
                          className="text-blue-600 font-semibold hover:underline cursor-pointer"
                        >
                          عرض كل النتائج ({smartSearchResults.length})
                        </button>
                      )}
                    </div>

                    {dashboardQuickResults.length === 0 ? (
                      <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-500">
                        لا توجد نتائج مطابقة لـ «{globalSearchQuery}» ضمن النطاق المحدد.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-right text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">الصندوق</th>
                              <th className="px-4 py-2.5 font-semibold">رقم الملف / الظرف</th>
                              <th className="px-4 py-2.5 font-semibold">اسم المورد / الشركة</th>
                              <th className="px-4 py-2.5 font-semibold">كود المستند</th>
                              <th className="px-4 py-2.5 font-semibold">الشيك / السنة</th>
                              <th className="px-4 py-2.5 font-semibold">الإجراء</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dashboardQuickResults.map((item) => (
                              <tr
                                key={`${item.boxId}-${item.fileNo}`}
                                className="hover:bg-blue-50/40 transition-colors"
                              >
                                <td className="px-4 py-2.5 font-display font-bold text-blue-700 whitespace-nowrap">
                                  {item.boxTitle}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                                  {item.envelopeLabel}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                  {item.supplierName}
                                </td>
                                <td className="px-4 py-2.5 font-mono-num text-xs text-slate-700">
                                  {item.docNo}
                                </td>
                                <td className="px-4 py-2.5 font-mono-num text-xs text-slate-600">
                                  {item.checkNo !== '—' ? item.checkNo : item.year}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => navigateToBox(item.boxId, item.fileNo)}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                  >
                                    انتقل للصندوق ←
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Visual Density Distribution across Boxes 1 - 13 */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                      التوزيع الإحصائي للملفات داخل الصناديق (1 – 13)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      اضغط على أي شريط لفتح الصندوق واستعراض الموردين والملفات بداخله
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSingleHtml}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>تحميل نسخة ملف HTML الواحد</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 pt-1">
                  {yearFilteredBoxes.map((box) => {
                    const widthPct = Math.max(8, Math.round((box.files.length / maxFilesInAnyBox) * 100));
                    return (
                      <button
                        key={box.id}
                        type="button"
                        onClick={() => navigateToBox(box.id)}
                        className="group w-full text-right py-1.5 flex items-center gap-3 hover:bg-slate-50 rounded-lg px-2 transition-colors cursor-pointer"
                      >
                        <span className="w-20 font-display font-bold text-xs text-slate-800 group-hover:text-blue-700 shrink-0">
                          {box.titleAr}
                        </span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 group-hover:bg-blue-700 rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="w-16 text-left font-mono-num text-xs font-semibold text-slate-700 shrink-0">
                          {box.files.length} ملف
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Complete Directory Grid of Boxes 1 - 13 */}
              <section className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                    دليل الصناديق المؤرشفة ({yearFilteredBoxes.length} صندوق)
                  </h2>
                  <span className="text-xs text-slate-500">
                    مرتبة حسب أرقام الصناديق الرسمية بدون أي خلط
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {yearFilteredBoxes.map((box) => (
                    <div
                      key={box.id}
                      className="bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-5 flex flex-col justify-between transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="font-display font-bold text-lg text-slate-900">
                            {box.titleAr}
                          </h3>
                          <div className="text-xs text-slate-500 font-mono-num">
                            {box.code} · {box.years.join(' / ')}
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-1">{box.categoryScope}</p>

                        {/* Sample first 2 suppliers as quiet unboxed text */}
                        <p className="text-xs text-slate-400 line-clamp-1 pt-0.5">
                          أبرز الموردين:{' '}
                          {box.files
                            .slice(0, 2)
                            .map((f) => f.supplierName)
                            .join(' · ')}
                          {box.files.length > 2 ? ' ...' : ''}
                        </p>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="text-sm font-bold font-mono-num text-slate-900">
                          {box.files.length}{' '}
                          <span className="font-sans font-normal text-xs text-slate-500">
                            ملف وظرف
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQrModalBox(box)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            title="عرض رمز QR والباركود"
                          >
                            <QrCode className="w-3.5 h-3.5 text-blue-600" />
                            <span>QR</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => triggerPrint('single-sticker', box.id)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 cursor-pointer"
                            title="طباعة ملصق الباركود للصندوق"
                            aria-label={`طباعة ملصق ${box.titleAr}`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => navigateToBox(box.id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            استعراض
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* =========================================================
              2. SMART SEARCH VIEW
             ========================================================= */}
          {activeSection === 'search' && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    محرك البحث الذكي الشامل في الأرشيف
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ابحث في جميع الصناديق أو خصص البحث لصناديق سنة محددة أو صندوق معين
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleExportCsv(smartSearchResults, 'Archive_Search_Results.csv')
                  }
                  className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>تصدير النتائج (Excel / CSV)</span>
                </button>
              </div>

              {/* Search & Filter Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    placeholder="اكتب اسم المورد، الشركة، رقم المستند (مثل CCO007)، أو رقم الشيك..."
                    className="w-full pr-10 pl-16 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-blue-600"
                    autoFocus
                  />
                  {globalSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 bg-slate-200/70 rounded cursor-pointer"
                    >
                      مسح
                    </button>
                  )}
                </div>

                <div className="lg:col-span-3">
                  <select
                    value={searchBoxFilter}
                    onChange={(e) =>
                      setSearchBoxFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                    }
                    aria-label="تصفية حسب الصندوق"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">كل الصناديق (1 إلى 13)</option>
                    {ARCHIVE_BOXES.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.titleAr} ({b.files.length} ملف)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <select
                    value={yearFilter}
                    onChange={(e) =>
                      setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                    }
                    aria-label="تصفية حسب السنة"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono-num text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">كل السنوات</option>
                    {AVAILABLE_YEARS.map((y) => (
                      <option key={y} value={y}>
                        سنة {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                <div>
                  إجمالي السجلات المطابقة:{' '}
                  <strong className="font-mono-num text-slate-900">
                    {smartSearchResults.length}
                  </strong>{' '}
                  سجل
                  {yearFilter !== 'all' ? ` · ضمن سنة ${yearFilter}` : ''}
                  {searchBoxFilter !== 'all' ? ` · في صندوق ${searchBoxFilter}` : ''}
                </div>
                {(globalSearchQuery !== '' || searchBoxFilter !== 'all' || yearFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalSearchQuery('');
                      setSearchBoxFilter('all');
                      setYearFilter('all');
                    }}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>

              {/* Search Results Table */}
              {smartSearchResults.length === 0 ? (
                <div className="py-14 text-center border border-slate-200 rounded-xl bg-slate-50/60 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">
                    لم يتم العثور على أي مورد أو ملف مطابق لمعايير البحث الحالية
                  </p>
                  <p className="text-xs text-slate-500">
                    تأكد من كتابة جزء من اسم المورد باللغة العربية أو الإنجليزية أو كود المستند
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalSearchQuery('');
                      setSearchBoxFilter('all');
                      setYearFilter('all');
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    عرض جميع السجلات (291)
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">الصندوق</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">رقم الملف / الظرف</th>
                        <th className="px-4 py-3 font-semibold">اسم المورد / الشركة / البيان</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">رقم المستند</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">الشيك / المرجع</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">السنة</th>
                        <th className="px-4 py-3 font-semibold">ملاحظات</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {smartSearchResults.map((rec) => (
                        <tr
                          key={`${rec.boxId}-${rec.fileNo}`}
                          className="hover:bg-blue-50/40 transition-colors"
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => navigateToBox(rec.boxId, rec.fileNo)}
                              className="font-display font-bold text-blue-700 hover:underline cursor-pointer"
                            >
                              {rec.boxTitle}
                            </button>
                            <span className="block text-[11px] font-mono-num text-slate-400">
                              {rec.boxCode}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                            <span className="font-mono-num text-slate-400 ml-1">#{rec.fileNo}</span>
                            {rec.envelopeLabel}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">
                            {rec.supplierName}
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-blue-700 whitespace-nowrap">
                            {rec.docNo}
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-slate-700 whitespace-nowrap">
                            {rec.checkNo}
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                            {rec.year}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                            {rec.notes}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => navigateToBox(rec.boxId, rec.fileNo)}
                                className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                              >
                                فتح بالصندوق
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const b = ARCHIVE_BOXES.find((x) => x.id === rec.boxId);
                                  if (b) setQrModalBox(b);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                title="رمز QR للصندوق"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* =========================================================
              3. BOXES MANAGEMENT & INTRA-BOX SEARCH VIEW
             ========================================================= */}
          {activeSection === 'boxes' && (
            <div className="space-y-5">
              {/* Box Selector Strip (1 to 13) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <span className="text-xs font-semibold text-slate-600">
                    اختر الصندوق لاستعراض محتوياته الكاملة (الصناديق 1 إلى 13):
                  </span>
                  <span className="text-xs text-slate-400 font-mono-num">
                    إجمالي 13 صندوق · 291 ملف
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ARCHIVE_BOXES.map((box) => {
                    const isCurrent = box.id === activeBox.id;
                    const inYear = yearFilter === 'all' || box.years.includes(yearFilter);
                    return (
                      <button
                        key={box.id}
                        type="button"
                        onClick={() => navigateToBox(box.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : inYear
                            ? 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200 hover:border-blue-400'
                            : 'bg-slate-50/50 text-slate-400 border-slate-200/60 opacity-60'
                        }`}
                      >
                        <span>{box.titleAr}</span>
                        <span
                          className={`font-mono-num text-[11px] ${
                            isCurrent ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          ({box.files.length})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Box Detail Card & Manifest */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
                {/* Box Header + Quick QR/Barcode Preview */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-slate-200">
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono-num text-blue-700 font-semibold">
                      {activeBox.code} · {activeBox.barcodeValue} · السنة المالية{' '}
                      {activeBox.years.join(' / ')}
                    </div>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
                      {activeBox.titleAr} — {activeBox.subtitleAr}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600">
                      التصنيف: {activeBox.categoryScope} · عدد الملفات والظروف المؤرشفة:{' '}
                      <strong className="font-mono-num text-slate-900">
                        {activeBox.files.length} ملف
                      </strong>
                    </p>
                  </div>

                  {/* Actions for Active Box */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQrModalBox(activeBox)}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <QrCode className="w-4 h-4 text-blue-600" />
                      <span>عرض QR والباركود</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerPrint('single-sticker', activeBox.id)}
                      className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة ملصق الصندوق</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerPrint('box-manifest', activeBox.id)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <FileText className="w-4 h-4" />
                      <span>طباعة كشف المحتويات</span>
                    </button>
                  </div>
                </div>

                {/* Intra-Box Search + Same-Year Scope Switcher */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={intraBoxQuery}
                      onChange={(e) => {
                        setIntraBoxQuery(e.target.value);
                        setHighlightedFileNo(null);
                      }}
                      placeholder={
                        intraSearchScope === 'current-box'
                          ? `ابحث عن اسم المورد أو رقم المستند داخل ${activeBox.titleAr}...`
                          : `ابحث عن اسم المورد في جميع صناديق سنة ${
                              yearFilter !== 'all' ? yearFilter : activeBox.primaryYear
                            }...`
                      }
                      className="w-full pr-10 pl-16 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-blue-600"
                    />
                    {intraBoxQuery && (
                      <button
                        type="button"
                        onClick={() => setIntraBoxQuery('')}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 bg-slate-200/70 rounded cursor-pointer"
                      >
                        مسح
                      </button>
                    )}
                  </div>

                  {/* Scope Segmented Toggle: Search inside this box vs Search all boxes of same year */}
                  <div
                    className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0"
                    role="group"
                    aria-label="نطاق البحث"
                  >
                    <button
                      type="button"
                      onClick={() => setIntraSearchScope('current-box')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        intraSearchScope === 'current-box'
                          ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      داخل {activeBox.titleAr} فقط
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntraSearchScope('same-year')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        intraSearchScope === 'same-year'
                          ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      كل صناديق سنة {yearFilter !== 'all' ? yearFilter : activeBox.primaryYear}
                    </button>
                  </div>
                </div>

                {/* Count & Export Row */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    المعروض حالياً:{' '}
                    <strong className="font-mono-num text-slate-900">{boxViewRecords.length}</strong>{' '}
                    ملف
                    {intraSearchScope === 'same-year'
                      ? ` عبر جميع صناديق سنة ${
                          yearFilter !== 'all' ? yearFilter : activeBox.primaryYear
                        }`
                      : ` من إجمالي ${activeBox.files.length} ملف في ${activeBox.titleAr}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleExportCsv(boxViewRecords, `${activeBox.code}_Manifest.csv`)
                    }
                    className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير الجدول CSV</span>
                  </button>
                </div>

                {/* Box Manifest Table */}
                {boxViewRecords.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <p className="text-sm font-semibold text-slate-700">
                      لا يوجد مورد بهذا الاسم في النطاق المحدد
                    </p>
                    {intraSearchScope === 'current-box' && intraBoxQuery.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => setIntraSearchScope('same-year')}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        توسيع البحث ليشمل كل صناديق سنة{' '}
                        {yearFilter !== 'all' ? yearFilter : activeBox.primaryYear}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold w-14">#</th>
                          {intraSearchScope === 'same-year' && (
                            <th className="px-4 py-3 font-semibold whitespace-nowrap">الصندوق</th>
                          )}
                          <th className="px-4 py-3 font-semibold whitespace-nowrap">
                            الظرف / الملف
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            اسم المورد / الشركة / البيان
                          </th>
                          <th className="px-4 py-3 font-semibold whitespace-nowrap">
                            رقم المستند
                          </th>
                          <th className="px-4 py-3 font-semibold whitespace-nowrap">
                            رقم الشيك / المرجع
                          </th>
                          <th className="px-4 py-3 font-semibold whitespace-nowrap">السنة</th>
                          <th className="px-4 py-3 font-semibold">ملاحظات وتفاصيل إضافية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {boxViewRecords.map((row) => {
                          const isHighlighted =
                            intraSearchScope === 'current-box' &&
                            highlightedFileNo === row.fileNo;
                          return (
                            <tr
                              key={`${row.boxId}-${row.fileNo}`}
                              className={`transition-colors ${
                                isHighlighted
                                  ? 'bg-amber-50 hover:bg-amber-100/70'
                                  : 'hover:bg-slate-50/90'
                              }`}
                            >
                              <td className="px-4 py-2.5 font-mono-num text-xs font-semibold text-slate-500">
                                {row.fileNo}
                              </td>
                              {intraSearchScope === 'same-year' && (
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => navigateToBox(row.boxId, row.fileNo)}
                                    className="font-display font-bold text-blue-700 hover:underline cursor-pointer"
                                  >
                                    {row.boxTitle}
                                  </button>
                                </td>
                              )}
                              <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                                {row.envelopeLabel}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-slate-900">
                                {row.supplierName}
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-blue-700 whitespace-nowrap">
                                {row.docNo}
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-slate-700 whitespace-nowrap">
                                {row.checkNo}
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                                {row.year}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-500">{row.notes}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* =========================================================
              4. QR CODES & BARCODE STICKER PRINTING CENTER
             ========================================================= */}
          {activeSection === 'qrcodes' && (
            <div className="space-y-6">
              {/* Studio Control Header */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    مركز توليد رموز الاستجابة السريعة (QR) وطباعة ملصقات الباركود
                  </h2>
                  <p className="text-xs text-slate-500">
                    كل صندوق مزود برمز QR يفتح محتويات الصندوق مباشرة عبر الهاتف، مع باركود قياسي
                    (Code-128) جاهز للطباعة واللصق على الصناديق الفيزيائية.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => triggerPrint('all-stickers')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة كل الملصقات دفعة واحدة (كبيرة من بعيد)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPrint('all-stickers-compact')}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <span>طباعة مدمجة (Compact Sheet)</span>
                  </button>
                </div>
              </section>

              {/* All Boxes QR + Barcode Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {yearFilteredBoxes.map((box) => {
                  const directUrl = getBoxDirectUrl(box.id);
                  const isCopied = copiedBoxId === box.id;

                  return (
                    <div
                      key={box.id}
                      className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-colors"
                    >
                      {/* Top Label Preview with Prominent Number Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Distinctive Large Box Number Badge */}
                          <div className="bg-slate-900 text-white rounded-xl p-2.5 flex flex-col items-center justify-center shrink-0 min-w-[62px] text-center shadow-xs">
                            <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">صندوق</span>
                            <span className="text-3xl font-black font-mono-num leading-none my-0.5">
                              {String(box.id).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] font-mono-num text-amber-400 font-bold">{box.code}</span>
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="text-[11px] font-mono-num text-blue-700 font-semibold">
                              السنة المالية {box.years.join(' / ')}
                            </div>
                            <h3 className="font-display font-extrabold text-lg text-slate-950 truncate">
                              {box.titleAr}
                            </h3>
                            <p className="text-xs text-slate-600 line-clamp-2">{box.categoryScope}</p>
                            <p className="text-xs text-slate-500 pt-0.5">
                              المحتوى:{' '}
                              <strong className="font-mono-num text-slate-900 font-bold">
                                {box.files.length} ملف وظرف
                              </strong>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setQrModalBox(box)}
                          className="shrink-0 p-1.5 border border-slate-200 rounded-xl bg-white hover:border-blue-400 transition-colors cursor-pointer"
                          title="تكبير ومعاينة الملصق"
                        >
                          <BoxQrCode value={directUrl} size={96} />
                        </button>
                      </div>

                      {/* 1D Barcode */}
                      <div className="py-2.5 px-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex justify-center">
                        <div className="w-full max-w-[220px]">
                          <Code128Barcode value={box.barcodeValue} height={38} />
                        </div>
                      </div>

                      {/* Direct URL & Copy */}
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono-num text-slate-600 truncate"
                          dir="ltr"
                        >
                          {directUrl}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyBoxUrl(box.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                          title="نسخ رابط الصندوق"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{isCopied ? 'تم' : 'نسخ'}</span>
                        </button>
                      </div>

                      {/* Sticker Print & Open Box Actions */}
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => triggerPrint('single-sticker', box.id)}
                          className="flex-1 py-2 px-3 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة ملصق الصندوق</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigateToBox(box.id)}
                          className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                          <span>المحتويات</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Quiet Footer */}
        <footer className="no-print border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <div>
            Smart Docs E-Archive · نظام إدارة وأرشفة المستندات للصناديق (1 إلى 13)
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleDownloadSingleHtml}
              className="text-blue-600 hover:underline font-medium cursor-pointer"
            >
              تنزيل نسخة Single-File HTML
            </button>
            <span>·</span>
            <a href={MASTER_PDF_PATH} target="_blank" rel="noreferrer" className="hover:underline">
              ملف PDF الأصلي
            </a>
          </div>
        </footer>
      </div>

      {/* QR & Barcode Preview Modal */}
      <QrModal
        box={qrModalBox}
        onClose={() => setQrModalBox(null)}
        getBoxUrl={getBoxDirectUrl}
        onPrintSingle={(boxId) => triggerPrint('single-sticker', boxId)}
        onOpenBox={(boxId) => navigateToBox(boxId)}
      />

      {/* Dedicated Print Media Surface */}
      <PrintSheet
        mode={printMode}
        boxes={yearFilteredBoxes}
        activeBox={printTargetBox}
        getBoxUrl={getBoxDirectUrl}
      />
    </div>
  );
}

export default App;
