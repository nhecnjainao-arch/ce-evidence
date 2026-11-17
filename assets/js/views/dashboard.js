import { S, dataset, computeStats, pendingSyncCount, folderInfo, typeInfo } from '../services.js';
import { esc, today, addDays, dateRange, vendor, $, fmtDateTime } from '../utils.js';
import { icon, visitCard, hydrateThumbs, emptyState } from '../ui.js';
import { status as syncStatus } from '../drive.js';

let charts = [];
let period = sessionStorage.getItem('dash-period') || '14';

export async function render(el) {
  const ds = await dataset();
  const t = today();
  const days = +period;
  const from = addDays(t, -(days - 1));
  const tod = computeStats(ds, { from: t, to: t });
  const per = computeStats(ds, { from, to: t });
  const all = computeStats(ds, {});
  const pending = await pendingSyncCount();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  el.innerHTML = `
  <section class="hero">
    <div><p class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
      <h1>${greet}${S.engineerName ? ', ' + esc(S.engineerName.split(' ')[0]) : ''}</h1>
      <p class="muted">${tod.totals.visits ? `Today: ${tod.totals.atmMachines} ATM · ${tod.totals.cpMachines} card printer${tod.totals.cpMachines === 1 ? '' : 's'} visited` : 'No visits logged today yet.'}</p></div>
    <div class="hero-actions">
      <a class="btn primary lg" href="#/capture">${icon('camera')} New visit</a>
      <a class="btn ghost" href="#/inbox">${icon('inbox')} Import photos</a>
    </div>
  </section>

  <section class="kpis">
    ${kpi('Visits today', tod.totals.visits, 'calendar', `${tod.totals.photos} photos · ${tod.totals.docs} docs`, 'cyan')}
    ${kpi('ATM today', tod.totals.atmMachines, 'atm', `${tod.totals.atmVisits} visit(s)`, 'atm')}
    ${kpi('Card printers today', tod.totals.cpMachines, 'printer', `${tod.totals.cpVisits} visit(s)`, 'cp')}
    ${kpi(`Visits · ${days}d`, per.totals.visits, 'chart', `${per.totals.activeDays} active days · ${(per.totals.visits / Math.max(1, per.totals.activeDays)).toFixed(1)}/day`, 'blue')}
    ${kpi('Photo compliance', per.totals.compliance + '%', 'image', `min ${S.minPhotos} photos per visit`, per.totals.compliance >= 90 ? 'green' : per.totals.compliance >= 70 ? 'amber' : 'red', per.totals.compliance)}
    ${kpi('Cloud sync', pending ? pending + ' pending' : 'Up to date', 'cloud', syncStatus.lastSync ? 'Last: ' + fmtDateTime(syncStatus.lastSync) : (syncStatus.account ? 'Not synced yet' : 'Not connected'), pending ? 'amber' : 'green')}
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Machines visited per day</h2>
      <div class="seg" id="period">${['7', '14', '30', '90'].map((p) => `<button data-p="${p}" class="${p === period ? 'on' : ''}">${p}d</button>`).join('')}</div></div>
    <div class="chart-box tall"><canvas id="c-daily"></canvas></div>
  </section>

  <section class="grid-3">
    <div class="panel"><div class="panel-head"><h2>Call types · ${days}d</h2></div><div class="chart-box"><canvas id="c-calls"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h2>Case folders</h2><a href="#/files" class="link">Open</a></div>
      <div class="folder-bars">${S.folders.map((f) => { const n = all.byFolder[f.id] || 0; const max = Math.max(1, ...Object.values(all.byFolder)); return `<a href="#/files/${f.id}" class="fbar"><span>${esc(f.label)}</span><div><i style="width:${(n / max) * 100}%;background:${f.color}"></i></div><b>${n}</b></a>`; }).join('')}</div></div>
    <div class="panel"><div class="panel-head"><h2>Fleet</h2><a href="#/machines" class="link">Machines</a></div>
      <div class="fleet">
        <div class="ring" style="--p:${ds.machines.length ? (ds.machines.filter((m) => m.type === 'ATM').length / ds.machines.length) * 100 : 50}"><div><b>${ds.machines.length}</b><span>machines</span></div></div>
        <ul><li><i class="dot atm"></i> ATM <b>${ds.machines.filter((m) => m.type === 'ATM').length}</b></li>
        <li><i class="dot cp"></i> Card printers <b>${ds.machines.filter((m) => m.type === 'CP').length}</b></li>
        <li>${icon('image')} Photos <b>${all.totals.photos}</b></li><li>${icon('doc')} Documents <b>${all.totals.docs}</b></li>
        <li>${icon('eye')} Pending review <b>${all.totals.pendingReview}</b></li></ul></div></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Activity heatmap · 26 weeks</h2><span class="muted small">Each square = one day</span></div>
    <div class="heatmap" id="heat"></div>
  </section>

  <section class="grid-2">
    <div class="panel"><div class="panel-head"><h2>Needs attention</h2><span class="muted small">Below ${S.minPhotos} photos or rework</span></div>
      <div class="list">${[...per.totals.nonCompliant, ...per.visits.filter((v) => v.review === 'REWORK' && v._photos >= S.minPhotos)].slice(0, 8).map((v) => `
        <a class="row" href="#/visit/${v.id}"><span>${esc(v.name)} <small class="muted">${esc(v.date)} · ${esc(v.callType)}</small></span>
        <span class="badge ${v.review === 'REWORK' ? 'review-REWORK' : 'warn'}">${v.review === 'REWORK' ? 'Rework' : v._photos + '/' + S.minPhotos + ' photos'}</span></a>`).join('') || '<p class="muted pad">All visits meet the photo requirement. 🎉</p>'}</div></div>
    <div class="panel"><div class="panel-head"><h2>Most visited · ${days}d</h2></div>
      <div class="list">${per.topMachines.slice(0, 8).map((m) => `<a class="row" href="#/machine/${encodeURIComponent(m.id)}"><span><i class="dot ${m.type === 'ATM' ? 'atm' : 'cp'}"></i> ${esc(m.id)}</span><span class="muted small">${m.visits} visits · last ${esc(m.last)}</span></a>`).join('') || '<p class="muted pad">No visits yet.</p>'}</div></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Recent visits</h2><a href="#/files" class="link">All files</a></div>
    ${ds.visits.length ? `<div class="vgrid">${ds.visits.slice(0, 8).map((v) => visitCard(v)).join('')}</div>` : emptyState('camera', 'No visits yet', 'Start your first machine visit to capture photos and documents.', '<a class="btn primary" href="#/capture">New visit</a>')}
  </section>`;

  el.querySelectorAll('.vcard').forEach((c) => (c.onclick = () => (location.hash = '#/visit/' + c.dataset.visit)));
  hydrateThumbs(el, Object.fromEntries(ds.media.map((m) => [m.id, m])));
  $('#period', el).onclick = (e) => { if (e.target.dataset.p) { period = e.target.dataset.p; sessionStorage.setItem('dash-period', period); render(el); } };

  heatmap($('#heat', el), all);
  await drawCharts(el, per, from, t);
  return () => { charts.forEach((c) => c.destroy()); charts = []; };
}

function kpi(label, value, ic, sub, tone, ring) {
  return `<div class="kpi tone-${tone}"><div class="kpi-ico">${icon(ic)}</div><div class="kpi-main"><span class="kpi-label">${esc(label)}</span>
    <b class="kpi-val">${esc(value)}</b><span class="kpi-sub">${esc(sub)}</span></div>
    ${ring !== undefined ? `<div class="mini-ring" style="--p:${ring}"></div>` : ''}</div>`;
}

function heatmap(host, st) {
  const end = today();
  const start = addDays(end, -(26 * 7 - 1) - new Date(end + 'T00:00:00').getDay());
  const map = Object.fromEntries(st.days.map((d) => [d.date, d.visits]));
  const max = Math.max(1, ...Object.values(map));
  const cells = dateRange(start, end).map((d) => {
    const n = map[d] || 0;
    const lvl = n === 0 ? 0 : Math.ceil((n / max) * 4);
    return `<a href="#/daily/${d}" class="hm l${lvl}" title="${d}: ${n} visit(s)"></a>`;
  });
  host.innerHTML = `<div class="hm-grid">${cells.join('')}</div><div class="hm-legend">Less <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> More</div>`;
}

async function drawCharts(el, st, from, to) {
  const Chart = await vendor.chart();
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--muted').trim() || '#94a3b8';
  const grid = css.getPropertyValue('--line').trim() || '#1f2b45';
  const atm = css.getPropertyValue('--atm').trim(), cp = css.getPropertyValue('--cp').trim();
  Chart.defaults.color = ink;
  Chart.defaults.font.family = 'Inter, Segoe UI, Roboto, sans-serif';
  const days = dateRange(from, to);
  const byDay = Object.fromEntries(st.days.map((d) => [d.date, d]));
  const c1 = $('#c-daily', el);
  if (!c1) return;
  charts.push(new Chart(c1, {
    type: 'bar',
    data: {
      labels: days.map((d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
      datasets: [
        { label: 'ATM', data: days.map((d) => byDay[d]?.atm || 0), backgroundColor: atm, borderRadius: 6, maxBarThickness: 34 },
        { label: 'Card / Statement printer', data: days.map((d) => byDay[d]?.cp || 0), backgroundColor: cp, borderRadius: 6, maxBarThickness: 34 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      onClick: (_, els) => { if (els[0]) location.hash = '#/daily/' + days[els[0].index]; },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: grid } } },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
    },
  }));
  const calls = Object.entries(st.byCall).sort((a, b) => b[1] - a[1]);
  const palette = ['#22d3ee', '#a78bfa', '#facc15', '#f87171', '#4ade80', '#60a5fa', '#f472b6', '#a3e635', '#fb923c', '#2dd4bf', '#c084fc', '#94a3b8'];
  charts.push(new Chart($('#c-calls', el), {
    type: 'doughnut',
    data: { labels: calls.length ? calls.map(([k]) => k) : ['No data'], datasets: [{ data: calls.length ? calls.map(([, v]) => v) : [1], backgroundColor: calls.length ? palette : [grid], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } } },
  }));
}
