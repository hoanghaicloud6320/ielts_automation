# Upload Transport Decision

Decision: use `rclone` for Google Drive upload instead of the Google Drive SDK.

Current local status:

- Installed through MSYS2 `pacman`.
- Package: `mingw-w64-ucrt-x86_64-rclone`
- Binary: `C:\msys64\ucrt64\bin\rclone.exe`
- Version checked: `rclone v1.74.3-DEV`
- No remote configured yet. `rclone listremotes` currently reports no config file.

## Why

- Keeps upload/auth separate from the Node.js app logic.
- Avoids owning Google Drive OAuth token refresh logic in application code.
- Makes the submit pipeline simpler: classify files locally, then call `rclone copy` or `rclone sync`.
- Makes the upload target configurable by remote name and path, for example `ielts-drive:IELTS/submit`.

## Planned Boundary

The app should not import a Google Drive SDK.

Instead, the upload module should shell out to a small adapter:

```text
src/upload/rcloneUploader
```

Expected responsibilities:

- validate that `rclone` exists
- validate that the configured remote exists
- upload a lesson folder to a configured remote path
- return command result, uploaded path, and any failure output

## Expected Commands

Install/check:

```bash
rclone version
```

Configure Google Drive remote:

```bash
rclone config
```

Suggested remote name:

```text
ielts-drive
```

## First-Time Google Drive Config

Run:

```bash
rclone config
```

Recommended choices:

```text
n
name> ielts-drive
Storage> drive
client_id> press Enter
client_secret> press Enter
scope> drive
root_folder_id> press Enter
service_account_file> press Enter
Edit advanced config? n
Use web browser to automatically authenticate rclone with remote? y
Configure this as a Shared Drive? n
Keep this "ielts-drive" remote? y
q
```

After config:

```bash
rclone listremotes
rclone lsd ielts-drive:
```

The second command should list folders in Google Drive.

List configured remotes:

```bash
rclone listremotes
```

Upload a lesson folder:

```bash
rclone copy submit/les_1 ielts-drive:IELTS/les_1 --progress
```

## Config Shape

Future app config can be:

```json
{
  "upload": {
    "provider": "rclone",
    "remote": "ielts-drive",
    "basePath": "IELTS/submissions"
  }
}
```
