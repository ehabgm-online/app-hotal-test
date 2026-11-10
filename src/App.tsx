import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Cloud,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LayoutGrid,
  List,
  Menu,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Smartphone,
  Tablet,
  Trash2,
  X,
  XCircle,
  Filter,
  Sparkles,
  Lightbulb,
  Mic,
  Camera,
} from 'lucide-react';
import { askGeminiAiSearch, AiSearchResponse } from './utils/aiSearchService';
import { AiSettingsModal } from './components/AiSettingsModal';
import { AiImageScannerModal } from './components/AiImageScannerModal';
import {
  ARCHIVE_BOXES,
  AVAILABLE_YEARS,
  ArchiveBox,
  ArchiveFileRecord,
  MASTER_PDF_PATH,
  MASTER_USER_SUPPLIERS,
  normalizeArabicSearch,
} from './data/archiveData';
import { BoxQrCode, Code128Barcode } from './components/BoxCodes';
import { PrintMode, PrintSheet, SupplierAuditItem, SupplierAuditLocation } from './components/PrintSheet';
import { QrModal } from './components/QrModal';
import {
  AddSingleSupplierModal,
  BatchAddSuppliersModal,
  CreateBoxModal,
  EditBoxModal,
  EditFileRecordModal,
} from './components/BoxEditorModals';
import { downloadStandaloneHtml } from './utils/singleFileExporter';
import {
  matchesBilingual,
  matchesArchiveRecord,
  scoreArchiveRecord,
  getSupplierBilingualInfo,
  getBilingualFileLabel,
} from './utils/bilingualSearch';
import { HighlightMatch } from './components/HighlightMatch';
import {
  subscribeToFirestoreBoxes,
  saveBoxToCloud,
  deleteBoxFromCloud,
  resetCloudBoxesToDefault,
  testFirestoreConnection,
  cacheBoxesLocally,
  getLocalCachedBoxes,
} from './services/firestoreArchive';

type ActiveSection = 'dashboard' | 'search' | 'boxes' | 'qrcodes' | 'suppliers' | 'extraction-plan';
type YearFilter = 'all' | number;
type IntraSearchScope = 'current-box' | 'same-year';

interface FlattenedRecord extends ArchiveFileRecord {
  boxId: number;
  boxCode: string;
  boxTitle: string;
  boxCategory: string;
  _searchScore?: number;
  _isExactMatch?: boolean;
}

function loadStoredBoxes(): ArchiveBox[] {
  return getLocalCachedBoxes();
}

export function App() {
  const [boxes, setBoxes] = useState<ArchiveBox[]>(loadStoredBoxes);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [selectedBoxId, setSelectedBoxId] = useState<number>(1);
  const [highlightedFileNo, setHighlightedFileNo] = useState<number | null>(null);

  // Search states
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [searchBoxFilter, setSearchBoxFilter] = useState<number | 'all'>('all');
  const [intraBoxQuery, setIntraBoxQuery] = useState<string>('');
  const [intraSearchScope, setIntraSearchScope] = useState<IntraSearchScope>('current-box');
  const [supplierDirectoryQuery, setSupplierDirectoryQuery] = useState<string>('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<'all' | 'found' | 'missing'>('all');
  const [supplierScopeFilter, setSupplierScopeFilter] = useState<'requested' | 'allArchive'>('requested');
  const [prefilledSupplierName, setPrefilledSupplierName] = useState<string>('');
  const [extractionPlanFilter, setExtractionPlanFilter] = useState<'all' | 'required-only'>('required-only');
  const [missingSuppliersSearch, setMissingSuppliersSearch] = useState<string>('');
  const [isAiSearching, setIsAiSearching] = useState<boolean>(false);
  const [aiSearchResult, setAiSearchResult] = useState<AiSearchResponse | null>(null);
  const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState<boolean>(false);
  const [isAiImageScannerOpen, setIsAiImageScannerOpen] = useState<boolean>(false);

  // Trigger Gemini AI Search Assistant
  const handleTriggerAiSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? globalSearchQuery).trim();
    if (!q) return;
    setIsAiSearching(true);
    try {
      const res = await askGeminiAiSearch(q);
      setAiSearchResult(res);
      if (res?.interpretedIntent?.targetBoxNumber) {
        setSearchBoxFilter(res.interpretedIntent.targetBoxNumber);
      }
      if (res?.interpretedIntent?.targetYear) {
        setYearFilter(res.interpretedIntent.targetYear);
      }
    } catch (err) {
      console.error('Error in AI search:', err);
    } finally {
      setIsAiSearching(false);
    }
  };

  // Trigger Voice Search via Web Speech API
  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('متصفحك لا يدعم البحث الصوتي المباشر.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      showToast('🎙️ جاري الاستماع للصوت... تحدث الآن بالعربية أو الإنجليزية');
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setGlobalSearchQuery(text);
      handleTriggerAiSearch(text);
      showToast(`تم التعرف على الصوت: "${text}"`);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      showToast('تعذر التعرف على الصوت، يرجى المحاولة مرة أخرى.');
    };

    recognition.start();
  };

  // UI & Print & Modal states
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [qrModalBox, setQrModalBox] = useState<ArchiveBox | null>(null);
  const [isCreateBoxModalOpen, setIsCreateBoxModalOpen] = useState<boolean>(false);
  const [isBatchAddModalOpen, setIsBatchAddModalOpen] = useState<boolean>(false);
  const [boxToEdit, setBoxToEdit] = useState<ArchiveBox | null>(null);
  const [recordToEdit, setRecordToEdit] = useState<{
    boxId: number;
    boxTitle: string;
    record: ArchiveFileRecord;
  } | null>(null);
  const [isAddSingleModalOpen, setIsAddSingleModalOpen] = useState<boolean>(false);
  const [printMode, setPrintMode] = useState<PrintMode>('all-stickers');
  const [printTargetBoxId, setPrintTargetBoxId] = useState<number>(1);
  const [copiedBoxId, setCopiedBoxId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openedViaQrBanner, setOpenedViaQrBanner] = useState<number | null>(null);
  // Focused Scan Viewer mode: when a user scans the QR code on a box, show ONLY the box files & search
  const [isFocusedScanMode, setIsFocusedScanMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return Boolean(p.get('box'));
    }
    return false;
  });
  // View mode for box files: 'cards' (optimal for mobile & tablets) vs 'table' (dense desktop)
  const [boxViewMode, setBoxViewMode] = useState<'cards' | 'table'>('cards');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Real-time Firestore Cloud Database Synchronization
  useEffect(() => {
    testFirestoreConnection();

    const unsubscribe = subscribeToFirestoreBoxes(
      (cloudBoxes, synced) => {
        setBoxes(cloudBoxes);
        setIsCloudSynced(synced);
        setIsSyncing(false);
        setLastSyncTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
      },
      (err) => {
        console.warn('Real-time sync notice:', err);
        setIsCloudSynced(false);
        setIsSyncing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Lock body scroll when mobile sidebar drawer is open to prevent overlapping scrolling
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileSidebarOpen]);

  // Next recommended box ID for creation
  const nextBoxId = useMemo(() => {
    const maxId = boxes.reduce((acc, b) => Math.max(acc, b.id), 0);
    return maxId + 1;
  }, [boxes]);

  // Dynamic available years list including any years from new boxes
  const dynamicYears = useMemo(() => {
    const yrSet = new Set<number>();
    boxes.forEach((b) => b.years.forEach((y) => yrSet.add(y)));
    return Array.from(yrSet).sort((a, b) => b - a);
  }, [boxes]);

  // Handle box creation with pasted suppliers (persisted directly to Cloud Firestore)
  const handleCreateBox = async (newBox: ArchiveBox) => {
    setBoxes((prev) => {
      const updated = [...prev, newBox];
      cacheBoxesLocally(updated);
      return updated;
    });
    setSelectedBoxId(newBox.id);
    setActiveSection('boxes');
    showToast(`جاري حفظ ${newBox.titleAr} في السحابة...`);
    try {
      await saveBoxToCloud(newBox);
      showToast(`تم حفظ ومزامنة ${newBox.titleAr} في السحابة بنجاح! متزامن لجميع الأجهزة.`);
    } catch (e) {
      console.error('Failed to sync new box to cloud:', e);
      showToast(`تم الحفظ محلياً (تعذر الاتصال بالسحابة)`);
    }
  };

  // Handle batch adding suppliers to an existing box
  const handleBatchAddSuppliers = async (boxId: number, newFiles: ArchiveFileRecord[]) => {
    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const nb = {
          ...b,
          files: [...b.files, ...newFiles],
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
        showToast(`تمت إضافة ${newFiles.length} مورد ومزامنتها سحابياً بنجاح!`);
      } catch (e) {
        console.error('Failed to update cloud:', e);
        showToast(`تمت الإضافة محلياً`);
      }
    }
  };

  // Update Box details
  const handleUpdateBox = async (updatedBox: ArchiveBox) => {
    setBoxes((prev) => {
      const updated = prev.map((b) => (b.id === updatedBox.id ? updatedBox : b));
      cacheBoxesLocally(updated);
      return updated;
    });
    try {
      await saveBoxToCloud(updatedBox);
      showToast(`تم حفظ تعديلات ${updatedBox.titleAr} في السحابة بنجاح!`);
    } catch (e) {
      console.error('Failed to update cloud:', e);
      showToast(`تم الحفظ محلياً`);
    }
  };

  // Delete Box
  const handleDeleteBox = async (boxId: number) => {
    if (boxes.length <= 1) {
      showToast('لا يمكن حذف الصندوق الوحيد المتبقي.');
      return;
    }
    const remaining = boxes.filter((b) => b.id !== boxId);
    setBoxes(remaining);
    cacheBoxesLocally(remaining);
    setSelectedBoxId(remaining[0].id);
    try {
      await deleteBoxFromCloud(boxId);
      showToast('تم حذف الصندوق من السحابة بنجاح.');
    } catch (e) {
      console.error('Failed to delete from cloud:', e);
    }
  };

  // Update Single File / Supplier Record
  const handleUpdateRecord = async (boxId: number, updatedRecord: ArchiveFileRecord) => {
    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const nb = {
          ...b,
          files: b.files.map((f) => (f.fileNo === updatedRecord.fileNo ? updatedRecord : f)),
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
        showToast(`تم حفظ تعديل "${updatedRecord.supplierName}" في السحابة بنجاح!`);
      } catch (e) {
        console.error('Failed to sync to cloud:', e);
      }
    }
  };

  // Delete Single File / Supplier Record
  const handleDeleteRecord = async (boxId: number, fileNo: number) => {
    const targetBox = boxes.find((b) => b.id === boxId);
    const targetFile = targetBox?.files.find((f) => f.fileNo === fileNo);
    if (
      !window.confirm(
        `هل أنت متأكد من حذف المورد "${targetFile?.supplierName || 'هذا المورد'}" من ${targetBox?.titleAr || 'الصندوق'}؟`
      )
    ) {
      return;
    }

    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const filtered = b.files.filter((f) => f.fileNo !== fileNo);
        const nb = {
          ...b,
          files: filtered,
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
        showToast('تم حذف المورد وتحديث السحابة بنجاح.');
      } catch (e) {
        console.error('Failed to sync to cloud:', e);
      }
    }
  };

  // Toggle audit check (green highlight / found status) on a supplier record
  const handleToggleRecordCheck = async (boxId: number, fileNo: number) => {
    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const nb = {
          ...b,
          files: b.files.map((f) => {
            if (f.fileNo !== fileNo) return f;
            return {
              ...f,
              isChecked: !f.isChecked,
            };
          }),
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
      } catch (e) {
        console.error('Failed to sync check state:', e);
      }
    }
  };

  // Add Single Supplier Record
  const handleAddSingleRecord = async (boxId: number, newRecord: ArchiveFileRecord) => {
    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const nb = {
          ...b,
          files: [...b.files, newRecord],
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
        showToast(`تمت إضافة "${newRecord.supplierName}" وحفظها في السحابة بنجاح!`);
      } catch (e) {
        console.error('Failed to sync to cloud:', e);
      }
    }
  };

  // Re-number file records in a box sequentially from 1 to N
  const handleRenumberFiles = async (boxId: number) => {
    let boxToSave: ArchiveBox | null = null;
    setBoxes((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== boxId) return b;
        const renumbered = b.files.map((f, i) => ({
          ...f,
          fileNo: i + 1,
          envelopeLabel: `الظرف ${i + 1}`,
        }));
        const nb = {
          ...b,
          files: renumbered,
        };
        boxToSave = nb;
        return nb;
      });
      cacheBoxesLocally(updated);
      return updated;
    });
    if (boxToSave) {
      try {
        await saveBoxToCloud(boxToSave);
        showToast('تمت إعادة ترقيم الملفات وتحديث السحابة بنجاح!');
      } catch (e) {
        console.error('Failed to sync to cloud:', e);
      }
    }
  };

  // Reset to original 13 default boxes in Cloud Firestore and local
  const handleResetToDefault = async () => {
    if (
      window.confirm(
        'هل تريد استعادة الصناديق الافتراضية الأصلية (1 إلى 13) في قاعدة البيانات السحابية؟ سيتم تحديث جميع الأجهزة المتصلة والموقع فورياً.'
      )
    ) {
      showToast('جاري استعادة الصناديق الأصلية في السحابة...');
      try {
        await resetCloudBoxesToDefault();
        setSelectedBoxId(1);
        showToast('تمت استعادة الصناديق الأصلية في السحابة بنجاح.');
      } catch (err) {
        console.error('Failed to reset cloud:', err);
        showToast('حدث خطأ أثناء الاتصال بالسحابة');
      }
    }
  };

  // Handle ?box=N deep-link from QR Code scans
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const boxParam = params.get('box');
    if (boxParam) {
      const parsedId = Number(boxParam);
      const exists = boxes.some((b) => b.id === parsedId);
      if (exists) {
        setSelectedBoxId(parsedId);
        setActiveSection('boxes');
        setOpenedViaQrBanner(parsedId);
        setIsFocusedScanMode(true);
      }
    }
  }, [boxes]);

  const getBoxDirectUrl = (boxId: number): string => {
    if (typeof window === 'undefined') return `?box=${boxId}`;
    const cleanBase = `${window.location.origin}${window.location.pathname}`;
    return `${cleanBase}?box=${boxId}`;
  };

  // Flatten all records for global analytics & instant search
  const allFlattenedRecords = useMemo<FlattenedRecord[]>(() => {
    const list: FlattenedRecord[] = [];
    for (const box of boxes) {
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
  }, [boxes]);

  // Filtered boxes according to selected YearFilter
  const yearFilteredBoxes = useMemo<ArchiveBox[]>(() => {
    if (yearFilter === 'all') return boxes;
    return boxes.filter((b) => b.years.includes(yearFilter));
  }, [boxes, yearFilter]);

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

  // Comprehensive Suppliers Directory Index & Audit
  const suppliersDirectoryList = useMemo<SupplierAuditItem[]>(() => {
    if (supplierScopeFilter === 'requested') {
      const items: SupplierAuditItem[] = MASTER_USER_SUPPLIERS.map((uSup) => {
        const matchingRecs = allFlattenedRecords.filter((rec) =>
          matchesBilingual(rec.supplierName, uSup)
        );
        const locations: SupplierAuditLocation[] = matchingRecs.map((rec) => ({
          boxId: rec.boxId,
          boxTitle: rec.boxTitle,
          boxCode: rec.boxCode,
          fileNo: rec.fileNo,
          envelopeLabel: rec.envelopeLabel,
          docNo: rec.docNo,
          checkNo: rec.checkNo,
          year: rec.year,
          notes: rec.notes,
        }));
        const bi = getSupplierBilingualInfo(uSup);
        return {
          supplierName: uSup,
          secondaryName: bi.secondary,
          isFound: locations.length > 0,
          locations,
          totalFiles: locations.length,
        };
      });

      // Sort: Found (green) first, then missing (red), then alphabetically
      items.sort((a, b) => {
        if (a.isFound !== b.isFound) {
          return a.isFound ? -1 : 1;
        }
        return a.supplierName.localeCompare(b.supplierName);
      });

      return items;
    }

    // Otherwise 'allArchive': group all raw records in archive
    const map = new Map<string, SupplierAuditLocation[]>();
    for (const rec of allFlattenedRecords) {
      const name = (rec.supplierName || 'غير محدد').trim();
      if (!map.has(name)) {
        map.set(name, []);
      }
      map.get(name)!.push({
        boxId: rec.boxId,
        boxTitle: rec.boxTitle,
        boxCode: rec.boxCode,
        fileNo: rec.fileNo,
        envelopeLabel: rec.envelopeLabel,
        docNo: rec.docNo,
        checkNo: rec.checkNo,
        year: rec.year,
        notes: rec.notes,
      });
    }

    const items: SupplierAuditItem[] = Array.from(map.entries()).map(([supplierName, locations]) => {
      const bi = getSupplierBilingualInfo(supplierName);
      return {
        supplierName,
        secondaryName: bi.secondary,
        isFound: locations.length > 0,
        locations,
        totalFiles: locations.length,
      };
    });

    items.sort((a, b) => {
      if (a.isFound !== b.isFound) {
        return a.isFound ? -1 : 1;
      }
      return a.supplierName.localeCompare(b.supplierName);
    });

    return items;
  }, [allFlattenedRecords, supplierScopeFilter]);

  const filteredSuppliersDirectory = useMemo(() => {
    let list = suppliersDirectoryList;

    if (supplierStatusFilter === 'found') {
      list = list.filter((s) => s.isFound);
    } else if (supplierStatusFilter === 'missing') {
      list = list.filter((s) => !s.isFound);
    }

    const q = supplierDirectoryQuery.trim();
    if (!q) return list;

    return list.filter((s) =>
      matchesBilingual(s.supplierName, q) ||
      (s.secondaryName && matchesBilingual(s.secondaryName, q)) ||
      s.locations.some(
        (loc) =>
          loc.boxCode.toLowerCase().includes(q.toLowerCase()) ||
          loc.boxTitle.includes(q) ||
          loc.envelopeLabel.includes(q) ||
          (loc.docNo && loc.docNo.includes(q))
      )
    );
  }, [suppliersDirectoryList, supplierStatusFilter, supplierDirectoryQuery]);

  // Supplier Audit KPI Summary Statistics
  const suppliersAuditStats = useMemo(() => {
    const total = suppliersDirectoryList.length;
    const found = suppliersDirectoryList.filter((s) => s.isFound).length;
    const missing = suppliersDirectoryList.filter((s) => !s.isFound).length;
    const totalArchivedFiles = suppliersDirectoryList.reduce((acc, s) => acc + s.totalFiles, 0);
    const coveragePercent = total > 0 ? Math.round((found / total) * 100) : 0;
    return { total, found, missing, totalArchivedFiles, coveragePercent };
  }, [suppliersDirectoryList]);

  // Export Complete Suppliers Audit Manifest to Excel / CSV
  const handleExportSuppliersAuditCsv = () => {
    const headers = [
      'م',
      'اسم المورد / الشركة',
      'الاسم التجاري / المعرب',
      'حالة التواجد بالصناديق (مطابقة)',
      'إجمالي الملفات بالأرشيف',
      'أرقام الصناديق المتواجد بها',
      'تفاصيل الأظرف والمستندات والسنوات',
    ];
    const rows = filteredSuppliersDirectory.map((s, idx) => {
      const statusText = s.isFound ? 'متواجد بالصناديق (أخضر)' : 'غير متواجد بالصناديق (أحمر)';
      const boxesStr = s.locations.map((l) => `${l.boxTitle} [${l.boxCode}]`).join(' | ');
      const envsStr = s.locations
        .map((l) => `${l.envelopeLabel} (سند: ${l.docNo || '—'} / شيك: ${l.checkNo || '—'} / سنة: ${l.year})`)
        .join(' | ');
      return [
        idx + 1,
        `"${s.supplierName.replace(/"/g, '""')}"`,
        `"${(s.secondaryName || '—').replace(/"/g, '""')}"`,
        `"${statusText}"`,
        s.totalFiles,
        `"${(boxesStr || 'لا يوجد').replace(/"/g, '""')}"`,
        `"${(envsStr || 'غير مؤرشف').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `كشف_حصر_وتدقيق_الموردين_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تصدير كشف تدقيق الموردين بالكامل بنجاح (Excel / CSV)');
  };

  // Per-Box Supplier Extraction Plans (خطة استخراج الموردين لكل صندوق)
  const boxExtractionPlans = useMemo(() => {
    return boxes.map((box) => {
      const requiredFiles = box.files.filter((f) =>
        MASTER_USER_SUPPLIERS.some((uSup) => matchesBilingual(f.supplierName, uSup))
      );
      const otherFiles = box.files.filter((f) =>
        !MASTER_USER_SUPPLIERS.some((uSup) => matchesBilingual(f.supplierName, uSup))
      );
      return {
        box,
        requiredFiles,
        otherFiles,
        totalRequired: requiredFiles.length,
      };
    });
  }, [boxes]);

  const missingMasterSuppliers = useMemo(() => {
    const allArchived = boxes.flatMap((b) => b.files);
    return MASTER_USER_SUPPLIERS.filter(
      (uSup) => !allArchived.some((f) => matchesBilingual(f.supplierName, uSup))
    ).map((s) => {
      const bi = getSupplierBilingualInfo(s);
      return { name: s, secondary: bi.secondary };
    });
  }, [boxes]);

  const extractionSummaryStats = useMemo(() => {
    const boxesWithRequired = boxExtractionPlans.filter((p) => p.totalRequired > 0).length;
    const totalRequiredFiles = boxExtractionPlans.reduce((sum, p) => sum + p.totalRequired, 0);
    return {
      totalBoxes: boxes.length,
      boxesWithRequired,
      totalRequiredFiles,
      missingSuppliersCount: missingMasterSuppliers.length,
    };
  }, [boxes, boxExtractionPlans, missingMasterSuppliers]);

  const handleExportExtractionPlanCsv = () => {
    const headers = [
      'رقم الصندوق',
      'كود الصندوق',
      'عنوان الصندوق',
      'رقم الظرف / الملف',
      'اسم المورد المطلوب استخراجه',
      'رقم المستند',
      'رقم الشيك',
      'السنة',
      'ملاحظات',
    ];
    const rows: string[] = [];
    for (const plan of boxExtractionPlans) {
      for (const f of plan.requiredFiles) {
        rows.push([
          plan.box.id,
          plan.box.code,
          `"${plan.box.titleAr.replace(/"/g, '""')}"`,
          `"${f.envelopeLabel.replace(/"/g, '""')}"`,
          `"${f.supplierName.replace(/"/g, '""')}"`,
          `"${f.docNo.replace(/"/g, '""')}"`,
          `"${f.checkNo.replace(/"/g, '""')}"`,
          f.year,
          `"${f.notes.replace(/"/g, '""')}"`,
        ].join(','));
      }
    }
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `خطة_استخراج_الموردين_من_الصناديق_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تصدير خطة استخراج الموردين لكل صندوق بنجاح (Excel / CSV)');
  };

  // Active box object
  const activeBox = useMemo<ArchiveBox>(() => {
    return boxes.find((b) => b.id === selectedBoxId) || boxes[0] || ARCHIVE_BOXES[0];
  }, [boxes, selectedBoxId]);

  const printTargetBox = useMemo<ArchiveBox>(() => {
    return boxes.find((b) => b.id === printTargetBoxId) || activeBox;
  }, [boxes, printTargetBoxId, activeBox]);

  // Global Smart Search results with High-Precision Relevance Ranking
  const smartSearchResults = useMemo<FlattenedRecord[]>(() => {
    const q = globalSearchQuery.trim();
    if (!q) {
      return yearFilteredRecords.filter((rec) => {
        if (searchBoxFilter !== 'all' && rec.boxId !== searchBoxFilter) {
          return false;
        }
        return true;
      });
    }

    const scoredItems: FlattenedRecord[] = [];
    const extraTerms =
      aiSearchResult && aiSearchResult.query.trim().toLowerCase() === q.toLowerCase()
        ? (aiSearchResult.interpretedIntent.alternateSearchTerms || []).filter(Boolean)
        : [];

    for (const rec of yearFilteredRecords) {
      if (searchBoxFilter !== 'all' && rec.boxId !== searchBoxFilter) {
        continue;
      }
      const res = scoreArchiveRecord(rec, q);
      let bestScore = res.score;
      let isExact = res.isExactMatch;

      for (const term of extraTerms) {
        if (term && term.trim()) {
          const tRes = scoreArchiveRecord(rec, term.trim());
          if (tRes.score > bestScore) {
            bestScore = tRes.score;
            isExact = isExact || tRes.isExactMatch;
          }
        }
      }

      if (bestScore > 0) {
        scoredItems.push({
          ...rec,
          _searchScore: bestScore,
          _isExactMatch: isExact,
        });
      }
    }

    // Sort by highest relevance score first, then by box, then by fileNo
    scoredItems.sort((a, b) => {
      const diff = (b._searchScore || 0) - (a._searchScore || 0);
      if (diff !== 0) return diff;
      if (a.boxId !== b.boxId) return a.boxId - b.boxId;
      return a.fileNo - b.fileNo;
    });

    return scoredItems;
  }, [globalSearchQuery, yearFilteredRecords, searchBoxFilter, aiSearchResult]);

  // Dashboard inline preview search results (top 8 matches when typing on dashboard)
  const dashboardQuickResults = useMemo<FlattenedRecord[]>(() => {
    const q = globalSearchQuery.trim();
    if (!q) return [];
    return smartSearchResults.slice(0, 8);
  }, [globalSearchQuery, smartSearchResults]);

  // Intra-box or Same-Year search inside Box Management view
  const boxViewRecords = useMemo<FlattenedRecord[]>(() => {
    const q = intraBoxQuery.trim();
    const targetYear = yearFilter !== 'all' ? yearFilter : activeBox.primaryYear;

    const basePool: FlattenedRecord[] =
      intraSearchScope === 'current-box'
        ? allFlattenedRecords.filter(
            (r) => r.boxId === activeBox.id && (yearFilter === 'all' || r.year === yearFilter)
          )
        : allFlattenedRecords.filter((r) => r.year === targetYear);

    if (!q) return basePool;

    const scoredItems: FlattenedRecord[] = [];
    for (const rec of basePool) {
      const res = scoreArchiveRecord(rec, q);
      if (res.score > 0) {
        scoredItems.push({
          ...rec,
          _searchScore: res.score,
          _isExactMatch: res.isExactMatch,
        });
      }
    }

    // Sort by highest relevance score first
    scoredItems.sort((a, b) => {
      const diff = (b._searchScore || 0) - (a._searchScore || 0);
      if (diff !== 0) return diff;
      return a.fileNo - b.fileNo;
    });

    return scoredItems;
  }, [intraBoxQuery, intraSearchScope, activeBox, allFlattenedRecords, yearFilter]);

  // Filtered records for the dedicated focused scan viewer (only this box + search)
  const focusedBoxRecords = useMemo(() => {
    const q = intraBoxQuery.trim();
    if (!q) return activeBox.files;

    const scoredItems: Array<{ file: ArchiveFileRecord; score: number }> = [];
    for (const f of activeBox.files) {
      const res = scoreArchiveRecord(
        {
          ...f,
          boxTitle: activeBox.titleAr,
          boxCode: activeBox.code,
          boxId: activeBox.id,
        },
        q
      );
      if (res.score > 0) {
        scoredItems.push({ file: f, score: res.score });
      }
    }

    scoredItems.sort((a, b) => b.score - a.score || a.file.fileNo - b.file.fileNo);
    return scoredItems.map((x) => x.file);
  }, [activeBox, intraBoxQuery]);

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
    downloadStandaloneHtml(boxes);
    showToast('تم تحميل ملف HTML المستقل الكامل بنجاح');
  };

  const sectionTitles: Record<ActiveSection, string> = {
    dashboard: 'لوحة التحكم الرئيسية',
    search: 'البحث الذكي في الموردين والمستندات',
    boxes: `إدارة الصناديق · ${activeBox.titleAr}`,
    qrcodes: 'مركز رموز QR وطباعة ملصقات الباركود',
    suppliers: 'دليل الموردين الشامل وأماكن تواجدهم',
    'extraction-plan': 'خطة استخراج وتدقيق الموردين لكل صندوق',
  };

  const maxFilesInAnyBox = useMemo(
    () => Math.max(...boxes.map((b) => b.files.length), 1),
    [boxes]
  );

  if (isFocusedScanMode) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" dir="rtl">
        {/* Top Header for Mobile Scan Inspection */}
        <header className="no-print sticky top-0 z-30 bg-[#0B1426]/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex flex-col items-center justify-center font-mono-num font-black shrink-0 shadow-md">
              <span className="text-[9px] uppercase tracking-wider text-blue-200 font-bold">صندوق</span>
              <span className="text-lg leading-none font-black">{String(activeBox.id).padStart(2, '0')}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="font-display font-bold text-sm sm:text-base text-white truncate">
                  {activeBox.titleAr}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 shrink-0">
                  سنة {activeBox.primaryYear}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>{activeBox.files.length} ملف ومورد مؤرشف</span>
                {isCloudSynced && (
                  <span className="text-emerald-400 font-semibold text-[10px] flex items-center gap-1">
                    <Cloud className="w-3 h-3 text-emerald-400" />
                    <span>سحابي متزامن</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyBoxUrl(activeBox.id)}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors cursor-pointer"
              title="مشاركة رابط الصندوق"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsFocusedScanMode(false);
                const url = new URL(window.location.href);
                url.searchParams.delete('box');
                window.history.replaceState({}, '', url.toString());
              }}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span>لوحة التحكم الكاملة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Quick Box Switcher Bar */}
        <div className="no-print bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
            <Boxes className="w-4 h-4 text-blue-400" />
            <span className="text-[11px]">تبديل الصندوق:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const boxRecords = activeBox.files.map((f) => ({
                  ...f,
                  boxId: activeBox.id,
                  boxCode: activeBox.code,
                  boxTitle: activeBox.titleAr,
                  boxCategory: activeBox.categoryScope,
                }));
                handleExportCsv(boxRecords, `${activeBox.code}_Suppliers.csv`);
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="تصدير شيت إكسيل / CSV لأسماء الموردين في هذا الصندوق"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير إكسيل (CSV)</span>
            </button>
            <select
              value={activeBox.id}
              onChange={(e) => {
                const newId = Number(e.target.value);
                setSelectedBoxId(newId);
                setIntraBoxQuery('');
                const url = new URL(window.location.href);
                url.searchParams.set('box', String(newId));
                window.history.replaceState({}, '', url.toString());
              }}
              className="bg-slate-800 text-white border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.titleAr} ({b.files.length} ملف)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sticky Search Field for Instant Warehouse Lookup */}
        <div className="no-print sticky top-[57px] z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 shadow-md">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={intraBoxQuery}
              onChange={(e) => setIntraBoxQuery(e.target.value)}
              placeholder={`ابحث بالعربي أو English (مثل: دومتي / Domty، Image 1، الظرف 1، سند، شيك)...`}
              className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {intraBoxQuery && (
              <button
                type="button"
                onClick={() => setIntraBoxQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                aria-label="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-0.5">
            <span>
              عرض <strong className="text-white font-mono-num font-bold">{focusedBoxRecords.length}</strong> من إجمالي <strong className="text-white font-mono-num font-bold">{activeBox.files.length}</strong> مورد
            </span>
            {intraBoxQuery && (
              <span className="text-blue-400 font-medium truncate max-w-[150px]">
                تصفية: "{intraBoxQuery}"
              </span>
            )}
          </div>
        </div>

        {/* List of Files / Suppliers */}
        <main className="no-print flex-1 p-3.5 sm:p-4 max-w-2xl mx-auto w-full space-y-3 pb-24">
          {focusedBoxRecords.length === 0 ? (
            <div className="bg-slate-900/80 rounded-2xl p-7 text-center border border-slate-800 my-4">
              <Search className="w-10 h-10 text-slate-500 mx-auto mb-2.5 opacity-60" />
              <h3 className="font-bold text-white text-sm mb-1">
                لا توجد نتائج مطابقة
              </h3>
              <p className="text-slate-400 text-xs mb-3.5">
                لم يتم العثور على أي مورد أو سند يطابق "{intraBoxQuery}" في هذا الصندوق.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIntraBoxQuery('')}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  مسح البحث وعرض كل الملفات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearchQuery(intraBoxQuery);
                    setIsFocusedScanMode(false);
                    setActiveSection('search');
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  البحث في كل الصناديق الأخرى
                </button>
              </div>
            </div>
          ) : (
            focusedBoxRecords.map((file, idx) => {
              const biInfo = getSupplierBilingualInfo(file.supplierName);
              const fileBi = getBilingualFileLabel(file.envelopeLabel, file.fileNo);
              return (
              <div
                key={file.fileNo}
                className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 rounded-2xl p-3.5 transition-all shadow-xs"
              >
                <div className="flex items-start justify-between gap-2.5 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-300 border border-blue-500/30 font-mono-num font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-sm sm:text-base text-white leading-snug break-words">
                        <HighlightMatch text={file.supplierName} query={intraBoxQuery} />
                      </h3>
                      {biInfo.secondary && (
                        <div className="text-[11px] text-blue-300 font-semibold mt-0.5">
                          <HighlightMatch text={biInfo.secondary} query={intraBoxQuery} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 text-xs font-bold border border-amber-500/20 font-mono-num whitespace-nowrap">
                      {fileBi.ar}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                      {fileBi.en}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                  <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-0.5">رقم السند:</div>
                    <div className="font-mono-num font-bold text-slate-200 truncate flex items-center justify-between">
                      <span className="text-xs">
                        <HighlightMatch text={file.docNo || '—'} query={intraBoxQuery} />
                      </span>
                      {file.docNo && file.docNo !== '—' && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(file.docNo);
                            showToast(`تم نسخ رقم السند: ${file.docNo}`);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                          title="نسخ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-0.5">رقم الشيك:</div>
                    <div className="font-mono-num font-bold text-slate-200 truncate flex items-center justify-between">
                      <span className="text-xs">
                        <HighlightMatch text={file.checkNo || '—'} query={intraBoxQuery} />
                      </span>
                      {file.checkNo && file.checkNo !== '—' && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(file.checkNo);
                            showToast(`تم نسخ رقم الشيك: ${file.checkNo}`);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                          title="نسخ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {file.notes && (
                  <div className="mt-2 text-[11px] text-slate-300 bg-slate-950/50 rounded-xl p-2 border border-slate-800/60">
                    <span className="text-slate-400 font-medium">ملاحظات: </span>
                    {file.notes}
                  </div>
                )}
              </div>
              );
            })
          )}

          {/* Bottom Return to Full Dashboard Banner */}
          <div className="pt-3 pb-8 text-center">
            <button
              type="button"
              onClick={() => {
                setIsFocusedScanMode(false);
                const url = new URL(window.location.href);
                url.searchParams.delete('box');
                window.history.replaceState({}, '', url.toString());
              }}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <span>الخروج والانتقال إلى لوحة التحكم الكاملة وإدارة كل الصناديق</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="no-print fixed bottom-5 left-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Dedicated Print Media Surface */}
        <PrintSheet
          mode={printMode}
          boxes={printMode === 'extraction-plan' ? boxes : yearFilteredBoxes}
          activeBox={printTargetBox}
          getBoxUrl={getBoxDirectUrl}
          suppliersList={filteredSuppliersDirectory}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row overflow-x-hidden" dir="rtl">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="no-print fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Architectural Dark/Blue RTL Sidebar */}
      <aside
        className={`no-print fixed lg:sticky top-0 right-0 z-[80] h-screen w-[290px] max-w-[85vw] bg-[#0B1426] text-slate-200 flex flex-col justify-between border-l border-slate-800/90 shadow-2xl shrink-0 transition-transform duration-200 ease-out ${
          mobileSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Brand Header */}
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-white text-base tracking-tight leading-snug">
                  Smart Docs
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>سحابة نشطة ومزامنة</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 text-xs font-bold border border-slate-700 cursor-pointer"
              aria-label="إغلاق القائمة"
            >
              <span>إغلاق</span>
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
              <span className="text-xs font-mono-num opacity-80">{boxes.length}</span>
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

            <button
              type="button"
              onClick={() => {
                setActiveSection('suppliers');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'suppliers'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Building2 className="w-4 h-4 shrink-0" />
                <span>دليل الموردين الشامل</span>
              </span>
              <span className="text-xs font-mono-num opacity-80">{suppliersDirectoryList.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('extraction-plan');
                setMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'extraction-plan'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <FileText className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>خطة استخراج الصناديق</span>
              </span>
              <span className="text-xs font-mono-num opacity-80">1–13</span>
            </button>
          </div>

          {/* Direct Box Index in Sidebar */}
          <div className="px-3.5 pt-3 pb-4 border-t border-slate-800/80 flex-1 overflow-y-auto">
            <div className="px-2 pb-2 text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>فهرس الصناديق السريع</span>
              <span className="font-mono-num">1–{boxes.length}</span>
            </div>
            <div className="space-y-0.5">
              {boxes.map((box) => {
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

            {/* Quick Create Box from Sidebar */}
            <button
              type="button"
              onClick={() => {
                setIsCreateBoxModalOpen(true);
                setMobileSidebarOpen(false);
              }}
              className="w-full mt-3 py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إنشاء صندوق جديد</span>
            </button>

            {boxes.length !== ARCHIVE_BOXES.length && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="w-full mt-1.5 py-1 px-2 text-[11px] text-slate-400 hover:text-rose-400 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>استعادة الافتراضي (1-13)</span>
              </button>
            )}
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
              onClick={() => setIsAiSettingsModalOpen(true)}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>إعدادات الذكاء الاصطناعي ومفتاح API ⚙️</span>
            </button>
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
        <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4 max-w-full overflow-hidden">
          {/* Zone 1: Mobile Menu + Contextual Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-sm sm:text-base lg:text-lg text-slate-900 truncate">
                  {sectionTitles[activeSection]}
                </h1>
                {/* Cloud Sync Status Indicator */}
                <div className="shrink-0">
                  {isSyncing ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                      <span className="hidden sm:inline">جاري المزامنة...</span>
                    </span>
                  ) : isCloudSynced ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                      title={`متصل بقاعدة البيانات السحابية - آخر مزامنة: ${lastSyncTime}`}
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">سحابي متصل</span>
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"
                      title="يعمل حالياً بوضع التخزين المؤقت (محلي)"
                    >
                      <Cloud className="w-3 h-3 text-slate-400" />
                      <span className="hidden sm:inline">محلي</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
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
            {dynamicYears.map((yr) => (
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

          {/* Zone 3: Primary Action & Create Box */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile-Only Action Buttons (Compact icons - Zero overflow!) */}
            <div className="flex sm:hidden items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFocusedScanMode(true)}
                className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center cursor-pointer shadow-2xs"
                title="فحص الصندوق الحالي بنمط الجوال المخصص للباركود"
                aria-label="فحص الصندوق"
              >
                <Smartphone className="w-4 h-4 text-indigo-600" />
              </button>

              <button
                type="button"
                onClick={() => setIsCreateBoxModalOpen(true)}
                className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center cursor-pointer shadow-xs"
                title="إنشاء صندوق جديد"
                aria-label="إنشاء صندوق جديد"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Desktop / Tablet Full Action Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFocusedScanMode(true)}
                className="px-2.5 sm:px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                title="فحص الصندوق الحالي بنمط الجوال المخصص للباركود"
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                <span>فحص الصندوق</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateBoxModalOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء صندوق جديد</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAiImageScannerOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                title="فحص مستند أو فاتورة بالصورة والذكاء الاصطناعي"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>فحص صورة / فاتورة 📷</span>
              </button>

              <button
                type="button"
                onClick={() => triggerPrint('all-stickers')}
                className="px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة ملصقات كل الصناديق ({boxes.length})</span>
              </button>
            </div>
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

        {/* QR Scan Deep-Link Contextual Banner - Enhanced for Mobile & Tablet Warehouse Inspection */}
        {openedViaQrBanner !== null && activeSection === 'boxes' && (
          <div className="no-print mx-3 sm:mx-6 mt-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xl border border-blue-900/50 relative overflow-hidden">
            {/* Background watermark */}
            <div className="absolute -left-6 -bottom-6 opacity-10 pointer-events-none">
              <QrCode className="w-36 h-36 text-white" />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center font-mono-num font-black shrink-0 shadow-lg border border-blue-400/30">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-blue-200">صندوق</span>
                  <span className="text-2xl sm:text-3xl leading-none">{String(activeBox.id).padStart(2, '0')}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      فحص فوري عبر الباركود والهاتف
                    </span>
                    <span className="text-xs font-mono-num text-slate-300">
                      {activeBox.code} · سنة {activeBox.primaryYear}
                    </span>
                  </div>
                  <h1 className="font-display font-extrabold text-lg sm:text-xl text-white">
                    {activeBox.titleAr} — {activeBox.subtitleAr}
                  </h1>
                  <p className="text-xs text-slate-300">
                    إجمالي المستندات والملفات المؤرشفة:{' '}
                    <strong className="text-amber-400 font-mono-num text-sm font-bold">
                      {activeBox.files.length} ملف
                    </strong>{' '}
                    · {activeBox.categoryScope}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSingleModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة مورد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: activeBox.titleAr,
                        text: `محتويات ${activeBox.titleAr} - ${activeBox.files.length} ملف`,
                        url: getBoxDirectUrl(activeBox.id),
                      }).catch(() => {});
                    } else {
                      handleCopyBoxUrl(activeBox.id);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="مشاركة أو نسخ الرابط"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>مشاركة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpenedViaQrBanner(null)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="إغلاق التنبيه"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Viewport Sections */}
        <main className="no-print flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6 pb-24 lg:pb-8">
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
                      يدعم البحث المزدوج بالعربية أو الإنجليزية (عربي ⇄ English) والبحث بأرقام السندات والشيكات
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTriggerAiSearch();
                      }
                    }}
                    placeholder="ابحث بالعربي أو English أو اسأل بالعامية (مثل: فين شيكات دومتي وبتروتريد؟ أو أظرف 2017)..."
                    className="w-full pr-11 pl-44 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 transition-colors shadow-2xs"
                  />
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {globalSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setGlobalSearchQuery('');
                          setAiSearchResult(null);
                        }}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-200/70 rounded-md cursor-pointer"
                      >
                        مسح
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleVoiceSearch}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                      title="بحث صوتي مباشر (تحدث بالصوت)"
                      aria-label="بحث صوتي"
                    >
                      <Mic className="w-4 h-4 text-emerald-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAiSearch()}
                      disabled={isAiSearching || !globalSearchQuery.trim()}
                      className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                      title="تحليل الاستفسار بالذكاء الاصطناعي المجاني (Gemini 3.8 Flash)"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAiSearching ? 'animate-spin' : ''}`} />
                      <span>{isAiSearching ? 'جاري التحليل...' : 'بحث ذكي AI'}</span>
                    </button>
                  </div>
                </div>

                {/* AI Insights Card on Dashboard */}
                {aiSearchResult && (
                  <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-blue-50/90 border border-indigo-200/80 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                          <Sparkles className="w-4 h-4 animate-pulse" />
                        </div>
                        <span>مساعد البحث الذكي (Gemini 3.8 Flash AI)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                          مجاني وسريع
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiSearchResult(null)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
                        title="إغلاق التفسير"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-2.5 text-sm text-slate-800 font-medium leading-relaxed bg-white/70 p-3 rounded-xl border border-indigo-100/80">
                      {aiSearchResult.interpretedIntent.directAnswerAr || 'تم تحليل استفسارك بدقة.'}
                    </div>

                    {/* Suggested Quick Queries */}
                    {aiSearchResult.interpretedIntent.suggestedQueries &&
                      aiSearchResult.interpretedIntent.suggestedQueries.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-indigo-100/60">
                          <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" />
                            اقتراحات بحث ذات صلة:
                          </span>
                          {aiSearchResult.interpretedIntent.suggestedQueries.map((sq, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setGlobalSearchQuery(sq);
                                handleTriggerAiSearch(sq);
                              }}
                              className="px-2.5 py-1 text-xs bg-white text-indigo-800 hover:bg-indigo-600 hover:text-white rounded-lg border border-indigo-200 font-medium shadow-2xs transition-all cursor-pointer"
                            >
                              {sq}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                )}

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
                                  {(() => {
                                    const fileBi = getBilingualFileLabel(item.envelopeLabel, item.fileNo);
                                    return (
                                      <div>
                                        <div className="font-semibold text-slate-800">{fileBi.ar}</div>
                                        <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{fileBi.en}</div>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                  <div>{item.supplierName}</div>
                                  {(() => {
                                    const bi = getSupplierBilingualInfo(item.supplierName);
                                    return bi.secondary ? (
                                      <div className="text-[11px] text-blue-600 font-normal">
                                        {bi.secondary}
                                      </div>
                                    ) : null;
                                  })()}
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

              {/* Complete Directory Grid of Boxes 1 - N */}
              <section className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">
                      دليل الصناديق المؤرشفة ({yearFilteredBoxes.length} صندوق)
                    </h2>
                    <span className="text-xs text-slate-500">
                      مرتبة حسب أرقام الصناديق الرسمية والجديدة
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateBoxModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إنشاء صندوق جديد</span>
                  </button>
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
                            onClick={() => setBoxToEdit(box)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 text-slate-600 hover:text-amber-600 cursor-pointer"
                            title="تحرير بيانات الصندوق"
                            aria-label={`تحرير بيانات ${box.titleAr}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleTriggerAiSearch();
                      }
                    }}
                    placeholder="ابحث بالعربي أو الإنجليزي أو اسأل الذكاء الاصطناعي (مثل: فين شيكات دومتي أو بتروتريد؟)..."
                    className="w-full pr-10 pl-40 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-blue-600 shadow-2xs"
                    autoFocus
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {globalSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setGlobalSearchQuery('');
                          setAiSearchResult(null);
                        }}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900 bg-slate-200/70 rounded cursor-pointer"
                      >
                        مسح
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleVoiceSearch}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                      title="بحث صوتي مباشر"
                      aria-label="بحث صوتي"
                    >
                      <Mic className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAiSearch()}
                      disabled={isAiSearching || !globalSearchQuery.trim()}
                      className="px-2.5 py-1.2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                      title="تحليل بالذكاء الاصطناعي المجاني (Gemini 3.8 Flash)"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAiSearching ? 'animate-spin' : ''}`} />
                      <span>{isAiSearching ? 'جاري...' : 'بحث AI'}</span>
                    </button>
                  </div>
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
                    <option value="all">كل الصناديق ({boxes.length} صندوق)</option>
                    {boxes.map((b) => (
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
                    {dynamicYears.map((y) => (
                      <option key={y} value={y}>
                        سنة {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Bilingual Search Suggestion Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-xs text-slate-500 font-medium ml-1">اقتراحات بحث سريعة (عربي ⇄ English):</span>
                {[
                  { label: 'دومتي / Domty', q: 'دومتي' },
                  { label: 'أميكو / Amico', q: 'Amico' },
                  { label: 'أرامكس / Aramex', q: 'أرامكس' },
                  { label: 'بتروتريد / Petrotrade', q: 'Petrotrade' },
                  { label: 'الظرف 1 / Image 1', q: 'Image 1' },
                  { label: 'الظرف 2 / Image 2', q: 'الظرف 2' },
                  { label: 'سنة 2017', q: '2017' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setGlobalSearchQuery(chip.q)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 transition-colors cursor-pointer border border-slate-200/60"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* AI Insights Card on Search Page */}
              {aiSearchResult && (
                <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-blue-50/90 border border-indigo-200/80 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Sparkles className="w-4 h-4 animate-pulse" />
                      </div>
                      <span>مساعد البحث الذكي (Gemini 3.8 Flash AI)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                        مجاني وسريع
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiSearchResult(null)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
                      title="إغلاق التفسير"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 text-sm text-slate-800 font-medium leading-relaxed bg-white/70 p-3 rounded-xl border border-indigo-100/80">
                    {aiSearchResult.interpretedIntent.directAnswerAr || 'تم تحليل استفسارك بدقة.'}
                  </div>

                  {/* Suggested Quick Queries */}
                  {aiSearchResult.interpretedIntent.suggestedQueries &&
                    aiSearchResult.interpretedIntent.suggestedQueries.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-indigo-100/60">
                        <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3" />
                          اقتراحات بحث ذات صلة:
                        </span>
                        {aiSearchResult.interpretedIntent.suggestedQueries.map((sq, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setGlobalSearchQuery(sq);
                              handleTriggerAiSearch(sq);
                            }}
                            className="px-2.5 py-1 text-xs bg-white text-indigo-800 hover:bg-indigo-600 hover:text-white rounded-lg border border-indigo-200 font-medium shadow-2xs transition-all cursor-pointer"
                          >
                            {sq}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              )}

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
                            {(() => {
                              const fileBi = getBilingualFileLabel(rec.envelopeLabel, rec.fileNo);
                              return (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono-num text-slate-400">#{rec.fileNo}</span>
                                    <span className="font-semibold text-slate-800">{fileBi.ar}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5" dir="ltr">
                                    {fileBi.en}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>
                                <HighlightMatch text={rec.supplierName} query={globalSearchQuery} />
                              </span>
                              {rec._isExactMatch && globalSearchQuery.trim() !== '' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                  ★ تطابق تام
                                </span>
                              )}
                            </div>
                            {(() => {
                              const bi = getSupplierBilingualInfo(rec.supplierName);
                              return bi.secondary ? (
                                <div className="text-[11px] text-blue-600 font-normal">
                                  <HighlightMatch text={bi.secondary} query={globalSearchQuery} />
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-blue-700 whitespace-nowrap">
                            <HighlightMatch text={rec.docNo} query={globalSearchQuery} />
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-slate-700 whitespace-nowrap">
                            <HighlightMatch text={rec.checkNo} query={globalSearchQuery} />
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                            {rec.year}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                            <HighlightMatch text={rec.notes || ''} query={globalSearchQuery} />
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
              {/* Box Selector Strip (1 to N) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      اختر الصندوق لاستعراض محتوياته الكاملة (الصناديق 1 إلى {boxes.length}):
                    </span>
                    <span className="text-xs text-slate-400 font-mono-num">
                      إجمالي {boxes.length} صندوق · {allFlattenedRecords.length} ملف
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateBoxModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إنشاء صندوق جديد</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {boxes.map((box) => {
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

                  {/* Actions for Active Box: Structured for Mobile & Desktop */}
                  <div className="w-full lg:w-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddSingleModalOpen(true)}
                        className="col-span-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>+ مورد واحد</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsBatchAddModalOpen(true)}
                        className="col-span-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
                      >
                        <ClipboardPaste className="w-4 h-4 shrink-0" />
                        <span>+ إضافة بالنسخ</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBoxToEdit(activeBox)}
                        className="col-span-1 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>تحرير الصندوق</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQrModalBox(activeBox)}
                        className="col-span-1 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <QrCode className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>QR والباركود</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerPrint('single-sticker', activeBox.id)}
                        className="col-span-1 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4 shrink-0" />
                        <span>طباعة الملصق</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRenumberFiles(activeBox.id)}
                        className="col-span-1 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        title="إعادة ترقيم ملفات الصندوق تسلسلياً (1 إلى N)"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>إعادة الترقيم</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerPrint('box-manifest', activeBox.id)}
                        className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>كشف المحتويات</span>
                      </button>
                    </div>
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
                          ? `ابحث بالعربي أو English (مثل: دومتي / Domty، Image 1، الظرف 1، سند) في ${activeBox.titleAr}...`
                          : `ابحث بالعربي أو English في جميع صناديق سنة ${
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

                {/* Count & Export & Mobile View Switcher Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pb-1">
                  <div className="flex items-center gap-2">
                    <span>
                      المعروض حالياً:{' '}
                      <strong className="font-mono-num text-slate-900">{boxViewRecords.length}</strong>{' '}
                      ملف
                      {intraSearchScope === 'same-year'
                        ? ` عبر جميع صناديق سنة ${
                            yearFilter !== 'all' ? yearFilter : activeBox.primaryYear
                          }`
                        : ` في ${activeBox.titleAr}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View mode switcher: Cards (Mobile/Tablet) vs Table (Desktop) */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setBoxViewMode('cards')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          boxViewMode === 'cards'
                            ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="عرض البطاقات الذكية المحسنة للهواتف والأجهزة اللوحية"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>بطاقات الهواتف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBoxViewMode('table')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          boxViewMode === 'table'
                            ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="عرض الجدول المكتبي الكامل"
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>جدول كامل</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleExportCsv(boxViewRecords, `${activeBox.code}_Manifest.csv`)
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-blue-600 font-medium flex items-center gap-1 cursor-pointer"
                      title="تصدير السجلات كملف CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تصدير CSV</span>
                    </button>
                  </div>
                </div>

                {/* Box Manifest: Empty State */}
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
                ) : boxViewMode === 'cards' ? (
                  /* =========================================================
                     1. MOBILE & TABLET OPTIMIZED CARDS VIEW
                     High-contrast, large touch targets, no horizontal scroll
                     ========================================================= */
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {boxViewRecords.map((row) => {
                      const isHighlighted =
                        intraSearchScope === 'current-box' && highlightedFileNo === row.fileNo;
                      const fileBi = getBilingualFileLabel(row.envelopeLabel, row.fileNo);
                      return (
                        <div
                          key={`${row.boxId}-${row.fileNo}`}
                          className={`rounded-2xl border transition-all p-4 space-y-3 relative flex flex-col justify-between ${
                            row.isChecked
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40 shadow-xs'
                              : isHighlighted
                              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 shadow-md'
                              : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs'
                          }`}
                        >
                          {/* Card Header Strip */}
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold text-xs font-mono-num border border-blue-200/60 shadow-2xs">
                                {fileBi.ar}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px] border border-slate-200" dir="ltr">
                                {fileBi.en}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleRecordCheck(row.boxId, row.fileNo)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                  row.isChecked
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800'
                                }`}
                                title="التعليم على المورد (تم العثور عليه في الأرشيف المادي)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{row.isChecked ? 'تم العثور عليه ✓' : 'تعليم'}</span>
                              </button>
                              {intraSearchScope === 'same-year' && (
                                <button
                                  type="button"
                                  onClick={() => navigateToBox(row.boxId, row.fileNo)}
                                  className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                >
                                  {row.boxTitle}
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] font-mono-num text-slate-400">
                              ملف #{row.fileNo}
                            </span>
                          </div>



                          {/* Supplier Name - Bold & High Contrast with Bilingual Display */}
                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400 font-medium block">
                              اسم المورد / الشركة:
                            </span>
                            <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-snug break-words flex items-center justify-between gap-2">
                              <span>
                                <HighlightMatch text={row.supplierName} query={intraBoxQuery} />
                              </span>
                              {row._isExactMatch && intraBoxQuery.trim() !== '' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                  ★ تطابق تام
                                </span>
                              )}
                            </h2>
                            {(() => {
                              const bi = getSupplierBilingualInfo(row.supplierName);
                              return bi.secondary ? (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-xs font-semibold border border-blue-200/60 mt-0.5">
                                  <span className="text-[10px] text-blue-500 font-normal">الاسم المترجم:</span>
                                  <span>
                                    <HighlightMatch text={bi.secondary} query={intraBoxQuery} />
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </div>

                          {/* Document and Check Badges with 1-Tap Copy */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between gap-1.5">
                              <div className="min-w-0">
                                <span className="text-[10px] text-slate-400 block font-semibold">
                                  رقم المستند
                                </span>
                                <span className="font-mono-num text-xs font-bold text-blue-800 truncate block">
                                  <HighlightMatch text={row.docNo} query={intraBoxQuery} />
                                </span>
                              </div>
                              {row.docNo !== '—' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(row.docNo);
                                    showToast(`تم نسخ رقم المستند: ${row.docNo}`);
                                  }}
                                  className="text-slate-400 hover:text-blue-700 p-1 cursor-pointer rounded hover:bg-blue-50"
                                  title="نسخ رقم المستند"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between gap-1.5">
                              <div className="min-w-0">
                                <span className="text-[10px] text-slate-400 block font-semibold">
                                  رقم الشيك
                                </span>
                                <span className="font-mono-num text-xs font-bold text-slate-700 truncate block">
                                  <HighlightMatch text={row.checkNo} query={intraBoxQuery} />
                                </span>
                              </div>
                              {row.checkNo !== '—' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(row.checkNo);
                                    showToast(`تم نسخ رقم الشيك: ${row.checkNo}`);
                                  }}
                                  className="text-slate-400 hover:text-slate-800 p-1 cursor-pointer rounded hover:bg-slate-200/60"
                                  title="نسخ رقم الشيك"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          {row.notes && row.notes !== '—' && (
                            <div className="text-xs text-slate-600 bg-amber-50/60 border border-amber-200/60 rounded-xl px-3 py-2 flex items-start gap-2">
                              <span className="text-amber-800 font-bold text-[11px] shrink-0">
                                ملاحظات:
                              </span>
                              <span className="leading-relaxed line-clamp-2">{row.notes}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* =========================================================
                     2. FULL DESKTOP TABLE VIEW
                     ========================================================= */
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
                          <th className="px-3 py-3 font-semibold text-center w-24 whitespace-nowrap">إجراءات</th>
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
                                row.isChecked
                                  ? 'bg-emerald-50/80 hover:bg-emerald-100/70 font-medium text-emerald-950'
                                  : isHighlighted
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
                                {(() => {
                                  const fileBi = getBilingualFileLabel(row.envelopeLabel, row.fileNo);
                                  return (
                                    <div>
                                      <span className="font-semibold text-slate-800">{fileBi.ar}</span>
                                      <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                                        {fileBi.en}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-slate-900">
                                <div className="flex items-center gap-1.5">
                                  <span>
                                    <HighlightMatch text={row.supplierName} query={intraBoxQuery} />
                                  </span>
                                  {row._isExactMatch && intraBoxQuery.trim() !== '' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                      ★ تطابق تام
                                    </span>
                                  )}
                                </div>
                                {(() => {
                                  const bi = getSupplierBilingualInfo(row.supplierName);
                                  return bi.secondary ? (
                                    <div className="text-[11px] text-blue-600 font-normal">
                                      <HighlightMatch text={bi.secondary} query={intraBoxQuery} />
                                    </div>
                                  ) : null;
                                })()}
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-blue-700 whitespace-nowrap">
                                <HighlightMatch text={row.docNo} query={intraBoxQuery} />
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-slate-700 whitespace-nowrap">
                                <HighlightMatch text={row.checkNo} query={intraBoxQuery} />
                              </td>
                              <td className="px-4 py-2.5 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                                {row.year}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-500">
                                <HighlightMatch text={row.notes || ''} query={intraBoxQuery} />
                              </td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRecordCheck(row.boxId, row.fileNo)}
                                    className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                      row.isChecked
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800'
                                    }`}
                                    title="تعليم أو إزالة التعليم"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{row.isChecked ? 'تم ✓' : 'تعليم'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRecordToEdit({
                                        boxId: row.boxId,
                                        boxTitle: row.boxTitle,
                                        record: {
                                          fileNo: row.fileNo,
                                          envelopeLabel: row.envelopeLabel,
                                          supplierName: row.supplierName,
                                          docNo: row.docNo,
                                          checkNo: row.checkNo,
                                          year: row.year,
                                          notes: row.notes,
                                        },
                                      })
                                    }
                                    title="تعديل بيانات هذا المورد"
                                    className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRecord(row.boxId, row.fileNo)}
                                    title="حذف هذا المورد من الصندوق"
                                    className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
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

          {/* =========================================================
              5. COMPREHENSIVE SUPPLIERS DIRECTORY & AUDIT (دليل وتدقيق الموردين)
             ========================================================= */}
          {activeSection === 'suppliers' && (
            <div className="space-y-6">
              {/* Header with Print & Export Actions */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
                      مطابقة وتدقيق الأرشيف
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      الصناديق من 1 إلى 13
                    </span>
                  </div>
                  <h2 className="font-display font-black text-xl sm:text-2xl text-slate-950">
                    دليل وتدقيق قائمة الموردين والشركات
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                    حصر شامل لجميع الموردين المستخرجين من المستندات ومطابقة أماكن تواجدهم الفعلية داخل الصناديق، مع تمييز المورد المتواجد بـ <strong className="text-emerald-700 font-bold">علامة خضراء (✓)</strong> والمورد غير المتواجد بـ <strong className="text-rose-700 font-bold">علامة حمراء (✕)</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => triggerPrint('suppliers-audit')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    title="طباعة كشف حصر وتدقيق الموردين بالكامل على ورق A4 رسمي"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الكشف بالكامل (A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportSuppliersAuditCsv}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    title="تنزيل شيت إكسيل / CSV يحمل أسماء الموردين وحالة تواجدهم وصناديقهم"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير شيت إكسيل (CSV)</span>
                  </button>
                </div>
              </section>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Total Suppliers */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
                    <span>إجمالي الموردين بالكشف</span>
                    <Building2 className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-slate-900">
                      {suppliersAuditStats.total}
                    </span>
                    <span className="text-xs text-slate-500">مورد / شركة</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    مستخرجون من بيانات المستندات
                  </div>
                </div>

                {/* Found Suppliers (Green) */}
                <div className="bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>متواجدون بالصناديق</span>
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-200 animate-pulse" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-emerald-700">
                      {suppliersAuditStats.found}
                    </span>
                    <span className="text-xs font-bold text-emerald-800">مورد مؤكد (أخضر)</span>
                  </div>
                  <div className="mt-2 text-[11px] text-emerald-700 font-semibold flex items-center gap-1 font-mono-num">
                    <span>مؤرشف في {suppliersAuditStats.totalArchivedFiles} ملف داخل الصناديق</span>
                  </div>
                </div>

                {/* Missing Suppliers (Red) */}
                <div className="bg-rose-50/60 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div className="text-xs font-bold text-rose-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>غير متواجدين (مفقود)</span>
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-200" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-rose-700">
                      {suppliersAuditStats.missing}
                    </span>
                    <span className="text-xs font-bold text-rose-800">مورد غير مؤرشف (أحمر)</span>
                  </div>
                  <div className="mt-2 text-[11px] text-rose-700 font-semibold">
                    غير مسجلين في الصناديق 1 إلى 13
                  </div>
                </div>

                {/* Audit Coverage % */}
                <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                  <div className="text-xs font-semibold text-blue-800 flex items-center justify-between">
                    <span>نسبة المطابقة والتغطية</span>
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-blue-700">
                      {suppliersAuditStats.coveragePercent}%
                    </span>
                    <span className="text-xs text-blue-700 font-medium">مكتمل بالأرشيف</span>
                  </div>
                  <div className="mt-2 w-full bg-blue-200/70 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${suppliersAuditStats.coveragePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Filter Tabs and Search Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
                {/* Status & Scope Filter Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Scope Selector: Requested (69) vs All Archive */}
                    <div className="bg-slate-100 p-0.5 rounded-xl flex items-center gap-1 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setSupplierScopeFilter('requested')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          supplierScopeFilter === 'requested'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        كشف المستندات المطلوبة (69 مورد)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupplierScopeFilter('allArchive')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          supplierScopeFilter === 'allArchive'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        سجلات الأرشيف الكاملة
                      </button>
                    </div>

                    <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

                    <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5 ml-1">
                      <Filter className="w-3.5 h-3.5 text-slate-500" />
                      <span>الحالة:</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSupplierStatusFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        supplierStatusFilter === 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>الكل</span>
                      <span className="font-mono-num px-1.5 py-0.2 rounded-md bg-white/20 text-[11px]">
                        {suppliersAuditStats.total}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierStatusFilter('found')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        supplierStatusFilter === 'found'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>متواجد (أخضر)</span>
                      <span className="font-mono-num px-1.5 py-0.2 rounded-md bg-white/30 text-[11px]">
                        {suppliersAuditStats.found}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierStatusFilter('missing')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        supplierStatusFilter === 'missing'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>غير متواجد (أحمر)</span>
                      <span className="font-mono-num px-1.5 py-0.2 rounded-md bg-white/30 text-[11px]">
                        {suppliersAuditStats.missing}
                      </span>
                    </button>
                  </div>

                  <div className="mr-auto text-xs text-slate-500 font-mono-num">
                    المعروض: <strong>{filteredSuppliersDirectory.length}</strong> مورد
                  </div>
                </div>

                {/* Instant Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={supplierDirectoryQuery}
                    onChange={(e) => setSupplierDirectoryQuery(e.target.value)}
                    placeholder="ابحث عن اسم المورد بالعربي أو الإنجليزي (مثل: دومتي، Amico، بيروت، كوانتا، ريتش، شيلار)..."
                    className="w-full pr-10 pl-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-blue-600 shadow-xs transition-colors"
                  />
                  {supplierDirectoryQuery && (
                    <button
                      type="button"
                      onClick={() => setSupplierDirectoryQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300 rounded-lg cursor-pointer transition-colors"
                    >
                      مسح البحث
                    </button>
                  )}
                </div>
              </div>

              {/* Directory & Audit Cards Grid */}
              {filteredSuppliersDirectory.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                  <Search className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="font-display font-bold text-slate-800 text-base">
                    لا توجد نتائج مطابقة لبحثك
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    لم نتمكن من العثور على أي مورد يطابق &quot;{supplierDirectoryQuery}&quot; في وضع التصفية الحالي.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierDirectoryQuery('');
                      setSupplierStatusFilter('all');
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
                  >
                    إعادة ضبط البحث والتصفية
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredSuppliersDirectory.map((item, idx) => {
                    const isFound = item.isFound;

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 border-2 ${
                          isFound
                            ? 'bg-white border-emerald-300/90 shadow-xs hover:border-emerald-400 hover:shadow-md'
                            : 'bg-rose-50/25 border-rose-300/90 shadow-xs hover:border-rose-400 hover:shadow-md'
                        }`}
                      >
                        {/* Top: Header, Status Badge (Green / Red) */}
                        <div className="space-y-3">
                          {/* Status Badge & Sequence */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            {isFound ? (
                              <div className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>متواجد في الصناديق (أخضر)</span>
                              </div>
                            ) : (
                              <div className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>غير متواجد بالصناديق (أحمر)</span>
                              </div>
                            )}

                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px] font-bold">
                              #{idx + 1}
                            </span>
                          </div>

                          {/* Supplier Names */}
                          <div className="space-y-1">
                            <h3 className="font-display font-extrabold text-base text-slate-950 leading-snug">
                              {item.supplierName}
                            </h3>
                            {item.secondaryName && (
                              <div className="text-xs text-blue-700 font-semibold flex items-center gap-1">
                                <span className="text-[10px] text-slate-400 font-normal">الاسم التجاري:</span>
                                <span>{item.secondaryName}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom: Locations or Missing Alert */}
                        <div className="space-y-2.5 pt-3 mt-3 border-t border-slate-100">
                          {isFound ? (
                            <>
                              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-1 text-emerald-800">
                                  <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>أماكن التواجد الفعلية بالأرشيف:</span>
                                </span>
                                <span className="font-mono-num font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md text-[11px]">
                                  {item.totalFiles} ملف
                                </span>
                              </div>

                              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {item.locations.map((loc, lIdx) => (
                                  <div
                                    key={lIdx}
                                    className="bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors"
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="text-xs font-bold text-slate-900 truncate">
                                        {loc.boxTitle} ({loc.boxCode})
                                      </div>
                                      <div className="text-[11px] text-slate-600 font-mono flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-800">{loc.envelopeLabel}</span>
                                        {loc.docNo && loc.docNo !== '—' && (
                                          <span className="text-blue-700 font-semibold">سند: {loc.docNo}</span>
                                        )}
                                        {loc.checkNo && loc.checkNo !== '—' && (
                                          <span className="text-slate-600">شيك: {loc.checkNo}</span>
                                        )}
                                        <span>سنة {loc.year}</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => navigateToBox(loc.boxId, loc.fileNo)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors shadow-2xs"
                                      title={`انتقل إلى ${loc.boxTitle} - ${loc.envelopeLabel}`}
                                    >
                                      انتقل للصندوق
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="space-y-2.5">
                              <div className="text-xs text-rose-800 bg-rose-100/60 rounded-xl p-3 border border-rose-200 space-y-1">
                                <div className="font-bold flex items-center gap-1.5 text-rose-900">
                                  <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>غير مدرج بأي من الصناديق (1 إلى 13)</span>
                                </div>
                                <p className="text-[11px] text-rose-700 leading-relaxed">
                                  هذا المورد مستخرج من بيان المستندات المطلوب مطابقتها، لكنه غير مؤرشف حالياً في الصناديق.
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setPrefilledSupplierName(item.supplierName);
                                  setIsAddSingleModalOpen(true);
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                                <span>أرشفة هذا المورد الآن في {activeBox.titleAr}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              6. BOX-BY-BOX SUPPLIER EXTRACTION PLAN (خطة استخراج الموردين لكل صندوق)
             ========================================================= */}
          {activeSection === 'extraction-plan' && (
            <div className="space-y-6">
              {/* Header */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      خطة الاستخراج والتدقيق لكل صندوق
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      الصناديق من 1 إلى 13 بناءً على القائمة الرئيسية
                    </span>
                  </div>
                  <h2 className="font-display font-black text-xl sm:text-2xl text-slate-950">
                    بيان الموردين المطلوب استخراجهم من كل صندوق
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                    يعرض هذا القسم لكل صندوق على حدة الموردين والمستندات المطابقة للقائمة الرئيسية التي يجب استخراجها وفحصها من كل صندوق بدقة واحترافية.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => triggerPrint('extraction-plan')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    title="طباعة خطة استخراج الموردين لكل صندوق بالكامل على ورق A4 رسمي"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة خطة الاستخراج (A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExtractionPlanCsv}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    title="تنزيل شيت إكسيل / CSV لخطة استخراج الموردين لكل صندوق"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير شيت خطة الاستخراج (CSV)</span>
                  </button>
                </div>
              </section>

              {/* Executive Extraction Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500">إجمالي الصناديق بالأرشيف</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-slate-900">
                      {extractionSummaryStats.totalBoxes}
                    </span>
                    <span className="text-xs text-slate-500">صندوق (1–13)</span>
                  </div>
                </div>

                <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>صناديق تحتوي ملفات مستهدفة</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-emerald-700">
                      {extractionSummaryStats.boxesWithRequired}
                    </span>
                    <span className="text-xs font-bold text-emerald-800">صناديق نشطة</span>
                  </div>
                </div>

                <div className="bg-blue-50/70 border-2 border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    <span>إجمالي الملفات المطلوب استخراجها</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-blue-700">
                      {extractionSummaryStats.totalRequiredFiles}
                    </span>
                    <span className="text-xs font-bold text-blue-800">ملف ومورد مؤكد</span>
                  </div>
                </div>

                <div className="bg-rose-50/70 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>موردون غير متواجدين بالصناديق</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono-num text-rose-700">
                      {extractionSummaryStats.missingSuppliersCount}
                    </span>
                    <span className="text-xs font-bold text-rose-800">مورد مفقود</span>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">عرض الصناديق:</span>
                  <button
                    type="button"
                    onClick={() => setExtractionPlanFilter('required-only')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                      extractionPlanFilter === 'required-only'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    الصناديق المطلوب استخراج منها فقط ({extractionSummaryStats.boxesWithRequired})
                  </button>

                  <button
                    type="button"
                    onClick={() => setExtractionPlanFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                      extractionPlanFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    جميع الصناديق (1–13)
                  </button>
                </div>
              </div>

              {/* Per-Box Extraction Plan Cards */}
              <div className="space-y-5">
                {boxExtractionPlans
                  .filter((plan) => extractionPlanFilter === 'all' || plan.totalRequired > 0)
                  .map((plan) => (
                    <div
                      key={plan.box.id}
                      className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-5 space-y-4 shadow-xs transition-all"
                    >
                      {/* Box Title Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-950 text-white font-black font-mono-num text-xl flex items-center justify-center shadow-xs">
                            {String(plan.box.id).padStart(2, '0')}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-950">
                                {plan.box.titleAr}
                              </h3>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-xs font-bold text-slate-700">
                                {plan.box.code}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-xs font-bold">
                                سنة {plan.box.primaryYear}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {plan.box.categoryScope} · إجمالي ملفات الصندوق: {plan.box.files.length} ملف
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono-num flex items-center gap-1.5 ${
                            plan.totalRequired > 0
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}>
                            {plan.totalRequired > 0 ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : null}
                            <span>المطلوب استخراجه: {plan.requiredFiles.length} مورد</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => navigateToBox(plan.box.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors"
                          >
                            انتقل للصندوق
                          </button>
                        </div>
                      </div>

                      {/* Required Files Table / List */}
                      {plan.requiredFiles.length === 0 ? (
                        <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 italic text-center">
                          لا توجد موردين مطابِقين للقائمة الرئيسية في هذا الصندوق.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                          <table className="w-full text-right text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-200">
                                <th className="px-3 py-2 text-center w-12 border-l border-slate-200">م</th>
                                <th className="px-3 py-2 w-32 border-l border-slate-200">الظرف / الملف</th>
                                <th className="px-3.5 py-2 border-l border-slate-200">اسم المورد المطلوب استخراجه</th>
                                <th className="px-3 py-2 w-32 border-l border-slate-200">رقم المستند</th>
                                <th className="px-3 py-2 w-28 border-l border-slate-200">الشيك / السنة</th>
                                <th className="px-3 py-2">ملاحظات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {plan.requiredFiles.map((f, fIdx) => (
                                <tr
                                  key={f.fileNo}
                                  className={`border-b border-slate-200 hover:bg-emerald-50/40 transition-colors ${
                                    fIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                                  }`}
                                >
                                  <td className="px-3 py-2 text-center font-mono-num font-bold text-slate-700 border-l border-slate-200">
                                    {fIdx + 1}
                                  </td>
                                  <td className="px-3 py-2 font-mono-num font-bold text-slate-900 border-l border-slate-200">
                                    {f.envelopeLabel}
                                  </td>
                                  <td className="px-3.5 py-2 font-bold text-slate-950 border-l border-slate-200">
                                    <span className="inline-flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>{f.supplierName}</span>
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono-num text-slate-800 border-l border-slate-200">
                                    {f.docNo}
                                  </td>
                                  <td className="px-3 py-2 font-mono-num text-slate-800 border-l border-slate-200">
                                    {f.checkNo !== '—' ? f.checkNo : f.year}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">
                                    {f.notes}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {/* Missing Suppliers Inventory Section */}
              <div className="bg-rose-50/40 border-2 border-rose-300 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-200 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                        غير متواجدين في الصناديق (1–13)
                      </span>
                      <span className="text-xs font-mono-num font-bold text-rose-700">
                        {extractionSummaryStats.missingSuppliersCount} مورد
                      </span>
                    </div>
                    <h3 className="font-display font-black text-lg text-slate-950">
                      قائمة الموردين المتبقين المطلوب البحث عنهم واستكمالهم
                    </h3>
                    <p className="text-xs text-slate-600">
                      هؤلاء الموردون واردون في الكشف المرسل لكن لم يتم العثور على أي ملف لهم داخل الصناديق من 1 إلى 13.
                    </p>
                  </div>

                  <div className="w-full sm:w-64">
                    <input
                      type="text"
                      value={missingSuppliersSearch}
                      onChange={(e) => setMissingSuppliersSearch(e.target.value)}
                      placeholder="ابحث في الموردين المفقودين..."
                      className="w-full px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs focus:outline-none focus:border-rose-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {missingMasterSuppliers
                    .filter((s) => {
                      if (!missingSuppliersSearch.trim()) return true;
                      const q = missingSuppliersSearch.trim().toLowerCase();
                      return s.name.toLowerCase().includes(q) || (s.secondary && s.secondary.includes(q));
                    })
                    .map((s, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-rose-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {s.name}
                          </div>
                          {s.secondary && (
                            <div className="text-[11px] text-blue-600 truncate">
                              {s.secondary}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPrefilledSupplierName(s.name);
                            setIsAddSingleModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
                          title="إضافة وأرشفة هذا المورد الآن"
                        >
                          + أرشفة الآن
                        </button>
                      </div>
                    ))}
                </div>
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

        {/* =========================================================
            BOTTOM MOBILE NAVIGATION BAR (شريط التنقل السريع للهاتف)
            Quick 1-thumb navigation between main sections on mobile
           ========================================================= */}
        <nav
          className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-1.5 flex items-center justify-around shadow-lg"
          aria-label="شريط التنقل السريع للهاتف"
        >
          <button
            type="button"
            onClick={() => {
              setActiveSection('dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold py-1 px-3 rounded-xl transition-colors cursor-pointer ${
              activeSection === 'dashboard'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span>الرئيسية</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection('search');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold py-1 px-3 rounded-xl transition-colors cursor-pointer ${
              activeSection === 'search'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Search className="w-5 h-5" />
            <span>البحث الذكي</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection('boxes');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold py-1 px-3 rounded-xl transition-colors cursor-pointer ${
              activeSection === 'boxes'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-5 h-5" />
            <span>الصناديق</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection('qrcodes');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold py-1 px-3 rounded-xl transition-colors cursor-pointer ${
              activeSection === 'qrcodes'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-5 h-5" />
            <span>رموز QR</span>
          </button>
        </nav>
      </div>

      {/* QR & Barcode Preview Modal */}
      <QrModal
        box={qrModalBox}
        onClose={() => setQrModalBox(null)}
        getBoxUrl={getBoxDirectUrl}
        onPrintSingle={(boxId) => triggerPrint('single-sticker', boxId)}
        onOpenBox={(boxId) => navigateToBox(boxId)}
      />

      {/* Create New Box Modal with Smart Paste */}
      <CreateBoxModal
        isOpen={isCreateBoxModalOpen}
        onClose={() => setIsCreateBoxModalOpen(false)}
        nextBoxId={nextBoxId}
        onCreateBox={handleCreateBox}
      />

      {/* Batch Add Suppliers to Active Box Modal */}
      <BatchAddSuppliersModal
        isOpen={isBatchAddModalOpen}
        onClose={() => setIsBatchAddModalOpen(false)}
        targetBox={activeBox}
        onAddSuppliers={handleBatchAddSuppliers}
      />

      {/* Edit Box Metadata Modal */}
      <EditBoxModal
        isOpen={boxToEdit !== null}
        onClose={() => setBoxToEdit(null)}
        box={boxToEdit}
        onSave={handleUpdateBox}
        onDelete={handleDeleteBox}
        totalBoxesCount={boxes.length}
      />

      {/* Edit File / Supplier Record Modal */}
      <EditFileRecordModal
        isOpen={recordToEdit !== null}
        onClose={() => setRecordToEdit(null)}
        record={recordToEdit?.record || null}
        boxTitle={recordToEdit?.boxTitle || ''}
        onSave={(updated) => {
          if (recordToEdit) {
            handleUpdateRecord(recordToEdit.boxId, updated);
          }
        }}
      />

      {/* Add Single Supplier Modal */}
      <AddSingleSupplierModal
        isOpen={isAddSingleModalOpen}
        onClose={() => {
          setIsAddSingleModalOpen(false);
          setPrefilledSupplierName('');
        }}
        targetBox={activeBox}
        initialSupplierName={prefilledSupplierName}
        onAdd={(newRec) => {
          handleAddSingleRecord(activeBox.id, newRec);
          setPrefilledSupplierName('');
        }}
      />

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={isAiSettingsModalOpen}
        onClose={() => setIsAiSettingsModalOpen(false)}
        onSaveToast={(msg) => showToast(msg)}
      />

      {/* AI Image Scanner / OCR Modal */}
      <AiImageScannerModal
        isOpen={isAiImageScannerOpen}
        onClose={() => setIsAiImageScannerOpen(false)}
        boxes={boxes}
        onAddRecordToBox={handleAddSingleRecord}
        onNavigateToBox={navigateToBox}
        showToast={showToast}
      />

      {/* Dedicated Print Media Surface */}
      <PrintSheet
        mode={printMode}
        boxes={printMode === 'extraction-plan' ? boxes : yearFilteredBoxes}
        activeBox={printTargetBox}
        getBoxUrl={getBoxDirectUrl}
        suppliersList={filteredSuppliersDirectory}
      />
    </div>
  );
}

export default App;
