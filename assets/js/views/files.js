// Case folders (Regular / Inspection / Escalation / …) separated by ATM vs Card Printer.
// Select visits → move between folders (or drag & drop on laptop), ZIP, delete.
import { S, dataset, moveVisits, deleteVisit, folderInfo } from '../services.js';
import { esc, $, $$, toast, confirmDialog } from '../utils.js';
import { icon, visitCard, hydrateThumbs, emptyState } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el, [folderParam]) {
  const ds = await dataset();
  let folder = folderParam || 'ALL';
  let type = sessionStorage.getItem('files-type') || 'ALL';
  let range = sessionStorage.getItem('files-range') || '';
  const selected = new Set();

  el.innerHTML = `
  <div class="page-head split"><div><h1>${icon('folder')} Evidence files</h1><p class="muted">Organised by case folder and machine type. Drag visits onto a folder to move them.</p></div>
    <a class="btn primary" href="#/capture">${icon('plus')} New visit</a></div>
  <div class="ftabs" id="ftabs"></div>
  <div class="toolbar">
    <div class="seg" id="ftype">${[['ALL', 'All'], ['ATM', 'ATM'], ['CP', 'Card Printer']].map(([k, l]) => `<button data-t="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div>
    <select id="frange"><option value="">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option></select>
    <button class="btn sm ghost" id="selall">Select all</button>
  </div>
  <div class="selbar" id="selbar" hidden><span id="selcount"></span>
    <select id="moveto"><option value="">Move to folder…</option>${S.folders.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select>
    <button class="btn sm" data-act="zip">${icon('zip')} ZIP</button>
    <button class="btn sm danger edit-only" data-act="del">${icon('trash')} Delete</button>
    <button class="btn sm ghost" data-act="clear">Clear</button></div>
  <div id="flist"></div>`;
  $('#frange', el).value = range;

  const mediaIdx = Object.fromEntries(ds.media.map((m) => [m.id, m]));
  function filtered() {
    const now = new Date();
    let from = '';
    if (range === '7' || range === '30') { const d = new Date(); d.setDate(d.getDate() - +range + 1); from = d.toISOString().slice(0, 10); }
    if (range === 'month') from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return ds.visits.filter((v) => (type === 'ALL' || v.machineType === type) && (!from || v.date >= from));
  }
  function draw() {
    const base = filtered();
    const counts = {}; base.forEach((v) => (counts[v.folder] = (counts[v.folder] || 0) + 1));
    $('#ftabs', el).innerHTML = [{ id: 'ALL', label: 'All', color: '#94a3b8' }, ...S.folders].map((f) =>
      `<button class="ftab ${f.id === folder ? 'on' : ''}" data-f="${f.id}" style="--c:${f.color}">${icon('folder')}<span>${esc(f.label)}</span><b>${f.id === 'ALL' ? base.length : counts[f.id] || 0}</b></button>`).join('');
    const list = folder === 'ALL' ? base : base.filter((v) => v.folder === folder);
    const atm = list.filter((v) => v.machineType === 'ATM'), cp = list.filter((v) => v.machineType === 'CP');
    const section = (title, ic, arr) => arr.length ? `<h3 class="sec-title">${icon(ic)} ${title} <small class="muted">${arr.length}</small></h3><div class="vgrid">${arr.map((v) => visitCard(v, { selectable: true, selected: selected.has(v.id) })).join('')}</div>` : '';
    $('#flist', el).innerHTML = list.length
      ? (type === 'ALL' ? section('ATM', 'atm', atm) + section('Card / Statement Printer', 'printer', cp) : section(type === 'ATM' ? 'ATM' : 'Card / Statement Printer', type === 'ATM' ? 'atm' : 'printer', list))
      : emptyState('folder', 'Folder is empty', 'No visits match this folder and filter.');
    hydrateThumbs(el, mediaIdx);
    updateSel();
  }
  function updateSel() {
    $('#selbar', el).hidden = !selected.size;
    $('#selcount', el).textContent = `${selected.size} selected`;
  }

  $('#ftabs', el).onclick = (e) => { const b = e.target.closest('.ftab'); if (!b) return; folder = b.dataset.f; history.replaceState(null, '', '#/files/' + folder); draw(); };
  $('#ftype', el).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; sessionStorage.setItem('files-type', type); $$('#ftype button', el).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  $('#frange', el).onchange = (e) => { range = e.target.value; sessionStorage.setItem('files-range', range); draw(); };
  $('#selall', el).onclick = () => { const list = (folder === 'ALL' ? filtered() : filtered().filter((v) => v.folder === folder)); const all = list.every((v) => selected.has(v.id)); list.forEach((v) => (all ? selected.delete(v.id) : selected.add(v.id))); draw(); };

  $('#flist', el).onclick = (e) => {
    const cb = e.target.closest('[data-sel]');
    if (cb) { cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel); cb.closest('.vcard').classList.toggle('sel', cb.checked); updateSel(); return; }
    const card = e.target.closest('.vcard');
    if (card) location.hash = '#/visit/' + card.dataset.visit;
  };
  $('#moveto', el).onchange = async (e) => {
    if (!e.target.value) return;
    await moveVisits([...selected], e.target.value);
    toast(`${selected.size} visit(s) moved to ${folderInfo(e.target.value).label}`, 'ok');
    selected.clear(); render(el, [folder]);
  };
  $('#selbar', el).onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'zip') exportVisitsZip([...selected]);
    if (act === 'clear') { selected.clear(); draw(); }
    if (act === 'del' && await confirmDialog('Delete visits', `Delete ${selected.size} visit(s) and all their files?`, 'Delete', true)) {
      for (const id of selected) await deleteVisit(id);
      selected.clear(); render(el, [folder]);
    }
  };

  // drag & drop (laptop)
  el.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.vcard'); if (!card) return;
    const ids = selected.has(card.dataset.visit) ? [...selected] : [card.dataset.visit];
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
  });
  $('#ftabs', el).addEventListener('dragover', (e) => { const t = e.target.closest('.ftab'); if (t && t.dataset.f !== 'ALL') { e.preventDefault(); t.classList.add('drop'); } });
  $('#ftabs', el).addEventListener('dragleave', (e) => e.target.closest('.ftab')?.classList.remove('drop'));
  $('#ftabs', el).addEventListener('drop', async (e) => {
    const t = e.target.closest('.ftab'); if (!t) return;
    e.preventDefault();
    const ids = JSON.parse(e.dataTransfer.getData('text/plain') || '[]');
    await moveVisits(ids, t.dataset.f);
    toast(`${ids.length} visit(s) moved to ${folderInfo(t.dataset.f).label}`, 'ok');
    selected.clear(); render(el, [folder]);
  });

  draw();
}
