// IndexedDB layer. Local database = source of truth on each device; Google Drive keeps devices in sync.
//
// Stores
//   machines   { id (machine ID, e.g. SNB7412), type 'ATM'|'CP', model, serial, location, customer, notes, createdAt, updatedAt }
//   visits     { id, machineId, machineType, name (SNB7412 / SNB7412_01 …), seq, callType, folder, date 'YYYY-MM-DD',
//                ticket, remarks, review, reviewNote, createdAt, updatedAt, deviceId }
//   media      { id, visitId, kind 'photo'|'document', docType, tag, filename, mime, size, width, height, takenAt,
//                createdAt, updatedAt, driveId, thumbDriveId, driveParent, hasBlob, hasThumb, needsUpload, needsRelocate }
//   blobs      { id (= media id), full: Blob, thumb: Blob }
//   settings   { key, value }
//   tombstones { id, store, driveIds[], deletedAt, remoteDone }

const DB_NAME = 'ce-smart-evidence';
const DB_VERSION = 1;
let _db;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('machines')) {
        const s = db.createObjectStore('machines', { keyPath: 'id' });
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('visits')) {
        const s = db.createObjectStore('visits', { keyPath: 'id' });
        s.createIndex('machineId', 'machineId');
        s.createIndex('date', 'date');
        s.createIndex('folder', 'folder');
      }
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('visitId', 'visitId');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('tombstones')) db.createObjectStore('tombstones', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async get(name, id) { return wrap((await store(name)).get(id)); },
  async all(name) { return wrap((await store(name)).getAll()); },
  async put(name, value) { await wrap((await store(name, 'readwrite')).put(value)); return value; },
  async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
  async byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); },
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },
  async putMany(name, values) {
    const database = await openDB();
    return new Promise((res, rej) => {
      const tx = database.transaction(name, 'readwrite');
      const s = tx.objectStore(name);
      values.forEach((v) => s.put(v));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async count(name) { return wrap((await store(name)).count()); },
};

// Settings helpers (key/value)
export async function getSetting(key, fallback) {
  const r = await db.get('settings', key);
  return r === undefined ? fallback : r.value;
}
export async function setSetting(key, value) {
  return db.put('settings', { key, value });
}
