# Dev Environment Setup (Svelte + Electron)

## Prerequisites
- Node.js `22.x` or later
- `npm.cmd` available on Windows PowerShell

## Project Directory
```powershell
cd 02.SvelteElectron
```

## Install
```powershell
npm.cmd install
```

## Run (Dev)
```powershell
npm.cmd run dev
```

## Build (UI)
```powershell
npm.cmd run build
```

## Start (Desktop)
```powershell
npm.cmd run start
```

## Structure
- `apps/ui`: Svelte (Vite) UI
- `apps/desktop`: Electron main/preload
- `dist/ui`: UI build output
