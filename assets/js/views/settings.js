// Settings: profile, capture quality, Google Drive sync, management sharing, editable lists, backup.
import { S, saveSettings } from '../services.js';
import { db } from '../db.js';
import { DEFAULT_SETTINGS, APP } from '../config.js';
import { esc, $, toast, confirmDialog, fmtBytes, modal, fmtDateTime } from '../utils.js';
import { icon, pickFiles } from '../ui.js';
import * as drive from '../drive.js';
import { exportBackup, importBackup } from '../exporter.js';

const listToText = (arr, color) => arr.map((x) => [x.id, x.label, color ? x.color : null].filter((v) => v != null).join(' | ')).join('\n');
const textToList = (txt, color) => txt.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p[0])
  .map(([id, label, c]) => ({ id: id.toUpperCase().replace(/\s+/g, '_'), label: label || id, ...(color ? { color: c || '#94a3b8' } : {}) }));

export async function render(el) {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const counts = { machines: await db.count('machines'), visits: await db.count('visits'), media: await db.count('media') };
  const st = drive.status;

  el.innerHTML = `
  <div class="page-head"><h1>${icon('settings')} Settings</h1></div>
  <div class="grid-2">
  <form class="panel form" id="sp"><div class="panel-head"><h2>Engineer profile</h2></div>
    <label class="field"><span>Full name</span><input name="engineerName" value="${esc(S.engineerName)}"></label>
    <div class="row2"><label class="field"><span>Engineer ID</span><input name="engineerId" value="${esc(S.engineerId)}"></label>
    <label class="field"><span>Region / Team</span><input name="region" value="${esc(S.region)}"></label></div>
    <label class="field"><span>Management emails (comma separated)</span><input name="managerEmails" value="${esc(S.managerEmails)}" placeholder="manager@company.com"></label>
    <div class="form-actions"><button class="btn primary">Save profile</button></div></form>

  <form class="panel form" id="sc"><div class="panel-head"><h2>Capture</h2></div>
    <div class="row2"><label class="field"><span>Max photo size (px)</span><select name="maxDimension">${[1280, 1600, 2048, 2560, 3200, 4096].map((n) => `<option ${n === +S.maxDimension ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>JPEG quality</span><select name="jpegQuality">${[0.7, 0.8, 0.85, 0.9, 0.95].map((n) => `<option ${n === +S.jpegQuality ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label class="field"><span>Required photos per visit (company rule)</span><input type="number" min="1" max="50" name="minPhotos" value="${S.minPhotos}"></label>
    <label class="check"><input type="checkbox" name="watermark" ${S.watermark ? 'checked' : ''}> Stamp visit name, date/time and engineer on photos</label>
    <label class="check"><input type="checkbox" name="docEnhance" ${S.docEnhance ? 'checked' : ''}> Enhance scanned documents (high-contrast)</label>
    <div class="form-actions"><button class="btn primary">Save capture settings</button></div></form>

  <section class="panel form" id="cloud"><div class="panel-head"><h2>${icon('cloud')} Google Drive sync</h2><span class="sync-pill s-${st.state}">${esc(st.state)}</span></div>
    <p class="muted small">Phone and laptop sign in with the <b>same Google account</b>. Every change is saved on the device first and synced when online. ${st.lastSync ? 'Last sync: ' + esc(fmtDateTime(st.lastSync)) : ''}</p>
    ${st.account ? `<p>Connected as <b>${esc(st.account)}</b></p>` : ''}
    <label class="field"><span>OAuth Client ID (from Google Cloud Console)</span><input id="cid" value="${esc(S.googleClientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com"></label>
    <label class="field"><span>Drive folder name</span><input id="droot" value="${esc(S.driveRootName)}"></label>
    <label class="check"><input type="checkbox" id="auto" ${S.autoSync ? 'checked' : ''}> Auto-sync (after changes, every 5 min, and when back online)</label>
    <div class="form-actions wrap">
      <button class="btn" id="csave">Save</button>
      <button class="btn primary" id="cconn">${st.account ? 'Reconnect' : 'Connect Google Drive'}</button>
      <button class="btn" id="csync">${icon('sync')} Sync now</button>
      ${st.account ? '<button class="btn ghost" id="copen">Open Drive folder</button><button class="btn ghost danger" id="cdisc">Disconnect</button>' : ''}
    </div>
    <div class="panel-head"><h2>Management review access</h2></div>
    <p class="muted small">Gives the management emails above <b>view-only</b> access to the Drive folder (Google sends them an email). They can browse every ATM / Card Printer folder without the app.</p>
    <div class="form-actions"><button class="btn" id="cshare">Share folder with management</button></div>
  </section>

  <form class="panel form" id="sl"><div class="panel-head"><h2>Lists <small class="muted">one per line: ID | Label</small></h2></div>
    <label class="field"><span>Call types</span><textarea name="callTypes" rows="7" class="mono">${esc(listToText(S.callTypes))}</textarea></label>
    <label class="field"><span>Document types</span><textarea name="docTypes" rows="5" class="mono">${esc(listToText(S.docTypes))}</textarea></label>
    <label class="field"><span>Case folders (ID | Label | #color)</span><textarea name="folders" rows="6" class="mono">${esc(listToText(S.folders, true))}</textarea></label>
    <div class="form-actions"><button class="btn primary">Save lists</button><button type="button" class="btn ghost" id="lreset">Reset to defaults</button></div></form>

  <section class="panel form"><div class="panel-head"><h2>Appearance & mode</h2></div>
    <label class="check"><input type="checkbox" id="theme" ${S.theme === 'light' ? 'checked' : ''}> Light theme</label>
    <label class="check"><input type="checkbox" id="rmode" ${S.reviewMode ? 'checked' : ''}> Review mode (hide capture / delete — for presenting to management)</label>
  </section>

  <section class="panel form"><div class="panel-head"><h2>Data & storage</h2></div>
    <p>${counts.machines} machines · ${counts.visits} visits · ${counts.media} files</p>
    ${est ? `<div class="bar"><i style="width:${Math.min(100, (est.usage / est.quota) * 100)}%"></i></div><p class="muted small">${fmtBytes(est.usage)} used of ${fmtBytes(est.quota)} available on this device · ${persisted ? 'protected from automatic cleanup ✓' : '<a href="#" id="persist">Protect storage</a>'}</p>` : ''}
    <div class="form-actions wrap"><button class="btn" id="bexp">Export full backup (.zip)</button><button class="btn" id="bimp">Restore backup</button>
      <button class="btn danger ghost" id="wipe">Erase this device</button></div>
    <p class="muted small">${esc(APP.name)} v${APP.version}</p>
  </section></div>`;

  const formSave = (id, map) => ($(id, el).onsubmit = async (e) => { e.preventDefault(); await saveSettings(map(e.target)); toast('Saved', 'ok'); });
  formSave('#sp', (f) => ({ engineerName: f.engineerName.value.trim(), engineerId: f.engineerId.value.trim(), region: f.region.value.trim(), managerEmails: f.managerEmails.value.trim() }));
  formSave('#sc', (f) => ({ maxDimension: +f.maxDimension.value, jpegQuality: +f.jpegQuality.value, minPhotos: Math.max(1, +f.minPhotos.value || 1), watermark: f.watermark.checked, docEnhance: f.docEnhance.checked }));
  formSave('#sl', (f) => ({ callTypes: textToList(f.callTypes.value), docTypes: textToList(f.docTypes.value), folders: textToList(f.folders.value, true) }));
  $('#lreset', el).onclick = async () => { await saveSettings({ callTypes: DEFAULT_SETTINGS.callTypes, docTypes: DEFAULT_SETTINGS.docTypes, folders: DEFAULT_SETTINGS.folders }); render(el); };

  const saveCloud = () => saveSettings({ googleClientId: $('#cid', el).value.trim(), driveRootName: $('#droot', el).value.trim() || 'CE Smart Evidence', autoSync: $('#auto', el).checked });
  $('#csave', el).onclick = async () => { await saveCloud(); toast('Saved', 'ok'); };
  $('#cconn', el).onclick = async () => { await saveCloud(); try { await drive.connect(); toast('Google Drive connected', 'ok'); await drive.sync(); render(el); } catch (e) { toast(e.message, 'error', 6000); } };
  $('#csync', el).onclick = async () => { await saveCloud(); try { await drive.sync({ interactive: true }); toast('Sync complete', 'ok'); render(el); } catch (e) { toast(e.message, 'error', 6000); } };
  $('#cdisc', el) && ($('#cdisc', el).onclick = () => { drive.disconnect(); render(el); });
  $('#copen', el) && ($('#copen', el).onclick = async () => { try { window.open(await drive.driveFolderLink(), '_blank'); } catch (e) { toast(e.message, 'error'); } });
  $('#cshare', el).onclick = async () => {
    const emails = S.managerEmails.split(/[,;\s]+/).filter((x) => /@/.test(x));
    if (!emails.length) return toast('Add management emails in Engineer profile first', 'warn');
    if (!await confirmDialog('Share Drive folder', `Give view-only access to: ${emails.join(', ')}? Google will email them a link.`, 'Share')) return;
    try {
      const r = await drive.shareWithManagement(emails);
      await modal({ title: 'Sharing result', body: `<ul>${r.results.map((x) => `<li>${esc(x.email)}: ${x.ok ? '✓ shared' : '✕ ' + esc(x.error)}</li>`).join('')}</ul><p class="small">Folder link: <a href="${r.link}" target="_blank">${r.link}</a></p>`, actions: [{ label: 'OK', cls: 'primary' }] });
    } catch (e) { toast(e.message, 'error', 6000); }
  };

  $('#theme', el).onchange = (e) => { saveSettings({ theme: e.target.checked ? 'light' : 'dark' }, { touch: false }); document.documentElement.dataset.theme = e.target.checked ? 'light' : 'dark'; };
  $('#rmode', el).onchange = (e) => { saveSettings({ reviewMode: e.target.checked }, { touch: false }); document.body.classList.toggle('review-mode', e.target.checked); };
  $('#persist', el) && ($('#persist', el).onclick = async (e) => { e.preventDefault(); const ok = await navigator.storage.persist(); toast(ok ? 'Storage protected' : 'Browser declined — install the app to enable', ok ? 'ok' : 'warn'); render(el); });
  $('#bexp', el).onclick = async () => { toast('Preparing backup…'); await exportBackup(); };
  $('#bimp', el).onclick = async () => {
    const [f] = await pickFiles({ accept: '.zip,application/zip', multiple: false });
    if (!f) return;
    try { const r = await importBackup(f); toast(`Restored ${r.visits} visits, ${r.media} files`, 'ok'); render(el); } catch (e) { toast(e.message, 'error'); }
  };
  $('#wipe', el).onclick = async () => {
    if (!await confirmDialog('Erase this device', 'Deletes ALL local data on this device (cloud copy in Google Drive is not touched). This cannot be undone.', 'Erase', true)) return;
    for (const s of ['machines', 'visits', 'media', 'blobs', 'tombstones']) await db.clear(s);
    toast('Device erased'); location.hash = '#/';
  };
}
