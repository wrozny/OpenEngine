# OpenEngine

A small, complete **2D game engine and scene studio** with Lua 5.3 scripting,
Box2D-based physics, an editable scene hierarchy, and standalone game export.
The included game, **Dead Signal**, is built with the same Lua API available to your own projects.

## Downloads

Open the [latest release](https://github.com/wrozny/OpenEngine/releases/latest) and
expand **Assets**. Download **OpenEngineStudio-Windows.zip** for the ready-to-run
Windows Studio and **DeadSignal-source.zip** for the Lua scripts, scene, sprites,
and a self-contained project you can open in Studio. These are release assets,
with no Actions artifact expiration. Each release also includes checksums and
GitHub's complete source-code archives.

Releases publish automatically when a version tag matching package.json is pushed
(for example, v0.1.0). The release workflow can also be run manually for an existing
tag. It uploads both ZIPs before publishing a new release.

For the current repository source, use **Code → Download ZIP** on the repository page.

## Start here

**Windows, no development tools:** unzip `OpenEngineStudio-Windows.zip` from GitHub Releases and run `OpenEngineStudio.exe`. The example opens automatically.
Press **Play** to run Dead Signal. Keep the executable with all the other files
in its extracted folder. Standalone game packaging instructions are below.
These unsigned portable packages may trigger Windows reputation prompts.

**From source:** install [Node.js 24 or newer](https://nodejs.org), then:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. No Lua installation, API keys, or external services
are needed. For desktop Studio from source:

```sh
npm run studio
```

The first desktop launch downloads the matching Electron runtime from its official
GitHub release and verifies its checksum. Downloads also respect standard HTTP(S)
proxy settings. If your network blocks GitHub release assets, browser Studio still works.

## What you can build

- Top-down games, arena shooters, simple platformers, puzzles, and physics prototypes.
- Scenes assembled from colored boxes, circles, and embedded sprite images.
- Lua gameplay organized into ordinary Scripts and reusable ModuleScripts.
- Keyboard/mouse controls, camera following, collision and raycast mechanics.
- Custom text, buttons, and health/progress bars; synthesized or file-based audio.
- Offline web games and portable desktop games containing their runtime and game data.

This release is **2D**, local/single-player, and shape/sprite based. It does not include
3D rendering, multiplayer replication, skeletal animation, a visual UI designer, or a
Roblox compatibility layer. The service/instance scripting model is inspired by Roblox;
Lua here is standard Lua 5.3 through Fengari, not Luau.

## Studio workflow

Click the project title to set your game name, description, and control hint.

1. Select a node in **Explorer**. Edit its name, position, size, rotation, appearance,
   sprite, and physics properties in **Properties**.
2. Drag objects in the scene. Scroll to zoom, middle-drag or Alt-drag to pan, and
   press **F** to frame the selection. **Snap** aligns movement to 25 world units.
3. Use **Insert** to create PhysicsObjects, folders, Scripts, or ModuleScripts.
   New nodes appear under the selected node; drag hierarchy rows to change parents.
4. Select a Script or ModuleScript to edit Lua. Switch back with the **Scene** tab.
5. Press **F5** or **Play**. Each play session gets its own scene, physics world,
   Lua state, and module cache. Stop returns to the untouched edit document.
6. **Save** writes a portable `.openengine` JSON document, including scripts and
   sprite data. **Open** restores one. Edits also autosave locally in the browser.
7. **Build game** exports an offline web ZIP. Packaged desktop Studio can also
   export a native game for its operating system without Node or a compiler.

Ctrl/Cmd+S saves; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo scene changes;
Ctrl/Cmd+D duplicates; Delete removes the selection. Inside the script textarea,
standard text undo remains available. Loading a project or making a new one is undoable.
The Guide button can reload the original example.

Autosave is convenience storage, not a backup. Download project files regularly.
Projects execute code when you press Play; open and run projects from people you trust.

## Dead Signal

WASD or arrow keys move, the mouse aims, and holding left click or Space fires.
Zombies move toward you and deal contact damage. Each kill awards 25 points.

Each cleared wave opens a supply screen. Spend points on maximum health with a
full heal, damage, fire rate, or movement speed, then start the next wave. Prices
increase for repeated purchases. Points carry across waves. Waves contain more
zombies, with increasing health and speed. The game ends at zero health and offers
**Try again**, which resets the run. Counts and speed eventually cap to keep the
simulation manageable; waves themselves continue indefinitely.

Source files live in `examples/zombie/`. Gameplay is in `scripts/Survival.lua`,
projectiles in `scripts/Weapons.lua`, tuning in `scripts/Config.lua`. The optional,
disabled `CollisionDemo` Script demonstrates `script.Parent.OnCollision`.
The example's two embedded SVG sprites are included as editable source assets.

## Build and distribute

```sh
# Production browser Studio and game runtime
npm run build
npm run preview

# Self-contained, offline game ZIP (open index.html after unzipping)
npm run package:game -- --platform web

# Portable Windows game with .exe, Electron runtime, and bundled project
npm run package:game -- --platform win32

# Package a project saved from Studio
npm run package:game -- --project "My Game.openengine" --platform win32

# Portable Windows Studio with in-app native export
npm run package:studio -- --platform win32

# Linux builds; macOS packaging should be performed on macOS
npm run package:game -- --platform linux
```

Outputs go to `release/`. Windows and Linux native exports are folders; zip and
ship the **entire folder**, including the license files. An `.exe` alone is not
a complete Electron application. No Node.js or Lua installation is needed by players.
Use `--arch arm64` for supported ARM targets; x64 is the default.
Native exports are portable distributions, not installers, and are not code-signed.
The in-app exporter supports Windows and Linux; macOS uses the CLI.

The checked-in example project resolves its `SourceFile` references during build.
Studio saves embed all code directly. Sprite uploads and named SourceFile assets are embedded as data URLs.
For portable audio, use the built-in effects or embedded data URLs with `PlayFile`;
arbitrary external audio/image URLs are not downloaded and bundled automatically.
Native project open/save is limited to 16 MB.

## Documentation and development

- [Lua and engine API](docs/API.md)
- [Make your own game](docs/TUTORIAL.md)
- [Architecture and extension points](docs/ARCHITECTURE.md)
- [Validation and platform coverage](docs/VALIDATION.md)
- [Third-party licenses](THIRD_PARTY_NOTICES.md)

```sh
npm test                    # Headless engine/gameplay and packaging tests
npx playwright install chromium  # Once, unless Chromium is already installed
npm run test:browser         # Studio, input/editing, save and actual offline export
npm run format:check
```

Set `CHROMIUM_PATH` to use a system Chromium executable. Node 24 is pinned in
`.node-version`; npm dependencies are pinned and locked. MIT licensed.
