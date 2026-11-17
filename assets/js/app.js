// App shell: router, navigation, sync indicator, service worker registration.
import { openDB } from './db.js';
import { S, loadSettings, bus } from './services.js';
import { $, $$, toast, esc } from './utils.js';
import { icon } from './ui.js';
import * as drive from './drive.js';
import { APP } from './config.js';

const NAV = [
  { r: '', label: 'Dashboard', ic: 'home', mobile: true },
  { r: 'capture', label: 'New visit', ic: 'camera', mobile: true, fab: true },
  { r: 'files', label: 'Files', ic: 'folder', mobile: true },
  { r: 'daily', label: 'Daily log', ic: 'calendar', mobile: true },
  { r: 'search', label: 'Search', ic: 'search' },
  { r: 'machines', label: 'Machines', ic: 'machine' },
  { r: 'inbox', label: 'Import', ic: 'inbox' },
  { r: 'reports', label: 'Reports', ic: 'report' },
  { r: 'settings', label: 'Settings', ic: 'settings' },
];

const ROUTES = {
  '': () => import('./views/dashboard.js'),
  capture: () => import('./views/capture.js'),
  visit: () => import('./views/visit.js'),
  files: () => import('./views/files.js'),
  search: () => import('./views/search.js'),
  daily: () => import('./views/daily.js'),
  machines: () => import('./views/machines.js'),
  machine: () => import('./views/machines.js').then((m) => ({ render: m.renderMachine })),
  inbox: () => import('./views/inbox.js'),
  reports: () => import('./views/reportsView.js'),
  settings: () => import('./views/settings.js'),
};

let cleanup = null;
let current = '';

function shell() {
  document.body.innerHTML = `
  <aside class="side">
    <a class="brand" href="#/"><img src="assets/icons/icon.svg" alt=""><div><b>CE Smart</b><span>Evidence</span></div></a>
    <nav>${NAV.map((n) => `<a href="#/${n.r}" data-r="${n.r}">${icon(n.ic)}<span>${n.label}</span></a>`).join('')}</nav>
    <div class="side-foot"><button class="sync-btn" id="syncbtn">${icon('sync')}<span id="synctext">Offline</span></button></div>
  </aside>
  <div class="shell-main">
    <header class="top">
      <button class="icon-btn menu-btn" id="menubtn" aria-label="Menu">${icon('menu')}</button>
      <form class="gsearch" id="gs">${icon('search')}<input id="gq" placeholder="Search machine ID, visit, ticket…" autocomplete="off"></form>
      <button class="sync-chip" id="syncchip" title="Cloud sync">${icon('cloud')}<i></i></button>
      <button class="icon-btn" id="themebtn" aria-label="Toggle theme">${icon('sun')}</button>
    </header>
    <main id="view" class="view"></main>
  </div>
  <nav class="bottom">${NAV.filter((n) => n.mobile).map((n) => `<a href="#/${n.r}" data-r="${n.r}" class="${n.fab ? 'fab' : ''}">${icon(n.ic)}<span>${n.fab ? '' : n.label}</span></a>`).join('')}
    <a href="#" id="morebtn">${icon('menu')}<span>More</span></a></nav>
  <div class="drawer" id="drawer" hidden><div class="drawer-panel">${NAV.map((n) => `<a href="#/${n.r}" data-r="${n.r}">${icon(n.ic)}<span>${n.label}</span></a>`).join('')}</div></div>
  <div id="toasts"></div>`;

  $('#gs').onsubmit = (e) => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent($('#gq').value.trim()); $('#gq').blur(); };
  const openDrawer = (e) => { e?.preventDefault(); $('#drawer').hidden = false; };
  $('#menubtn').onclick = openDrawer;
  $('#morebtn').onclick = openDrawer;
  $('#drawer').onclick = () => ($('#drawer').hidden = true);
  $('#themebtn').onclick = async () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    const { saveSettings } = await import('./services.js');
    saveSettings({ theme: t }, { touch: false });
    route();
  };
  const doSync = async () => {
    try { await drive.sync({ interactive: true }); if (drive.status.state === 'idle') toast('Synced with Google Drive', 'ok'); }
    catch (e) { toast(e.message, 'error', 6000); }
  };
  $('#syncbtn').onclick = doSync;
  $('#syncchip').onclick = () => (S.googleClientId ? doSync() : (location.hash = '#/settings'));
}

function paintSync(st) {
  const labels = { idle: 'Synced', syncing: 'Syncing…', offline: 'Not connected', 'offline-net': 'Offline', expired: 'Tap to reconnect', error: 'Sync error' };
  const text = st.state === 'syncing' && st.message ? st.message : labels[st.state] || st.state;
  const t = $('#synctext'); if (t) t.textContent = text;
  const chip = $('#syncchip');
  if (chip) { chip.className = 'sync-chip s-' + st.state; chip.title = text + (st.account ? ' · ' + st.account : ''); }
  $('#syncbtn')?.classList.toggle('spin', st.state === 'syncing');
}

async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name, ...params] = path.split('/');
  const loader = ROUTES[name] || ROUTES[''];
  current = name;
  $$('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === name || (name === 'visit' && a.dataset.r === 'files') || (name === 'machine' && a.dataset.r === 'machines')));
  $('#drawer').hidden = true;
  const view = $('#view');
  try { cleanup?.(); } catch { /* ignore */ }
  cleanup = null;
  view.classList.add('leaving');
  try {
    const mod = await loader();
    view.innerHTML = '';
    view.onclick = null;
    const fresh = view.cloneNode(false); // drop listeners from previous view
    view.replaceWith(fresh);
    fresh.classList.remove('leaving');
    cleanup = await mod.render(fresh, params, new URLSearchParams(qs || ''));
    if (!qs || !qs.includes('keep')) window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p></div>`;
  }
}

// Views that show data re-render when data changes (e.g. after a sync pulled changes from the other device).
const LIVE = new Set(['', 'files', 'daily', 'machines', 'machine', 'search']);
let refreshTimer;
bus.on('changed', (what) => {
  if (what !== 'sync' || !LIVE.has(current)) return;
  clearTimeout(refreshTimer); refreshTimer = setTimeout(route, 300);
});
bus.on('sync', paintSync);

async function boot() {
  await openDB();
  await loadSettings();
  document.documentElement.dataset.theme = S.theme || 'dark';
  shell();
  document.body.classList.toggle('review-mode', !!S.reviewMode);
  document.title = APP.name;
  window.addEventListener('hashchange', route);
  paintSync(drive.status);
  await route();
  drive.startAutoSync();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.onupdatefound = () => {
        const w = reg.installing;
        w.onstatechange = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready — reopen the app to use the new version', 'info', 6000); };
      };
    }).catch((e) => console.warn('SW registration failed', e));
  }
  if (!S.engineerName) setTimeout(() => toast('Tip: set your name and Google Drive in Settings', 'info', 5000), 1500);
}

boot();
