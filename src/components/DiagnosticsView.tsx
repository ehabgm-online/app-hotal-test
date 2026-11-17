import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  Server,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';
import { ArchiveBox, ARCHIVE_BOXES } from '../data/archiveData';
import {
  BoxSyncAuditItem,
  BoxSyncStatus,
  forceResyncBoxesFromServer,
  fetchServerBoxesAudit,
  measureFirestoreLatency,
  saveBoxToCloud,
  seedFirestoreBoxes,
  subscribeToSyncDiagnostics,
  SyncDiagnosticsSnapshot,
  getSyncDiagnosticsSnapshot,
} from '../services/firestoreArchive';

interface DiagnosticsViewProps {
  clientBoxes: ArchiveBox[];
  pendingCloudSync: number[];
  isCloudSynced: boolean;
  onClientBoxesUpdated: (updatedBoxes: ArchiveBox[]) => void;
  onRetryPendingSync: () => Promise<void>;
  onOpenBox: (boxId: number) => void;
  onToast: (message: string) => void;
}

type AuditFilter = 'all' | 'missing-on-client' | 'out-of-sync' | 'missing-on-server' | 'synced';

function formatArabicTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseBoxIdList(input: string): number[] {
  const result = new Set<number>();
  const parts = input
    .split(/[\s,،;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 200) {
        for (let i = start; i <= end; i += 1) {
          result.add(i);
        }
      }
      continue;
    }
    const cleanNum = part.replace(/^(?:BOX|صندوق)[-_#\s]*/i, '');
    if (/^\d+$/.test(cleanNum)) {
      const id = parseInt(cleanNum, 10);
      if (id > 0) result.add(id);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  clientBoxes,
  pendingCloudSync,
  isCloudSynced,
  onClientBoxesUpdated,
  onRetryPendingSync,
  onOpenBox,
  onToast,
}) => {
  const [diag, setDiag] = useState<SyncDiagnosticsSnapshot>(getSyncDiagnosticsSnapshot);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditItems, setAuditItems] = useState<BoxSyncAuditItem[]>([]);
  const [lastAuditMeta, setLastAuditMeta] = useState<{
    serverCount: number;
    serverFetchMs: number;
    fetchedAt: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<AuditFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBoxIds, setSelectedBoxIds] = useState<number[]>([]);
  const [manualBoxInput, setManualBoxInput] = useState<string>('');
  const [syncingBoxIds, setSyncingBoxIds] = useState<number[]>([]);
  const [isBatchSyncing, setIsBatchSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToSyncDiagnostics(setDiag);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const runServerAudit = useCallback(async () => {
    setIsAuditing(true);
    setAuditError(null);
    try {
      const res = await fetchServerBoxesAudit(clientBoxes);
      setAuditItems(res.items);
      setLastAuditMeta({
        serverCount: res.serverCount,
        serverFetchMs: res.serverFetchMs,
        fetchedAt: res.fetchedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuditError(msg);
    } finally {
      setIsAuditing(false);
    }
  }, [clientBoxes]);

  const handleMeasurePing = useCallback(async () => {
    setIsPinging(true);
    try {
      const res = await measureFirestoreLatency();
      if (res.ok) {
        onToast(`تم قياس زمن استجابة Firestore: ${res.latencyMs} مللي ثانية`);
      } else {
        onToast('تعذر الوصول لخادم Firestore (وضع عدم الاتصال أو مشكلة شبكة)');
      }
    } finally {
      setIsPinging(false);
    }
  }, [onToast]);

  // Initial ping + audit when mounting the diagnostics view
  useEffect(() => {
    void measureFirestoreLatency();
    void runServerAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleForcePullBoxes = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      setSyncingBoxIds((prev) => Array.from(new Set([...prev, ...ids])));
      setIsBatchSyncing(true);
      try {
        const res = await forceResyncBoxesFromServer(ids, clientBoxes);
        onClientBoxesUpdated(res.updatedClientBoxes);

        if (res.pulledIds.length > 0 && res.notFoundOnServerIds.length === 0) {
          onToast(
            `تم سحب ومزامنة ${res.pulledIds.length} صندوق مباشرة من الخادم (${res.latencyMs} ms)`
          );
        } else if (res.pulledIds.length > 0 && res.notFoundOnServerIds.length > 0) {
          onToast(
            `تم سحب [${res.pulledIds.join(', ')}] من الخادم، ولم يُعثر على [${res.notFoundOnServerIds.join(', ')}] على الخادم`
          );
        } else {
          onToast(
            `الصناديق [${res.notFoundOnServerIds.join(', ')}] غير موجودة على خادم Firestore بعد`
          );
        }

        // Refresh audit against updated clientBoxes
        const updatedAudit = await fetchServerBoxesAudit(res.updatedClientBoxes);
        setAuditItems(updatedAudit.items);
        setLastAuditMeta({
          serverCount: updatedAudit.serverCount,
          serverFetchMs: updatedAudit.serverFetchMs,
          fetchedAt: updatedAudit.fetchedAt,
        });
        setSelectedBoxIds((prev) => prev.filter((id) => !res.pulledIds.includes(id)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAuditError(msg);
        onToast('فشل سحب الصناديق من خادم Firestore');
      } finally {
        setSyncingBoxIds((prev) => prev.filter((id) => !ids.includes(id)));
        setIsBatchSyncing(false);
      }
    },
    [clientBoxes, onClientBoxesUpdated, onToast]
  );

  const handleForcePushMissingToServer = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      const toPush: ArchiveBox[] = [];
      for (const id of ids) {
        const cli = clientBoxes.find((b) => b.id === id);
        const mst = ARCHIVE_BOXES.find((b) => b.id === id);
        if (cli) toPush.push(cli);
        else if (mst) toPush.push(mst);
      }
      if (toPush.length === 0) {
        onToast('لا توجد بيانات محلية أو مرجعية لرفعها للصناديق المحددة');
        return;
      }

      setSyncingBoxIds((prev) => Array.from(new Set([...prev, ...ids])));
      setIsBatchSyncing(true);
      try {
        if (toPush.length === 1) {
          await saveBoxToCloud(toPush[0]);
        } else {
          await seedFirestoreBoxes(toPush);
        }
        onToast(`تم رفع ومزامنة ${toPush.length} صندوق إلى خادم Firestore بنجاح`);
        await runServerAudit();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAuditError(msg);
        onToast('تعذر رفع الصناديق إلى خادم Firestore');
      } finally {
        setSyncingBoxIds((prev) => prev.filter((id) => !ids.includes(id)));
        setIsBatchSyncing(false);
      }
    },
    [clientBoxes, onToast, runServerAudit]
  );

  const handleManualForceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedIds = parseBoxIdList(manualBoxInput);
    if (parsedIds.length === 0) {
      onToast('أدخل رقم صندوق صحيح (مثال: 19 أو 13, 15, 19)');
      return;
    }
    void handleForcePullBoxes(parsedIds);
  };

  const counts = useMemo(() => {
    let missingOnClient = 0;
    let missingOnServer = 0;
    let outOfSync = 0;
    let synced = 0;
    for (const item of auditItems) {
      if (item.status === 'missing-on-client') missingOnClient += 1;
      else if (item.status === 'missing-on-server') missingOnServer += 1;
      else if (item.status === 'out-of-sync') outOfSync += 1;
      else synced += 1;
    }
    return {
      total: auditItems.length,
      missingOnClient,
      missingOnServer,
      outOfSync,
      synced,
      needsAttention: missingOnClient + outOfSync + missingOnServer,
    };
  }, [auditItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return auditItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(item.boxId).includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.titleAr.toLowerCase().includes(q)
      );
    });
  }, [auditItems, statusFilter, searchQuery]);

  const latencyStats = useMemo(() => {
    const okSamples = diag.latencyHistory.filter((s) => s.ok);
    if (okSamples.length === 0) {
      return { avg: null, min: null, max: null };
    }
    const vals = okSamples.map((s) => s.latencyMs);
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / vals.length),
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [diag.latencyHistory]);

  const maxHistoryMs = useMemo(() => {
    if (diag.latencyHistory.length === 0) return 100;
    return Math.max(...diag.latencyHistory.map((s) => s.latencyMs), 100);
  }, [diag.latencyHistory]);

  const latencyAssessment = useMemo(() => {
    if (!isOnline) {
      return { label: 'غير متصل بالإنترنت', color: 'text-rose-700', barColor: 'bg-rose-500' };
    }
    if (diag.lastLatencyMs === null) {
      return { label: 'بانتظار القياس', color: 'text-slate-600', barColor: 'bg-slate-400' };
    }
    if (diag.lastLatencyMs < 250) {
      return { label: 'استجابة سريعة ومستقرة', color: 'text-emerald-700', barColor: 'bg-emerald-500' };
    }
    if (diag.lastLatencyMs < 700) {
      return { label: 'استجابة متوسطة', color: 'text-amber-700', barColor: 'bg-amber-500' };
    }
    return { label: 'زمن استجابة مرتفع', color: 'text-rose-700', barColor: 'bg-rose-500' };
  }, [diag.lastLatencyMs, isOnline]);

  const toggleSelection = (boxId: number) => {
    setSelectedBoxIds((prev) =>
      prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]
    );
  };

  const selectAllDiscrepant = () => {
    const discrepantIds = auditItems
      .filter((i) => i.status === 'missing-on-client' || i.status === 'out-of-sync')
      .map((i) => i.boxId);
    setSelectedBoxIds(discrepantIds);
    if (discrepantIds.length === 0) {
      onToast('جميع الصناديق الموجودة على الخادم متطابقة بالفعل مع العميل');
    }
  };

  const statusMeta = (status: BoxSyncStatus) => {
    switch (status) {
      case 'missing-on-client':
        return {
          text: 'مفقود على العميل (موجود بالخادم)',
          textColor: 'text-rose-700',
          icon: <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />,
        };
      case 'out-of-sync':
        return {
          text: 'اختلاف في عدد الملفات مع الخادم',
          textColor: 'text-amber-700',
          icon: <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />,
        };
      case 'missing-on-server':
        return {
          text: 'غير مرفوع على خادم Firestore',
          textColor: 'text-indigo-700',
          icon: <CloudOff className="w-4 h-4 text-indigo-600 shrink-0" />,
        };
      default:
        return {
          text: 'متطابق مع الخادم',
          textColor: 'text-emerald-700',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Primary Action Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Activity className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="font-display font-bold text-lg sm:text-xl text-slate-900">
              مركز تشخيص المزامنة وزمن استجابة Firestore
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
            مراقبة حالة الاتصال المباشر مع قاعدة بيانات Firestore، قياس زمن الاستجابة الفعلي بالمللي ثانية، ومقارنة وثائق الخادم مع نسخة العميل مع إمكانية سحب ومزامنة أي صندوق مفقود قسرياً من الخادم.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleMeasurePing}
            disabled={isPinging}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Wifi className={`w-4 h-4 text-blue-600 ${isPinging ? 'animate-pulse' : ''}`} />
            <span>{isPinging ? 'جاري القياس...' : 'قياس زمن الاستجابة (Ping)'}</span>
          </button>

          <button
            type="button"
            onClick={runServerAudit}
            disabled={isAuditing}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isAuditing ? 'جاري فحص الخادم...' : 'فحص ومقارنة مع الخادم'}</span>
          </button>
        </div>
      </div>

      {/* Offline / Error Alert Banner */}
      {(auditError || diag.lastError) && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-2.5 text-xs sm:text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">تنبيه اتصال بقاعدة بيانات Firestore</div>
              <div className="text-rose-700 font-mono-num text-xs mt-0.5 break-all">
                {auditError || diag.lastError}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={runServerAudit}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Pending Local Writes Banner */}
      {pendingCloudSync.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-900">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              يوجد <strong className="font-mono-num">{pendingCloudSync.length}</strong> صندوق بتعديلات محلية بانتظار الرفع للسحابة ({pendingCloudSync.join(', ')}).
            </span>
          </div>
          <button
            type="button"
            onClick={onRetryPendingSync}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            مزامنة التعديلات المعلّقة الآن
          </button>
        </div>
      )}

      {/* Real-time Telemetry Summary Grid (Single-Elevation Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Real-time Sync Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>حالة المزامنة اللحظية</span>
            {isCloudSynced && !diag.snapshotFromCache ? (
              <Cloud className="w-4 h-4 text-emerald-600" />
            ) : (
              <CloudOff className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div>
            <div className="text-lg font-display font-bold text-slate-900">
              {!isOnline
                ? 'وضع عدم الاتصال'
                : diag.hasPendingWrites
                ? 'جاري إرسال تعديلات للخادم'
                : !diag.snapshotFromCache
                ? 'متزامن لحظياً مع الخادم'
                : 'قراءة من الكاش المحلي'}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>مستمع البث:</span>
              <span className={diag.listenerActive ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                {diag.listenerActive ? 'نشط' : 'متوقف'}
              </span>
              <span aria-hidden="true">·</span>
              <span>تعديلات معلّقة:</span>
              <span className="font-mono-num font-semibold text-slate-800">
                {diag.hasPendingWrites || pendingCloudSync.length > 0
                  ? `${pendingCloudSync.length || 1}`
                  : '0'}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>آخر تأكيد من الخادم</span>
            <span className="font-mono-num text-slate-800">{formatArabicTime(diag.lastServerAckAt)}</span>
          </div>
        </div>

        {/* Card 2: Firestore Network Latency */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>زمن استجابة شبكة Firestore</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono-num font-bold text-slate-900">
                {diag.lastLatencyMs !== null ? diag.lastLatencyMs : '—'}
              </span>
              <span className="text-xs font-mono-num text-slate-500">ms</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${latencyAssessment.color}`}>
              {latencyAssessment.label}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>المتوسط / الأدنى</span>
            <span className="font-mono-num text-slate-800">
              {latencyStats.avg !== null ? `${latencyStats.avg} ms / ${latencyStats.min} ms` : '—'}
            </span>
          </div>
        </div>

        {/* Card 3: Server vs Client Box Parity */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>تطابق الخادم والعميل</span>
            <Server className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono-num font-bold text-slate-900">
                {lastAuditMeta ? lastAuditMeta.serverCount : diag.serverDocCount ?? '—'}
              </span>
              <span className="text-xs text-slate-500">
                على الخادم /{' '}
                <strong className="font-mono-num text-slate-800">{clientBoxes.length}</strong>{' '}
                على العميل
              </span>
            </div>
            <div className="text-xs mt-1">
              {lastAuditMeta ? (
                counts.needsAttention === 0 ? (
                  <span className="text-emerald-700 font-semibold">جميع الصناديق متطابقة</span>
                ) : (
                  <span className="text-amber-700 font-semibold">
                    {counts.needsAttention} صندوق بحاجة للمراجعة أو المزامنة
                  </span>
                )
              ) : (
                <span className="text-slate-500">جاري مطابقة الخادم...</span>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>زمن جرد الخادم</span>
            <span className="font-mono-num text-slate-800">
              {lastAuditMeta ? `${lastAuditMeta.serverFetchMs} ms` : '—'}
            </span>
          </div>
        </div>

        {/* Card 4: Network & Firestore Environment */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>بيئة الاتصال وقاعدة البيانات</span>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <div>
            <div className="text-sm font-mono-num font-semibold text-slate-900 truncate" title={diag.databaseId}>
              {diag.databaseId}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>الشبكة:</span>
              <span className={isOnline ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                {isOnline ? 'متصل' : 'غير متصل'}
              </span>
              <span aria-hidden="true">·</span>
              <span>المشروع:</span>
              <span className="font-mono-num text-slate-700 truncate">{diag.projectId || '—'}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between gap-2">
            <span className="shrink-0">الجلسة</span>
            <span className="font-mono-num text-slate-800 truncate">
              {diag.authUid ? `UID: ${diag.authUid.slice(0, 10)}…` : 'وصول مباشر'}
            </span>
          </div>
        </div>
      </div>

      {/* Latency History & Manual Targeted Force Re-sync Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Live Latency Samples Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">
                سجل قياسات زمن الاستجابة الفعلي مع خادم Firestore
              </h3>
              <p className="text-xs text-slate-500">
                آخر {diag.latencyHistory.length} استعلام مباشر للخادم (Ping / جرد / مزامنة قسرية)
              </p>
            </div>
            {latencyStats.max !== null && (
              <div className="text-xs font-mono-num text-slate-600">
                أدنى: {latencyStats.min}ms · متوسط: {latencyStats.avg}ms · أعلى: {latencyStats.max}ms
              </div>
            )}
          </div>

          {diag.latencyHistory.length === 0 ? (
            <div className="h-28 flex items-center justify-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
              اضغط على «قياس زمن الاستجابة» لتسجيل أول قياس مباشر للشبكة.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-28 flex items-end gap-1.5 pt-4 px-2 bg-slate-50 border border-slate-100 rounded-xl">
                {diag.latencyHistory.map((sample, idx) => {
                  const pct = Math.max(10, Math.round((sample.latencyMs / maxHistoryMs) * 100));
                  const barBg = !sample.ok
                    ? 'bg-rose-500'
                    : sample.latencyMs < 250
                    ? 'bg-emerald-500'
                    : sample.latencyMs < 700
                    ? 'bg-amber-500'
                    : 'bg-rose-500';
                  return (
                    <div
                      key={`${sample.timestamp}-${idx}`}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      title={`${sample.latencyMs} ms (${sample.source}) - ${formatArabicTime(sample.timestamp)}`}
                    >
                      <div
                        className={`w-full max-w-[22px] rounded-t-md transition-all ${barBg}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                <span>أقدم قياس: {formatArabicTime(diag.latencyHistory[0]?.timestamp || null)}</span>
                <span>أحدث قياس: {formatArabicTime(diag.latencyHistory[diag.latencyHistory.length - 1]?.timestamp || null)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Manual Force Re-Sync By Box ID(s) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600 shrink-0" />
              <span>سحب قسري مباشر لصناديق محددة من الخادم</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              أدخل رقم صندوق واحد أو أكثر (مثال: <span className="font-mono-num">19</span> أو{' '}
              <span className="font-mono-num">13, 15, 19</span> أو نطاق{' '}
              <span className="font-mono-num">10-19</span>) لجلب أحدث نسخة مباشرة من خادم Firestore إلى هذا الجهاز وتجاوز الذاكرة المؤقتة.
            </p>
          </div>

          <form onSubmit={handleManualForceSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualBoxInput}
                onChange={(e) => setManualBoxInput(e.target.value)}
                placeholder="أدخل أرقام الصناديق (مثال: 19 أو 13, 15, 19)"
                dir="ltr"
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono-num text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={isBatchSyncing || !manualBoxInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
                <span>فرض المزامنة</span>
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>تحديد سريع:</span>
            {[13, 15, 19].map((quickId) => (
              <button
                key={quickId}
                type="button"
                onClick={() => void handleForcePullBoxes([quickId])}
                disabled={syncingBoxIds.includes(quickId)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono-num font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                سحب صندوق {quickId}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Server vs Client Parity Inspector Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900">
                فحص الصناديق: مقارنة الخادم بالعميل
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                آخر جرد من الخادم: {lastAuditMeta ? formatArabicTime(lastAuditMeta.fetchedAt) : 'لم يُجرَ بعد'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAllDiscrepant}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                تحديد الناقصة / غير المتطابقة
              </button>

              {selectedBoxIds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleForcePullBoxes(selectedBoxIds)}
                    disabled={isBatchSyncing}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    <span>سحب المحددة من الخادم ({selectedBoxIds.length})</span>
                  </button>

                  {selectedBoxIds.some(
                    (id) => auditItems.find((i) => i.boxId === id)?.status === 'missing-on-server'
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleForcePushMissingToServer(
                          selectedBoxIds.filter(
                            (id) =>
                              auditItems.find((i) => i.boxId === id)?.status === 'missing-on-server'
                          )
                        )
                      }
                      disabled={isBatchSyncing}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      <span>رفع الناقصة للخادم</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  { id: 'all', label: `الكل (${counts.total})` },
                  { id: 'missing-on-client', label: `ناقصة بالعميل (${counts.missingOnClient})` },
                  { id: 'out-of-sync', label: `مختلفة (${counts.outOfSync})` },
                  { id: 'missing-on-server', label: `ناقصة بالخادم (${counts.missingOnServer})` },
                  { id: 'synced', label: `متطابقة (${counts.synced})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الصندوق أو الكود أو الاسم..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="تحديد كل الصناديق الظاهرة"
                    checked={
                      filteredItems.length > 0 &&
                      filteredItems.every((i) => selectedBoxIds.includes(i.boxId))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBoxIds(filteredItems.map((i) => i.boxId));
                      } else {
                        setSelectedBoxIds([]);
                      }
                    }}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">الصندوق</th>
                <th className="py-3 px-4">ملفات العميل</th>
                <th className="py-3 px-4">ملفات الخادم</th>
                <th className="py-3 px-4">المرجع</th>
                <th className="py-3 px-4">حالة التطابق</th>
                <th className="py-3 px-4">آخر تحديث بالخادم</th>
                <th className="py-3 px-4 text-left">إجراءات المزامنة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isAuditing && auditItems.length === 0 ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="w-4 h-4 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-40 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-10 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-10 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-10 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-20 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-7 w-24 bg-slate-200 rounded mr-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center text-slate-500">
                    لا توجد صناديق مطابقة للتصفية الحالية.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const meta = statusMeta(item.status);
                  const isRowSyncing = syncingBoxIds.includes(item.boxId);
                  return (
                    <tr key={item.boxId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          aria-label={`تحديد ${item.titleAr}`}
                          checked={selectedBoxIds.includes(item.boxId)}
                          onChange={() => toggleSelection(item.boxId)}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.titleAr}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">
                          {item.code} · {item.primaryYear}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-800">
                        {item.clientFileCount !== null ? `${item.clientFileCount}` : 'مفقود'}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-800">
                        {item.serverFileCount !== null ? `${item.serverFileCount}` : 'غير موجود'}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-500">
                        {item.masterFileCount !== null ? `${item.masterFileCount}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`inline-flex items-center gap-1.5 font-medium ${meta.textColor}`}>
                          {meta.icon}
                          <span>{meta.text}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-500">
                        {formatArabicTime(item.serverUpdatedAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {item.serverFileCount !== null ? (
                            <button
                              type="button"
                              onClick={() => void handleForcePullBoxes([item.boxId])}
                              disabled={isRowSyncing}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                              title="سحب أحدث نسخة لهذا الصندوق مباشرة من خادم Firestore إلى العميل"
                            >
                              <ArrowDownToLine className={`w-3.5 h-3.5 ${isRowSyncing ? 'animate-bounce' : ''}`} />
                              <span>{isRowSyncing ? 'جاري السحب...' : 'سحب من الخادم'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleForcePushMissingToServer([item.boxId])}
                              disabled={isRowSyncing}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                              title="رفع الصندوق من النسخة المحلية/المرجعية إلى خادم Firestore"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" />
                              <span>{isRowSyncing ? 'جاري الرفع...' : 'رفع للخادم'}</span>
                            </button>
                          )}

                          {item.clientFileCount !== null && (
                            <button
                              type="button"
                              onClick={() => onOpenBox(item.boxId)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                              title={`فتح ${item.titleAr}`}
                              aria-label={`فتح ${item.titleAr}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
