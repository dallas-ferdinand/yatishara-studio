# Yatishara Studio `.studio` OS filetype

Downloads use a **YSTUDIO** magic envelope around an open zip so Linux/macOS/Windows
do not content-sniff the file as a ZIP. MIME: `application/vnd.yatishara.studio`.

Icon: cut-scene clapperboard with Yatishara mark on the slate
(`icons/studio-project-*.png`, `windows/yatishara-studio.ico`).

## Linux

```bash
bash resources/studio-filetype/linux/install.sh
```

Then reopen the file manager (or `killall nautilus` / Dolphin).

## Windows

1. Keep `windows/yatishara-studio.ico` next to `install.ps1` (or run from this tree).
2. PowerShell (user scope, no admin):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\resources\studio-filetype\windows\install.ps1
```

Restart Explorer if the old ZIP icon sticks.

## macOS

Finder icons for custom types need a registered UTI (usually via an app bundle).
Until the native Studio app ships document types:

1. Build `yatishara-studio.icns` on a Mac from `macos/yatishara-studio.iconset`:

```bash
iconutil -c icns macos/yatishara-studio.iconset -o macos/yatishara-studio.icns
```

2. Point the Studio app `CFBundleDocumentTypes` / `UTExportedTypeDeclarations`
   at `.studio` + `application/vnd.yatishara.studio` + that icns.

Without an app association, Finder may still show a generic document icon — but
**not** ZIP, because of the envelope.

## Import compatibility

Studio unwraps the envelope on import. Legacy raw-zip `.studio` files still work.
