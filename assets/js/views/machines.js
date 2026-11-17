// Machine registry, separated into ATM and Card / Statement Printer, plus per-machine history.
import { dataset, saveMachine, getMachine, typeInfo } from '../services.js';
import { MACHINE_TYPES } from '../config.js';
import { esc, $, $$, toast, modal, debounce } from '../utils.js';
import { icon, visitCard, hydrateThumbs, emptyState } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el) {
  const ds = await dataset();
  let tab = sessionStorage.getItem('mach-tab') || 'ATM';
  const stats = {};
  ds.visits.forEach((v) => { const s = (stats[v.machineId] ||= { n: 0, last: '', call: '', photos: 0 }); s.n++; s.photos += v._photos; if (v.date >= s.last) { s.last = v.date; s.call = v.callType; } });

  el.innerHTML = `
  <div class="page-head split"><div><h1>${icon('machine')} Machines</h1><p class="muted">ATM and card / statement printers kept separate for easy finding.</p></div>
    <button class="btn primary" id="madd">${icon('plus')} Add machine</button></div>
  <div class="ftabs" id="mtabs">${MACHINE_TYPES.map((t) => `<button class="ftab ${t.id === tab ? 'on' : ''}" data-t="${t.id}" style="--c:${t.color}">${icon(t.id === 'ATM' ? 'atm' : 'printer')}<span>${esc(t.label)}</span><b>${ds.machines.filter((m) => m.type === t.id).length}</b></button>`).join('')}</div>
  <input id="mq" class="full" placeholder="Filter by ID, model, location…">
  <div class="table-wrap"><table class="tbl hover"><thead><tr><th>Machine ID</th><th>Model</th><th>Location</th><th>Visits</th><th>Photos</th><th>Last visit</th><th>Last call</th><th></th></tr></thead><tbody id="mbody"></tbody></table></div>`;

  const draw = () => {
    const q = $('#mq', el).value.toLowerCase();
    const list = ds.machines.filter((m) => m.type === tab && [m.id, m.model, m.location, m.serial, m.customer].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (stats[b.id]?.last || '').localeCompare(stats[a.id]?.last || ''));
    $('#mbody', el).innerHTML = list.map((m) => `<tr data-id="${esc(m.id)}"><td><b class="mono">${esc(m.id)}</b></td><td>${esc(m.model || '')}</td><td>${esc(m.location || '')}</td>
      <td>${stats[m.id]?.n || 0}</td><td>${stats[m.id]?.photos || 0}</td><td>${esc(stats[m.id]?.last || '—')}</td><td>${esc(stats[m.id]?.call || '')}</td>
      <td><a class="btn sm ghost" href="#/capture/${encodeURIComponent(m.id)}" onclick="event.stopPropagation()">${icon('camera')} Visit</a></td></tr>`).join('')
      || `<tr><td colspan="8" class="muted">No ${tab === 'ATM' ? 'ATM' : 'card printer'} machines yet.</td></tr>`;
  };
  $('#mtabs', el).onclick = (e) => { const b = e.target.closest('.ftab'); if (!b) return; tab = b.dataset.t; sessionStorage.setItem('mach-tab', tab); $$('#mtabs .ftab', el).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  $('#mq', el).oninput = debounce(draw, 120);
  $('#mbody', el).onclick = (e) => { const r = e.target.closest('tr[data-id]'); if (r) location.hash = '#/machine/' + encodeURIComponent(r.dataset.id); };
  $('#madd', el).onclick = async () => { const m = await editMachine({ id: '', type: tab }); if (m) render(el); };
  draw();
}

export async function editMachine(m) {
  return modal({
    title: m.id ? `Edit ${m.id}` : 'Add machine',
    body: `<form class="form" id="mf">
      <label class="field"><span>Machine ID</span><input name="id" value="${esc(m.id)}" ${m.id ? 'readonly' : 'required'} autocapitalize="characters"></label>
      <label class="field"><span>Type</span><select name="type">${MACHINE_TYPES.map((t) => `<option value="${t.id}" ${t.id === m.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <div class="row2"><label class="field"><span>Model</span><input name="model" value="${esc(m.model || '')}"></label><label class="field"><span>Serial no.</span><input name="serial" value="${esc(m.serial || '')}"></label></div>
      <div class="row2"><label class="field"><span>Location / Branch</span><input name="location" value="${esc(m.location || '')}"></label><label class="field"><span>Customer / Bank</span><input name="customer" value="${esc(m.customer || '')}"></label></div>
      <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(m.notes || '')}</textarea></label></form>`,
    actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, {
      label: 'Save', cls: 'primary', value: async (d) => {
        const f = Object.fromEntries(new FormData($('#mf', d)));
        if (!f.id) { toast('Machine ID required', 'warn'); return false; }
        const rec = await saveMachine({ ...m, ...f }); toast('Machine saved', 'ok'); return rec;
      },
    }],
  });
}

export async function renderMachine(el, [rawId]) {
  const id = decodeURIComponent(rawId || '');
  const m = await getMachine(id);
  if (!m) { el.innerHTML = emptyState('machine', 'Machine not found', id); return; }
  const ds = await dataset();
  const visits = ds.visits.filter((v) => v.machineId === id);
  const photos = visits.reduce((a, v) => a + v._photos, 0);
  el.innerHTML = `
  <div class="page-head split"><div><a href="#/machines" class="link small">← Machines</a><h1 class="mono">${esc(m.id)}</h1>
    <p class="muted">${esc(typeInfo(m.type).label)}${m.model ? ' · ' + esc(m.model) : ''}${m.serial ? ' · S/N ' + esc(m.serial) : ''}${m.location ? ' · 📍 ' + esc(m.location) : ''}${m.customer ? ' · ' + esc(m.customer) : ''}</p></div>
    <div class="head-actions"><button class="btn ghost" id="medit">Edit</button>${visits.length ? `<button class="btn ghost" id="mzip">${icon('zip')} ZIP all</button>` : ''}
    <a class="btn primary" href="#/capture/${encodeURIComponent(m.id)}">${icon('camera')} New visit</a></div></div>
  <section class="kpis"><div class="kpi tone-cyan"><div class="kpi-main"><span class="kpi-label">Visits</span><b class="kpi-val">${visits.length}</b></div></div>
    <div class="kpi tone-blue"><div class="kpi-main"><span class="kpi-label">Photos</span><b class="kpi-val">${photos}</b></div></div>
    <div class="kpi tone-cp"><div class="kpi-main"><span class="kpi-label">Next visit name</span><b class="kpi-val mono small">${esc(visits.length ? `${m.id}_${String(Math.max(...visits.map((v) => v.seq)) + 1).padStart(2, '0')}` : m.id)}</b></div></div></section>
  <h3 class="sec-title">Visit timeline</h3>
  ${visits.length ? `<div class="timeline">${visits.sort((a, b) => b.seq - a.seq).map((v) => `<div class="tl-item"><i></i>${visitCard(v)}</div>`).join('')}</div>` : emptyState('camera', 'No visits yet', 'Start a visit to capture photos.')}`;
  hydrateThumbs(el, Object.fromEntries(ds.media.map((x) => [x.id, x])));
  el.querySelectorAll('.vcard').forEach((c) => (c.onclick = () => (location.hash = '#/visit/' + c.dataset.visit)));
  $('#medit', el).onclick = async () => { if (await editMachine(m)) renderMachine(el, [rawId]); };
  $('#mzip', el) && ($('#mzip', el).onclick = () => exportVisitsZip(visits.map((v) => v.id)));
}
