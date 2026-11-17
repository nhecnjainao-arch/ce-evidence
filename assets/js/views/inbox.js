// Import from the phone gallery: (a) "Share → CE Smart Evidence" from Google Photos / Gallery (PWA share target),
// or (b) pick many photos here. Photos are grouped by the date they were taken (EXIF), then assigned to a machine ID.
import { S, createVisit, addMedia, listVisits, getMachine, nextVisitInfo, normalizeId } from '../services.js';
import { MACHINE_TYPES } from '../config.js';
import { esc, $, $$, toast, exifDate, ymd, fmtDate, debounce } from '../utils.js';
import { icon, pickFiles, emptyState, callTypeOptions } from '../ui.js';

const SHARE_CACHE = 'ces-share';
let picked = []; // { key, file, date, url, shared }

async function loadShared() {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARE_CACHE);
  const out = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-name') || 'shared.jpg');
    const file = new File([blob], name, { type: blob.type, lastModified: +res.headers.get('x-modified') || Date.now() });
    out.push({ key: req.url, file, shared: true });
  }
  return out;
}

async function enrich(items) {
  for (const it of items) {
    const d = (await exifDate(it.file)) || new Date(it.file.lastModified || Date.now());
    it.taken = d.getTime(); it.date = ymd(d);
    it.url = it.file.type.startsWith('image/') ? URL.createObjectURL(it.file) : '';
  }
  return items;
}

export async function render(el) {
  const shared = await enrich(await loadShared());
  const known = new Set(picked.map((p) => p.key));
  picked = [...picked, ...shared.filter((s) => !known.has(s.key))];

  const groups = {};
  picked.forEach((p) => (groups[p.date] ||= []).push(p));
  const dates = Object.keys(groups).sort().reverse();

  el.innerHTML = `
  <div class="page-head split"><div><h1>${icon('inbox')} Import from gallery</h1>
    <p class="muted">Pick photos from your phone gallery, or in Google Photos / Gallery tap <b>Share → CE Smart Evidence</b>. Photos are grouped by the date they were taken.</p></div>
    <div class="head-actions"><button class="btn primary" id="ipick">${icon('image')} Pick photos</button>${picked.length ? '<button class="btn ghost" id="iclear">Clear</button>' : ''}</div></div>
  ${!picked.length ? emptyState('inbox', 'Nothing to import', 'Choose photos from your gallery to file them under a machine ID automatically.') : ''}
  ${dates.map((d) => `
    <section class="panel igroup" data-date="${d}">
      <div class="panel-head"><h2>${esc(fmtDate(d))} <small class="muted">${groups[d].length} file(s)</small></h2>
        <label class="check"><input type="checkbox" class="gall" checked> all</label></div>
      <div class="mgrid small">${groups[d].map((p) => `<figure class="mtile"><label class="msel"><input type="checkbox" class="ipick" data-k="${esc(p.key)}" checked></label>
        ${p.url ? `<img src="${p.url}" alt="">` : `<div class="noimg">${icon('doc')}</div>`}<figcaption>${esc(new Date(p.taken).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</figcaption></figure>`).join('')}</div>
      <div class="iform">
        <input class="imid" placeholder="Machine ID e.g. SNB7412" autocapitalize="characters">
        <select class="itype">${MACHINE_TYPES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
        <select class="icall">${callTypeOptions('PM')}</select>
        <select class="ikind"><option value="photo">as Photos</option>${S.docTypes.map((x) => `<option value="doc:${esc(x.id)}">as Document · ${esc(x.label)}</option>`).join('')}</select>
        <span class="iname muted small"></span>
        <button class="btn primary igo">Create visit & import</button>
        <button class="btn ghost iadd">Add to existing visit…</button>
      </div>
    </section>`).join('')}`;

  $('#ipick', el).onclick = async () => {
    const files = await pickFiles({ accept: 'image/*,application/pdf', multiple: true });
    if (!files.length) return;
    toast('Reading photo dates…');
    picked.push(...await enrich(files.map((f, i) => ({ key: `pick-${Date.now()}-${i}`, file: f }))));
    render(el);
  };
  $('#iclear', el) && ($('#iclear', el).onclick = async () => { await clearShared(picked.map((p) => p.key)); picked = []; render(el); });

  $$('.igroup', el).forEach((g) => {
    const date = g.dataset.date;
    $('.gall', g).onchange = (e) => $$('.ipick', g).forEach((c) => (c.checked = e.target.checked));
    const mid = $('.imid', g);
    mid.oninput = debounce(async () => {
      mid.value = mid.value.toUpperCase();
      const id = normalizeId(mid.value);
      if (!id) { $('.iname', g).textContent = ''; return; }
      const m = await getMachine(id);
      if (m) $('.itype', g).value = m.type;
      $('.iname', g).textContent = `→ ${(await nextVisitInfo(id)).name}${m ? '' : ' (new machine)'}`;
    }, 200);
    const chosen = () => $$('.ipick', g).filter((c) => c.checked).map((c) => picked.find((p) => p.key === c.dataset.k)).filter(Boolean);
    const kindOpts = () => { const k = $('.ikind', g).value; return k === 'photo' ? { kind: 'photo' } : { kind: 'document', docType: k.slice(4) }; };
    $('.igo', g).onclick = async () => {
      const items = chosen();
      if (!normalizeId(mid.value)) return toast('Enter the machine ID', 'warn');
      if (!items.length) return toast('Select at least one photo', 'warn');
      const v = await createVisit({ machineId: mid.value, machineType: $('.itype', g).value, callType: $('.icall', g).value, date });
      await importInto(v.id, items, kindOpts(), g);
      location.hash = '#/visit/' + v.id;
    };
    $('.iadd', g).onclick = async () => {
      const items = chosen();
      if (!items.length) return toast('Select at least one photo', 'warn');
      const visits = (await listVisits()).filter((v) => !mid.value || v.machineId === normalizeId(mid.value)).slice(0, 200);
      const { modal } = await import('../utils.js');
      const target = await modal({
        title: 'Add to visit', body: `<div class="list pick">${visits.map((v) => `<label class="row"><input type="radio" name="t" value="${v.id}"> <b class="mono">${esc(v.name)}</b> <small class="muted">${esc(v.date)} · ${esc(v.callType)}</small></label>`).join('') || '<p class="muted">No visits found.</p>'}</div>`,
        actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Import', cls: 'primary', value: (m) => $('input[name=t]:checked', m)?.value || false }],
      });
      if (!target) return;
      await importInto(target, items, kindOpts(), g);
      location.hash = '#/visit/' + target;
    };
  });
}

async function importInto(visitId, items, opts, g) {
  const btn = $('.igo', g); btn.disabled = true;
  let n = 0;
  for (const it of items) {
    n++; btn.textContent = `Importing ${n}/${items.length}…`;
    try { await addMedia(visitId, it.file, { ...opts, takenAt: it.taken }); } catch (e) { toast(e.message, 'error'); }
  }
  await clearShared(items.map((i) => i.key));
  picked = picked.filter((p) => !items.includes(p));
  toast(`${items.length} file(s) imported`, 'ok');
}

async function clearShared(keys) {
  if (!('caches' in window)) return;
  const cache = await caches.open(SHARE_CACHE);
  for (const k of keys) if (k.startsWith('http')) await cache.delete(k);
}
