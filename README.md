# CE Smart Evidence

Photo and document evidence system for customer engineers. It runs as a **PWA (Progressive Web App)**: you install it on an **Android phone** and a **Windows laptop**, and both stay in sync through **your Google Drive**.

## What it does

| Need | How it is handled |
|---|---|
| Photos on every call (PM, Installation, FLM, SLM, CHGF, CHGC, Normal, Inspection, Escalation…) | **New visit** → enter machine ID → pick call type → *Take photo / Live multi-shot / From gallery* |
| Automatic naming | 1st visit `SNB7412`, 2nd `SNB7412_01`, 3rd `SNB7412_02`… Files: `SNB7412_01_001.jpg`, documents `SNB7412_01_DOC-442_001.jpg` |
| ZIP for management | **Save & ZIP** on a visit, or select many visits / a day / a period → ZIP with `photos/`, `documents/`, `visit_info.txt/json`, `summary.csv` and a **`preview.html`** gallery |
| Picture preview for review | Full-screen viewer (swipe, zoom, slideshow, filmstrip), **Review** button, management review status (Pending / Approved / Needs rework) with notes |
| Phone + laptop sync | Google Drive (`drive.file` scope). Works offline; syncs automatically when online |
| Document capture (442, PM checklist, service report…) | **Scan document** with high-contrast enhancement, or attach PDF/image files |
| Phone gallery | **Import**: pick many photos (grouped by date taken, from EXIF), or in Google Photos tap **Share → CE Smart Evidence** |
| ATM vs Card / Statement printer | Separate machine registry, separate Drive folders (`ATM/`, `Card Printer/`), separate counts everywhere |
| Search | Machine ID, visit name, ticket, location, remarks, file names, date, call type, folder, review state, "below photo requirement" |
| Inspection / Escalation folders | Case folders (Regular, Inspection, Escalation, Follow-up, For Review, Closed). Move visits by select → *Move to* or drag & drop. Move photos between visits (renamed automatically) |
| Executive reports | **HTML, PDF, PowerPoint (editable charts), Excel (6 sheets)** + evidence ZIP for any period |
| Daily tracking | **Daily log**: ATM machines vs card printers visited per day, monthly calendar, monthly justification table, Excel export |
| Dashboard | KPIs, stacked daily chart, call type mix, case folders, fleet ring, 26-week activity heatmap, compliance alerts, most-visited machines |
| Company photo rule | Settings → *Required photos per visit*; dashboard and reports flag visits below the minimum |
| Extensible | Call types, document types and case folders are editable lists in Settings; modular ES-module code with no build step |

## Quick start (laptop, 2 minutes)

1. Install Python 3 (already on this PC).
2. Double-click **`start-laptop.bat`** → the app opens at <http://localhost:8080>.
3. In Edge/Chrome click the **Install** icon in the address bar to get a desktop app.

`localhost` is treated as secure, so camera, offline mode and Google sign-in all work locally. **For the phone you need an HTTPS address**, so publish it once. See [docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md).

## Documentation

- [docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md): Google Cloud / Drive setup, GitHub Pages deployment, installing on phone and laptop, updating
- [docs/DATABASE.md](docs/DATABASE.md): local database schema, Drive layout, sync algorithm
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md): daily workflow for the engineer and for management review

## Project structure

```
index.html                 app entry
manifest.webmanifest       PWA manifest (install, shortcuts, Android share target)
sw.js                      service worker (offline cache + share target)
start-laptop.bat           local server for Windows
assets/
  css/app.css              theme (dark / light), responsive layout
  icons/                   app icons
  vendor/                  JSZip, Chart.js, jsPDF(+autotable), PptxGenJS, SheetJS (bundled, offline)
  js/
    config.js              call types, doc types, folders, defaults  ← extend here
    db.js                  IndexedDB schema & helpers
    services.js            business logic: naming, visits, media, stats
    drive.js               Google Drive auth + sync
    exporter.js            evidence ZIP + preview.html, backup/restore
    reports.js             HTML / PDF / PPTX / XLSX executive reports
    ui.js                  shared UI: cards, lightbox, camera
    utils.js               image processing, EXIF, dialogs, files
    app.js                 router & shell
    views/                 dashboard, capture, visit, files, search, daily, machines, reportsView, inbox, settings
```

No build tools, frameworks or servers are needed. Any static web host works.
