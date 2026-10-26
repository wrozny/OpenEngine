# OpenEngine

A Lua game engine and desktop Studio for **2D and 3D** projects. Build scenes, write
scripts, run physics, and export a game with its own runtime. The authoring scene is
separate from every Play session.

## Download and run

Open the [latest GitHub release](https://github.com/wrozny/OpenEngine/releases/latest)
and expand **Assets**:

- **OpenEngineStudio-Windows.zip** — extract the entire ZIP and run `OpenEngineStudio.exe`.
  Keep the executable beside its runtime files. No Node.js or Lua installation is needed.
- **Example.Projects.zip** — extract, then use Studio's **Open** button to select
  `Dead Signal/Dead Signal.openengine`, `Parcel Panic/Parcel Panic.openengine`, or `Neon Borough/Neon Borough.openengine`.
- **NeonBorough-Windows.zip** — ready-to-run online city client and Server applications.
- **NeonBorough-web.zip** — web client and bundled Node.js server. Run `node server.cjs`
  with Node.js 24 LTS, then visit `http://localhost:7777`.
- **SHA256SUMS.txt** — checksums for the downloads. GitHub's **Source code** links contain
  the complete engine source for the release.

The Studio launcher offers **New**, **Open**, recent projects, and explicit example
buttons. It never silently starts a game. Missing recent files are crossed out and
can be removed with the × button. Desktop recents show actual project file paths;
browser recents are local browser copies.

Choose **2D** or **3D** when creating a project. Use a starter with a player controller,
a 2D platformer starter, or an empty scene. Click the project title to change its
name, description, and in-game control hint.

## Studio workflow

- **Panels:** drag tabs to rearrange/dock them, drag dividers to resize, and double-click
  a tab to maximize it. Layout is remembered. **Reset layout** restores the defaults.
- **Scene:** right-click to insert objects or operate on the selection. Ctrl/Cmd-click
  selects multiple objects; deletion and duplication are undoable as a group.
- **2D viewport:** drag objects to move them, middle/Alt-drag to pan, wheel to zoom.
  Drag empty space for rectangular selection; **Snap** uses a 25-unit grid.
- **3D viewport:** use Move/Rotate/Scale gizmos. Right-drag orbits, middle-drag pans,
  and the wheel zooms. Hold right mouse with WASD to fly; Space/Control change height
  and Shift increases speed. **F** frames the active object. Snap uses 1-meter movement,
  15-degree rotation, and 0.25 scale increments.
- **Properties:** edit transforms, shapes, appearance, physics, textures, controller
  settings, and named attributes. Select Workspace in 3D to edit the sky and fallen height.
- **Lua:** select a Script, ModuleScript, or controller. Monaco supplies syntax coloring,
  engine-aware autocomplete (Ctrl+Space), signatures, hover help, and syntax diagnostics.
  These completions describe engine APIs and basic local service aliases; they are not
  a full Lua language server or static type checker.
- **Play:** F5 starts/stops a disposable session. Edit-time data survives unchanged.
- **Save:** desktop Studio writes a .openengine project file; the browser downloads one.
  Ctrl/Cmd+Shift+S uses Save As. Browser copies are convenient, not permanent backups.
- **Build:** export an offline single-player web ZIP or a multiplayer web client/server ZIP. Packaged desktop Studio exports native games; online games include separate client and Server applications.

Ctrl/Cmd+S saves; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo scene changes; Ctrl/Cmd+D
duplicates; Delete removes the selection. Monaco retains standard text editing shortcuts.

## Engine features

- Object2D boxes/circles and Object3D boxes/spheres/cylinders/wedges, with configurable physics.
- Planck/Box2D 2D physics and Cannon 3D physics: contacts, sensors, filtering and rays.
- Three.js rendering, lights/shadows, tiled materials and textures, configurable sky images.
- Workspace and ScriptService hierarchy, script.Parent, events, cloning, and modules.
- Editable data attributes: SetAttribute, GetAttribute and GetAttributes.
- Editable Lua PlayerController2D (TopDown/Platformer) and PlayerController3D
  (Platformer/FreeCamera), including grounded jumping and configurable keys/speeds.
- Keyboard/mouse input, camera following and mouse look, HTML UI widgets, synthesized
  sounds, local/embedded audio, vector and math helpers.
- Automatic 3D object cleanup below Workspace.FallenHeight, with OnFallen recovery hooks.

Existing version 1 **PhysicsObject** documents and Lua constructors migrate to Object2D.
2D uses pixels with Y pointing down; 3D uses meters with Y pointing up. Parenting organizes
objects and scripts; it does not imply inherited transforms.

This engine supports standalone and dedicated-server multiplayer projects. Lua is **Lua 5.3**
through Fengari, not Luau; Roblox compatibility is not provided. There is no skeletal animation
system, polygon collider editor or touch/gamepad controller. Scripts are trusted code, not a security sandbox.
3D needs a WebGL-capable machine. Native packages include Chromium and are unsigned.

## Example projects

**Dead Signal (2D):** WASD/arrows move, mouse aims, left click/Space fires. Survive waves
of increasingly fast zombies. Kills award points; between waves upgrade health, damage,
fire rate or speed. Death offers a fresh run. Gameplay is ordinary Lua under
`examples/zombie/` and uses the same public API as your projects.

**Parcel Panic (3D):** a floating-island workplace comedy. Collect three lost parcels,
deliver them to a post box, score a football goal, and ring the bell to clock out.
WASD moves, Space jumps, right-drag looks, E interacts/kicks, and R returns to spawn.
Fallen players respawn and lost balls are replaced. See `examples/parcel-panic/`.

Each folder in **Example Projects.zip** includes a named, self-contained Studio document
and editable Lua/asset source. `project.openengine` in a source folder references those
external files and is intended for the CLI. Open the named portable document in Studio.

## Develop from source

Install [Node.js 24+](https://nodejs.org), then run from the repository root:

```sh
npm ci
npm run dev
```

Open the address Vite prints. There are no required credentials, databases or game services.
For desktop Studio on a graphical machine:

```sh
npm run studio
```

Electron downloads come from official GitHub releases with TLS and checksum verification.
The installer/packager honors standard HTTP(S) proxy settings. Browser Studio works without
an Electron download. All dependencies are version-pinned and locked.

```sh
npm test                         # Engine, gameplay, document and native-file tests
npx playwright install chromium  # Once, unless system Chromium is available
npm run test:browser              # Real editor and offline-game integration checks
npm run test:production           # Production bundles under desktop CSP
npm run format:check
```

Set CHROMIUM_PATH to choose a system Chromium executable. Headless Linux desktop export
validation is available after packaging Linux Studio:

```sh
npm run package:studio -- --platform linux
npm run test:desktop -- --executable release/OpenEngineStudio-linux-x64/OpenEngineStudio
```

## Package games and releases

```sh
npm run build
npm run preview
npm run package:examples
npm run package:game -- --platform web
npm run package:game -- --project "My Game.openengine" --platform win32
npm run package:studio -- --platform win32
```

Outputs go to `release/`. Native outputs are folders; distribute the **entire folder**,
including Electron license files. The .exe alone is not a complete application.
Use `--platform linux` or package on macOS for those systems; `--arch arm64` selects ARM.
In-app native export supports Windows/Linux. macOS CLI packaging/signing is not validated.

Uploading an image embeds its data in the saved project. SourceFile assets are resolved
by the CLI. Use named/embedded assets and built-in sounds for portable exports; external
URLs are not downloaded automatically. Desktop project open/save supports up to 64 MB.
The release workflow builds both requested ZIPs and publishes them when a version tag
matching package.json is pushed. New releases remain drafts until asset uploads finish.

## Documentation

- [Lua and engine API](docs/API.md)
- [Make your own game](docs/TUTORIAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Validation and platform coverage](docs/VALIDATION.md)
- [Third-party licenses](THIRD_PARTY_NOTICES.md)

MIT licensed. Art and texture patterns shipped with the examples were created for this project.

## Multiplayer (0.3)

Enable **Multiplayer** when creating a project or in **Project settings**. Play opens a dedicated server and a client; **Add client** tests another player over a real WebSocket connection. Lua now supports `ServerScript`, `LocalScript`, `Players`, `RemoteEvent`, and `Object2D/3D:SetNetworkOwner(player)`. Legacy Scripts run on the host; PlayerControllers run on their owning client.

**Neon Borough** is an original online 3D city sandbox with walking/jumping, shooting, respawning, eight pedestrians and three enterable arcade cars. Open it from the launcher and press Play, then Add client. WASD moves/drives, Space jumps, right drag looks, left click shoots, and E enters/exits a nearby car.

Multiplayer web builds contain a web client and a self-contained Node.js host: extract, install Node.js 24 LTS, run `node server.cjs`, then visit `http://localhost:7777`. Multiplayer Windows builds produce separate client and Server applications; run the Server first, then join `ws://SERVER-IP:7777/socket` from each client. Native hosting needs no Node install. See [multiplayer API, deployment and limits](docs/MULTIPLAYER.md) before hosting publicly.

## Traversal and city update (0.4)

Default 3D and 2D platformer controllers now climb walkable ramps and low steps. StepHeight and MaxSlopeAngle are editable, and Wedge is available as an Object3D shape. Ground, ceiling, diagonal-corner and destination checks keep characters from climbing through obstacles. Untouched old default controller scripts migrate automatically; custom Lua is preserved.

Neon Borough has lower curbs, improved car handling, and server-controlled swag: residents award 10, players 50. Swag appears above player heads and survives respawns within a connection. Cars can cross pathways, fast impacts earn takedowns, and pedestrians recover when lost. The release includes ready-to-run game builds and **NeonBorough-source.zip**. See the [new traversal and world-label APIs](docs/API.md#traversal-and-wedges-04).
