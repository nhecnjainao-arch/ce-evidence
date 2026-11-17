// Google Drive sync (scope: drive.file — the app only sees files it created).
//
// Drive layout
//   CE Smart Evidence/
//     ATM/<MachineID>/<VisitName>/<files>
//     Card Printer/<MachineID>/<VisitName>/<files>
//     _system/ces-db.json        ← metadata database shared by all your devices
//     _system/thumbs/<id>.jpg    ← small previews so other devices load fast
//
// Sync = pull remote db → merge (last-write-wins per record, deletions via tombstones)
//        → upload new files → relocate moved files → trash deleted files → push merged db.
import { db, getSetting, setSetting } from './db.js';
import { S, bus, saveSettings, typeInfo } from './services.js';
import { loadScript, debounce, toast } from './utils.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const LOCAL_ONLY = ['hasBlob', 'hasThumb'];
const SYNCED_SETTINGS = ['engineerName', 'engineerId', 'region', 'managerEmails', 'maxDimension', 'jpegQuality', 'watermark',
  'minPhotos', 'docEnhance', 'driveRootName', 'callTypes', 'docTypes', 'folders'];

let token = null;
let tokenExp = 0;
let tokenClient = null;
let syncing = false;
export const status = { state: 'offline', account: '', lastSync: 0, message: '' };

function setStatus(patch) { Object.assign(status, patch); bus.emit('sync', status); }

// ---------- auth ----------
(function restoreToken() {
  try {
    const t = JSON.parse(localStorage.getItem('ces-token') || 'null');
    if (t && t.exp > Date.now() + 60000) { token = t.token; tokenExp = t.exp; }
    status.account = localStorage.getItem('ces-account') || '';
    status.lastSync = +localStorage.getItem('ces-lastsync') || 0;
    status.state = token ? 'idle' : (status.account ? 'expired' : 'offline');
  } catch { /* ignore */ }
})();

export const isConnected = () => !!token && tokenExp > Date.now() + 30000;

export async function connect() {
  if (!S.googleClientId) throw new Error('Add your Google OAuth Client ID in Settings → Cloud Sync first.');
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: S.googleClientId,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        token = resp.access_token;
        tokenExp = Date.now() + (resp.expires_in - 60) * 1000;
        localStorage.setItem('ces-token', JSON.stringify({ token, exp: tokenExp }));
        try {
          const about = await api('/about?fields=user(emailAddress,displayName)');
          status.account = about.user.emailAddress;
          localStorage.setItem('ces-account', status.account);
        } catch { /* ignore */ }
        setStatus({ state: 'idle', message: '' });
        resolve(true);
      },
      error_callback: (e) => reject(new Error(e.message || e.type || 'Sign-in cancelled')),
    });
    tokenClient.requestAccessToken({ prompt: status.account ? '' : 'consent', login_hint: status.account || undefined });
  });
}

export function disconnect() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0;
  localStorage.removeItem('ces-token'); localStorage.removeItem('ces-account');
  setStatus({ state: 'offline', account: '' });
}

async function api(path, opts = {}, base = API) {
  if (!isConnected()) { setStatus({ state: 'expired' }); throw new Error('Google session expired — tap Sync to reconnect.'); }
  const res = await fetch(base + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; setStatus({ state: 'expired' }); throw new Error('Google session expired — tap Sync to reconnect.'); }
  if (!res.ok) { const t = await res.text(); const err = new Error(`Drive ${res.status}: ${t.slice(0, 200)}`); err.status = res.status; throw err; }
  if (opts.raw) return res;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

// ---------- folders & files ----------
const qEsc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let folderCache = null;

async function findOrCreateFolder(name, parentId) {
  const q = `name='${qEsc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : " and 'root' in parents");
  const r = await api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (r.files.length) return r.files[0].id;
  const created = await api('/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  });
  return created.id;
}

async function folderPath(parts) {
  if (!folderCache) folderCache = await getSetting('driveFolders', {});
  let parent = null, key = '';
  for (const p of parts) {
    key += '/' + p;
    if (!folderCache[key]) { folderCache[key] = await findOrCreateFolder(p, parent); await setSetting('driveFolders', folderCache); }
    parent = folderCache[key];
  }
  return parent;
}
async function resetFolderCache() { folderCache = {}; await setSetting('driveFolders', {}); }

async function uploadFile(blob, name, parentId, mime, existingId) {
  const meta = existingId ? { name } : { name, parents: [parentId] };
  const boundary = 'ces' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`,
  ]);
  const path = existingId ? `/files/${existingId}?uploadType=multipart&fields=id` : '/files?uploadType=multipart&fields=id';
  return api(path, { method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, UPLOAD);
}

async function downloadFile(id) {
  const res = await api(`/files/${id}?alt=media`, { raw: true });
  return res.blob();
}

function visitFolderParts(visit) {
  return [S.driveRootName, typeInfo(visit.machineType).folder, visit.machineId, visit.name];
}

// ---------- remote blob on demand ----------
export async function fetchRemoteBlob(m, which = 'thumb') {
  const id = which === 'thumb' ? m.thumbDriveId : m.driveId;
  if (!id || !isConnected()) return null;
  const blob = await downloadFile(id);
  const rec = (await db.get('blobs', m.id)) || { id: m.id };
  rec[which] = blob;
  await db.put('blobs', rec);
  const cur = await db.get('media', m.id);
  if (cur) await db.put('media', { ...cur, [which === 'thumb' ? 'hasThumb' : 'hasBlob']: true });
  return blob;
}

// ---------- merge ----------
const strip = (r) => { const o = { ...r }; LOCAL_ONLY.forEach((k) => delete o[k]); Object.keys(o).forEach((k) => k.startsWith('_') && delete o[k]); return o; };

async function mergeStore(name, remoteList, deadIds) {
  const local = await db.all(name);
  const L = new Map(local.map((r) => [r.id, r]));
  const out = [];
  for (const r of remoteList || []) {
    if (deadIds.has(r.id)) continue;
    const l = L.get(r.id);
    if (!l) {
      const rec = name === 'media' ? { ...r, hasBlob: false, hasThumb: false } : r;
      await db.put(name, rec);
      out.push(rec);
    } else if ((r.updatedAt || 0) > (l.updatedAt || 0)) {
      const rec = name === 'media'
        ? { ...r, hasBlob: l.hasBlob, hasThumb: l.hasThumb, needsUpload: l.needsUpload && !r.driveId }
        : r;
      await db.put(name, rec);
      out.push(rec);
    } else out.push(l);
    L.delete(r.id);
  }
  for (const l of L.values()) { if (deadIds.has(l.id)) continue; out.push(l); }
  // apply deletions locally
  for (const id of deadIds) if ((await db.get(name, id))) { await db.del(name, id); if (name === 'media') await db.del('blobs', id); }
  return out;
}

// ---------- full sync ----------
export async function sync({ interactive = false } = {}) {
  if (syncing) return;
  if (!navigator.onLine) { setStatus({ state: 'offline-net', message: 'No internet — changes are saved on this device.' }); return; }
  if (!isConnected()) {
    if (!interactive) { setStatus({ state: status.account ? 'expired' : 'offline' }); return; }
    await connect();
  }
  syncing = true;
  setStatus({ state: 'syncing', message: 'Reading cloud database…' });
  try {
    await doSync();
  } catch (e) {
    if (e.status === 404) { await resetFolderCache(); try { await doSync(); } catch (e2) { fail(e2); } } else fail(e);
  } finally { syncing = false; }
  function fail(e) { console.error(e); setStatus({ state: 'error', message: e.message }); toast('Sync failed: ' + e.message, 'error', 5000); }
}

async function doSync() {
  const sysId = await folderPath([S.driveRootName, '_system']);
  const thumbsId = await folderPath([S.driveRootName, '_system', 'thumbs']);

  // 1. pull
  const found = await api(`/files?q=${encodeURIComponent(`name='ces-db.json' and '${sysId}' in parents and trashed=false`)}&fields=files(id)`);
  const dbFileId = found.files[0]?.id;
  let remote = { machines: [], visits: [], media: [], tombstones: [], settings: null };
  if (dbFileId) remote = { ...remote, ...JSON.parse(await (await downloadFile(dbFileId)).text()) };

  // 2. merge tombstones first
  const localTomb = await db.all('tombstones');
  const tombMap = new Map(localTomb.map((t) => [t.id, t]));
  for (const t of remote.tombstones || []) if (!tombMap.has(t.id)) { tombMap.set(t.id, t); await db.put('tombstones', t); }
  const dead = new Set(tombMap.keys());

  setStatus({ message: 'Merging records…' });
  await mergeStore('machines', remote.machines, dead);
  await mergeStore('visits', remote.visits, dead);
  await mergeStore('media', remote.media, dead);

  if (remote.settings && (remote.settings.updatedAt || 0) > (S.updatedAt || 0)) {
    const patch = {}; SYNCED_SETTINGS.forEach((k) => { if (k in remote.settings) patch[k] = remote.settings[k]; });
    await saveSettings({ ...patch, updatedAt: remote.settings.updatedAt }, { touch: false });
  }

  // 3. upload new media
  const visits = new Map((await db.all('visits')).map((v) => [v.id, v]));
  const media = await db.all('media');
  const toUpload = media.filter((m) => m.needsUpload && m.hasBlob && visits.has(m.visitId));
  let n = 0;
  for (const m of toUpload) {
    n++; setStatus({ message: `Uploading ${n}/${toUpload.length} · ${m.filename}` });
    const v = visits.get(m.visitId);
    const parent = await folderPath(visitFolderParts(v));
    const b = await db.get('blobs', m.id);
    if (!b?.full) continue;
    const f = await uploadFile(b.full, m.filename, parent, m.mime);
    let thumbId = m.thumbDriveId;
    if (b.thumb && !thumbId) thumbId = (await uploadFile(b.thumb, m.id + '.jpg', thumbsId, 'image/jpeg')).id;
    await db.put('media', { ...(await db.get('media', m.id)), driveId: f.id, thumbDriveId: thumbId, driveParent: parent, needsUpload: false, needsRelocate: false, updatedAt: Date.now() });
  }

  // 4. relocate moved / renamed media
  for (const m of (await db.all('media')).filter((x) => x.needsRelocate && x.driveId && visits.has(x.visitId))) {
    setStatus({ message: `Moving ${m.filename}` });
    const parent = await folderPath(visitFolderParts(visits.get(m.visitId)));
    const qs = parent !== m.driveParent && m.driveParent ? `?addParents=${parent}&removeParents=${m.driveParent}` : '';
    await api(`/files/${m.driveId}${qs}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.filename }) });
    await db.put('media', { ...m, driveParent: parent, needsRelocate: false, updatedAt: Date.now() });
  }

  // 5. trash deleted files
  for (const t of (await db.all('tombstones')).filter((x) => !x.remoteDone && x.driveIds?.length)) {
    for (const id of t.driveIds) {
      try { await api(`/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); }
      catch (e) { if (e.status !== 404) throw e; }
    }
    await db.put('tombstones', { ...t, remoteDone: true });
  }

  // 6. push merged database
  setStatus({ message: 'Saving cloud database…' });
  const settings = { updatedAt: S.updatedAt || 0 }; SYNCED_SETTINGS.forEach((k) => (settings[k] = S[k]));
  const payload = {
    app: 'CE Smart Evidence', schema: 1, updatedAt: Date.now(),
    machines: await db.all('machines'), visits: await db.all('visits'),
    media: (await db.all('media')).map(strip), tombstones: await db.all('tombstones'), settings,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  await uploadFile(blob, 'ces-db.json', sysId, 'application/json', dbFileId);

  // 7. pull thumbnails missing on this device (4 at a time)
  const missing = (await db.all('media')).filter((m) => !m.hasThumb && m.thumbDriveId);
  for (let i = 0; i < missing.length; i += 4) {
    setStatus({ message: `Downloading previews ${Math.min(i + 4, missing.length)}/${missing.length}` });
    await Promise.all(missing.slice(i, i + 4).map((m) => fetchRemoteBlob(m, 'thumb').catch(() => null)));
  }

  status.lastSync = Date.now();
  localStorage.setItem('ces-lastsync', status.lastSync);
  setStatus({ state: 'idle', message: '' });
  bus.emit('changed', 'sync');
}

/** Give management read-only access to the CE Smart Evidence Drive folder. */
export async function shareWithManagement(emails) {
  if (!isConnected()) await connect();
  const rootId = await folderPath([S.driveRootName]);
  const results = [];
  for (const email of emails) {
    try {
      await api(`/files/${rootId}/permissions?sendNotificationEmail=true`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      });
      results.push({ email, ok: true });
    } catch (e) { results.push({ email, ok: false, error: e.message }); }
  }
  return { results, link: `https://drive.google.com/drive/folders/${rootId}` };
}

export async function driveFolderLink() {
  const rootId = await folderPath([S.driveRootName]);
  return `https://drive.google.com/drive/folders/${rootId}`;
}

// ---------- automatic sync ----------
const autoSync = debounce(() => { if (S.autoSync && isConnected()) sync(); }, 15000);
export function startAutoSync() {
  bus.on('changed', (what) => { if (what !== 'sync') autoSync(); });
  window.addEventListener('online', () => { setStatus({ state: isConnected() ? 'idle' : status.state }); autoSync(); });
  window.addEventListener('offline', () => setStatus({ state: 'offline-net' }));
  setInterval(() => { if (S.autoSync && isConnected()) sync(); else if (token && !isConnected()) setStatus({ state: 'expired' }); }, 5 * 60 * 1000);
  if (S.autoSync && isConnected()) setTimeout(() => sync(), 3000);
}
