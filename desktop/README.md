# NSB POS Desktop

This is a lightweight Electron wrapper for the hosted POS:

`https://nsbpos-production.up.railway.app/pos`

## Run

```bash
npm run desktop
```

## Build Windows Installer

```bash
npm run desktop:dist
```

The generated installer/output goes to `desktop-dist/`.

To point the desktop app at another POS URL, set `NSB_POS_URL` before launching Electron.
