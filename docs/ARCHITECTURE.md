# Architecture

OpenEngine separates authoring, simulation, presentation, and distribution. The editor
never simulates its own document. Play serializes the document into a new Engine; Stop
disposes that Engine and leaves the authoring document alone.

| Area                              | Responsibility                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/engine/scene.js`             | Instance hierarchy, serialization, cloning and project validation.                       |
| `src/engine/signal.js`            | Snapshot-based event dispatch with explicit disconnection.                               |
| `src/engine/math.js`              | Immutable 2D vector values and numeric helpers.                                          |
| `src/engine/engine.js`            | Service container, 60 Hz simulation, Planck ownership and post-step contacts.            |
| `src/engine/lua.js`               | Lua VM lifetime, host proxies, script environments, module cache and callback ownership. |
| `src/engine/input.js`, `audio.js` | Scoped DOM input and WebAudio/file playback lifecycle.                                   |
| `src/engine/renderer.js`          | Canvas rendering, sprite caching, hit testing and selection outlines.                    |
| `src/game-view.js`                | Shared play surface, DOM UI, input wiring and animation lifetime.                        |
| `src/studio/`                     | Editor document/history, hierarchy, inspector, source editing and file/export UI.        |
| `src/runtime/`                    | Game-only entry points for desktop/web and fully offline HTML export.                    |
| `desktop/`                        | Isolated Electron shell, narrow file/build IPC and native distribution copying.          |
| `tools/`                          | Project source hydration, reproducible builds and Electron packaging.                    |
| `examples/zombie/`                | Game data, embedded sprite sources and ordinary Lua gameplay.                            |

## Deliberate choices

- **2D and Canvas** keep the runtime small, easy to inspect, and independent of a GPU driver.
- **Planck** provides existing Box2D collision resolution, sensors, filtering and raycasts.
  Engine units convert at the boundary: 50 pixels to one physics meter.
- **Fengari** runs Lua 5.3 consistently in a browser and desktop runtime. Per-session
  states prevent old module caches and callbacks from leaking into new play sessions.
- **Explicit services and scene instances** provide a familiar hierarchy without attempting
  to reproduce Roblox's networking, APIs or proprietary scripting dialect.
- **JSON documents** embed script source and sprites. Editor saves and packaged projects
  use the same format. A source project may use relative SourceFile references, which
  the build pipeline resolves before distribution.
- **No server** is required. Web builds embed runtime and project in one HTML document.
  Desktop builds embed the compiled runtime and project in Electron's app resources.
- **No renderer Node integration**: Electron uses a sandboxed preload, context isolation,
  disabled navigation/popups, denied permission requests, and a restrictive CSP. Native
  file paths are chosen through system dialogs. Lua projects remain trusted code.

## Lifecycle

The engine starts enabled Scripts after attaching the scene. Newly attached Scripts
start immediately. Lua event subscriptions record the owning Script, including
subscriptions added from its event callbacks. Removing/disabling that Script disconnects
its subscriptions. A callback error disconnects that handler and reports its owner.
Stopping a game disposes Lua, input listeners, audio, UI subscriptions and scene bodies.

Heartbeat precedes the physics step. Contacts are queued during world stepping and
dispatched afterwards so gameplay may destroy/create objects without mutating a locked
Box2D world. Scene rendering sorts visible objects by Layer. Input transforms pointer
coordinates into world space using the same camera as rendering.

## Extending the engine

- Add a service to the Engine service map; public properties/methods are bridged into Lua.
  Keep Lua-callable methods in colon style and return engine values or primitives.
- Add a class by extending CLASSES, constructor defaults, validation, serialization,
  inspector UI, and any runtime attachment behavior it needs. Add behavioral tests.
- Add collision groups in GROUPS/MASKS; document both sides of the filter relationship.
- New UI primitives belong in UIService data and GameView's DOM rendering, not in game Lua
  internals. New game rules belong in example/project scripts, not renderer conditionals.
- For transform inheritance, animation, joints, or external asset pipelines, introduce
  explicit components rather than adding game-name checks to the runtime.

## Scope and tradeoffs

This is a compact 0.1 engine, not a replacement for a mature 3D editor. The source editor
is a plain accessible textarea with line numbers and indentation; there is no language
server or autocomplete. History stores up to 80 complete project snapshots, so large
embedded assets increase memory usage. Sprite images are cached per renderer; changing
many unique textures in one session increases memory usage until that view is closed.
Native packages are comparatively large because they include Chromium. Game data and
Lua source remain inspectable in exports; there is no encryption or anti-cheat promise.
The zombie AI intentionally steers directly toward the player and can be blocked by cover.
