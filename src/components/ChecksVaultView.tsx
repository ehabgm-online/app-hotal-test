import React, { useState, useMemo, useDeferredValue, useEffect, startTransition } from 'react';
import {
  ArchiveBox,
  ArchiveFileRecord,
  normalizeArabicSearch,
} from '../data/archiveData';
import {
  CreditCard,
  FileText,
  Search,
  Filter,
  Plus,
  Printer,
  FileSpreadsheet,
  Sparkles,
  Building2,
  CheckCircle2,
  Boxes,
  DollarSign,
  Edit3,
  Trash2,
  X,
  Camera,
  Layers,
  ArrowUpDown,
  Check,
} from 'lucide-react';
import { Code128Barcode } from './BoxCodes';
import { matchesBilingual, getSupplierBilingualInfo } from '../utils/bilingualSearch';

export interface FlattenedCheckRecord extends ArchiveFileRecord {
  boxId: number;
  boxCode: string;
  boxTitle: string;
  boxCategory: string;
}

interface ChecksVaultViewProps {
  boxes: ArchiveBox[];
  onAddRecord: (boxId: number, record: ArchiveFileRecord) => Promise<void>;
  onUpdateRecord: (boxId: number, record: ArchiveFileRecord) => Promise<void>;
  onDeleteRecord: (boxId: number, fileNo: number) => Promise<void>;
  onToggleCheck?: (boxId: number, fileNo: number) => Promise<void>;
  onEditRecord?: (boxId: number, boxTitle: string, record: ArchiveFileRecord) => void;
  onNavigateToBox: (boxId: number, fileNo?: number) => void;
  onOpenAiScanner?: () => void;
  showToast: (msg: string) => void;
  yearFilter: 'all' | number;
}

export const ChecksVaultView: React.FC<ChecksVaultViewProps> = ({
  boxes,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onToggleCheck,
  onEditRecord,
  onNavigateToBox,
  onOpenAiScanner,
  showToast,
  yearFilter,
}) => {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [typeFilter, setTypeFilter] = useState<'all' | 'checks-only' | 'docs-only' | 'with-amount'>('all');
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<number | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'table' | 'cards' | 'analytics'>('table');
  const [sortField, setSortField] = useState<'supplier' | 'amount' | 'year' | 'box'>('box');
  const [sortAsc, setSortAsc] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(60);

  // Dynamic available years & default box
  const availableYears = useMemo(() => {
    const set = new Set<number>([2016, 2017, 2019, 2021]);
    boxes.forEach((b) => (b.years || []).forEach((y) => set.add(y)));
    return Array.from(set).sort((a, b) => b - a);
  }, [boxes]);

  const defaultBoxId = useMemo(() => {
    if (yearFilter !== 'all') {
      const match = boxes.find((b) => (b.years || []).includes(yearFilter));
      if (match) return match.id;
    }
    return boxes[boxes.length - 1]?.id || 1;
  }, [boxes, yearFilter]);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newDocNo, setNewDocNo] = useState('');
  const [newCheckNo, setNewCheckNo] = useState('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newYear, setNewYear] = useState<number>(yearFilter !== 'all' ? yearFilter : availableYears[0] || 2017);
  const [newNotes, setNewNotes] = useState('');
  const [targetBoxId, setTargetBoxId] = useState<number>(defaultBoxId);

  // Printable Voucher Modal
  const [voucherRecord, setVoucherRecord] = useState<FlattenedCheckRecord | null>(null);

  // Reset box filter & pagination seamlessly when boxes/yearFilter changes
  useEffect(() => {
    if (selectedBoxFilter !== 'all') {
      const stillValid = boxes.some(
        (b) => b.id === selectedBoxFilter && (yearFilter === 'all' || (b.years || []).includes(yearFilter))
      );
      if (!stillValid) setSelectedBoxFilter('all');
    }
  }, [boxes, yearFilter, selectedBoxFilter]);

  useEffect(() => {
    if (!boxes.some((b) => b.id === targetBoxId)) {
      setTargetBoxId(defaultBoxId);
    }
  }, [boxes, targetBoxId, defaultBoxId]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [deferredSearchQuery, typeFilter, selectedBoxFilter, yearFilter, activeTab]);

  // Close internal modals cleanly with Escape
  useEffect(() => {
    if (!isAddModalOpen && !voucherRecord) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
        setVoucherRecord(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAddModalOpen, voucherRecord]);

  // Flatten all records from all boxes
  const allRecords = useMemo<FlattenedCheckRecord[]>(() => {
    const list: FlattenedCheckRecord[] = [];
    for (const b of boxes) {
      if (yearFilter !== 'all' && !b.years.includes(yearFilter)) continue;
      for (const f of b.files || []) {
        if (yearFilter !== 'all' && f.year !== yearFilter) continue;
        list.push({
          ...f,
          boxId: b.id,
          boxCode: b.code,
          boxTitle: b.titleAr,
          boxCategory: b.categoryScope,
        });
      }
    }
    return list;
  }, [boxes, yearFilter]);

  // Filtered Records (uses deferred query for zero typing lag)
  const filteredRecords = useMemo(() => {
    let result = allRecords;

    if (selectedBoxFilter !== 'all') {
      result = result.filter((r) => r.boxId === selectedBoxFilter);
    }

    if (typeFilter === 'checks-only') {
      result = result.filter((r) => r.checkNo && r.checkNo !== '—');
    } else if (typeFilter === 'docs-only') {
      result = result.filter((r) => r.docNo && r.docNo !== '—');
    } else if (typeFilter === 'with-amount') {
      result = result.filter((r) => typeof r.amountEgp === 'number' && r.amountEgp > 0);
    }

    const q = deferredSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => {
        return (
          matchesBilingual(r.supplierName, q) ||
          r.checkNo.toLowerCase().includes(q) ||
          r.docNo.toLowerCase().includes(q) ||
          r.boxCode.toLowerCase().includes(q) ||
          r.boxTitle.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q)
        );
      });
    }

    // Sort copy without mutating memo source
    const sorted = [...result];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'supplier') {
        cmp = a.supplierName.localeCompare(b.supplierName);
      } else if (sortField === 'amount') {
        cmp = (a.amountEgp || 0) - (b.amountEgp || 0);
      } else if (sortField === 'year') {
        cmp = a.year - b.year;
      } else {
        cmp = a.boxId - b.boxId || a.fileNo - b.fileNo;
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [allRecords, selectedBoxFilter, typeFilter, deferredSearchQuery, sortField, sortAsc]);

  const visibleRecords = useMemo(
    () => filteredRecords.slice(0, visibleLimit),
    [filteredRecords, visibleLimit]
  );

  // KPI Metrics
  const metrics = useMemo(() => {
    const totalRecords = allRecords.length;
    const checksCount = allRecords.filter((r) => r.checkNo && r.checkNo !== '—').length;
    const docsCount = allRecords.filter((r) => r.docNo && r.docNo !== '—').length;
    const totalAmount = allRecords.reduce((acc, r) => acc + (r.amountEgp || 0), 0);
    const uniqueSuppliers = new Set(allRecords.map((r) => normalizeArabicSearch(r.supplierName))).size;

    return {
      totalRecords,
      checksCount,
      docsCount,
      totalAmount,
      uniqueSuppliers,
    };
  }, [allRecords]);

  // Intelligent Auto-Box Predictor
  const handleSupplierInputChange = (val: string) => {
    setNewSupplierName(val);
    const norm = normalizeArabicSearch(val);
    if (!norm) return;

    // Check if supplier already exists in any box
    for (const b of boxes) {
      const match = b.files.find((f) => matchesBilingual(f.supplierName, val));
      if (match) {
        setTargetBoxId(b.id);
        if (match.docNo && match.docNo !== '—') setNewDocNo(match.docNo);
        if (match.year) setNewYear(match.year);
        break;
      }
    }
  };

  // Handle Save New Check/Invoice
  const handleSaveNewCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      showToast('يرجى إدخال اسم المورد أو الشركة');
      return;
    }

    const targetBox = boxes.find((b) => b.id === targetBoxId) || boxes[0];
    const nextFileNo = targetBox.files.length + 1;
    const parsedAmount = newAmount.trim() ? parseFloat(newAmount) : undefined;

    const newRecord: ArchiveFileRecord = {
      fileNo: nextFileNo,
      envelopeLabel: `الظرف ${nextFileNo}`,
      supplierName: newSupplierName.trim(),
      docNo: newDocNo.trim() || '—',
      checkNo: newCheckNo.trim() || '—',
      year: newYear,
      notes: newNotes.trim() || (parsedAmount ? `القيمة: ${parsedAmount.toLocaleString('ar-EG')} ج.م` : ''),
      ...(typeof parsedAmount === 'number' && Number.isFinite(parsedAmount)
        ? { amountEgp: parsedAmount }
        : {}),
    };

    try {
      await onAddRecord(targetBox.id, newRecord);
      showToast(`تم إضافة الشيك/المستند بنجاح إلى ${targetBox.titleAr}`);
      setIsAddModalOpen(false);
      // Reset form
      setNewSupplierName('');
      setNewDocNo('');
      setNewCheckNo('');
      setNewAmount('');
      setNewNotes('');
    } catch {
      showToast('حدث خطأ أثناء الحفظ');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'م',
      'الصندوق',
      'كود الصندوق',
      'رقم الملف',
      'اسم المورد / الشركة',
      'رقم الشيك',
      'كود / رقم المستند',
      'السنة المالية',
      'المبلغ (ج.م)',
      'ملاحظات',
    ];
    const rows = filteredRecords.map((r, i) => [
      i + 1,
      `"${r.boxTitle}"`,
      r.boxCode,
      r.fileNo,
      `"${r.supplierName.replace(/"/g, '""')}"`,
      `"${r.checkNo}"`,
      `"${r.docNo}"`,
      r.year,
      r.amountEgp || '',
      `"${r.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `شيكات_وفواتير_الموردين_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تصدير كشف شيكات وفواتير الموردين بنجاح (Excel / CSV)');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span>فندق النيل ريتز كارلتون · المنظومة المركزية المعتمدة</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
              مخزن شيكات وفواتير الموردين العمومي
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              إدارة وتنظيم شيكات وفواتير ومستندات كافة الموردين مع الفحص بالذكاء الاصطناعي، والتعلم الذاتي للأكواد وأرقام الصناديق، وتوليد سندات الصرف الفورية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شيك / فاتورة جديدة</span>
            </button>

            {onOpenAiScanner && (
              <button
                type="button"
                onClick={onOpenAiScanner}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer"
                title="مسح فاتورة أو شيك ضوئياً بالذكاء الاصطناعي واستخراج البيانات تلقائياً"
              >
                <Camera className="w-4 h-4 text-amber-400" />
                <span>مسح ضوئي ذكي (OCR)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
              title="تصدير شيت إكسيل لكافة شيكات الموردين"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>إكسيل (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip (Interactive Quick Filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Documents */}
        <button
          type="button"
          onClick={() => startTransition(() => { setTypeFilter('all'); setActiveTab('table'); })}
          className={`text-right bg-white border rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            typeFilter === 'all' ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>إجمالي قيود الأرشيف</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black font-mono-num text-slate-900">
            {metrics.totalRecords}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            شيكات ومستندات وفواتير مسجلة
          </div>
        </button>

        {/* Total Checks */}
        <button
          type="button"
          onClick={() => startTransition(() => { setTypeFilter('checks-only'); setActiveTab('table'); })}
          className={`text-right bg-blue-50/70 border rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            typeFilter === 'checks-only' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-200 hover:border-blue-400'
          }`}
        >
          <div className="text-xs font-bold text-blue-800 flex items-center justify-between">
            <span>الشيكات البنكية الموثقة</span>
            <CreditCard className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black font-mono-num text-blue-700">
            {metrics.checksCount}
          </div>
          <div className="mt-1 text-[11px] text-blue-700 font-medium">
            اضغط لتصفية الشيكات البنكية فقط
          </div>
        </button>

        {/* Total Invoices */}
        <button
          type="button"
          onClick={() => startTransition(() => { setTypeFilter('docs-only'); setActiveTab('table'); })}
          className={`text-right bg-emerald-50/70 border rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            typeFilter === 'docs-only' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
            <span>الفواتير والمستندات بالأكواد</span>
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black font-mono-num text-emerald-700">
            {metrics.docsCount}
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">
            اضغط لتصفية المستندات بالأكواد
          </div>
        </button>

        {/* Active Suppliers */}
        <button
          type="button"
          onClick={() => startTransition(() => setActiveTab('analytics'))}
          className={`text-right bg-purple-50/70 border rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            activeTab === 'analytics' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-200 hover:border-purple-400'
          }`}
        >
          <div className="text-xs font-bold text-purple-800 flex items-center justify-between">
            <span>الموردون والشركات</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black font-mono-num text-purple-700">
            {metrics.uniqueSuppliers}
          </div>
          <div className="mt-1 text-[11px] text-purple-700 font-medium">
            اضغط لعرض التحليل الذكي
          </div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المورد، كود المستند (مثل COF001)، رقم الشيك، الصندوق، أو الملاحظات..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('table'))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
                activeTab === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              جدول منظم
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('cards'))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
                activeTab === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              بطاقات وسندات الشيكات
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setActiveTab('analytics'))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1 ${
                activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>التحليل الذكي</span>
            </button>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 ml-1">
            <Filter className="w-3.5 h-3.5" />
            <span>نوع السجل:</span>
          </div>

          <button
            type="button"
            onClick={() => startTransition(() => setTypeFilter('all'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] ${
              typeFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            الكل ({allRecords.length})
          </button>

          <button
            type="button"
            onClick={() => startTransition(() => setTypeFilter('checks-only'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1 ${
              typeFilter === 'checks-only' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <CreditCard className="w-3 h-3" />
            <span>شيكات بنكية فقط</span>
          </button>

          <button
            type="button"
            onClick={() => startTransition(() => setTypeFilter('docs-only'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1 ${
              typeFilter === 'docs-only' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>فواتير ومستندات بأكواد</span>
          </button>

          <button
            type="button"
            onClick={() => startTransition(() => setTypeFilter('with-amount'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1 ${
              typeFilter === 'with-amount' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            <DollarSign className="w-3 h-3" />
            <span>شيكات ذات قيمة مالية</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Box Selector Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">الصندوق:</span>
            <select
              value={selectedBoxFilter}
              onChange={(e) =>
                startTransition(() =>
                  setSelectedBoxFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                )
              }
              className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">كافة الصناديق</option>
              {boxes
                .filter((b) => yearFilter === 'all' || (b.years || []).includes(yearFilter))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.titleAr} ({b.files.length} ملف)
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'table' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold w-12 text-center">#</th>
                  <th
                    className="px-4 py-3 font-bold cursor-pointer hover:text-blue-600 select-none"
                    onClick={() => {
                      if (sortField === 'supplier') setSortAsc(!sortAsc);
                      else {
                        setSortField('supplier');
                        setSortAsc(true);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>اسم المورد / الشركة</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-bold">كود المورد / الفاتورة</th>
                  <th className="px-4 py-3 font-bold">رقم الشيك</th>
                  <th
                    className="px-4 py-3 font-bold cursor-pointer hover:text-blue-600 select-none"
                    onClick={() => {
                      if (sortField === 'box') setSortAsc(!sortAsc);
                      else {
                        setSortField('box');
                        setSortAsc(true);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>مكان الحفظ والأرشيف</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-bold">السنة المالية</th>
                  <th
                    className="px-4 py-3 font-bold cursor-pointer hover:text-blue-600 select-none"
                    onClick={() => {
                      if (sortField === 'amount') setSortAsc(!sortAsc);
                      else {
                        setSortField('amount');
                        setSortAsc(false);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>القيمة (ج.م)</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-bold">ملاحظات المستند</th>
                  <th className="px-4 py-3 font-bold text-center">إجراءات وسندات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      لا توجد شيكات أو مستندات مطابقة للبحث الحالي.
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((r, idx) => {
                    const bi = getSupplierBilingualInfo(r.supplierName);
                    return (
                      <tr
                        key={`${r.boxId}-${r.fileNo}-${idx}`}
                        className={`transition-colors ${
                          r.isChecked ? 'bg-emerald-50/60 hover:bg-emerald-100/50' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono-num text-center text-slate-400 font-semibold">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{r.supplierName}</div>
                          {bi.secondary && (
                            <div className="text-[11px] text-slate-400 font-sans mt-0.5">{bi.secondary}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.docNo && r.docNo !== '—' ? (
                            <span className="font-mono-num font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                              {r.docNo}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.checkNo && r.checkNo !== '—' ? (
                            <span className="font-mono-num font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1.5">
                              <CreditCard className="w-3 h-3 text-blue-500" />
                              <span>{r.checkNo}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onNavigateToBox(r.boxId, r.fileNo)}
                            className="font-bold text-blue-700 hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <Boxes className="w-3.5 h-3.5 text-blue-500" />
                            <span>{r.boxTitle}</span>
                            <span className="text-slate-400 text-xs font-mono-num font-normal">[{r.boxCode}]</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono-num font-bold text-slate-700">
                          {r.year}
                        </td>
                        <td className="px-4 py-3 font-mono-num font-bold text-emerald-700">
                          {r.amountEgp ? `${r.amountEgp.toLocaleString('ar-EG')} ج.م` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={r.notes}>
                          {r.notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setVoucherRecord(r)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                              title="عرض وطباعة سند صرف وشيك رسمي"
                            >
                              سند الشيك
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onToggleCheck
                                  ? onToggleCheck(r.boxId, r.fileNo)
                                  : onUpdateRecord(r.boxId, { ...r, isChecked: !r.isChecked })
                              }
                              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                r.isChecked
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title={r.isChecked ? 'إلغاء التعليم' : 'تعليم كمطابق ✓'}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            {onEditRecord && (
                              <button
                                type="button"
                                onClick={() => onEditRecord(r.boxId, r.boxTitle, r)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                title="تعديل السجل"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteRecord(r.boxId, r.fileNo)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="حذف السجل"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredRecords.length > visibleLimit && (
            <div className="p-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 60)}
                className="px-5 py-2 rounded-xl bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 text-xs font-bold cursor-pointer transition-colors"
              >
                عرض المزيد ({Math.min(60, filteredRecords.length - visibleLimit)} سجل إضافي من أصل {filteredRecords.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Check Cards & Vouchers View */}
      {activeTab === 'cards' && (
        <div className="space-y-4">
          {filteredRecords.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
              لا توجد شيكات أو مستندات مطابقة للبحث الحالي.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleRecords.map((r, idx) => (
                <div
                  key={`${r.boxId}-${r.fileNo}-${idx}`}
                  className={`bg-white border-2 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group ${
                    r.isChecked
                      ? 'border-emerald-400 bg-emerald-50/30'
                      : 'border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        فندق النيل ريتز كارلتون · شيك ومستند مورد
                      </div>
                      <h3 className="font-extrabold text-base text-slate-900 truncate" title={r.supplierName}>
                        {r.supplierName}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono-num font-bold">
                          {r.docNo !== '—' ? r.docNo : 'بدون كود'}
                        </span>
                        <span className="text-slate-500 font-mono-num font-semibold">سنة {r.year}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-left">
                      <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono-num font-black block">
                        {r.boxCode}
                      </span>
                    </div>
                  </div>

                  {/* Check and Amount Strip */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">رقم الشيك البنكي:</span>
                      <span className="font-mono-num font-black text-blue-700 text-sm">
                        {r.checkNo !== '—' ? r.checkNo : '—'}
                      </span>
                    </div>
                    {r.amountEgp && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                        <span className="text-slate-500">القيمة المعتمدة:</span>
                        <span className="font-mono-num font-black text-emerald-700 text-sm">
                          {r.amountEgp.toLocaleString('ar-EG')} ج.م
                        </span>
                      </div>
                    )}
                    {r.notes && (
                      <div className="text-[11px] text-slate-600 line-clamp-2 pt-1 border-t border-slate-200">
                        {r.notes}
                      </div>
                    )}
                  </div>

                  {/* Barcode visual preview */}
                  <div className="pt-1">
                    <Code128Barcode value={r.docNo !== '—' ? r.docNo : r.boxCode} height={28} showLabel={false} />
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVoucherRecord(r)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        طباعة السند
                      </button>
                      {onEditRecord && (
                        <button
                          type="button"
                          onClick={() => onEditRecord(r.boxId, r.boxTitle, r)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 transition-colors cursor-pointer"
                          title="تعديل"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToBox(r.boxId, r.fileNo)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      الانتقال للصندوق
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredRecords.length > visibleLimit && (
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 60)}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 text-xs font-bold cursor-pointer transition-colors"
              >
                عرض المزيد ({Math.min(60, filteredRecords.length - visibleLimit)} بطاقة إضافية من أصل {filteredRecords.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Smart Self-Learning Insights & Analytics View */}
      {activeTab === 'analytics' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 font-display">
                تقرير الذكاء الاصطناعي الأرشيفي والتحليل الذاتي للشيكات
              </h2>
              <p className="text-xs text-slate-500">
                فحص وتحليل منطقي فوري لكافة شيكات ومستندات فندق النيل ريتز كارلتون
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>حالة التوثيق البنكي</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                يحتوي الأرشيف على <strong>{metrics.checksCount}</strong> قيد شيك بنكي مسجل برقم رسمي، و
                <strong>{metrics.docsCount}</strong> مستند وفاتورة تحمل كود مورد مسجل ومعتمد.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>تغطية الموردين</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                تمت فهرسة <strong>{metrics.uniqueSuppliers}</strong> مورد مختلف عبر صناديق السنوات ({availableYears.slice().sort((a, b) => a - b).join('، ')})، وأحدث صندوق مضاف: <strong>{boxes[boxes.length - 1]?.titleAr || 'صندوق 1'}</strong> بعدد {boxes[boxes.length - 1]?.files.length || 0} ملف.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>التعلم الذاتي والتنبؤ</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                نظام التعلم الذاتي يربط تلقائياً بين كود المورد (مثل <code>COF001</code> أو <code>CAL013</code>) ومكان صندوقه المقترح فور إضافة شيكات جديدة.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Check / Invoice Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">إضافة شيك / فاتورة مورد للأرشيف</h3>
                  <p className="text-xs text-slate-500">حفظ ومزامنة سحابية وفورية لجميع الأجهزة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCheck} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المورد أو الشركة *</label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={(e) => handleSupplierInputChange(e.target.value)}
                  placeholder="مثال: Office Mix on Line أو شركة دومتي أو دعشوشة..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود المورد / الفاتورة</label>
                  <input
                    type="text"
                    value={newDocNo}
                    onChange={(e) => setNewDocNo(e.target.value)}
                    placeholder="مثال: COF001 أو CAL013"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الشيك البنكي</label>
                  <input
                    type="text"
                    value={newCheckNo}
                    onChange={(e) => setNewCheckNo(e.target.value)}
                    placeholder="مثال: 07716000076729 أو 2017"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المبلغ المالي (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="مثال: 6000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">السنة المالية</label>
                  <select
                    value={newYear}
                    onChange={(e) => setNewYear(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:border-blue-500"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الصندوق المخصص للحفظ *</label>
                <select
                  value={targetBoxId}
                  onChange={(e) => setTargetBoxId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-blue-900 focus:outline-none focus:border-blue-500 bg-blue-50/50"
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr} [{b.code}] — {b.subtitleAr || b.categoryScope}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="ملاحظات الصرف أو رقم الإذن أو صور المستندات..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs sm:text-sm cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md cursor-pointer transition-all"
                >
                  حفظ وتوثيق الشيك سحابياً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Voucher Modal */}
      {voucherRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">سند استلام / صرف شيك فندقي معتمد</h3>
              </div>
              <button
                type="button"
                onClick={() => setVoucherRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Official Hotel Voucher Canvas */}
            <div className="border-2 border-slate-900 rounded-xl p-5 bg-white space-y-4">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">THE NILE RITZ-CARLTON · CAIRO</div>
                  <div className="text-base font-black text-slate-900">فندق النيل ريتز كارلتون · الأرشيف المالي</div>
                </div>
                <div className="text-left font-mono-num text-xs">
                  <div><strong>السنة:</strong> {voucherRecord.year}</div>
                  <div><strong>الصندوق:</strong> {voucherRecord.boxTitle}</div>
                </div>
              </div>

              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">اسم المورد / المستفيد:</span>
                  <span className="font-bold text-slate-950 text-base">{voucherRecord.supplierName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">كود المستند / الفاتورة:</span>
                  <span className="font-mono-num font-bold text-slate-900">{voucherRecord.docNo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">رقم الشيك البنكي:</span>
                  <span className="font-mono-num font-extrabold text-blue-700 text-base">{voucherRecord.checkNo}</span>
                </div>
                {voucherRecord.amountEgp && (
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-700 font-bold">المبلغ المعتمد:</span>
                    <span className="font-mono-num font-black text-emerald-700 text-lg">
                      {voucherRecord.amountEgp.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                )}
                {voucherRecord.notes && (
                  <div className="text-xs text-slate-600 pt-1">
                    <strong>البيان / الملاحظات:</strong> {voucherRecord.notes}
                  </div>
                )}
              </div>

              {/* Barcode & Signature */}
              <div className="pt-3 border-t border-slate-300 flex items-center justify-between gap-4">
                <div className="w-48">
                  <Code128Barcode value={voucherRecord.docNo !== '—' ? voucherRecord.docNo : voucherRecord.boxCode} height={34} />
                </div>
                <div className="text-center text-[10px] text-slate-500 border-t border-slate-400 pt-2 px-6">
                  توقيع أمين الأرشيف والمطابقة
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setVoucherRecord(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة السند</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
