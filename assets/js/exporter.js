// Evidence ZIP packages (with a built-in preview.html for management) and full backup / restore.
import { db } from './db.js';
import { S, typeInfo, callLabel, folderInfo, docLabel, dataset } from './services.js';
import { vendor, esc, fmtDate, fmtDateTime, today, saveOrShare, toast } from './utils.js';
import { fetchRemoteBlob, isConnected } from './drive.js';
import { APP } from './config.js';

const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-');

export function visitFolderName(v) {
  return safe(`${v.name}_${v.callType}_${v.date}`);
}

async function fullBlob(m) {
  const b = await db.get('blobs', m.id);
  if (b?.full) return b.full;
  if (isConnected() && m.driveId) return fetchRemoteBlob(m, 'full');
  return null;
}

/** Build a ZIP for one or many visits. Returns { blob, filename, missing }. */
export async function buildEvidenceZip(visitIds, { onProgress } = {}) {
  const JSZip = await vendor.zip();
  const zip = new JSZip();
  const ds = await dataset();
  const visits = ds.visits.filter((v) => visitIds.includes(v.id)).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const rows = [];
  const preview = [];
  let missing = 0, done = 0;
  const total = visits.reduce((a, v) => a + v._media.length, 0) || 1;
  const single = visits.length === 1;

  for (const v of visits) {
    const base = single ? '' : `${typeInfo(v.machineType).folder}/${v.machineId}/${visitFolderName(v)}/`;
    const items = [];
    for (const m of v._media.sort((a, b) => a.createdAt - b.createdAt)) {
      const blob = await fullBlob(m);
      done++; onProgress?.(done / total);
      const sub = m.kind === 'document' ? 'documents/' : 'photos/';
      if (!blob) { missing++; continue; }
      zip.file(base + sub + m.filename, blob);
      items.push({ path: base + sub + m.filename, m });
    }
    const info = {
      visit: v.name, machineId: v.machineId, machineType: typeInfo(v.machineType).label,
      model: v._machine?.model || '', location: v._machine?.location || '',
      callType: callLabel(v.callType), folder: folderInfo(v.folder).label, date: v.date,
      ticket: v.ticket, remarks: v.remarks, review: v.review, reviewNote: v.reviewNote,
      engineer: v.engineer || S.engineerName, photos: v._photos, documents: v._docs,
      files: v._media.map((m) => ({ file: m.filename, kind: m.kind, tag: m.tag, docType: m.docType, takenAt: new Date(m.takenAt).toISOString() })),
    };
    zip.file(base + 'visit_info.json', JSON.stringify(info, null, 2));
    zip.file(base + 'visit_info.txt', Object.entries(info).filter(([k]) => k !== 'files').map(([k, val]) => `${k.padEnd(12)}: ${val ?? ''}`).join('\r\n'));
    rows.push([v.date, v.name, v.machineId, typeInfo(v.machineType).label, v.callType, folderInfo(v.folder).label, v.ticket, v._photos, v._docs, v.review, (v.remarks || '').replace(/[\r\n,]+/g, ' ')]);
    preview.push({ v, items });
  }

  const csv = [['Date', 'Visit', 'Machine ID', 'Type', 'Call Type', 'Folder', 'Ticket', 'Photos', 'Documents', 'Review', 'Remarks'], ...rows]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  zip.file('summary.csv', '﻿' + csv);
  zip.file('preview.html', previewHtml(preview));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const filename = single
    ? `${visitFolderName(visits[0])}.zip`
    : `CE_Evidence_${visits[0]?.date || today()}_to_${visits.at(-1)?.date || today()}_${visits.length}visits.zip`;
  return { blob, filename, missing };
}

export async function exportVisitsZip(visitIds) {
  if (!visitIds.length) return toast('Nothing selected', 'warn');
  toast('Building ZIP…');
  const { blob, filename, missing } = await buildEvidenceZip(visitIds);
  if (missing) toast(`${missing} file(s) are only in the cloud and could not be included — connect Google Drive and retry.`, 'warn', 6000);
  await saveOrShare(blob, filename, 'Machine evidence');
}

function previewHtml(groups) {
  const cards = groups.map(({ v, items }) => `
  <section class="visit">
    <header><h2>${esc(v.name)} <small>${esc(typeInfo(v.machineType).label)}</small></h2>
    <div class="meta"><span>${esc(fmtDate(v.date))}</span><span>${esc(callLabel(v.callType))}</span><span>${esc(folderInfo(v.folder).label)}</span>
    ${v.ticket ? `<span>Ticket ${esc(v.ticket)}</span>` : ''}<span>${v._photos} photos · ${v._docs} docs</span></div>
    ${v._machine?.location ? `<p>📍 ${esc(v._machine.location)}${v._machine.model ? ' · ' + esc(v._machine.model) : ''}</p>` : ''}
    ${v.remarks ? `<p class="rem">${esc(v.remarks)}</p>` : ''}</header>
    <div class="grid">${items.map(({ path, m }) => m.mime === 'application/pdf'
      ? `<a class="pdf" href="${encodeURI(path)}" target="_blank">📄<br>${esc(m.filename)}</a>`
      : `<figure><img loading="lazy" src="${encodeURI(path)}" onclick="lb(this)"><figcaption>${esc(m.kind === 'document' ? docLabel(m.docType) : m.tag)} · ${esc(fmtDateTime(m.takenAt))}</figcaption></figure>`).join('')}</div>
  </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence Preview</title><style>
body{margin:0;font-family:Segoe UI,Roboto,Arial,sans-serif;background:#0b1220;color:#e2e8f0}
.top{padding:20px 24px;background:linear-gradient(90deg,#0e7490,#6d28d9)}.top h1{margin:0;font-size:22px}.top p{margin:4px 0 0;opacity:.85}
main{padding:16px;max-width:1300px;margin:auto}.visit{background:#111a2e;border:1px solid #1f2b45;border-radius:14px;padding:16px;margin-bottom:18px}
h2{margin:0;font-size:18px}h2 small{font-weight:400;color:#67e8f9;margin-left:8px;font-size:13px}.meta{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.meta span{background:#1e293b;border-radius:99px;padding:3px 10px;font-size:12px}.rem{color:#cbd5e1;font-style:italic}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}figure{margin:0;background:#0b1220;border-radius:10px;overflow:hidden}
img{width:100%;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in;display:block}figcaption{font-size:11px;padding:6px;color:#94a3b8}
.pdf{display:flex;align-items:center;justify-content:center;text-align:center;aspect-ratio:4/3;background:#1e293b;border-radius:10px;color:#fca5a5;font-size:12px;text-decoration:none}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center}#lb img{max-width:96vw;max-height:94vh;width:auto;aspect-ratio:auto;object-fit:contain}
</style></head><body><div class="top"><h1>${esc(APP.name)} — Evidence Preview</h1>
<p>${groups.length} visit(s) · Engineer: ${esc(S.engineerName || '—')} ${S.engineerId ? '(' + esc(S.engineerId) + ')' : ''} · Generated ${esc(new Date().toLocaleString())}</p></div>
<main>${cards}</main><div id="lb" onclick="this.style.display='none'"><img id="lbi"></div>
<script>function lb(i){document.getElementById('lbi').src=i.src;document.getElementById('lb').style.display='flex'}</script>
<p style="text-align:center;color:#64748b;font-size:12px">Extract the ZIP first, then open preview.html to view all photos.</p></body></html>`;
}

// ---------- backup / restore (all data incl. photos) ----------
export async function exportBackup() {
  const JSZip = await vendor.zip();
  const zip = new JSZip();
  const data = {
    app: APP.name, schema: APP.schema, exportedAt: Date.now(),
    machines: await db.all('machines'), visits: await db.all('visits'), media: await db.all('media'),
    tombstones: await db.all('tombstones'), settings: (await db.get('settings', 'app'))?.value || {},
  };
  zip.file('database.json', JSON.stringify(data));
  for (const b of await db.all('blobs')) {
    if (b.full) zip.file(`blobs/${b.id}.full`, b.full);
    if (b.thumb) zip.file(`blobs/${b.id}.thumb`, b.thumb);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  await saveOrShare(blob, `CE_Evidence_Backup_${today()}.zip`);
}

export async function importBackup(file) {
  const JSZip = await vendor.zip();
  const zip = await JSZip.loadAsync(file);
  const data = JSON.parse(await zip.file('database.json').async('string'));
  if (data.app !== APP.name) throw new Error('Not a CE Smart Evidence backup');
  await db.putMany('machines', data.machines);
  await db.putMany('visits', data.visits);
  await db.putMany('tombstones', data.tombstones || []);
  const mediaById = Object.fromEntries(data.media.map((m) => [m.id, m]));
  for (const m of data.media) {
    const full = zip.file(`blobs/${m.id}.full`);
    const thumb = zip.file(`blobs/${m.id}.thumb`);
    if (full || thumb) {
      await db.put('blobs', { id: m.id, full: full ? new Blob([await full.async('arraybuffer')], { type: m.mime }) : undefined, thumb: thumb ? new Blob([await thumb.async('arraybuffer')], { type: 'image/jpeg' }) : undefined });
    }
    mediaById[m.id] = { ...m, hasBlob: !!full, hasThumb: !!thumb };
  }
  await db.putMany('media', Object.values(mediaById));
  return { machines: data.machines.length, visits: data.visits.length, media: data.media.length };
}
