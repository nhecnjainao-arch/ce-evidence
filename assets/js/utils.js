// Shared helpers: ids, dates, DOM, dialogs, image processing, EXIF, file saving.

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function ymd(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
export const today = () => ymd(new Date());
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export function fmtDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtBytes(b = 0) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- toast & dialogs ----------
export function toast(msg, type = 'info', ms = 2800) {
  let host = $('#toasts');
  if (!host) { host = h('<div id="toasts"></div>'); document.body.append(host); }
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  host.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function modal({ title = '', body = '', actions = [], wide = false, onOpen } = {}) {
  return new Promise((resolve) => {
    const el = h(`<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-actions"></div></div></div>`);
    const bodyEl = $('.modal-body', el);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
    const close = (v) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    $('[data-x]', el).onclick = () => close(null);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(null); });
    actions.forEach((a) => {
      const b = h(`<button class="btn ${a.cls || ''}">${esc(a.label)}</button>`);
      b.onclick = async () => {
        const v = a.value === undefined ? true : (typeof a.value === 'function' ? await a.value(el) : a.value);
        if (v !== false) close(v);
      };
      $('.modal-actions', el).append(b);
    });
    document.body.append(el);
    onOpen?.(el, close);
  });
}

export const confirmDialog = (title, text, okLabel = 'Confirm', danger = false) =>
  modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: okLabel, value: true, cls: danger ? 'danger' : 'primary' }] });

export function promptDialog(title, label, value = '') {
  return modal({
    title,
    body: `<label class="field"><span>${esc(label)}</span><input id="pd-in" value="${esc(value)}"></label>`,
    actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'OK', cls: 'primary', value: (el) => $('#pd-in', el).value.trim() }],
    onOpen: (el) => setTimeout(() => $('#pd-in', el).focus(), 50),
  });
}

// ---------- scripts ----------
const _scripts = {};
export function loadScript(src) {
  if (!_scripts[src]) {
    _scripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.append(s);
    });
  }
  return _scripts[src];
}
export const vendor = {
  zip: () => loadScript('assets/vendor/jszip.min.js').then(() => window.JSZip),
  pdf: async () => { await loadScript('assets/vendor/jspdf.umd.min.js'); await loadScript('assets/vendor/jspdf.plugin.autotable.min.js'); return window.jspdf.jsPDF; },
  pptx: () => loadScript('assets/vendor/pptxgen.bundle.js').then(() => window.PptxGenJS),
  xlsx: () => loadScript('assets/vendor/xlsx.full.min.js').then(() => window.XLSX),
  chart: () => loadScript('assets/vendor/chart.umd.js').then(() => window.Chart),
};

// ---------- saving / sharing ----------
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// On Android, offer the native share sheet (Gmail, Outlook, Teams, Viber, WhatsApp…); otherwise download.
export async function saveOrShare(blob, filename, title = 'CE Smart Evidence') {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    const choice = await modal({
      title: 'File ready',
      body: `<p><b>${esc(filename)}</b> (${fmtBytes(blob.size)})</p><p class="muted">Share directly to email / chat, or save to the device.</p>`,
      actions: [{ label: 'Save to device', value: 'save', cls: 'ghost' }, { label: 'Share…', value: 'share', cls: 'primary' }],
    });
    if (choice === 'share') {
      try { await navigator.share({ files: [file], title, text: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!choice) return;
  }
  downloadBlob(blob, filename);
}

// ---------- images ----------
export function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

async function decode(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej;
      img.src = URL.createObjectURL(blob);
    });
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

/**
 * Resize, optionally enhance (documents) and watermark an image.
 * Returns { full, thumb, width, height }.
 */
export async function processImage(blob, { maxDim = 2048, quality = 0.85, stamp = null, enhance = false } = {}) {
  const img = await decode(blob);
  const iw = img.width, ih = img.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.round(iw * scale), hgt = Math.round(ih * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.45) brightness(1.08)';
  ctx.drawImage(img, 0, 0, w, hgt);
  ctx.filter = 'none';
  if (stamp) drawStamp(ctx, w, hgt, stamp);
  const full = await canvasToBlob(c, quality);
  const thumb = await makeThumb(c, 360);
  img.close?.();
  return { full, thumb, width: w, height: hgt };
}

function drawStamp(ctx, w, hgt, lines) {
  const fs = Math.max(14, Math.round(Math.min(w, hgt) * 0.028));
  const pad = Math.round(fs * 0.6);
  ctx.font = `600 ${fs}px Segoe UI, Roboto, Arial, sans-serif`;
  const lh = fs * 1.3;
  const boxH = lines.length * lh + pad * 2;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(w - boxW - pad, hgt - boxH - pad, boxW, boxH);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, w - boxW, hgt - boxH - pad + pad + i * lh));
}

export async function makeThumb(source, size = 360) {
  const img = source instanceof Blob ? await decode(source) : source;
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 0.72);
}

// PDF / non-image placeholder thumbnail
export async function placeholderThumb(label = 'PDF') {
  const c = document.createElement('canvas');
  c.width = 270; c.height = 360;
  const x = c.getContext('2d');
  x.fillStyle = '#1e293b'; x.fillRect(0, 0, 270, 360);
  x.fillStyle = '#ef4444'; x.fillRect(60, 120, 150, 90);
  x.fillStyle = '#fff'; x.font = 'bold 44px Arial'; x.textAlign = 'center'; x.fillText(label, 135, 182);
  return canvasToBlob(c, 0.8);
}

// ---------- EXIF DateTimeOriginal (JPEG) ----------
export async function exifDate(file) {
  try {
    if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name || '')) return null;
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off < v.byteLength - 4) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      off += 2 + len;
    }
  } catch { /* ignore */ }
  return null;
}
function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  const readIFD = (ifd) => {
    const n = u16(ifd); const tags = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), valOff: e + 8 };
    }
    return tags;
  };
  const str = (t) => {
    const o = t.count > 4 ? start + u32(t.valOff) : t.valOff;
    let s = ''; for (let i = 0; i < t.count - 1; i++) s += String.fromCharCode(v.getUint8(o + i));
    return s;
  };
  const ifd0 = readIFD(start + u32(start + 4));
  let dt = ifd0[0x0132] ? str(ifd0[0x0132]) : null;
  if (ifd0[0x8769]) {
    const ex = readIFD(start + u32(ifd0[0x8769].valOff));
    if (ex[0x9003]) dt = str(ex[0x9003]);
  }
  if (!dt) return null;
  const m = dt.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function deviceId() {
  let id = localStorage.getItem('ces-device');
  if (!id) { id = uid().slice(0, 8); localStorage.setItem('ces-device', id); }
  return id;
}
