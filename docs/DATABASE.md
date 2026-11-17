# Database and Sync Design

## 1. Local database (each device): IndexedDB `ce-smart-evidence`, version 1

Defined in `assets/js/db.js`. It works with no internet connection.

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `machines` | `id` (machine ID, e.g. `SNB7412`) | `type` | `type` (`ATM` / `CP`), `model`, `serial`, `location`, `customer`, `notes`, `createdAt`, `updatedAt` |
| `visits` | `id` (UUID) | `machineId`, `date`, `folder` | `machineId`, `machineType`, `name` (`SNB7412_01`), `seq`, `callType`, `folder`, `date` (`YYYY-MM-DD`), `ticket`, `remarks`, `review` (`PENDING`/`APPROVED`/`REWORK`), `reviewNote`, `engineer`, `deviceId`, `createdAt`, `updatedAt` |
| `media` | `id` (UUID) | `visitId` | `kind` (`photo`/`document`), `docType`, `tag`, `filename`, `mime`, `size`, `width`, `height`, `takenAt`, `driveId`, `thumbDriveId`, `driveParent`, `needsUpload`, `needsRelocate`, `hasBlob`, `hasThumb`, `createdAt`, `updatedAt` |
| `blobs` | `id` (= media id) | | `full` (Blob), `thumb` (Blob, about 360 px). Kept separate so lists load fast |
| `settings` | `key` | | `app` (profile, capture options, lists), `driveFolders` (Drive folder-id cache) |
| `tombstones` | `id` | | Deletion markers `{ store, driveIds[], deletedAt, remoteDone }`, so a deletion reaches the other device |

### Naming rules (`services.js`)
- Visit name: `seq 0 → SNB7412`, `seq n → SNB7412_<nn>` (`_01`, `_02`, …). `seq` = highest existing `seq` for that machine + 1, so deleting a visit never reuses a name.
- Photo: `<visit>_<nnn>.jpg` → `SNB7412_01_001.jpg`
- Document: `<visit>_DOC-<type>_<nnn>.jpg|pdf` → `SNB7412_01_DOC-442_001.jpg`
- A photo moved to another visit is renamed to that visit's next number, and moved in Drive on the next sync.

### Image processing (on device, before saving)
Photos are resized to the longest side set in Settings (default 2048 px) and saved as JPEG at the chosen quality (default 0.85). They are optionally stamped with *visit • call type • date-time • engineer*. Documents get at least 2400 px plus optional grayscale/contrast enhancement. EXIF date-taken is read from gallery imports so photos land on the correct day.

## 2. Cloud: Google Drive

```
CE Smart Evidence/
├── ATM/
│   └── SNB7412/
│       ├── SNB7412/          SNB7412_001.jpg …
│       └── SNB7412_01/       SNB7412_01_001.jpg, SNB7412_01_DOC-442_001.jpg …
├── Card Printer/
│   └── CPR1001/…
└── _system/
    ├── ces-db.json           metadata of all machines / visits / media / tombstones / shared settings
    └── thumbs/<mediaId>.jpg  previews for other devices
```

Scope `drive.file`: the app can only see and change files it created.

## 3. Sync algorithm (`drive.js → doSync`)

1. **Pull** `_system/ces-db.json`.
2. **Tombstones** are merged first. Any record deleted on either device is removed locally, including its blobs.
3. **Merge** `machines`, `visits` and `media` record by record using **last-write-wins on `updatedAt`**. Local-only flags (`hasBlob`, `hasThumb`) are kept. New remote media arrive as metadata only.
4. Shared **settings** (profile, lists, capture options) are merged with last-write-wins.
5. **Upload** media with `needsUpload` into `<type>/<machine>/<visit>/`, plus the thumbnail into `_system/thumbs`.
6. **Relocate** media with `needsRelocate`: change parents and rename (moved photo, or the machine changed between ATM and CP).
7. **Trash** the Drive files of tombstones once (they go to Drive Trash and can be recovered for 30 days).
8. **Push** the merged `ces-db.json`.
9. **Download thumbnails** that are missing on this device. Originals download on demand (viewer, ZIP, reports).

Conflicts: if the same visit is edited on both devices between syncs, the later edit wins. If two **offline** devices create a visit for the same machine at the same time, both can get the same next name (e.g. two `SNB7412_03`). Sync before starting a visit on a second device to avoid this.

## 4. Backup

Settings → **Export full backup** produces a ZIP (`database.json` + `blobs/`) that holds everything on the device, including originals. **Restore backup** merges it back in. This is independent of Drive.

## 5. Schema changes (future)

Raise `DB_VERSION` in `db.js` and add the new stores or indexes inside `onupgradeneeded` (keep the existing `if (!contains)` guards). Raise `APP.schema` in `config.js` if the format of `ces-db.json` changes.
