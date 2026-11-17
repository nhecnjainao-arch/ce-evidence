// Executive reports: HTML, PDF, PowerPoint and Excel generated on-device.
import { S, dataset, computeStats, typeInfo, callLabel, folderInfo, getBlob } from './services.js';
import { vendor, esc, fmtDate, blobToDataURL, saveOrShare, dateRange } from './utils.js';
import { APP } from './config.js';

const C = { atm: '#0891b2', cp: '#7c3aed', ink: '#0f172a', mute: '#64748b', palette: ['#0891b2', '#7c3aed', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#64748b'] };

async function buildData(opts) {
  const ds = await dataset();
  const st = computeStats(ds, opts);
  const days = dateRange(opts.from, opts.to).map((d) => st.days.find((x) => x.date === d) || { date: d, visits: 0, atm: 0, cp: 0, atmVisits: 0, cpVisits: 0, photos: 0, docs: 0 });
  return { ds, st, days, opts };
}

// ---------- chart images ----------
async function chartPNG(config, w = 1000, h = 460) {
  const Chart = await vendor.chart();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const chart = new Chart(c, { ...config, options: { responsive: false, animation: false, devicePixelRatio: 1, plugins: { legend: { labels: { color: C.ink, font: { size: 14 } } }, ...(config.options?.plugins || {}) }, ...(config.options || {}) } });
  const url = c.toDataURL('image/png');
  chart.destroy();
  return url;
}
async function charts(data) {
  const { st, days } = data;
  const daily = await chartPNG({
    type: 'bar',
    data: { labels: days.map((d) => d.date.slice(5)), datasets: [{ label: 'ATM machines', data: days.map((d) => d.atm), backgroundColor: C.atm }, { label: 'Card / Statement printers', data: days.map((d) => d.cp), backgroundColor: C.cp }] },
    options: { scales: { x: { stacked: true, ticks: { color: C.mute } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: C.mute } } } },
  });
  const calls = Object.entries(st.byCall).sort((a, b) => b[1] - a[1]);
  const callChart = await chartPNG({
    type: 'doughnut',
    data: { labels: calls.map(([k]) => k), datasets: [{ data: calls.map(([, v]) => v), backgroundColor: C.palette }] },
    options: { plugins: { legend: { position: 'right', labels: { color: C.ink, font: { size: 14 } } } } },
  }, 700, 460);
  return { daily, callChart, calls };
}

function title(opts) {
  const t = opts.type === 'ALL' ? 'ATM & Card Printer' : typeInfo(opts.type).label;
  return { main: 'Executive Field Service Report', sub: `${t} · ${fmtDate(opts.from)} – ${fmtDate(opts.to)}`, by: `${S.engineerName || 'Customer Engineer'}${S.engineerId ? ' (' + S.engineerId + ')' : ''}${S.region ? ' · ' + S.region : ''}` };
}

function kpiList(t) {
  return [
    ['Total visits', t.visits], ['ATM machines', t.atmMachines], ['Card printers', t.cpMachines],
    ['ATM visits', t.atmVisits], ['Printer visits', t.cpVisits], ['Active days', t.activeDays],
    ['Photos', t.photos], ['Documents', t.docs], ['Photo compliance', t.compliance + '%'],
    ['Avg visits / day', t.activeDays ? (t.visits / t.activeDays).toFixed(1) : '0'], ['Pending review', t.pendingReview], ['Needs rework', t.rework],
  ];
}

async function sampleThumbs(visits, max = 4) {
  const out = [];
  for (const m of visits._media.filter((x) => x.kind === 'photo').slice(0, max)) {
    const b = await getBlob(m.id);
    if (b?.thumb) out.push(await blobToDataURL(b.thumb));
  }
  return out;
}

// ---------- HTML ----------
export async function reportHTML(opts) {
  const data = await buildData(opts);
  const { st, days } = data;
  const ch = await charts(data);
  const T = title(opts);
  let photoSection = '';
  if (opts.includePhotos) {
    const blocks = [];
    for (const v of st.visits.slice(0, 60)) {
      const th = await sampleThumbs(v, 4);
      blocks.push(`<div class="pv"><b>${esc(v.name)}</b> · ${esc(v.date)} · ${esc(v.callType)}<div>${th.map((s) => `<img src="${s}">`).join('')}</div></div>`);
    }
    photoSection = `<h2>Photo evidence (sample)</h2><div class="pvs">${blocks.join('')}</div>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(T.main)}</title>
<style>body{font-family:Segoe UI,Roboto,Arial,sans-serif;margin:0;color:#0f172a;background:#f1f5f9}header{background:linear-gradient(110deg,#0e7490,#6d28d9);color:#fff;padding:28px 32px}
header h1{margin:0;font-size:26px}header p{margin:6px 0 0;opacity:.9}main{max-width:1200px;margin:auto;padding:24px}
.k{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.k div{background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px #0001}
.k b{display:block;font-size:26px;color:#0e7490}.k span{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.ch{display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-top:16px}.ch img{width:100%;background:#fff;border-radius:12px;padding:8px;box-sizing:border-box}
h2{margin:28px 0 10px;font-size:18px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px}
th{background:#0f172a;color:#fff;text-align:left;padding:8px}td{padding:7px 8px;border-bottom:1px solid #e2e8f0}tr:nth-child(even) td{background:#f8fafc}
.pvs{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}.pv{background:#fff;border-radius:12px;padding:10px;font-size:13px}.pv img{width:48%;margin:4px 1%;border-radius:6px}
.bad{color:#dc2626;font-weight:600}@media(max-width:700px){.ch{grid-template-columns:1fr}}@media print{body{background:#fff}}</style></head><body>
<header><h1>${esc(T.main)}</h1><p>${esc(T.sub)}</p><p>${esc(T.by)} · Generated ${esc(new Date().toLocaleString())}</p></header><main>
<div class="k">${kpiList(st.totals).map(([l, v]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
<div class="ch"><img src="${ch.daily}" alt="Daily machines visited"><img src="${ch.callChart}" alt="Call types"></div>
<h2>Daily activity</h2><table><tr><th>Date</th><th>ATM machines</th><th>Card printers</th><th>Total visits</th><th>Photos</th><th>Docs</th></tr>
${days.filter((d) => d.visits).map((d) => `<tr><td>${d.date}</td><td>${d.atm}</td><td>${d.cp}</td><td>${d.visits}</td><td>${d.photos}</td><td>${d.docs}</td></tr>`).join('')}
<tr><th>Total</th><th>${st.totals.atmMachines} unique</th><th>${st.totals.cpMachines} unique</th><th>${st.totals.visits}</th><th>${st.totals.photos}</th><th>${st.totals.docs}</th></tr></table>
<h2>Call type breakdown</h2><table><tr><th>Call type</th><th>Visits</th><th>Share</th></tr>${ch.calls.map(([k, v]) => `<tr><td>${esc(callLabel(k))}</td><td>${v}</td><td>${Math.round((v / st.totals.visits) * 100)}%</td></tr>`).join('')}</table>
<h2>Case folders</h2><table><tr><th>Folder</th><th>Visits</th></tr>${Object.entries(st.byFolder).map(([k, v]) => `<tr><td>${esc(folderInfo(k).label)}</td><td>${v}</td></tr>`).join('')}</table>
<h2>Most visited machines</h2><table><tr><th>Machine</th><th>Type</th><th>Visits</th><th>Last visit</th></tr>${st.topMachines.slice(0, 15).map((m) => `<tr><td>${esc(m.id)}</td><td>${esc(typeInfo(m.type).label)}</td><td>${m.visits}</td><td>${m.last}</td></tr>`).join('')}</table>
${st.totals.nonCompliant.length ? `<h2>Visits below photo requirement (min ${S.minPhotos})</h2><table><tr><th>Visit</th><th>Date</th><th>Call</th><th>Photos</th></tr>${st.totals.nonCompliant.map((v) => `<tr><td>${esc(v.name)}</td><td>${v.date}</td><td>${esc(v.callType)}</td><td class="bad">${v._photos}</td></tr>`).join('')}</table>` : ''}
<h2>All visits</h2><table><tr><th>Date</th><th>Visit</th><th>Type</th><th>Call</th><th>Folder</th><th>Ticket</th><th>Location</th><th>Photos</th><th>Docs</th><th>Review</th></tr>
${st.visits.map((v) => `<tr><td>${v.date}</td><td>${esc(v.name)}</td><td>${v.machineType}</td><td>${esc(v.callType)}</td><td>${esc(folderInfo(v.folder).label)}</td><td>${esc(v.ticket)}</td><td>${esc(v._machine?.location || '')}</td><td>${v._photos}</td><td>${v._docs}</td><td>${esc(v.review)}</td></tr>`).join('')}</table>
${photoSection}<p style="color:#94a3b8;font-size:12px;margin-top:24px">${esc(APP.name)} v${APP.version}</p></main></body></html>`;
  await saveOrShare(new Blob([html], { type: 'text/html' }), `Executive_Report_${opts.from}_${opts.to}.html`);
}

// ---------- PDF ----------
export async function reportPDF(opts) {
  const jsPDF = await vendor.pdf();
  const data = await buildData(opts);
  const { st, days } = data;
  const ch = await charts(data);
  const T = title(opts);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  doc.setFillColor(14, 116, 144); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255); doc.setFontSize(20); doc.text(T.main, 12, 14);
  doc.setFontSize(11); doc.text(`${T.sub}   |   ${T.by}`, 12, 23);
  doc.setTextColor(15, 23, 42);
  const k = kpiList(st.totals);
  k.forEach(([l, v], i) => {
    const x = 12 + (i % 6) * 46, y = 38 + Math.floor(i / 6) * 22;
    doc.setFillColor(241, 245, 249); doc.roundedRect(x, y, 43, 19, 2, 2, 'F');
    doc.setFontSize(15); doc.setTextColor(14, 116, 144); doc.text(String(v), x + 4, y + 9);
    doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(l.toUpperCase(), x + 4, y + 15);
  });
  doc.addImage(ch.daily, 'PNG', 12, 84, 160, 74);
  doc.addImage(ch.callChart, 'PNG', 178, 84, 107, 70);
  const tbl = (head, body, startY) => doc.autoTable({ head: [head], body, startY, styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] }, alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: 12, right: 12 } });
  doc.addPage();
  doc.setFontSize(14); doc.text('Daily activity — machines visited', 12, 14);
  tbl(['Date', 'ATM machines', 'Card printers', 'Visits', 'Photos', 'Docs'],
    [...days.filter((d) => d.visits).map((d) => [d.date, d.atm, d.cp, d.visits, d.photos, d.docs]), ['TOTAL', st.totals.atmMachines + ' unique', st.totals.cpMachines + ' unique', st.totals.visits, st.totals.photos, st.totals.docs]], 18);
  let y = doc.lastAutoTable.finalY + 10;
  doc.text('Call types', 12, y);
  tbl(['Call type', 'Visits', 'Share'], ch.calls.map(([kk, v]) => [callLabel(kk), v, Math.round((v / st.totals.visits) * 100) + '%']), y + 4);
  doc.addPage();
  doc.setFontSize(14); doc.text('Visit register', 12, 14);
  tbl(['Date', 'Visit', 'Type', 'Call', 'Folder', 'Ticket', 'Location', 'Photos', 'Docs', 'Review'],
    st.visits.map((v) => [v.date, v.name, v.machineType, v.callType, folderInfo(v.folder).label, v.ticket, v._machine?.location || '', v._photos, v._docs, v.review]), 18);
  if (st.totals.nonCompliant.length) {
    y = doc.lastAutoTable.finalY + 10;
    if (y > 180) { doc.addPage(); y = 14; }
    doc.setFontSize(14); doc.text(`Visits below photo requirement (min ${S.minPhotos})`, 12, y);
    tbl(['Visit', 'Date', 'Call', 'Photos'], st.totals.nonCompliant.map((v) => [v.name, v.date, v.callType, v._photos]), y + 4);
  }
  if (opts.includePhotos) {
    let col = 0, row = 0;
    doc.addPage(); doc.setFontSize(14); doc.text('Photo evidence (sample)', 12, 14);
    for (const v of st.visits.slice(0, 24)) {
      const th = await sampleThumbs(v, 3);
      if (!th.length) continue;
      const x = 12 + col * 138, yy = 22 + row * 60;
      doc.setFontSize(9); doc.text(`${v.name} · ${v.date} · ${v.callType}`, x, yy);
      th.forEach((s, i) => doc.addImage(s, 'JPEG', x + i * 45, yy + 2, 43, 50));
      col++; if (col > 1) { col = 0; row++; }
      if (row > 2) { doc.addPage(); row = 0; }
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.text(`${APP.name} · page ${i}/${pages}`, W - 60, 205); }
  await saveOrShare(doc.output('blob'), `Executive_Report_${opts.from}_${opts.to}.pdf`);
}

// ---------- PowerPoint ----------
export async function reportPPT(opts) {
  const PptxGenJS = await vendor.pptx();
  const { st, days } = await buildData(opts);
  const T = title(opts);
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE';
  p.title = T.main;
  const dark = '0F172A', cyan = '0E7490';

  let s = p.addSlide();
  s.background = { color: dark };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.25, fill: { color: cyan } });
  s.addText(T.main, { x: 0.7, y: 2.3, w: 12, h: 1, fontSize: 40, bold: true, color: 'FFFFFF' });
  s.addText(T.sub, { x: 0.7, y: 3.4, w: 12, h: 0.6, fontSize: 20, color: '67E8F9' });
  s.addText(T.by, { x: 0.7, y: 4.1, w: 12, h: 0.5, fontSize: 16, color: 'CBD5E1' });

  s = p.addSlide();
  s.addText('Key metrics', { x: 0.5, y: 0.3, fontSize: 28, bold: true, color: dark });
  kpiList(st.totals).forEach(([l, v], i) => {
    const x = 0.5 + (i % 4) * 3.1, y = 1.2 + Math.floor(i / 4) * 1.9;
    s.addShape(p.ShapeType.roundRect, { x, y, w: 2.9, h: 1.7, fill: { color: 'F1F5F9' }, rectRadius: 0.1 });
    s.addText(String(v), { x, y: y + 0.15, w: 2.9, h: 0.9, fontSize: 34, bold: true, color: cyan, align: 'center' });
    s.addText(l.toUpperCase(), { x, y: y + 1.05, w: 2.9, h: 0.4, fontSize: 12, color: '64748B', align: 'center' });
  });

  s = p.addSlide();
  s.addText('Machines visited per day', { x: 0.5, y: 0.3, fontSize: 28, bold: true, color: dark });
  s.addChart(p.ChartType.bar, [
    { name: 'ATM', labels: days.map((d) => d.date.slice(5)), values: days.map((d) => d.atm) },
    { name: 'Card / Statement printer', labels: days.map((d) => d.date.slice(5)), values: days.map((d) => d.cp) },
  ], { x: 0.5, y: 1.1, w: 12.3, h: 5.9, barGrouping: 'stacked', chartColors: ['0891B2', '7C3AED'], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 10 });

  s = p.addSlide();
  s.addText('Call types & case folders', { x: 0.5, y: 0.3, fontSize: 28, bold: true, color: dark });
  const calls = Object.entries(st.byCall).sort((a, b) => b[1] - a[1]);
  if (calls.length) s.addChart(p.ChartType.doughnut, [{ name: 'Calls', labels: calls.map(([k]) => k), values: calls.map(([, v]) => v) }],
    { x: 0.5, y: 1.1, w: 6.2, h: 5.8, showLegend: true, legendPos: 'r', showPercent: true, chartColors: C.palette.map((c) => c.slice(1)) });
  const folders = Object.entries(st.byFolder);
  if (folders.length) s.addChart(p.ChartType.bar, [{ name: 'Visits', labels: folders.map(([k]) => folderInfo(k).label), values: folders.map(([, v]) => v) }],
    { x: 7, y: 1.1, w: 5.8, h: 5.8, barDir: 'bar', chartColors: ['7C3AED'], showValue: true });

  const tableOpts = { x: 0.5, y: 1.1, w: 12.3, fontSize: 11, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true };
  const hdr = (arr) => arr.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: dark } } }));
  s = p.addSlide();
  s.addText('Daily justification', { x: 0.5, y: 0.3, fontSize: 28, bold: true, color: dark });
  s.addTable([hdr(['Date', 'ATM machines', 'Card printers', 'Visits', 'Photos', 'Docs']), ...days.filter((d) => d.visits).map((d) => [d.date, d.atm, d.cp, d.visits, d.photos, d.docs].map(String))], tableOpts);

  s = p.addSlide();
  s.addText('Most visited machines', { x: 0.5, y: 0.3, fontSize: 28, bold: true, color: dark });
  s.addTable([hdr(['Machine', 'Type', 'Visits', 'Last visit']), ...st.topMachines.slice(0, 12).map((m) => [m.id, typeInfo(m.type).label, String(m.visits), m.last])], tableOpts);

  if (st.totals.nonCompliant.length) {
    s = p.addSlide();
    s.addText(`Below photo requirement (min ${S.minPhotos}) — ${st.totals.compliance}% compliant`, { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: 'B91C1C' });
    s.addTable([hdr(['Visit', 'Date', 'Call', 'Photos']), ...st.totals.nonCompliant.slice(0, 40).map((v) => [v.name, v.date, v.callType, String(v._photos)])], tableOpts);
  }

  if (opts.includePhotos) {
    for (const v of st.visits.slice(0, 20)) {
      const th = await sampleThumbs(v, 4);
      if (!th.length) continue;
      s = p.addSlide();
      s.addText(`${v.name} · ${typeInfo(v.machineType).label}`, { x: 0.5, y: 0.25, fontSize: 24, bold: true, color: dark });
      s.addText(`${v.date} · ${callLabel(v.callType)} · ${folderInfo(v.folder).label}${v.ticket ? ' · Ticket ' + v.ticket : ''}`, { x: 0.5, y: 0.85, fontSize: 14, color: '64748B' });
      th.forEach((d, i) => s.addImage({ data: d, x: 0.5 + i * 3.1, y: 1.5, w: 2.95, h: 3.9, sizing: { type: 'contain', w: 2.95, h: 3.9 } }));
      if (v.remarks) s.addText(v.remarks, { x: 0.5, y: 5.7, w: 12.3, h: 1.2, fontSize: 13, color: '334155' });
    }
  }
  const blob = await p.write({ outputType: 'blob' });
  await saveOrShare(blob, `Executive_Report_${opts.from}_${opts.to}.pptx`);
}

// ---------- Excel ----------
export async function reportExcel(opts) {
  const XLSX = await vendor.xlsx();
  const { st, days, ds } = await buildData(opts);
  const T = title(opts);
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (widths) ws['!cols'] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('Summary', [[T.main], [T.sub], [T.by], [], ['Metric', 'Value'], ...kpiList(st.totals)], [28, 18]);
  add('Daily', [['Date', 'ATM machines', 'Card printers', 'ATM visits', 'Printer visits', 'Total visits', 'Photos', 'Documents'],
    ...days.map((d) => [d.date, d.atm, d.cp, d.atmVisits, d.cpVisits, d.visits, d.photos, d.docs])], [12, 14, 14, 12, 14, 12, 10, 12]);
  add('Visits', [['Date', 'Visit', 'Machine ID', 'Type', 'Model', 'Location', 'Call type', 'Folder', 'Ticket', 'Photos', 'Documents', 'Review', 'Review note', 'Remarks', 'Engineer'],
    ...st.visits.map((v) => [v.date, v.name, v.machineId, typeInfo(v.machineType).label, v._machine?.model || '', v._machine?.location || '', callLabel(v.callType), folderInfo(v.folder).label, v.ticket, v._photos, v._docs, v.review, v.reviewNote, v.remarks, v.engineer])],
  [11, 14, 12, 22, 14, 24, 24, 12, 12, 8, 10, 12, 20, 40, 16]);
  const vIds = new Set(st.visits.map((v) => v.id));
  const vMap = Object.fromEntries(st.visits.map((v) => [v.id, v]));
  add('Files', [['Visit', 'File', 'Kind', 'Tag / Doc type', 'Taken', 'Size KB', 'In Drive'],
    ...ds.media.filter((m) => vIds.has(m.visitId)).map((m) => [vMap[m.visitId].name, m.filename, m.kind, m.kind === 'document' ? m.docType : m.tag, new Date(m.takenAt).toLocaleString(), Math.round(m.size / 1024), m.driveId ? 'Yes' : 'No'])],
  [14, 30, 10, 16, 20, 9, 9]);
  add('Call types', [['Call type', 'Visits'], ...Object.entries(st.byCall).map(([k, v]) => [callLabel(k), v])], [30, 10]);
  add('Machines', [['Machine ID', 'Type', 'Visits in period', 'Last visit'], ...st.topMachines.map((m) => [m.id, typeInfo(m.type).label, m.visits, m.last])], [14, 24, 16, 12]);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await saveOrShare(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Executive_Report_${opts.from}_${opts.to}.xlsx`);
}
