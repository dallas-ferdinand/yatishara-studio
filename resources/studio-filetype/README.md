# Yatishara Studio `.studio` OS filetype

Downloads use a **YSTUDIO** magic envelope around an open zip so Linux/macOS/Windows
do not content-sniff the file as a ZIP. MIME: `application/vnd.yatishara.studio`.

Without a one-time OS install, Linux shows a generic “binary / unknown” icon and
“unknown file type” — that is expected after the envelope. Install the pack below
for the clapperboard icon + open handler.

## Linux (one-time)

From this repo:

```bash
bash resources/studio-filetype/linux/install.sh
```

Or download the portable pack (no repo needed):

```bash
curl -fsSL -o yatishara-studio-linux-filetype.tar.gz \
  https://studio.yatishara.com/filetype/yatishara-studio-linux-filetype.tar.gz
tar -xzf yatishara-studio-linux-filetype.tar.gz
bash studio-filetype/linux/install.sh
```

Then reopen the file manager (`killall nautilus` or Dolphin).

Check:

```bash
xdg-mime query filetype ~/Downloads/something.studio
# → application/vnd.yatishara.studio
```

Double-click opens Studio in the browser and nudges you to **drop the file into Files** to import. There is no native desktop editor yet.

Ensure `~/.local/bin` is on your `PATH` so the open helper resolves.

## Windows

1. Keep `windows/yatishara-studio.ico` next to `install.ps1`.
2. PowerShell (user scope):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\resources\studio-filetype\windows\install.ps1
```

Restart Explorer if the icon is stale.

## macOS

Finder custom types need a UTI via an app bundle. Until the native Studio app ships
document types, build `yatishara-studio.icns` from `macos/yatishara-studio.iconset`
with `iconutil` and register `.studio` + `application/vnd.yatishara.studio`.

Envelope still prevents ZIP sniffing even without an icon.

## Import

Studio unwraps the envelope on import. Legacy raw-zip `.studio` still works.
