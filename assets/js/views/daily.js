// Daily log: how many ATMs and card printers were visited each day — for justification to management.
import { dataset, computeStats, typeInfo, folderInfo } from '../services.js';
import { esc, $, today, addDays, fmtDate, dateRange, vendor, saveOrShare } from '../utils.js';
import { icon, visitCard, hydrateThumbs, emptyState } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el, [dateParam]) {
  const date = dateParam || today();
  const ds = await dataset();
  const day = computeStats(ds, { from: date, to: date });
  const month = date.slice(0, 7);
  const mFrom = month + '-01';
  const mEnd = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const mTo = `${month}-${String(mEnd).padStart(2, '0')}`;
  const ms = computeStats(ds, { from: mFrom, to: mTo });
  const byDay = Object.fromEntries(ms.days.map((d) => [d.date, d]));
  const t = day.totals;

  el.innerHTML = `
  <div class="page-head split"><div><h1>${icon('calendar')} Daily log</h1><p class="muted">Track machines visited per day — ATM vs card / statement printer.</p></div>
    <div class="daynav"><a class="btn ghost" href="#/daily/${addDays(date, -1)}">‹</a><input type="date" id="dpick" value="${date}"><a class="btn ghost" href="#/daily/${addDays(date, 1)}">›</a>
    <a class="btn ghost" href="#/daily/${today()}">Today</a></div></div>

  <h2 class="day-title">${esc(new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</h2>
  <section class="kpis">
    <div class="kpi tone-atm"><div class="kpi-ico">${icon('atm')}</div><div class="kpi-main"><span class="kpi-label">ATM machines</span><b class="kpi-val">${t.atmMachines}</b><span class="kpi-sub">${t.atmVisits} visit(s)</span></div></div>
    <div class="kpi tone-cp"><div class="kpi-ico">${icon('printer')}</div><div class="kpi-main"><span class="kpi-label">Card printers</span><b class="kpi-val">${t.cpMachines}</b><span class="kpi-sub">${t.cpVisits} visit(s)</span></div></div>
    <div class="kpi tone-blue"><div class="kpi-ico">${icon('image')}</div><div class="kpi-main"><span class="kpi-label">Photos / Docs</span><b class="kpi-val">${t.photos} / ${t.docs}</b><span class="kpi-sub">${t.compliance}% compliant</span></div></div>
    <div class="kpi tone-cyan"><div class="kpi-ico">${icon('chart')}</div><div class="kpi-main"><span class="kpi-label">Call types</span><b class="kpi-val small">${Object.entries(day.byCall).map(([k, v]) => `${esc(k)}×${v}`).join(' ') || '—'}</b></div></div>
  </section>
  <div class="toolbar">${day.visits.length ? `<button class="btn" id="dzip">${icon('zip')} ZIP this day (${day.visits.length})</button>` : ''}</div>
  ${day.visits.length ? `<div class="vgrid">${day.visits.map((v) => visitCard(v)).join('')}</div>` : emptyState('calendar', 'No visits on this day', 'Pick another date or start a new visit.')}

  <section class="panel"><div class="panel-head"><h2>${esc(new Date(mFrom + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))} — monthly justification</h2>
    <button class="btn sm" id="mxl">${icon('report')} Excel</button></div>
    <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<b>${d}</b>`).join('')}
      ${'<span></span>'.repeat(new Date(mFrom + 'T00:00:00').getDay())}
      ${dateRange(mFrom, mTo).map((d) => { const x = byDay[d]; return `<a href="#/daily/${d}" class="calday ${d === date ? 'on' : ''} ${x ? 'has' : ''}"><i>${+d.slice(8)}</i>${x ? `<span class="c-atm">${x.atm} ATM</span><span class="c-cp">${x.cp} CP</span>` : ''}</a>`; }).join('')}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>ATM machines</th><th>Card printers</th><th>Visits</th><th>Photos</th><th>Docs</th></tr></thead><tbody>
    ${ms.days.map((d) => `<tr><td><a href="#/daily/${d.date}">${esc(fmtDate(d.date))}</a></td><td>${d.atm}</td><td>${d.cp}</td><td>${d.visits}</td><td>${d.photos}</td><td>${d.docs}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No visits this month</td></tr>'}
    </tbody><tfoot><tr><th>Month total</th><th>${ms.totals.atmMachines} unique · ${ms.totals.atmVisits} visits</th><th>${ms.totals.cpMachines} unique · ${ms.totals.cpVisits} visits</th><th>${ms.totals.visits}</th><th>${ms.totals.photos}</th><th>${ms.totals.docs}</th></tr></tfoot></table></div>
  </section>`;

  hydrateThumbs(el, Object.fromEntries(ds.media.map((m) => [m.id, m])));
  $('#dpick', el).onchange = (e) => (location.hash = '#/daily/' + e.target.value);
  el.querySelectorAll('.vcard').forEach((c) => (c.onclick = () => (location.hash = '#/visit/' + c.dataset.visit)));
  $('#dzip', el) && ($('#dzip', el).onclick = () => exportVisitsZip(day.visits.map((v) => v.id)));
  $('#mxl', el).onclick = async () => {
    const XLSX = await vendor.xlsx();
    const wb = XLSX.utils.book_new();
    const rows = [['Date', 'ATM machines', 'Card printers', 'ATM visits', 'Printer visits', 'Total visits', 'Photos', 'Docs'],
      ...dateRange(mFrom, mTo).map((d) => { const x = byDay[d]; return [d, x?.atm || 0, x?.cp || 0, x?.atmVisits || 0, x?.cpVisits || 0, x?.visits || 0, x?.photos || 0, x?.docs || 0]; }),
      ['TOTAL (unique)', ms.totals.atmMachines, ms.totals.cpMachines, ms.totals.atmVisits, ms.totals.cpVisits, ms.totals.visits, ms.totals.photos, ms.totals.docs]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Daily');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', 'Visit', 'Machine', 'Type', 'Call', 'Folder', 'Ticket', 'Photos', 'Docs'],
      ...ms.visits.map((v) => [v.date, v.name, v.machineId, typeInfo(v.machineType).label, v.callType, folderInfo(v.folder).label, v.ticket, v._photos, v._docs])]), 'Visits');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveOrShare(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Daily_Log_${month}.xlsx`);
  };
}
