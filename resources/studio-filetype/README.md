# Yatishara Studio `.studio` OS filetype (optional)

**Default product behavior:** `.studio` downloads are an **open zip** with a
`.studio` filename. No custom magic envelope, no required OS MIME install.
Linux/macOS/Windows may show a ZIP icon — that is the accepted tradeoff so
files stay openable and user-friendly.

In-app Files still use the CapCut-style clapperboard icon.

Import unwraps an older `YSTUDIO` envelope if present (legacy downloads only).

## Optional desktop icon pack

Only if someone wants a branded Finder/Explorer/Nautilus icon. **Not required.**

```bash
bash resources/studio-filetype/linux/install.sh
```

Windows: `resources/studio-filetype/windows/install.ps1`
