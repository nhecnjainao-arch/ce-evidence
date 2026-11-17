// New visit: machine ID → auto name (SNB7412, SNB7412_01 …) → call type → start capturing.
import { S, listMachines, getMachine, nextVisitInfo, createVisit, normalizeId, visitsForMachine } from '../services.js';
import { CALLTYPE_DEFAULT_FOLDER, MACHINE_TYPES } from '../config.js';
import { esc, today, $, $$, toast, debounce } from '../utils.js';
import { icon, callTypeOptions, folderOptions } from '../ui.js';

export async function render(el, [preset]) {
  const machines = await listMachines();
  el.innerHTML = `
  <div class="page-head"><h1>${icon('camera')} New machine visit</h1><p class="muted">Photos and documents are named automatically from the machine ID.</p></div>
  <form class="panel form" id="vf" autocomplete="off">
    <label class="field big"><span>Machine ID</span>
      <input name="machineId" id="mid" list="mlist" placeholder="e.g. SNB7412" required autocapitalize="characters" value="${esc(preset || '')}">
      <datalist id="mlist">${machines.map((m) => `<option value="${esc(m.id)}">${m.type === 'ATM' ? 'ATM' : 'Card Printer'} ${esc(m.location || '')}</option>`).join('')}</datalist></label>
    <div class="name-preview" id="np"><span class="muted">Visit name will appear here</span></div>

    <div class="field"><span>Machine type</span>
      <div class="seg wide" id="mtype">${MACHINE_TYPES.map((t, i) => `<button type="button" data-t="${t.id}" class="${i === 0 ? 'on' : ''}">${icon(t.id === 'ATM' ? 'atm' : 'printer')} ${esc(t.label)}</button>`).join('')}</div></div>

    <div class="row2">
      <label class="field"><span>Model</span><input name="model" placeholder="e.g. SelfServ 84 / CS-200"></label>
      <label class="field"><span>Location / Branch</span><input name="location" placeholder="Branch or site"></label>
    </div>

    <div class="field"><span>Call type</span>
      <div class="chips" id="calls">${S.callTypes.map((c, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c.id)}" title="${esc(c.label)}">${esc(c.id)}</button>`).join('')}</div>
      <select name="callType" hidden>${callTypeOptions(S.callTypes[0]?.id)}</select></div>

    <div class="row3">
      <label class="field"><span>Case folder</span><select name="folder">${folderOptions('REGULAR')}</select></label>
      <label class="field"><span>Visit date</span><input type="date" name="date" value="${today()}" required></label>
      <label class="field"><span>Ticket / Call no.</span><input name="ticket" placeholder="optional"></label>
    </div>
    <label class="field"><span>Remarks</span><textarea name="remarks" rows="2" placeholder="Problem found, action taken, parts replaced…"></textarea></label>
    <div class="form-actions"><button class="btn primary lg" type="submit">${icon('camera')} Start visit & capture</button></div>
  </form>`;

  const form = $('#vf', el);
  let mtype = 'ATM';
  const setType = (t) => { mtype = t; $$('#mtype button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); };
  $('#mtype', el).onclick = (e) => { const b = e.target.closest('button'); if (b) setType(b.dataset.t); };
  $('#calls', el).onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    $$('#calls .chip', el).forEach((c) => c.classList.toggle('on', c === b));
    form.callType.value = b.dataset.c;
    form.folder.value = CALLTYPE_DEFAULT_FOLDER[b.dataset.c] || 'REGULAR';
  };

  const preview = debounce(async () => {
    const id = normalizeId(form.machineId.value);
    const np = $('#np', el);
    if (!id) { np.innerHTML = '<span class="muted">Visit name will appear here</span>'; return; }
    const info = await nextVisitInfo(id);
    const m = await getMachine(id);
    if (m) {
      setType(m.type);
      if (!form.model.value) form.model.value = m.model || '';
      if (!form.location.value) form.location.value = m.location || '';
      const last = (await visitsForMachine(id)).at(-1);
      np.innerHTML = `<b class="mono">${esc(info.name)}</b><span>Visit #${info.previous + 1} for this ${m.type === 'ATM' ? 'ATM' : 'card printer'}${last ? ` · last ${esc(last.date)} (${esc(last.callType)})` : ''}</span>
        <a href="#/machine/${encodeURIComponent(id)}" class="link">History</a>`;
    } else {
      np.innerHTML = `<b class="mono">${esc(info.name)}</b><span>New machine — first visit</span>`;
    }
  }, 200);
  form.machineId.addEventListener('input', () => { form.machineId.value = form.machineId.value.toUpperCase(); preview(); });
  preview();
  setTimeout(() => form.machineId.focus(), 100);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      const v = await createVisit({ ...f, machineType: mtype });
      toast(`Visit ${v.name} created`, 'ok');
      location.hash = `#/visit/${v.id}?new=1`;
    } catch (err) { toast(err.message, 'error'); }
  };
}
