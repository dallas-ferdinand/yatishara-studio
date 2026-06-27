# MercuryOS Desk (Next.js)

Canonical MercuryOS web desk at **`/desk/`** — files, editor, agent, terminal, settings. Next.js static export, Bun, gateway agent runtime.

**Live:** https://mercuryos.yatishara.com/ · Pulse: `/pulse/`

## Build

```bash
cd 05-projects/mercuryos-desk-next
./scripts/build.sh   # → out/
```

Gateway serves `out/` at **`/desk/`** only.

## Connect

1. Open `/desk/`
2. **Send new code to WhatsApp** (or read PIN from `./m` terminal)
3. Enter 6-digit PIN → bearer session stored in `localStorage`

Client header: `X-Mercury-Client: desk`
