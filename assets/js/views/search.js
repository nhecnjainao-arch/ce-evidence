// Search across machine IDs, visit names, tickets, locations, remarks, file names, call types and dates.
import { S, dataset, typeInfo } from '../services.js';
import { esc, $, debounce } from '../utils.js';
import { icon, visitCard, hydrateThumbs, emptyState, callTypeOptions, folderOptions } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el, _p, query) {
  const ds = await dataset();
  const q0 = query.get('q') || '';
  el.innerHTML = `
  <div class="page-head"><h1>${icon('search')} Search</h1></div>
  <div class="panel form">
    <input id="sq" class="search-big" placeholder="Machine ID, visit (SNB7412_01), ticket, location, remark, file name…" value="${esc(q0)}" autofocus>
    <div class="row4">
      <select id="st"><option value="ALL">All machine types</option><option value="ATM">ATM</option><option value="CP">Card / Statement Printer</option></select>
      <select id="sc"><option value="">All call types</option>${callTypeOptions('')}</select>
      <select id="sf"><option value="">All folders</option>${folderOptions('')}</select>
      <select id="sr"><option value="">Any review state</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REWORK">Needs rework</option></select>
    </div>
    <div class="row3"><label class="field"><span>From</span><input type="date" id="sfrom"></label><label class="field"><span>To</span><input type="date" id="sto"></label>
      <label class="field"><span>&nbsp;</span><label class="check"><input type="checkbox" id="slow"> Below ${S.minPhotos} photos only</label></label></div>
  </div>
  <div class="toolbar"><span id="scount" class="muted"></span><button class="btn sm" id="szip" hidden>${icon('zip')} ZIP results</button></div>
  <div id="sres"></div>`;
  $('#sc', el).value = ''; $('#sf', el).value = '';

  const idx = ds.visits.map((v) => ({
    v,
    text: [v.name, v.machineId, v.ticket, v.remarks, v.callType, v.date, v.reviewNote, v.engineer, typeInfo(v.machineType).label,
      v._machine?.location, v._machine?.model, v._machine?.serial, v._machine?.customer, ...v._media.map((m) => m.filename + ' ' + m.tag + ' ' + m.docType)].join(' ').toLowerCase(),
  }));
  const mediaIdx = Object.fromEntries(ds.media.map((m) => [m.id, m]));
  let results = [];

  const run = () => {
    const q = $('#sq', el).value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const t = $('#st', el).value, c = $('#sc', el).value, f = $('#sf', el).value, r = $('#sr', el).value;
    const from = $('#sfrom', el).value, to = $('#sto', el).value, low = $('#slow', el).checked;
    results = idx.filter(({ v, text }) =>
      terms.every((x) => text.includes(x)) && (t === 'ALL' || v.machineType === t) && (!c || v.callType === c) && (!f || v.folder === f) &&
      (!r || v.review === r) && (!from || v.date >= from) && (!to || v.date <= to) && (!low || v._photos < S.minPhotos)).map((x) => x.v);
    // exact machine ID match first
    results.sort((a, b) => (b.machineId.toLowerCase() === q) - (a.machineId.toLowerCase() === q) || b.date.localeCompare(a.date));
    $('#scount', el).textContent = `${results.length} visit(s) · ${results.reduce((a, v) => a + v._photos, 0)} photos`;
    $('#szip', el).hidden = !results.length;
    $('#sres', el).innerHTML = results.length ? `<div class="vgrid">${results.slice(0, 200).map((v) => visitCard(v)).join('')}</div>` : emptyState('search', 'No matches', 'Try a machine ID like SNB7412 or a date like 2026-11.');
    hydrateThumbs(el, mediaIdx);
    history.replaceState(null, '', '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
  };
  el.addEventListener('input', debounce(run, 150));
  el.addEventListener('change', run);
  $('#sres', el).onclick = (e) => { const c = e.target.closest('.vcard'); if (c) location.hash = '#/visit/' + c.dataset.visit; };
  $('#szip', el).onclick = () => exportVisitsZip(results.map((v) => v.id));
  run();
}
