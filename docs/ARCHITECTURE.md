# Architecture

OpenEngine separates scene data, simulation, rendering, authoring tools and distribution.
Every Play session receives a serialized copy of the document, so its bodies, Lua modules,
attributes and event subscriptions cannot mutate the editor's scene.

## Modules

| Area                                                                | Responsibility                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/engine/scene.js`                                               | Hierarchy, class defaults, compatibility, transforms, validation and serialization.  |
| `src/engine/attributes.js`, `math.js`                               | Serializable attribute values and immutable 2D/3D vectors.                           |
| `src/engine/engine.js`                                              | Services, Lua lifecycle, fixed-step simulation, queued contacts and world cleanup.   |
| `src/engine/physics/`                                               | Planck pixel/meter conversion and Cannon's meter-based Y-up world.                   |
| `src/engine/renderer.js`, `renderer3d.js`                           | Canvas 2D and Three.js projection, materials, resource lifetime and picking.         |
| `src/engine/materials.js`, `texture-uv.js`                          | Original embedded patterns and world-sized primitive UV mapping.                     |
| `src/engine/controllers.js`                                         | Editable Lua templates and exposed controller defaults.                              |
| `src/engine/lua.js`, `lua-syntax.js`                                | VM bridge, module environments, owned callbacks and compile-only editor diagnostics. |
| `src/game-view.js`                                                  | Shared play surface, input wiring, DOM widgets, frame loop and teardown.             |
| `src/studio/store.js`                                               | Authoring document, selection, transactional edits and undo/redo.                    |
| `src/studio/dock.js`, `viewport.js`                                 | Dockable layout and dimensional scene interactions/gizmos.                           |
| `src/studio/code-editor.js`, `lua-api.js`                           | Monaco models, project-aware completions, help and diagnostics.                      |
| `src/studio/launcher.js`, `projects.js`                             | Explicit project startup, dimension selection, files and browser recent copies.      |
| `src/studio/hierarchy.js`, `inspector.js`, `attribute-inspector.js` | Reusable authoring panels.                                                           |
| `src/studio/context-menu.js`, `dialogs.js`                          | Context operations and focused dialogs.                                              |
| `desktop/projects.cjs`                                              | Persistent recent paths, existence checks and authorized atomic project writes.      |
| `desktop/main.cjs`, `preload.cjs`, `export.cjs`                     | Sandboxed Electron shell, narrow IPC and native game export.                         |
| `tools/`                                                            | Source-file hydration, runtime builds, example ZIPs and platform packaging.          |

## Established dependencies

Three.js supplies the 3D renderer and transform/orbit controls. Cannon (cannon-es)
provides 3D rigid bodies, while Planck provides Box2D-based 2D physics. Fengari executes
Lua 5.3 in browsers and desktop. Microsoft's Monaco supplies text editing; Golden Layout
supplies docking; Lucide supplies icons. fflate creates portable ZIPs. No project code,
textures or editor components are downloaded from unreviewed runtime/CDN sources.
Dependencies are pinned in package.json and package-lock.json; full notices accompany
exported games and Studio.

## Scene and scripting model

Project version 1 remains supported. Missing dimension means 2D. PhysicsObject input
names normalize to Object2D; new documents use Object2D/Object3D. A project contains
Workspace and ScriptService, embedded assets, object data and source strings. Source
projects may reference relative Lua/asset files; the build loader embeds them.

Object transforms are world space. Parenting controls organization and script ownership,
not inherited transform multiplication. 2D is pixels/Y-down; 3D is meters/Y-up. The physics
adapter owns unit conversion, body construction, transform synchronization and raycasts.

One Lua state belongs to each session. Enabled Scripts/controllers start after scene
attachment; newly attached scripts start immediately. Modules run once per require and
cache results in that VM. Each script has a separate script binding. Controller nodes
store editable Lua Source plus explicit control/speed properties; there is no hidden
native movement system competing with their scripts.

Event connections remember their owning script, including connections created from its
callbacks. Destroying/unparenting/disabling an owner disconnects them. Destroying a signal
also releases its Lua connections, preventing projectiles from retaining every shot's
callback. Callback errors stop that handler and identify its owner in Output.

Heartbeat runs before each 60 Hz physics step. Contacts are queued during stepping and
dispatched afterwards, allowing safe body destruction inside handlers. The 3D world then
checks FallenHeight, fires OnFallen, and removes objects still below it. A recovery handler
can move an object above the barrier to retain it.

## Authoring model

Studio starts with a launcher and never executes a project on import. The document store
owns transactions and up to 80 history snapshots; grouped edits are one undo step.
Multi-selection actions exclude descendants of already-selected ancestors to avoid
repeating subtree operations. A new/opened project starts its own history.

Golden Layout owns tab movement, split sizing and persistence. Panels retain their own
DOM and can be moved without creating a second editor/store. The viewport recreates its
projection when the project dimension changes. Three's controls operate on rendered
objects; completed drags become document transactions. GPU meshes, geometry, textures,
controls and animation callbacks are disposed when their view ends.

Monaco owns one model per edited script and disposes them when changing projects.
Completion providers describe engine services, objects, vectors and scene children,
with basic service-alias inference. They are intentionally not a complete Lua language
server. Diagnostics compile source in a temporary VM without executing it. Play uses a
separate runtime VM with callback instruction budgets.

## Files, security and distribution

Electron has no renderer Node integration: context isolation and sandboxing are enabled,
permissions/popups/navigation are denied, and CSP restricts code/assets to packaged
resources and embedded media. Monaco workers are local packaged resources, not remote
scripts. Project paths enter through native dialogs or known recent records. Removing
an entry from recents does not delete the file or revoke the active document's save grant.
Writes use a temporary sibling followed by rename.

These boundaries do not turn Lua into an untrusted-code sandbox. Projects are trusted
code. Runtime attributes can hold values that cannot be saved; serialization explicitly
rejects executable references or cyclic data rather than silently corrupting a project.
Keep project backups, especially when relying on browser storage quotas.

Web exports embed their runtime, project and license notices in one offline HTML file.
Desktop exports bundle the same compiled runtime with Electron and project.json. Native
Studio exports copy its installed runtime into a separate folder and replace the app
payload with the game. Release automation builds Windows Studio and Example Projects.zip
before publishing the versioned release. Credentials are supplied by the GitHub runner;
none are stored in source or archives.

## Extension points and limits

Add services through the Engine service map; add classes through defaults, validation,
serialization, attachment, inspector controls and behavioral tests. Add game rules in
Lua, not renderer-specific conditionals. A future transform-inheritance or animation
system should be an explicit component rather than an implicit parenting side effect.

There is no skeletal animation, networking, arbitrary mesh collider import, joint editor,
or formal large-world performance target. Shape colliders are primitives. The zombie AI
intentionally chases directly and can be blocked by cover. History snapshots and embedded
images trade memory for simple portable documents. Native packages are comparatively
large because they include Chromium; exported code/data remain inspectable.

## Networking boundary

`src/network/server.js` owns an authoritative Engine and the player registry. It accepts bounded input through a transport-independent interface, enforces physics leases, redacts server script subtrees, and sends an initial snapshot plus per-instance deltas. `src/network/client.js` maintains stable scene/Player identities, starts only local/owned scripts, reconciles server corrections, and submits owned physics samples. `presentation.js` interpolates render transforms without moving collision/query state. `codec.js` bounds data and reconstructs vectors/instance references; wire input never selects code to execute.

`server/host.js` adapts the same authority to Node HTTP and the established `ws` WebSocket implementation, with payload limits, rate/backpressure bounds and dead-peer cleanup. The development Vite plugin and desktop main process each own the lifetime of a localhost testing host; Studio's `network-session.js` controls independent browser runtimes over actual sockets. The offline runtime uses `runtime/multiplayer.js` for its connect screen. No server runs in a browser tab, so background client rendering cannot pause host logic.

`tools/build-server.mjs` uses esbuild to bundle all non-built-in server dependencies into CommonJS artifacts. Web builds ship the headless CLI host; Electron packages include the host API and a native Server mode. Client documents are redacted before export, while the separate server distribution retains private scripts. Scene ownership generations prevent an old client sample from undoing a server teleport or respawn. This is deliberately an initial explicit protocol, with its boundaries described in MULTIPLAYER.md.

## Traversal and world UI

Character movement stays in a shared headless helper, with explicit GetGround/MoveCharacter APIs consumed by editable Lua defaults and server-side arcade actors. Footprint probes respect collision masks; low-step lifting checks the raised sweep and destination envelope. Cannon uses a reusable probe body with a separate Narrowphase for overlap tests, so queries never enter the simulation or generate gameplay contacts; Planck uses its shape-overlap query. Wedge vertices/faces are shared by rendering and convex physics. Exact legacy default sources are recorded for safe controller migration; custom source is not rewritten.

RunService.PostSimulation is the transform-following boundary after contact dispatch. Car decorations/passengers and character appearance follow there. WorldLabels is a rendering-layer DOM helper: the headless UI service only stores text/target/offset data. It projects the renderer's camera and smoothed replica pose, then applies range/visibility/occlusion checks. Swag remains server state; client UI reads replicated character attributes. Vehicle and resident rules are separate private Lua modules under the city server script.

## Authored UI

UIService is also a SceneNode at the root, with a compatibility facade for the legacy HUD/widget methods. `ui-schema.js` defines public defaults and validation; `ui-types.js` defines immutable UDim2. ScreenGui and element data serialize in the same project/replication graph as other instances. Old two-service documents normalize to a stable third service without changing version 1.

`src/ui/layout.js` is a pure shared layout function. `src/ui/renderer.js` incrementally reconciles native DOM controls for runtime and Studio; it preserves focus/caret and DOM identities while properties animate. Studio's `ui-editor.js` owns canvas gestures, selection overlays and device previews; `ui-inspector.js` derives property controls from the public schema. `templates.js` supplies an editable responsive dialog, also used by the clinic example. No UI framework or remote code dependency was added.

Tweens live in the engine's fixed simulation step and are cancelled with their target/script. Native entrance/hover/click presets are presentation effects. Multiplayer reconciliation retains local UI property changes unless that property changes on the authority. RemoteEvents carry requests, never client-decided clinic rewards.

`collision-events.js` aggregates fixture/body callbacks into instance-level transitions. Engine teardown synthesizes leaves; physics adapter body identities filter queued callbacks from removed/rebuilt bodies. Query probes remain outside this event stream.
