# Dead Signal source

This folder contains the editable game scene, Lua gameplay, and SVG sprites for
Dead Signal. It is a project for OpenEngine, not an independent engine/runtime.

## Open in Windows Studio

Download **OpenEngineStudio-Windows.zip** and **Example Projects.zip** from
[GitHub Releases](https://github.com/wrozny/OpenEngine/releases/latest).
Extract both ZIPs. Run OpenEngineStudio.exe, click Open, and choose
**Dead Signal/Dead Signal.openengine** from the examples folder. Press Play.
The named document embeds all scripts and sprites; saving it in Studio does not
rewrite the separate Lua files. The launcher also offers the example explicitly.

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

Release downloads include checksums and complete engine source archives.
