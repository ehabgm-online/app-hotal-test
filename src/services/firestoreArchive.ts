import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  getDocsFromServer,
  getDocFromServer,
  writeBatch,
} from 'firebase/firestore';
import { db, auth, testFirestoreConnection } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { ArchiveBox, ArchiveFileRecord, ARCHIVE_BOXES } from '../data/archiveData';
import { getCanonicalSupplierKey } from '../utils/bilingualSearch';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const BOXES_COLLECTION = 'boxes';
const LOCAL_STORAGE_KEY = 'smart_docs_boxes_data_v1';
const LOCAL_RECONCILE_FLAG = 'smart_docs_master_sync_v5';
const MASTER_RECONCILE_CUTOFF_ISO = '2026-11-14T23:59:59.000Z';

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function getBoxDocId(boxId: number): string {
  return `box_${boxId}`;
}

function getSupplierNameLinkKey(rec: ArchiveFileRecord): string {
  return getCanonicalSupplierKey(rec.supplierName || '') || (rec.supplierName || '').toLowerCase().trim();
}

export function reconcileBoxWithMaster(
  storedBox: ArchiveBox,
  rawUpdatedAt?: string,
  forceMerge = false
): { box: ArchiveBox; changed: boolean } {
  const master = ARCHIVE_BOXES.find((m) => m.id === storedBox.id);
  if (!master || master.files.length === 0) {
    return { box: storedBox, changed: false };
  }

  // Case A: Stored box exists in Firestore/localStorage with 0 files -> hydrate completely from master
  if (storedBox.files.length === 0) {
    const mergedYears = Array.from(new Set([...(storedBox.years || []), ...master.years]));
    return {
      box: {
        ...storedBox,
        subtitleAr: storedBox.subtitleAr || master.subtitleAr,
        categoryScope:
          !storedBox.categoryScope || storedBox.categoryScope === 'أرشيف عام'
            ? master.categoryScope
            : storedBox.categoryScope,
        years: mergedYears.length > 0 ? mergedYears : master.years,
        files: master.files.map((f) => ({ ...f })),
      },
      changed: true,
    };
  }

  // Case B: One-time reconciliation for older documents saved before master data was completed
  const isOlderThanMasterUpdate = !rawUpdatedAt || rawUpdatedAt < MASTER_RECONCILE_CUTOFF_ISO;
  if (!forceMerge && !isOlderThanMasterUpdate) {
    return { box: storedBox, changed: false };
  }

  // Link strictly by Supplier Name (supporting multiple occurrences of the same supplier inside a box)
  const storedCounts = new Map<string, number>();
  for (const f of storedBox.files) {
    const key = getSupplierNameLinkKey(f);
    storedCounts.set(key, (storedCounts.get(key) || 0) + 1);
  }

  const masterSeenCounts = new Map<string, number>();
  const missingMasterFiles = master.files.filter((mf) => {
    const key = getSupplierNameLinkKey(mf);
    const occ = (masterSeenCounts.get(key) || 0) + 1;
    masterSeenCounts.set(key, occ);
    return occ > (storedCounts.get(key) || 0);
  });

  if (missingMasterFiles.length === 0) {
    return { box: storedBox, changed: false };
  }

  let nextFileNo = storedBox.files.reduce((max, f) => Math.max(max, f.fileNo || 0), 0);
  const appendedFiles = missingMasterFiles.map((mf) => {
    nextFileNo += 1;
    return {
      ...mf,
      fileNo: nextFileNo,
    };
  });

  const mergedYears = Array.from(new Set([...(storedBox.years || []), ...master.years]));

  return {
    box: {
      ...storedBox,
      years: mergedYears.length > 0 ? mergedYears : master.years,
      categoryScope: master.categoryScope || storedBox.categoryScope,
      files: [...storedBox.files, ...appendedFiles],
    },
    changed: true,
  };
}

/**
 * Deep sanitization function ensuring EVERY box and file record has valid fields
 * preventing any runtime TypeError or blank screen crash.
 */
export function sanitizeArchiveBox(raw: any, fallbackId: number): ArchiveBox {
  const id = typeof raw?.id === 'number' ? raw.id : fallbackId;
  const masterFallback = ARCHIVE_BOXES.find((b) => b.id === id);

  const safeYears: number[] =
    Array.isArray(raw?.years) && raw.years.length > 0
      ? raw.years.map((y: any) => Number(y) || 2017)
      : masterFallback?.years || [2017];

  const safePrimaryYear =
    typeof raw?.primaryYear === 'number'
      ? raw.primaryYear
      : safeYears[0] || masterFallback?.primaryYear || 2017;

  const rawFiles = Array.isArray(raw?.files) ? raw.files : masterFallback?.files || [];
  const safeFiles: ArchiveFileRecord[] = rawFiles.map((f: any, idx: number) => {
    const rec: ArchiveFileRecord = {
      fileNo: typeof f?.fileNo === 'number' ? f.fileNo : idx + 1,
      envelopeLabel: String(f?.envelopeLabel || `الظرف ${idx + 1}`),
      supplierName: String(f?.supplierName || 'غير محدد'),
      docNo: String(f?.docNo || '—'),
      checkNo: String(f?.checkNo || '—'),
      year: typeof f?.year === 'number' ? f.year : safePrimaryYear,
      notes: String(f?.notes || ''),
      isChecked: Boolean(f?.isChecked),
    };
    if (typeof f?.amountEgp === 'number' && Number.isFinite(f.amountEgp)) {
      rec.amountEgp = f.amountEgp;
    }
    return rec;
  });

  return {
    id,
    code: String(raw?.code || masterFallback?.code || `BOX-${id}`),
    barcodeValue: String(raw?.barcodeValue || masterFallback?.barcodeValue || `ARC-BOX-${id}`),
    titleAr: String(raw?.titleAr || masterFallback?.titleAr || `صندوق ${id}`),
    subtitleAr: String(raw?.subtitleAr || masterFallback?.subtitleAr || ''),
    categoryScope: String(raw?.categoryScope || masterFallback?.categoryScope || 'أرشيف عام'),
    primaryYear: safePrimaryYear,
    years: safeYears,
    files: safeFiles,
  };
}

/**
 * Cache boxes locally for instant offline loading and SSR safety
 */
export function cacheBoxesLocally(boxes: ArchiveBox[]): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(boxes));
    }
  } catch (err) {
    console.warn('LocalStorage quota or access notice:', err);
  }
}

/**
 * Read cached boxes from localStorage if available with sanitization and master reconciliation
 */
export function getLocalCachedBoxes(): ArchiveBox[] {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const needsOneTimeLocalReconcile = !localStorage.getItem(LOCAL_RECONCILE_FLAG);
          let mutated = false;

          const boxById = new Map<number, ArchiveBox>();
          parsed.forEach((b: any, idx: number) => {
            const sanitized = sanitizeArchiveBox(b, idx + 1);
            const updatedAt = typeof b?.updatedAt === 'string' ? b.updatedAt : undefined;
            const reconciled = reconcileBoxWithMaster(
              sanitized,
              updatedAt,
              needsOneTimeLocalReconcile
            );
            if (reconciled.changed) mutated = true;
            const prev = boxById.get(reconciled.box.id);
            if (!prev) {
              boxById.set(reconciled.box.id, reconciled.box);
            } else {
              mutated = true;
              if (reconciled.box.files.length > prev.files.length) {
                boxById.set(reconciled.box.id, reconciled.box);
              }
            }
          });

          const cachedBoxes = Array.from(boxById.values());
          const existingIds = new Set(cachedBoxes.map((b) => b.id));
          const missing = ARCHIVE_BOXES.filter((b) => !existingIds.has(b.id));
          if (missing.length > 0) {
            cachedBoxes.push(...missing);
            mutated = true;
          }

          if (mutated || needsOneTimeLocalReconcile) {
            cachedBoxes.sort((a, b) => a.id - b.id);
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cachedBoxes));
              localStorage.setItem(LOCAL_RECONCILE_FLAG, 'done');
            } catch {
              // ignore
            }
          }
          return cachedBoxes;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read cached boxes from localStorage:', err);
  }
  return ARCHIVE_BOXES;
}

export interface LatencySample {
  timestamp: string;
  latencyMs: number;
  ok: boolean;
  source: 'ping' | 'server-fetch' | 'force-sync';
}

export interface SyncDiagnosticsSnapshot {
  listenerActive: boolean;
  snapshotFromCache: boolean;
  hasPendingWrites: boolean;
  lastSnapshotAt: string | null;
  lastServerAckAt: string | null;
  lastLatencyMs: number | null;
  latencyHistory: LatencySample[];
  serverDocCount: number | null;
  clientBoxCount: number;
  lastError: string | null;
  authUid: string | null;
  projectId: string;
  databaseId: string;
}

export type BoxSyncStatus =
  | 'synced'
  | 'missing-on-client'
  | 'missing-on-server'
  | 'out-of-sync';

export interface BoxSyncAuditItem {
  boxId: number;
  code: string;
  titleAr: string;
  primaryYear: number;
  status: BoxSyncStatus;
  clientFileCount: number | null;
  serverFileCount: number | null;
  masterFileCount: number | null;
  serverUpdatedAt: string | null;
  serverBox: ArchiveBox | null;
}

export interface ServerAuditResult {
  items: BoxSyncAuditItem[];
  serverCount: number;
  serverFetchMs: number;
  fetchedAt: string;
}

export interface ForceResyncResult {
  updatedClientBoxes: ArchiveBox[];
  pulledIds: number[];
  notFoundOnServerIds: number[];
  latencyMs: number;
}

let hasAutoReconciledOnce = false;

let currentDiagnostics: SyncDiagnosticsSnapshot = {
  listenerActive: false,
  snapshotFromCache: true,
  hasPendingWrites: false,
  lastSnapshotAt: null,
  lastServerAckAt: null,
  lastLatencyMs: null,
  latencyHistory: [],
  serverDocCount: null,
  clientBoxCount: 0,
  lastError: null,
  authUid: auth?.currentUser?.uid || null,
  projectId: firebaseConfig.projectId || '',
  databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
};

const diagnosticsListeners = new Set<(snap: SyncDiagnosticsSnapshot) => void>();

function emitDiagnostics(patch: Partial<SyncDiagnosticsSnapshot>): void {
  currentDiagnostics = {
    ...currentDiagnostics,
    ...patch,
    authUid: auth?.currentUser?.uid || currentDiagnostics.authUid,
  };
  for (const listener of diagnosticsListeners) {
    listener(currentDiagnostics);
  }
}

function appendLatencySample(sample: LatencySample): void {
  const nextHistory = [...currentDiagnostics.latencyHistory, sample].slice(-20);
  emitDiagnostics({
    lastLatencyMs: sample.ok ? sample.latencyMs : currentDiagnostics.lastLatencyMs,
    latencyHistory: nextHistory,
    lastServerAckAt: sample.ok ? sample.timestamp : currentDiagnostics.lastServerAckAt,
  });
}

export function getSyncDiagnosticsSnapshot(): SyncDiagnosticsSnapshot {
  return currentDiagnostics;
}

export function subscribeToSyncDiagnostics(
  listener: (snap: SyncDiagnosticsSnapshot) => void
): () => void {
  diagnosticsListeners.add(listener);
  listener(currentDiagnostics);
  return () => {
    diagnosticsListeners.delete(listener);
  };
}

/**
 * Measure live Firestore round-trip latency directly against the server (bypasses local cache)
 */
export async function measureFirestoreLatency(): Promise<{
  latencyMs: number;
  ok: boolean;
  error?: string;
}> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nowIso = new Date().toISOString();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(end - start));
    appendLatencySample({ timestamp: nowIso, latencyMs, ok: true, source: 'ping' });
    emitDiagnostics({ lastError: null });
    return { latencyMs, ok: true };
  } catch (err) {
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(end - start));
    const msg = err instanceof Error ? err.message : String(err);
    // If permission denied returned from server, server actually responded over network
    const isPermissionError = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient');
    if (isPermissionError) {
      appendLatencySample({ timestamp: nowIso, latencyMs, ok: true, source: 'ping' });
      emitDiagnostics({ lastError: null });
      return { latencyMs, ok: true };
    }
    appendLatencySample({ timestamp: nowIso, latencyMs, ok: false, source: 'ping' });
    emitDiagnostics({ lastError: msg });
    return { latencyMs, ok: false, error: msg };
  }
}

/**
 * Fetch authoritative boxes directly from Firestore server and compare against client + master
 */
export async function fetchServerBoxesAudit(
  clientBoxes: ArchiveBox[]
): Promise<ServerAuditResult> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nowIso = new Date().toISOString();
  try {
    const snapshot = await getDocsFromServer(collection(db, BOXES_COLLECTION));
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const serverFetchMs = Math.max(1, Math.round(end - start));

    const serverMap = new Map<number, { box: ArchiveBox; updatedAt: string | null }>();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.id === 'number') {
        const sanitized = sanitizeArchiveBox(data, data.id);
        const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;
        const prev = serverMap.get(sanitized.id);
        if (!prev || sanitized.files.length > prev.box.files.length) {
          serverMap.set(sanitized.id, { box: sanitized, updatedAt });
        }
      }
    });

    const clientMap = new Map<number, ArchiveBox>(clientBoxes.map((b) => [b.id, b]));
    const masterMap = new Map<number, ArchiveBox>(ARCHIVE_BOXES.map((b) => [b.id, b]));

    const allIds = Array.from(
      new Set<number>([
        ...serverMap.keys(),
        ...clientMap.keys(),
        ...masterMap.keys(),
      ])
    ).sort((a, b) => a - b);

    const items: BoxSyncAuditItem[] = allIds.map((boxId) => {
      const srv = serverMap.get(boxId);
      const cli = clientMap.get(boxId);
      const mst = masterMap.get(boxId);

      const serverFileCount = srv ? srv.box.files.length : null;
      const clientFileCount = cli ? cli.files.length : null;
      const masterFileCount = mst ? mst.files.length : null;

      let status: BoxSyncStatus = 'synced';
      if (srv && !cli) {
        status = 'missing-on-client';
      } else if (!srv && (cli || mst)) {
        status = 'missing-on-server';
      } else if (srv && cli) {
        const fileDiff = srv.box.files.length !== cli.files.length;
        const titleDiff = srv.box.titleAr !== cli.titleAr || srv.box.code !== cli.code;
        status = fileDiff || titleDiff ? 'out-of-sync' : 'synced';
      }

      const refBox = srv?.box || cli || mst!;
      return {
        boxId,
        code: refBox.code,
        titleAr: refBox.titleAr,
        primaryYear: refBox.primaryYear,
        status,
        clientFileCount,
        serverFileCount,
        masterFileCount,
        serverUpdatedAt: srv?.updatedAt || null,
        serverBox: srv?.box || null,
      };
    });

    appendLatencySample({ timestamp: nowIso, latencyMs: serverFetchMs, ok: true, source: 'server-fetch' });
    emitDiagnostics({
      serverDocCount: serverMap.size,
      clientBoxCount: clientBoxes.length,
      lastError: null,
    });

    return {
      items,
      serverCount: serverMap.size,
      serverFetchMs,
      fetchedAt: nowIso,
    };
  } catch (err) {
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const serverFetchMs = Math.max(1, Math.round(end - start));
    const msg = err instanceof Error ? err.message : String(err);
    appendLatencySample({ timestamp: nowIso, latencyMs: serverFetchMs, ok: false, source: 'server-fetch' });
    emitDiagnostics({ lastError: msg });
    handleFirestoreError(err, OperationType.LIST, BOXES_COLLECTION);
  }
}

/**
 * Force re-sync specific box IDs directly from Firestore server to client state & local cache
 */
export async function forceResyncBoxesFromServer(
  boxIds: number[],
  currentClientBoxes: ArchiveBox[]
): Promise<ForceResyncResult> {
  const uniqueIds = Array.from(new Set(boxIds)).sort((a, b) => a - b);
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nowIso = new Date().toISOString();

  const pulledBoxes: ArchiveBox[] = [];
  const pulledIds: number[] = [];
  const notFoundOnServerIds: number[] = [];

  try {
    await Promise.all(
      uniqueIds.map(async (boxId) => {
        const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(boxId));
        const docSnap = await getDocFromServer(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const sanitized = sanitizeArchiveBox(data, boxId);
          pulledBoxes.push(sanitized);
          pulledIds.push(boxId);
        } else {
          notFoundOnServerIds.push(boxId);
        }
      })
    );

    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(end - start));

    const mergedMap = new Map<number, ArchiveBox>(
      currentClientBoxes.map((b) => [b.id, b])
    );
    for (const srvBox of pulledBoxes) {
      mergedMap.set(srvBox.id, srvBox);
    }
    const updatedClientBoxes = Array.from(mergedMap.values()).sort((a, b) => a.id - b.id);
    cacheBoxesLocally(updatedClientBoxes);

    appendLatencySample({ timestamp: nowIso, latencyMs, ok: true, source: 'force-sync' });
    emitDiagnostics({
      clientBoxCount: updatedClientBoxes.length,
      lastError: null,
    });

    return {
      updatedClientBoxes,
      pulledIds: pulledIds.sort((a, b) => a - b),
      notFoundOnServerIds: notFoundOnServerIds.sort((a, b) => a - b),
      latencyMs,
    };
  } catch (err) {
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(end - start));
    const msg = err instanceof Error ? err.message : String(err);
    appendLatencySample({ timestamp: nowIso, latencyMs, ok: false, source: 'force-sync' });
    emitDiagnostics({ lastError: msg });
    handleFirestoreError(err, OperationType.GET, BOXES_COLLECTION);
  }
}

/**
 * Subscribe to Firestore 'boxes' collection in real time (including metadata sync status).
 * If empty on first server snapshot, it automatically seeds the initial archive boxes.
 */
export function subscribeToFirestoreBoxes(
  onUpdate: (boxes: ArchiveBox[], isCloudSynced: boolean) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, BOXES_COLLECTION);
  emitDiagnostics({ listenerActive: true });

  const unsubscribe = onSnapshot(
    colRef,
    { includeMetadataChanges: true },
    async (snapshot) => {
      const nowIso = new Date().toISOString();
      const fromCache = snapshot.metadata.fromCache;
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;

      emitDiagnostics({
        listenerActive: true,
        snapshotFromCache: fromCache,
        hasPendingWrites,
        lastSnapshotAt: nowIso,
        lastServerAckAt: !fromCache ? nowIso : currentDiagnostics.lastServerAckAt,
        serverDocCount: !fromCache ? snapshot.size : currentDiagnostics.serverDocCount,
        lastError: null,
      });

      // If collection is completely empty on the server, seed it with default master boxes
      if (snapshot.empty) {
        if (fromCache) {
          onUpdate(getLocalCachedBoxes(), false);
          return;
        }
        console.info('Firestore boxes collection is empty. Seeding with default master boxes...');
        try {
          await seedFirestoreBoxes(ARCHIVE_BOXES);
        } catch (seedErr) {
          console.error('Failed to auto-seed Firestore:', seedErr);
          if (onError && seedErr instanceof Error) onError(seedErr);
          onUpdate(getLocalCachedBoxes(), false);
        }
        return;
      }

      const boxMap = new Map<number, { box: ArchiveBox; rawUpdatedAt?: string }>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && typeof data.id === 'number') {
          const sanitized = sanitizeArchiveBox(data, data.id);
          const rawUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : undefined;
          const prev = boxMap.get(sanitized.id);
          if (!prev || sanitized.files.length > prev.box.files.length) {
            boxMap.set(sanitized.id, { box: sanitized, rawUpdatedAt });
          }
        }
      });

      const loadedBoxes: ArchiveBox[] = [];
      const boxesToSync: ArchiveBox[] = [];
      const shouldReconcileNow = !hasAutoReconciledOnce;
      if (shouldReconcileNow) {
        hasAutoReconciledOnce = true;
      }

      for (const { box, rawUpdatedAt } of boxMap.values()) {
        // Always hydrate completely empty master boxes; run missing-file merge once for older docs
        const reconciled = reconcileBoxWithMaster(
          box,
          rawUpdatedAt,
          false
        );
        if (reconciled.changed && (shouldReconcileNow || box.files.length === 0)) {
          loadedBoxes.push(reconciled.box);
          boxesToSync.push(reconciled.box);
        } else {
          loadedBoxes.push(box);
        }
      }

      // Add any master ARCHIVE_BOXES not yet stored in Firestore
      if (shouldReconcileNow) {
        const existingIds = new Set(loadedBoxes.map((b) => b.id));
        const missingMasterBoxes = ARCHIVE_BOXES.filter((b) => !existingIds.has(b.id));
        if (missingMasterBoxes.length > 0) {
          loadedBoxes.push(...missingMasterBoxes);
          boxesToSync.push(...missingMasterBoxes);
        }
      }

      if (boxesToSync.length > 0) {
        console.info(`Auto-syncing ${boxesToSync.length} archive boxes with master records to Firestore...`);
        seedFirestoreBoxes(boxesToSync).catch((seedErr) => {
          console.warn('Background master box sync notice:', seedErr);
        });
      }

      // Sort by box ID ascending
      loadedBoxes.sort((a, b) => a.id - b.id);

      // Cache locally for offline backup
      cacheBoxesLocally(loadedBoxes);
      emitDiagnostics({ clientBoxCount: loadedBoxes.length });

      onUpdate(loadedBoxes, !fromCache);
    },
    (error) => {
      console.warn('Firestore subscription notice (falling back to cache):', error.message);
      emitDiagnostics({
        listenerActive: false,
        snapshotFromCache: true,
        lastError: error.message,
      });
      if (onError) onError(error);
      // Fallback to local cache if network is down
      const fallback = getLocalCachedBoxes();
      onUpdate(fallback, false);
    }
  );

  return () => {
    emitDiagnostics({ listenerActive: false });
    unsubscribe();
  };
}

/**
 * Save or update a single box in Firestore and local cache
 */
export async function saveBoxToCloud(box: ArchiveBox): Promise<void> {
  const path = `${BOXES_COLLECTION}/${getBoxDocId(box.id)}`;
  try {
    const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(box.id));
    const payload = stripUndefinedDeep({
      ...box,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Delete a box from Firestore
 */
export async function deleteBoxFromCloud(boxId: number): Promise<void> {
  const path = `${BOXES_COLLECTION}/${getBoxDocId(boxId)}`;
  try {
    const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(boxId));
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Batch seed boxes into Firestore (chunked under 400 ops per batch for safety)
 */
export async function seedFirestoreBoxes(boxes: ArchiveBox[]): Promise<void> {
  try {
    const CHUNK_SIZE = 350;
    for (let i = 0; i < boxes.length; i += CHUNK_SIZE) {
      const chunk = boxes.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const box of chunk) {
        const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(box.id));
        batch.set(
          docRef,
          stripUndefinedDeep({
            ...box,
            updatedAt: new Date().toISOString(),
          })
        );
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, BOXES_COLLECTION);
  }
}

/**
 * Reset Firestore collection back to original master boxes
 */
export async function resetCloudBoxesToDefault(): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, BOXES_COLLECTION));
    const refs = snapshot.docs.map((d) => d.ref);
    const CHUNK_SIZE = 350;
    for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + CHUNK_SIZE)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    // Then seed initial boxes
    await seedFirestoreBoxes(ARCHIVE_BOXES);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, BOXES_COLLECTION);
  }
}

export { testFirestoreConnection };
