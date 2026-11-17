# Setup and Deployment Guide

You do this once, in roughly 30 minutes. At the end you will have:

- the app published at a fixed **HTTPS address**, e.g. `https://<your-github-name>.github.io/ce-evidence/`
- the app installed on your **Android phone** and your **Windows laptop**
- both devices syncing through **one Google Drive account**
- management with **view-only** access to the Drive folder

> **Before you start:** check with your company that storing machine and site photos on a Google Drive account is allowed. If the company uses Google Workspace, ask IT whether third-party apps may use Drive. If not, use a personal Gmail account set aside for work evidence.

---

## Part 1: Publish the app (GitHub Pages, free HTTPS)

The phone camera, installation and Google sign-in all require HTTPS. GitHub Pages provides it at no cost.

1. Create a free account at <https://github.com>.
2. Click **New repository**. Name it `ce-evidence` and choose **Public**. GitHub Pages on a private repository needs a paid plan, but the code contains no data: every photo stays in your own Drive and browser.
3. Click **uploading an existing file**, then drag in **everything inside this project folder** (`index.html`, `manifest.webmanifest`, `sw.js`, the `assets/` folder and the `docs/` folder). Click **Commit changes**.
4. Open **Settings → Pages**. Set *Source* = **Deploy from a branch** and *Branch* = **main / (root)**, then click **Save**.
5. After about a minute the site is live at `https://<your-github-name>.github.io/ce-evidence/`. Write this address down; it is your **APP URL**.

*Other options:* Netlify (drag the folder onto <https://app.netlify.com/drop>), Cloudflare Pages, or any company web server with HTTPS. The app is static files only.

---

## Part 2: Google Cloud setup (Drive sync)

1. Go to <https://console.cloud.google.com> and sign in with the **Google account that will store the evidence**.
2. **Create a project:** use the project picker → **New project** → name it `CE Smart Evidence` → **Create**.
3. **Enable the Drive API:** go to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
4. **OAuth consent screen** (APIs & Services → OAuth consent screen / "Google Auth Platform"):
   - User type: **External**
   - App name: `CE Smart Evidence`; support and developer email: yours
   - Scopes: add `.../auth/drive.file`. This scope only lets the app see files that the app itself created, never the rest of your Drive.
   - **Test users:** add your own Google address. Leave the app in **Testing** mode; that is fine for personal use.
5. **Create the Client ID** (APIs & Services → Credentials → **Create credentials → OAuth client ID**):
   - Application type: **Web application**
   - **Authorized JavaScript origins.** Add both of these, exactly, with no trailing slash and no path:
     - `https://<your-github-name>.github.io`
     - `http://localhost:8080`
   - Leave *Authorized redirect URIs* empty.
   - Click **Create** and copy the **Client ID** (`xxxxxxxx.apps.googleusercontent.com`).

> The Client ID is not a secret; it is designed to sit in browser apps. No client secret is used.

---

## Part 3: Install and connect each device

### Android phone (Chrome)
1. Open your **APP URL** in Chrome.
2. Tap **⋮ → Install app** (or "Add to Home screen"). The app now has an icon and runs full screen.
3. Open the app and go to **More → Settings**:
   - **Engineer profile:** your name, engineer ID, region and management emails → **Save profile**
   - **Google Drive sync:** paste the **Client ID** → **Connect Google Drive** → choose your account → **Allow**
4. Allow the **camera** when the app asks for it.
5. Gallery sharing: in Google Photos / Gallery, select photos → **Share** → **CE Smart Evidence**. They arrive in **Import**. This only works once the app is installed.

### Windows laptop (Edge or Chrome)
1. Open the same **APP URL**, then click the **Install** icon in the address bar.
2. Settings → paste the same Client ID → **Connect Google Drive** with the **same Google account**.
3. Press **Sync now**. Everything captured on the phone appears.

*Offline / local alternative:* double-click `start-laptop.bat` to run it at `http://localhost:8080`. This is a separate local copy of the app; it syncs through Drive in the same way.

### How syncing behaves
- Everything is saved **on the device first**, so the app works with no signal.
- When online and connected, it syncs **15 seconds after a change, every 5 minutes, and when the connection returns**.
- Google sign-in tokens last **1 hour**. After that the cloud icon turns amber; tap it (or **Sync now**) to reconnect, which takes one tap.
- Full-size photos are uploaded to Drive. Other devices download small previews automatically and fetch the original when you open or ZIP a photo.

---

## Part 4: Management review access

Two options. You can use both.

1. **Drive folder (no app needed).** Settings → **Share folder with management**. The management emails get **view-only** access to `CE Smart Evidence/` in Drive, laid out as `ATM/<MachineID>/<Visit>/…` and `Card Printer/<MachineID>/<Visit>/…`.
2. **Files you send.** Use evidence ZIPs (with `preview.html`) and executive reports (HTML / PDF / PPT / Excel) from **Reports**. On the phone, *Share…* opens Gmail, Outlook, Teams, Viber and similar apps directly.

For presenting on your laptop, turn on **Settings → Review mode**. It hides the capture, delete and edit buttons.

---

## Part 5: Updating the app later

1. Edit the files, or replace them with a new version.
2. In `sw.js`, raise `VERSION` (for example `ces-v1.0.1` → `ces-v1.0.2`). **This step is required**, otherwise installed apps keep the cached old version.
3. Upload the changed files to the GitHub repository (**Add file → Upload files**).
4. Devices pick up the update automatically. A message says "Update ready"; close and reopen the app.

Your data is unaffected by updates, because it lives in each device's database and in Drive.

### Where to extend
- New call types, document types or case folders: Settings → **Lists** (no code), or edit the defaults in `assets/js/config.js`.
- New screen: add `assets/js/views/<name>.js` exporting `render(el, params, query)`, register it in `ROUTES`/`NAV` in `assets/js/app.js`, and list the file in `sw.js` `SHELL`.
- New report section: `assets/js/reports.js` (all formats share `computeStats()` from `services.js`).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` / `origin_mismatch` | The **Authorized JavaScript origin** must exactly match the address bar origin, e.g. `https://name.github.io` (no `/ce-evidence`, no trailing `/`). Changes can take 5 minutes to apply. |
| `Access blocked: app has not completed verification` | Add your Google address under **Test users** on the consent screen. |
| Sign-in popup does nothing | Allow pop-ups for the app's site. |
| Camera doesn't open | Use the HTTPS address (not `http://<ip>`), then allow camera permission in Chrome site settings. |
| "Share → CE Smart Evidence" missing | Install the app first (Part 3). Android only. |
| Photos show a faded tile on the laptop | The photo is in Drive but not downloaded yet. Connect and open it; it downloads on demand. |
| Storage warning | Settings → Data & storage → **Protect storage**. Use **Export full backup** regularly. |
| Old version still showing | Increase `VERSION` in `sw.js`, re-upload, then close and reopen the app. |
