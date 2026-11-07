import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, testFirestoreConnection } from '../lib/firebase';
import { ArchiveBox, ARCHIVE_BOXES } from '../data/archiveData';

const BOXES_COLLECTION = 'boxes';
const LOCAL_STORAGE_KEY = 'smart_docs_boxes_data_v1';

export function getBoxDocId(boxId: number): string {
  return `box_${boxId}`;
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
 * Read cached boxes from localStorage if available
 */
export function getLocalCachedBoxes(): ArchiveBox[] {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read cached boxes from localStorage:', err);
  }
  return ARCHIVE_BOXES;
}

/**
 * Subscribe to Firestore 'boxes' collection in real time.
 * If empty on first connection, it automatically seeds the initial 13 archive boxes.
 */
export function subscribeToFirestoreBoxes(
  onUpdate: (boxes: ArchiveBox[], isCloudSynced: boolean) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, BOXES_COLLECTION);

  const unsubscribe = onSnapshot(
    colRef,
    async (snapshot) => {
      // If collection is completely empty, seed it with the default 13 archive boxes
      if (snapshot.empty) {
        console.info('Firestore boxes collection is empty. Seeding with default master boxes...');
        try {
          await seedFirestoreBoxes(ARCHIVE_BOXES);
        } catch (seedErr) {
          console.error('Failed to auto-seed Firestore:', seedErr);
        }
        return;
      }

      const loadedBoxes: ArchiveBox[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ArchiveBox;
        if (data && typeof data.id === 'number') {
          loadedBoxes.push(data);
        }
      });

      // Sort by box ID ascending
      loadedBoxes.sort((a, b) => a.id - b.id);

      // Cache locally for offline backup
      cacheBoxesLocally(loadedBoxes);

      onUpdate(loadedBoxes, true);
    },
    (error) => {
      console.warn('Firestore subscription notice (falling back to cache):', error.message);
      if (onError) onError(error);
      // Fallback to local cache if network is down
      const fallback = getLocalCachedBoxes();
      onUpdate(fallback, false);
    }
  );

  return unsubscribe;
}

/**
 * Save or update a single box in Firestore and local cache
 */
export async function saveBoxToCloud(box: ArchiveBox): Promise<void> {
  const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(box.id));
  const payload = {
    ...box,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(docRef, payload, { merge: true });
}

/**
 * Delete a box from Firestore
 */
export async function deleteBoxFromCloud(boxId: number): Promise<void> {
  const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(boxId));
  await deleteDoc(docRef);
}

/**
 * Batch seed boxes into Firestore
 */
export async function seedFirestoreBoxes(boxes: ArchiveBox[]): Promise<void> {
  const batch = writeBatch(db);
  for (const box of boxes) {
    const docRef = doc(db, BOXES_COLLECTION, getBoxDocId(box.id));
    batch.set(docRef, {
      ...box,
      updatedAt: new Date().toISOString(),
    });
  }
  await batch.commit();
}

/**
 * Reset Firestore collection back to original master 13 boxes
 */
export async function resetCloudBoxesToDefault(): Promise<void> {
  // First delete any boxes that are not in ARCHIVE_BOXES
  const snapshot = await getDocs(collection(db, BOXES_COLLECTION));
  const batch = writeBatch(db);
  snapshot.forEach((d) => {
    batch.delete(d.ref);
  });
  await batch.commit();

  // Then seed initial boxes
  await seedFirestoreBoxes(ARCHIVE_BOXES);
}

export { testFirestoreConnection };
