# Dead Signal source

This folder contains the editable game scene, Lua gameplay, and SVG sprites for
Dead Signal. It is a project for OpenEngine, not an independent engine/runtime.

## Open in Windows Studio

Download the `OpenEngineStudio-Windows` and `DeadSignal-source` artifacts from the
[downloads workflow](https://github.com/wrozny/OpenEngine/actions/workflows/downloads.yml).
Choose the latest successful run and find **Artifacts** near the bottom of its page.
GitHub requires you to be signed in to download artifacts.

1. Extract both ZIPs to separate folders. Keep all Studio runtime files together.
2. Run `OpenEngineStudio.exe` from the Studio folder.
3. Click **Open** and select `DeadSignal.openengine` from the game source download.
4. Press **Play**. Edit scripts through Explorer, then save your own project.

`DeadSignal.openengine` is generated for the downloadable source artifact and embeds
all Lua and sprite data, so it opens directly in Studio. Changes saved from Studio
stay in that self-contained document; they do not rewrite the separate Lua files.

## Edit source files in the repository

- `scripts/Survival.lua`: waves, movement, zombie AI, health, rewards and upgrades.
- `scripts/Weapons.lua`: projectiles and collision handling.
- `scripts/Config.lua`: starting stats, rewards and upgrade costs.
- `scripts/CollisionDemo.lua`: optional object-owned collision event example.
- `assets/`: editable SVG sprite artwork.
- `project.openengine`: scene and references to the separate Lua/asset files.

Clone/download the complete [OpenEngine repository](https://github.com/wrozny/OpenEngine),
install Node.js 24+, and run from the repository root:

```sh
npm ci
npm run dev
```

The bundled example reads these source files. To generate a fresh portable Studio
document and source folder after changing them:

```sh
npm run package:source
```

To package the game as a Windows runtime:

```sh
npm run package:game -- --project examples/zombie/project.openengine --platform win32
```

GitHub artifacts are retained for 90 days. Use **Run workflow** on the downloads
workflow page to create fresh downloads later.
