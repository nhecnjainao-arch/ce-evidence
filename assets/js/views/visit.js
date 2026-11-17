// Visit detail: capture photos / documents, tag, preview, move, review, ZIP.
import { db } from '../db.js';
import { S, addMedia, mediaForVisit, updateVisit, deleteVisit, deleteMedia, moveMedia, updateMedia, listVisits, getMachine, forgetURL, docLabel, folderInfo, callLabel } from '../services.js';
import { PHOTO_TAGS, REVIEW_STATES } from '../config.js';
import { esc, $, $$, toast, modal, confirmDialog, fmtDate, fmtBytes, exifDate } from '../utils.js';
import { icon, typeBadge, folderBadge, reviewBadge, hydrateThumbs, lightbox, liveCamera, pickFiles, callTypeOptions, folderOptions, docTypeOptions, emptyState } from '../ui.js';
import { exportVisitsZip } from '../exporter.js';

export async function render(el, [id], query) {
  const v = await db.get('visits', id);
  if (!v) { el.innerHTML = emptyState('folder', 'Visit not found', 'It may have been deleted on another device.', '<a class="btn" href="#/files">Back to files</a>'); return; }
  const machine = await getMachine(v.machineId);
  const media = await mediaForVisit(id);
  const photos = media.filter((m) => m.kind === 'photo');
  const docs = media.filter((m) => m.kind === 'document');
  const selected = new Set();
  const isNew = query.get('new') === '1';
  let docType = sessionStorage.getItem('docType') || S.docTypes[0]?.id;
  const pct = Math.min(100, Math.round((photos.length / S.minPhotos) * 100));

  el.innerHTML = `
  <div class="page-head split">
    <div><a href="#/files/${v.folder}" class="link small">← ${esc(folderInfo(v.folder).label)}</a>
      <h1 class="mono">${esc(v.name)}</h1>
      <div class="vbadges">${typeBadge(v.machineType)}${folderBadge(v.folder)}${reviewBadge(v.review)}<span class="badge">${esc(fmtDate(v.date))}</span><span class="badge">${esc(callLabel(v.callType))}</span></div>
      <p class="muted small">${machine?.model ? esc(machine.model) + ' · ' : ''}${machine?.location ? '📍 ' + esc(machine.location) : ''}${v.ticket ? ' · Ticket #' + esc(v.ticket) : ''}</p>
    </div>
    <div class="head-actions">
      <button class="btn ghost" data-act="review">${icon('eye')} Review</button>
      <button class="btn primary" data-act="zip">${icon('zip')} Save & ZIP</button>
    </div>
  </div>

  <div class="progress-card ${pct >= 100 ? 'ok' : ''}">
    <div><b>${photos.length}/${S.minPhotos}</b> required photos ${pct >= 100 ? '✓ requirement met' : ''}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>

  <section class="capture-bar edit-only">
    <button class="cap-btn main" data-act="camera">${icon('camera')}<span>Take photo</span></button>
    <button class="cap-btn" data-act="live">${icon('eye')}<span>Live multi-shot</span></button>
    <button class="cap-btn" data-act="gallery">${icon('image')}<span>From gallery</span></button>
    <div class="cap-doc">
      <select id="doctype" aria-label="Document type">${docTypeOptions(docType)}</select>
      <button class="cap-btn" data-act="doc">${icon('doc')}<span>Scan document</span></button>
      <button class="cap-btn" data-act="docfile">${icon('report')}<span>Doc file / PDF</span></button>
    </div>
    <label class="tagpick">Tag new photos <select id="newtag">${PHOTO_TAGS.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
  </section>
  <div id="busy" class="busy" hidden></div>

  <div class="selbar" id="selbar" hidden><span id="selcount"></span>
    <button class="btn sm" data-act="sel-tag">Tag</button><button class="btn sm" data-act="sel-move">${icon('move')} Move to visit</button>
    <button class="btn sm danger" data-act="sel-del">${icon('trash')} Delete</button><button class="btn sm ghost" data-act="sel-clear">Clear</button></div>

  <section class="panel"><div class="panel-head"><h2>${icon('image')} Photos <small class="muted">${photos.length}</small></h2></div>
    ${photos.length ? `<div class="mgrid">${photos.map(tile).join('')}</div>` : `<p class="muted pad">No photos yet — use <b>Take photo</b> above.</p>`}</section>
  <section class="panel"><div class="panel-head"><h2>${icon('doc')} Documents <small class="muted">${docs.length}</small></h2></div>
    ${docs.length ? `<div class="mgrid docs">${docs.map(tile).join('')}</div>` : `<p class="muted pad">No documents yet — choose 442 / PM checklist and tap <b>Scan document</b>.</p>`}</section>

  <section class="grid-2">
    <form class="panel form" id="details"><div class="panel-head"><h2>Visit details</h2></div>
      <div class="row2"><label class="field"><span>Call type</span><select name="callType">${callTypeOptions(v.callType)}</select></label>
      <label class="field"><span>Case folder</span><select name="folder">${folderOptions(v.folder)}</select></label></div>
      <div class="row2"><label class="field"><span>Date</span><input type="date" name="date" value="${esc(v.date)}"></label>
      <label class="field"><span>Ticket</span><input name="ticket" value="${esc(v.ticket)}"></label></div>
      <label class="field"><span>Remarks</span><textarea name="remarks" rows="3">${esc(v.remarks)}</textarea></label>
      <div class="form-actions"><button class="btn primary edit-only">Save details</button></div></form>
    <form class="panel form" id="review"><div class="panel-head"><h2>Management review</h2></div>
      <div class="seg wide" id="rv">${REVIEW_STATES.map((r) => `<button type="button" data-r="${r.id}" class="${r.id === v.review ? 'on' : ''}">${esc(r.label)}</button>`).join('')}</div>
      <label class="field"><span>Review note</span><textarea name="reviewNote" rows="3" placeholder="Comments from reviewer">${esc(v.reviewNote)}</textarea></label>
      <div class="form-actions"><button class="btn">Save review</button>
      <button type="button" class="btn danger ghost edit-only" data-act="delete">${icon('trash')} Delete visit</button></div>
      <p class="muted small">Created ${esc(new Date(v.createdAt).toLocaleString())}${v.engineer ? ' by ' + esc(v.engineer) : ''} · ${media.length} files · ${fmtBytes(media.reduce((a, m) => a + (m.size || 0), 0))}</p></form>
  </section>`;

  hydrateThumbs(el, Object.fromEntries(media.map((m) => [m.id, m])));
  const reload = () => render(el, [id], new URLSearchParams());

  function tile(m) {
    return `<figure class="mtile" data-m="${m.id}">
      <label class="msel edit-only" onclick="event.stopPropagation()"><input type="checkbox" data-pick="${m.id}"></label>
      <img data-thumb="${m.id}" alt="">
      <figcaption><span class="mono">${esc(m.filename)}</span><span>${esc(m.kind === 'document' ? docLabel(m.docType) : m.tag)}${m.driveId ? ' · ☁' : ''}</span></figcaption></figure>`;
  }

  async function ingest(files, kind, opts = {}) {
    if (!files.length) return;
    const busy = $('#busy', el);
    busy.hidden = false;
    let i = 0;
    for (const f of files) {
      i++; busy.textContent = `Processing ${i}/${files.length}…`;
      try {
        const takenAt = opts.useExif ? (await exifDate(f))?.getTime() : undefined;
        await addMedia(id, f, { kind, docType, tag: $('#newtag', el).value, takenAt: takenAt || (f.lastModified && opts.useExif ? f.lastModified : undefined) });
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
    busy.hidden = true;
    toast(`${files.length} ${kind === 'document' ? 'document(s)' : 'photo(s)'} saved`, 'ok');
    reload();
  }

  $('#doctype', el).onchange = (e) => { docType = e.target.value; sessionStorage.setItem('docType', docType); };

  el.onclick = async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { pick.checked ? selected.add(pick.dataset.pick) : selected.delete(pick.dataset.pick); updateSel(); return; }
    const t = e.target.closest('.mtile');
    if (t && !e.target.closest('label')) {
      const list = t.closest('.docs') ? docs : photos;
      lightbox(list, list.findIndex((m) => m.id === t.dataset.m));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'camera': ingest(await pickFiles({ capture: true, multiple: false }), 'photo'); break;
      case 'gallery': ingest(await pickFiles({ multiple: true }), 'photo', { useExif: true }); break;
      case 'live': {
        const n = await liveCamera({ title: `${v.name} · photos`, onShot: (f) => addMedia(id, f, { kind: 'photo', tag: $('#newtag', el).value }) });
        if (n) { toast(`${n} photo(s) saved`, 'ok'); reload(); }
        break;
      }
      case 'doc': ingest(await pickFiles({ capture: true, multiple: false }), 'document'); break;
      case 'docfile': ingest(await pickFiles({ accept: 'image/*,application/pdf', multiple: true }), 'document'); break;
      case 'review': if (media.length) lightbox([...photos, ...docs], 0); else toast('No files to preview yet', 'warn'); break;
      case 'zip': await exportVisitsZip([id]); break;
      case 'delete':
        if (await confirmDialog('Delete visit', `Delete ${v.name} and all ${media.length} files? Cloud copies are moved to Drive trash on next sync.`, 'Delete', true)) {
          await deleteVisit(id); toast('Visit deleted'); location.hash = '#/files';
        }
        break;
      case 'sel-clear': selected.clear(); $$('[data-pick]', el).forEach((c) => (c.checked = false)); updateSel(); break;
      case 'sel-del':
        if (await confirmDialog('Delete files', `Delete ${selected.size} selected file(s)?`, 'Delete', true)) {
          for (const mid of selected) { forgetURL(mid); await deleteMedia(mid); }
          reload();
        }
        break;
      case 'sel-tag': {
        const tag = await modal({ title: 'Tag photos', body: `<select id="tg" class="full">${PHOTO_TAGS.map((x) => `<option>${esc(x)}</option>`).join('')}</select>`,
          actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Apply', cls: 'primary', value: (m) => $('#tg', m).value }] });
        if (tag) { for (const mid of selected) await updateMedia(mid, { tag }); reload(); }
        break;
      }
      case 'sel-move': {
        const visits = (await listVisits()).filter((x) => x.id !== id);
        const target = await modal({
          title: `Move ${selected.size} file(s) to…`,
          body: `<input id="mvq" placeholder="Filter visits…" class="full"><div class="list pick" id="mvl">${visits.slice(0, 300).map((x) => `<label class="row"><input type="radio" name="mv" value="${x.id}"> <b class="mono">${esc(x.name)}</b> <small class="muted">${esc(x.date)} · ${esc(x.callType)}</small></label>`).join('')}</div>`,
          actions: [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Move', cls: 'primary', value: (m) => $('input[name=mv]:checked', m)?.value || false }],
          onOpen: (m) => { $('#mvq', m).oninput = (ev) => $$('#mvl .row', m).forEach((r) => (r.hidden = !r.textContent.toLowerCase().includes(ev.target.value.toLowerCase()))); },
        });
        if (target) { await moveMedia([...selected], target); toast('Files moved and renamed', 'ok'); reload(); }
        break;
      }
    }
  };

  function updateSel() {
    $('#selbar', el).hidden = !selected.size;
    $('#selcount', el).textContent = `${selected.size} selected`;
  }

  $('#details', el).onsubmit = async (e) => {
    e.preventDefault();
    await updateVisit(id, Object.fromEntries(new FormData(e.target)));
    toast('Saved', 'ok'); reload();
  };
  let review = v.review;
  $('#rv', el).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; review = b.dataset.r; $$('#rv button', el).forEach((x) => x.classList.toggle('on', x === b)); };
  $('#review', el).onsubmit = async (e) => {
    e.preventDefault();
    await updateVisit(id, { review, reviewNote: e.target.reviewNote.value });
    toast('Review saved', 'ok'); reload();
  };

  if (isNew) setTimeout(() => toast(`Capture at least ${S.minPhotos} photos for ${v.name}`, 'info', 3500), 300);
}
