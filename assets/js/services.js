// Business logic: settings, machines, visits (auto-naming), media, folders, tombstones, statistics.
import { db, getSetting, setSetting } from './db.js';
import { DEFAULT_SETTINGS, MACHINE_TYPES, CALLTYPE_DEFAULT_FOLDER } from './config.js';
import { uid, today, pad, processImage, placeholderThumb, deviceId, fmtDateTime } from './utils.js';

// ---------- event bus ----------
const listeners = {};
export const bus = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => (listeners[ev] = listeners[ev].filter((f) => f !== fn)); },
  emit(ev, data) { (listeners[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); },
};
const changed = (what) => bus.emit('changed', what);

// ---------- settings ----------
export let S = { ...DEFAULT_SETTINGS };
export async function loadSettings() {
  const saved = await getSetting('app', {});
  S = { ...DEFAULT_SETTINGS, ...saved };
  return S;
}
export async function saveSettings(patch, { touch = true } = {}) {
  S = { ...S, ...patch };
  if (touch) S.updatedAt = Date.now();
  await setSetting('app', S);
  bus.emit('settings', S);
  return S;
}

export const typeInfo = (t) => MACHINE_TYPES.find((m) => m.id === t) || MACHINE_TYPES[0];
export const callLabel = (id) => S.callTypes.find((c) => c.id === id)?.label || id;
export const folderInfo = (id) => S.folders.find((f) => f.id === id) || { id, label: id, color: '#94a3b8' };
export const docLabel = (id) => S.docTypes.find((d) => d.id === id)?.label || id;

export const normalizeId = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '');

// ---------- machines ----------
export async function getMachine(id) { return db.get('machines', normalizeId(id)); }
export async function listMachines() { return db.all('machines'); }
export async function saveMachine(m) {
  const now = Date.now();
  const existing = await db.get('machines', m.id);
  const rec = { createdAt: now, ...existing, ...m, id: normalizeId(m.id), updatedAt: now };
  await db.put('machines', rec);
  if (existing && existing.type !== rec.type) {
    // machine type changed → its visits/media must relocate in Drive (ATM ↔ Card Printer folder)
    for (const v of await db.byIndex('visits', 'machineId', rec.id)) {
      await db.put('visits', { ...v, machineType: rec.type, updatedAt: now });
      for (const md of await db.byIndex('media', 'visitId', v.id)) await db.put('media', { ...md, needsRelocate: true, updatedAt: now });
    }
  }
  changed('machines');
  return rec;
}

// ---------- visits ----------
export async function visitsForMachine(machineId) {
  const v = await db.byIndex('visits', 'machineId', normalizeId(machineId));
  return v.sort((a, b) => a.seq - b.seq);
}

/** First visit → SNB7412, second → SNB7412_01, third → SNB7412_02 … */
export function visitName(machineId, seq) {
  return seq === 0 ? machineId : `${machineId}_${pad(seq)}`;
}
export async function nextVisitInfo(machineId) {
  const id = normalizeId(machineId);
  const visits = await visitsForMachine(id);
  const seq = visits.length ? Math.max(...visits.map((v) => v.seq)) + 1 : 0;
  return { seq, name: visitName(id, seq), previous: visits.length };
}

export async function createVisit({ machineId, machineType, model, location, callType, folder, date, ticket, remarks }) {
  const id = normalizeId(machineId);
  if (!id) throw new Error('Machine ID is required');
  let m = await getMachine(id);
  if (!m) m = await saveMachine({ id, type: machineType || 'ATM', model: model || '', location: location || '' });
  else if ((model && model !== m.model) || (location && location !== m.location)) m = await saveMachine({ ...m, model: model || m.model, location: location || m.location });
  const { seq, name } = await nextVisitInfo(id);
  const now = Date.now();
  const visit = {
    id: uid(), machineId: id, machineType: m.type, name, seq,
    callType: callType || 'NORMAL',
    folder: folder || CALLTYPE_DEFAULT_FOLDER[callType] || 'REGULAR',
    date: date || today(), ticket: ticket || '', remarks: remarks || '',
    review: 'PENDING', reviewNote: '',
    engineer: S.engineerName || '', deviceId: deviceId(),
    createdAt: now, updatedAt: now,
  };
  await db.put('visits', visit);
  changed('visits');
  return visit;
}

export async function updateVisit(id, patch) {
  const v = await db.get('visits', id);
  if (!v) return null;
  const rec = { ...v, ...patch, updatedAt: Date.now() };
  await db.put('visits', rec);
  changed('visits');
  return rec;
}

export async function moveVisits(ids, folder) {
  for (const id of ids) await updateVisit(id, { folder });
}

export async function deleteVisit(id) {
  const media = await db.byIndex('media', 'visitId', id);
  for (const m of media) await deleteMedia(m.id, { silent: true });
  await db.del('visits', id);
  await db.put('tombstones', { id, store: 'visits', driveIds: [], deletedAt: Date.now() });
  changed('visits');
}

export async function listVisits() {
  return (await db.all('visits')).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

// ---------- media ----------
export async function mediaForVisit(visitId) {
  return (await db.byIndex('media', 'visitId', visitId)).sort((a, b) => a.createdAt - b.createdAt);
}

function mediaFilename(visit, kind, docType, n, ext) {
  const base = kind === 'document' ? `${visit.name}_DOC-${docType || 'GEN'}_${pad(n, 3)}` : `${visit.name}_${pad(n, 3)}`;
  return `${base}.${ext}`;
}

async function nextMediaNumber(visit, kind, docType) {
  const all = await db.byIndex('media', 'visitId', visit.id);
  const same = all.filter((m) => m.kind === kind && (kind !== 'document' || m.docType === docType));
  const nums = same.map((m) => +(m.filename.match(/_(\d{3})\.\w+$/)?.[1] || 0));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

/** Add a photo or document (image or PDF) to a visit. Processing happens on-device before saving. */
export async function addMedia(visitId, file, { kind = 'photo', docType = '', tag = 'General', takenAt } = {}) {
  const visit = await db.get('visits', visitId);
  if (!visit) throw new Error('Visit not found');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const ts = takenAt || Date.now();
  let full, thumb, width = 0, height = 0, mime, ext;
  if (isPdf) {
    full = file; thumb = await placeholderThumb('PDF'); mime = 'application/pdf'; ext = 'pdf';
  } else {
    const stamp = S.watermark
      ? [`${visit.name} • ${visit.callType}${kind === 'document' ? ' • ' + docType : ''}`, `${fmtDateTime(ts)}${S.engineerName ? ' • ' + S.engineerName : ''}`]
      : null;
    const r = await processImage(file, {
      maxDim: kind === 'document' ? Math.max(S.maxDimension, 2400) : S.maxDimension,
      quality: S.jpegQuality, stamp, enhance: kind === 'document' && S.docEnhance,
    });
    ({ full, thumb, width, height } = r); mime = 'image/jpeg'; ext = 'jpg';
  }
  const n = await nextMediaNumber(visit, kind, docType);
  const now = Date.now();
  const rec = {
    id: uid(), visitId, kind, docType: kind === 'document' ? docType : '', tag: kind === 'photo' ? tag : '',
    filename: mediaFilename(visit, kind, docType, n, ext), mime, size: full.size, width, height,
    takenAt: ts, createdAt: now, updatedAt: now,
    hasBlob: true, hasThumb: true, needsUpload: true, driveId: '', thumbDriveId: '',
  };
  await db.put('blobs', { id: rec.id, full, thumb });
  await db.put('media', rec);
  await db.put('visits', { ...visit, updatedAt: now });
  changed('media');
  return rec;
}

export async function updateMedia(id, patch) {
  const m = await db.get('media', id);
  if (!m) return null;
  const rec = { ...m, ...patch, updatedAt: Date.now() };
  await db.put('media', rec);
  changed('media');
  return rec;
}

/** Move photos/documents into another visit (renames them to the target visit's naming). */
export async function moveMedia(ids, targetVisitId) {
  const target = await db.get('visits', targetVisitId);
  for (const id of ids) {
    const m = await db.get('media', id);
    if (!m || m.visitId === targetVisitId) continue;
    const n = await nextMediaNumber(target, m.kind, m.docType);
    const ext = m.filename.split('.').pop();
    await db.put('media', {
      ...m, visitId: targetVisitId, filename: mediaFilename(target, m.kind, m.docType, n, ext),
      needsRelocate: !!m.driveId, updatedAt: Date.now(),
    });
  }
  await updateVisit(targetVisitId, {});
  changed('media');
}

export async function deleteMedia(id, { silent = false } = {}) {
  const m = await db.get('media', id);
  if (!m) return;
  await db.del('media', id);
  await db.del('blobs', id);
  await db.put('tombstones', { id, store: 'media', driveIds: [m.driveId, m.thumbDriveId].filter(Boolean), deletedAt: Date.now() });
  if (!silent) changed('media');
}

export async function getBlob(id) { return db.get('blobs', id); }

const urlCache = new Map();
/** Object URL for a media thumbnail (or full). Falls back to Drive download via the sync module. */
export async function mediaURL(m, which = 'thumb') {
  const key = m.id + which;
  if (urlCache.has(key)) return urlCache.get(key);
  let b = await getBlob(m.id);
  let blob = b?.[which] || (which === 'thumb' ? b?.full : null);
  if (!blob) {
    const { fetchRemoteBlob } = await import('./drive.js');
    blob = await fetchRemoteBlob(m, which).catch(() => null);
    if (!blob) return '';
  }
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}
export function forgetURL(id) {
  ['thumb', 'full'].forEach((w) => { const k = id + w; if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); } });
}

// ---------- aggregate dataset ----------
export async function dataset() {
  const [machines, visits, media] = await Promise.all([db.all('machines'), db.all('visits'), db.all('media')]);
  const mediaByVisit = {};
  media.forEach((m) => (mediaByVisit[m.visitId] ||= []).push(m));
  const machineMap = Object.fromEntries(machines.map((m) => [m.id, m]));
  visits.forEach((v) => {
    const md = mediaByVisit[v.id] || [];
    v._photos = md.filter((x) => x.kind === 'photo').length;
    v._docs = md.filter((x) => x.kind === 'document').length;
    v._media = md;
    v._machine = machineMap[v.machineId];
  });
  visits.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  return { machines, visits, media, machineMap, mediaByVisit };
}

/** Stats used by dashboard, daily log and executive reports. */
export function computeStats(ds, { from, to, type = 'ALL' } = {}) {
  const vis = ds.visits.filter((v) => (!from || v.date >= from) && (!to || v.date <= to) && (type === 'ALL' || v.machineType === type));
  const byDay = {};
  const byCall = {};
  const byFolder = {};
  const byMachine = {};
  const uniq = { ATM: new Set(), CP: new Set() };
  let photos = 0, docs = 0;
  vis.forEach((v) => {
    const d = (byDay[v.date] ||= { date: v.date, visits: 0, ATM: new Set(), CP: new Set(), photos: 0, docs: 0, atmVisits: 0, cpVisits: 0 });
    d.visits++; d[v.machineType]?.add(v.machineId); d.photos += v._photos; d.docs += v._docs;
    if (v.machineType === 'ATM') d.atmVisits++; else d.cpVisits++;
    byCall[v.callType] = (byCall[v.callType] || 0) + 1;
    byFolder[v.folder] = (byFolder[v.folder] || 0) + 1;
    (byMachine[v.machineId] ||= { id: v.machineId, type: v.machineType, visits: 0, last: '' }).visits++;
    if (v.date > byMachine[v.machineId].last) byMachine[v.machineId].last = v.date;
    uniq[v.machineType]?.add(v.machineId);
    photos += v._photos; docs += v._docs;
  });
  const days = Object.values(byDay).map((d) => ({ ...d, atm: d.ATM.size, cp: d.CP.size })).sort((a, b) => a.date.localeCompare(b.date));
  const compliant = vis.filter((v) => v._photos >= S.minPhotos).length;
  return {
    visits: vis, days, byCall, byFolder,
    topMachines: Object.values(byMachine).sort((a, b) => b.visits - a.visits),
    totals: {
      visits: vis.length, photos, docs,
      atmVisits: vis.filter((v) => v.machineType === 'ATM').length,
      cpVisits: vis.filter((v) => v.machineType === 'CP').length,
      atmMachines: uniq.ATM.size, cpMachines: uniq.CP.size,
      activeDays: days.length,
      compliance: vis.length ? Math.round((compliant / vis.length) * 100) : 100,
      nonCompliant: vis.filter((v) => v._photos < S.minPhotos),
      pendingReview: vis.filter((v) => v.review === 'PENDING').length,
      rework: vis.filter((v) => v.review === 'REWORK').length,
    },
  };
}

export async function pendingSyncCount() {
  const media = await db.all('media');
  return media.filter((m) => m.needsUpload || m.needsRelocate).length;
}
