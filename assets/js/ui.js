// Reusable UI pieces: icons, visit cards, lazy thumbnails, lightbox, live camera.
import { esc, h, $, $$, fmtDate, fmtDateTime, toast } from './utils.js';
import { S, typeInfo, callLabel, folderInfo, docLabel, mediaURL } from './services.js';

const P = {
  home: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z',
  camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zm8 3a4 4 0 100 8 4 4 0 000-8z',
  folder: 'M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z',
  search: 'M10 3a7 7 0 015.3 11.6l5 5-1.4 1.4-5-5A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z',
  calendar: 'M7 2v2H4a1 1 0 00-1 1v15a1 1 0 001 1h16a1 1 0 001-1V5a1 1 0 00-1-1h-3V2h-2v2H9V2zM5 9h14v10H5z',
  atm: 'M3 4h18v10H3zm3 3v4h12V7zM6 16h12v4H6z',
  printer: 'M7 3h10v5H7zM4 9h16a1 1 0 011 1v6h-4v5H7v-5H3v-6a1 1 0 011-1zm5 8v2h6v-2z',
  chart: 'M4 20V10h3v10zm6 0V4h3v16zm6 0v-7h3v7z',
  report: 'M6 2h9l5 5v15H6zm8 1v5h5M9 12h8M9 16h8',
  settings: 'M12 8a4 4 0 110 8 4 4 0 010-8zm8.6 5.5l-2 .4-.6 1.4 1.1 1.8-1.8 1.8-1.8-1.1-1.4.6-.4 2h-2.6l-.4-2-1.4-.6-1.8 1.1-1.8-1.8 1.1-1.8-.6-1.4-2-.4v-2.6l2-.4.6-1.4-1.1-1.8 1.8-1.8 1.8 1.1 1.4-.6.4-2h2.6l.4 2 1.4.6 1.8-1.1 1.8 1.8-1.1 1.8.6 1.4 2 .4z',
  inbox: 'M3 13l3-9h12l3 9v7H3zm2 0h4a3 3 0 006 0h4',
  cloud: 'M7 18a5 5 0 01-.6-10A7 7 0 0119.5 10 4 4 0 0118 18z',
  doc: 'M6 2h9l5 5v15H6zm8 1v5h5',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  zip: 'M6 2h12v20H6zm5 2v2h2V4zm0 4v2h2V8zm0 4v4h2v-4z',
  image: 'M3 4h18v16H3zm2 2v9l4-4 4 4 3-3 3 3V6zm10 1.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  eye: 'M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 100 8 4 4 0 000-8z',
  trash: 'M9 3h6v2h5v2H4V5h5zm-3 6h12l-1 12H7z',
  move: 'M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8z',
  sun: 'M12 7a5 5 0 110 10 5 5 0 010-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3z',
  sync: 'M12 4a8 8 0 017.7 6h-2.1A6 6 0 006.3 8.3L9 11H2V4l2.9 2.9A8 8 0 0112 4zm-7.7 10h2.1a6 6 0 0011.3 1.7L15 13h7v7l-2.9-2.9A8 8 0 014.3 14z',
  machine: 'M5 3h14v18H5zm3 3v5h8V6zm0 8v2h3v-2z',
};
export const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.doc}"/></svg>`;

export const typeBadge = (t) => `<span class="badge type-${t}">${icon(t === 'ATM' ? 'atm' : 'printer')} ${t === 'ATM' ? 'ATM' : 'Card Printer'}</span>`;
export const folderBadge = (f) => { const fi = folderInfo(f); return `<span class="badge folder" style="--c:${fi.color}">${esc(fi.label)}</span>`; };
export const reviewBadge = (r) => `<span class="badge review-${r}">${r === 'APPROVED' ? '✓ Approved' : r === 'REWORK' ? '⚠ Rework' : '● Pending'}</span>`;

export function visitCard(v, { selectable = false, selected = false } = {}) {
  const cover = v._media?.find((m) => m.kind === 'photo') || v._media?.[0];
  const low = v._photos < S.minPhotos;
  return `<article class="vcard ${selected ? 'sel' : ''}" data-visit="${v.id}" draggable="${selectable}">
    ${selectable ? `<label class="vsel" onclick="event.stopPropagation()"><input type="checkbox" data-sel="${v.id}" ${selected ? 'checked' : ''}></label>` : ''}
    <div class="vthumb">${cover ? `<img data-thumb="${cover.id}" alt="">` : `<div class="noimg">${icon('camera')}</div>`}
      <span class="count">${icon('image')} ${v._photos}${v._docs ? ` · ${icon('doc')} ${v._docs}` : ''}</span></div>
    <div class="vbody">
      <div class="vtitle"><b>${esc(v.name)}</b>${typeBadge(v.machineType)}</div>
      <div class="vmeta">${esc(fmtDate(v.date))} · <b>${esc(v.callType)}</b>${v.ticket ? ' · #' + esc(v.ticket) : ''}</div>
      ${v._machine?.location ? `<div class="vloc">📍 ${esc(v._machine.location)}</div>` : ''}
      <div class="vbadges">${folderBadge(v.folder)}${reviewBadge(v.review)}${low ? `<span class="badge warn">${v._photos}/${S.minPhotos} photos</span>` : ''}</div>
    </div></article>`;
}

/** Fill <img data-thumb="mediaId"> elements lazily. */
export function hydrateThumbs(root, mediaIndex) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(async (e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const m = mediaIndex[e.target.dataset.thumb];
      if (!m) return;
      const url = await mediaURL(m, 'thumb');
      if (url) e.target.src = url; else e.target.classList.add('cloud-only');
    });
  }, { rootMargin: '200px' });
  $$('img[data-thumb]', root).forEach((img) => io.observe(img));
}

// ---------- lightbox / review preview ----------
export function lightbox(list, start = 0, { onChange } = {}) {
  let i = start, zoom = 1;
  const el = h(`<div class="lightbox">
    <div class="lb-top"><div class="lb-info"></div><div class="lb-tools">
      <button class="icon-btn" data-zoom title="Zoom">⤢</button>
      <button class="icon-btn" data-full title="Download original">⬇</button>
      <button class="icon-btn" data-play title="Slideshow">▶</button>
      <button class="icon-btn" data-close title="Close (Esc)">✕</button></div></div>
    <button class="lb-nav prev" aria-label="Previous">‹</button>
    <div class="lb-stage"><img alt=""><iframe title="PDF" hidden></iframe><div class="lb-load">Loading…</div></div>
    <button class="lb-nav next" aria-label="Next">›</button>
    <div class="lb-strip"></div></div>`);
  const img = $('img', el), frame = $('iframe', el), load = $('.lb-load', el);
  let timer = null;
  const strip = $('.lb-strip', el);
  strip.innerHTML = list.map((m, k) => `<img data-k="${k}" data-thumb="${m.id}">`).join('');
  hydrateThumbs(strip, Object.fromEntries(list.map((m) => [m.id, m])));
  async function show() {
    const m = list[i];
    zoom = 1; img.style.transform = '';
    load.hidden = false;
    $('.lb-info', el).innerHTML = `<b>${esc(m.filename)}</b><span>${i + 1} / ${list.length} · ${esc(m.kind === 'document' ? docLabel(m.docType) : m.tag)} · ${esc(fmtDateTime(m.takenAt))}</span>`;
    $$('img', strip).forEach((t) => t.classList.toggle('on', +t.dataset.k === i));
    $(`img[data-k="${i}"]`, strip)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const url = await mediaURL(m, 'full') || await mediaURL(m, 'thumb');
    load.hidden = !!url; if (!url) load.textContent = 'Not on this device — connect Google Drive to load.';
    if (m.mime === 'application/pdf') { img.hidden = true; frame.hidden = false; frame.src = url; }
    else { frame.hidden = true; img.hidden = false; img.src = url; }
    onChange?.(m);
  }
  const go = (d) => { i = (i + d + list.length) % list.length; show(); };
  const close = () => { clearInterval(timer); el.remove(); document.removeEventListener('keydown', key); };
  const key = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  $('.prev', el).onclick = () => go(-1);
  $('.next', el).onclick = () => go(1);
  $('[data-close]', el).onclick = close;
  $('[data-zoom]', el).onclick = () => { zoom = zoom === 1 ? 2.2 : 1; img.style.transform = `scale(${zoom})`; };
  img.ondblclick = () => $('[data-zoom]', el).click();
  $('[data-play]', el).onclick = (e) => {
    if (timer) { clearInterval(timer); timer = null; e.target.textContent = '▶'; }
    else { timer = setInterval(() => go(1), 2500); e.target.textContent = '⏸'; }
  };
  $('[data-full]', el).onclick = async () => {
    const m = list[i]; const url = await mediaURL(m, 'full');
    if (!url) return toast('Original not available offline', 'warn');
    const a = document.createElement('a'); a.href = url; a.download = m.filename; a.click();
  };
  strip.onclick = (e) => { const k = e.target.dataset.k; if (k !== undefined) { i = +k; show(); } };
  let sx = null;
  el.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', (e) => { if (sx === null || zoom > 1) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; });
  document.body.append(el);
  show();
}

// ---------- live camera (multi-shot) ----------
export function liveCamera({ title = 'Camera', onShot }) {
  return new Promise((resolve) => {
    let stream = null, facing = 'environment', shots = 0;
    const el = h(`<div class="camera">
      <video playsinline autoplay muted></video>
      <div class="cam-top"><b>${esc(title)}</b><span class="cam-count">0 captured</span><button class="icon-btn" data-close>✕</button></div>
      <div class="cam-bottom"><button class="icon-btn big" data-flip title="Switch camera">⟲</button>
        <button class="shutter" aria-label="Capture"></button>
        <button class="btn primary" data-done>Done</button></div>
      <div class="cam-flash"></div></div>`);
    const video = $('video', el);
    async function start() {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        video.srcObject = stream;
      } catch (e) { toast('Camera not available: ' + e.message, 'error'); finish(); }
    }
    function finish() { stream?.getTracks().forEach((t) => t.stop()); el.remove(); resolve(shots); }
    $('[data-close]', el).onclick = finish;
    $('[data-done]', el).onclick = finish;
    $('[data-flip]', el).onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); };
    $('.shutter', el).onclick = async () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      $('.cam-flash', el).classList.add('on'); setTimeout(() => $('.cam-flash', el).classList.remove('on'), 150);
      navigator.vibrate?.(30);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
      shots++; $('.cam-count', el).textContent = `${shots} captured`;
      await onShot(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    };
    document.body.append(el);
    start();
  });
}

/** Native file picker. capture=true opens the phone camera app directly. */
export function pickFiles({ accept = 'image/*', multiple = true, capture = false } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

export function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="empty">${icon(iconName, 'xl')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
}

export function callTypeOptions(sel) {
  return S.callTypes.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
}
export function folderOptions(sel) {
  return S.folders.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
}
export function docTypeOptions(sel) {
  return S.docTypes.map((d) => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
}
export { callLabel, typeInfo };
