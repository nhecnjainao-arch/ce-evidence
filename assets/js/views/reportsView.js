// Executive report builder: pick a period and format (HTML, PDF, PowerPoint, Excel) or a bulk evidence ZIP.
import { dataset, computeStats } from '../services.js';
import { esc, $, today, addDays, toast } from '../utils.js';
import { icon } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el) {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  el.innerHTML = `
  <div class="page-head"><h1>${icon('report')} Executive reports</h1><p class="muted">Everything on the dashboard, packaged for management.</p></div>
  <form class="panel form" id="rf">
    <div class="chips" id="presets">
      <button type="button" class="chip" data-r="today">Today</button><button type="button" class="chip" data-r="7">Last 7 days</button>
      <button type="button" class="chip on" data-r="month">This month</button><button type="button" class="chip" data-r="lastmonth">Last month</button>
      <button type="button" class="chip" data-r="90">Last 90 days</button><button type="button" class="chip" data-r="year">This year</button></div>
    <div class="row3"><label class="field"><span>From</span><input type="date" name="from" value="${monthStart}"></label>
      <label class="field"><span>To</span><input type="date" name="to" value="${t}"></label>
      <label class="field"><span>Machines</span><select name="type"><option value="ALL">ATM + Card Printer</option><option value="ATM">ATM only</option><option value="CP">Card / Statement Printer only</option></select></label></div>
    <label class="check"><input type="checkbox" name="includePhotos" checked> Include sample photos (HTML / PDF / PPT)</label>
    <div class="preview-kpis" id="rk"></div>
    <div class="report-btns">
      <button type="button" class="rbtn" data-f="html"><b>HTML</b><span>Interactive web page</span></button>
      <button type="button" class="rbtn" data-f="pdf"><b>PDF</b><span>Print-ready A4</span></button>
      <button type="button" class="rbtn" data-f="ppt"><b>PowerPoint</b><span>Editable slides & charts</span></button>
      <button type="button" class="rbtn" data-f="xlsx"><b>Excel</b><span>Raw data, 6 sheets</span></button>
      <button type="button" class="rbtn" data-f="zip"><b>Evidence ZIP</b><span>All photos & docs in period</span></button>
    </div>
  </form>`;
  const f = $('#rf', el);
  const ds = await dataset();
  const opts = () => ({ from: f.from.value, to: f.to.value, type: f.type.value, includePhotos: f.includePhotos.checked });
  const preview = () => {
    const s = computeStats(ds, opts()).totals;
    $('#rk', el).innerHTML = [['Visits', s.visits], ['ATM machines', s.atmMachines], ['Card printers', s.cpMachines], ['Photos', s.photos], ['Docs', s.docs], ['Compliance', s.compliance + '%']]
      .map(([l, v]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('');
  };
  f.addEventListener('change', preview);
  $('#presets', el).onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    el.querySelectorAll('#presets .chip').forEach((c) => c.classList.toggle('on', c === b));
    const r = b.dataset.r; let from = t, to = t;
    if (r === '7') from = addDays(t, -6);
    if (r === '90') from = addDays(t, -89);
    if (r === 'month') from = monthStart;
    if (r === 'year') from = t.slice(0, 4) + '-01-01';
    if (r === 'lastmonth') { const d = new Date(t.slice(0, 8) + '01T00:00:00'); d.setDate(0); to = d.toISOString().slice(0, 10); from = to.slice(0, 8) + '01'; }
    f.from.value = from; f.to.value = to; preview();
  };
  el.querySelector('.report-btns').onclick = async (e) => {
    const b = e.target.closest('.rbtn'); if (!b) return;
    const o = opts();
    if (o.from > o.to) return toast('“From” is after “To”', 'warn');
    b.classList.add('loading');
    try {
      const R = await import('../reports.js');
      if (b.dataset.f === 'html') await R.reportHTML(o);
      if (b.dataset.f === 'pdf') await R.reportPDF(o);
      if (b.dataset.f === 'ppt') await R.reportPPT(o);
      if (b.dataset.f === 'xlsx') await R.reportExcel(o);
      if (b.dataset.f === 'zip') await exportVisitsZip(computeStats(ds, o).visits.map((v) => v.id));
    } catch (err) { console.error(err); toast('Report failed: ' + err.message, 'error', 6000); }
    b.classList.remove('loading');
  };
  preview();
}
