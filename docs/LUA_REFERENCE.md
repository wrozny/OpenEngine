# OpenEngine Lua reference — 0.6.0

This is a self-contained reference for writing OpenEngine game scripts, including use as context for a coding model. It describes the public gameplay API implemented in **OpenEngine 0.6.0**. OpenEngine uses **Lua 5.3 through Fengari**, with a Roblox-inspired instance hierarchy. It does not implement Roblox or Luau. Examples use ordinary Lua, not JavaScript.

For visual editor instructions see [UI_EDITOR.md](UI_EDITOR.md); for hosting see [MULTIPLAYER.md](MULTIPLAYER.md). Everything needed to understand the scripting API is below. Functions on internal JavaScript implementation objects are not public gameplay contracts.

## Contents

1. [Prompt for a coding model](#1-prompt-for-a-coding-model)
2. [Language, globals and calling conventions](#2-language-globals-and-calling-conventions)
3. [Scripts, modules and execution sides](#3-scripts-modules-and-execution-sides)
4. [Services](#4-services)
5. [Instances, hierarchy and attributes](#5-instances-hierarchy-and-attributes)
6. [Vectors, UDim2 and math](#6-vectors-udim2-and-math)
7. [Objects and world properties](#7-objects-and-world-properties)
8. [Collision events, queries and character physics](#8-collision-events-queries-and-character-physics)
9. [Frame events and time](#9-frame-events-and-time)
10. [Input](#10-input)
11. [Camera](#11-camera)
12. [Players, remotes and replication](#12-players-remotes-and-replication)
13. [Character controllers](#13-character-controllers)
14. [Authored UI and responsive layout](#14-authored-ui-and-responsive-layout)
15. [UI events and animation](#15-ui-events-and-animation)
16. [Legacy widgets, HUD and world labels](#16-legacy-widgets-hud-and-world-labels)
17. [Audio and assets](#17-audio-and-assets)
18. [Complete recipes](#18-complete-recipes)
19. [Unsupported features and troubleshooting](#19-unsupported-features-and-troubleshooting)
20. [Source map and maintenance](#20-source-map-and-maintenance)

## 1. Prompt for a coding model

Attach **this entire file** to the model, then use this template. Fill in the project facts: the model cannot infer your scene tree from the engine API.

```text
Help me write Lua for OpenEngine 0.6.0. The attached LUA_REFERENCE.md is
my API contract. Use only APIs documented there and ordinary Lua 5.3.
Do not substitute Roblox/Luau APIs or invent missing engine functionality.

Project dimension: [2D or 3D]
Multiplayer enabled: [yes or no]
Relevant Explorer hierarchy, with class names:
[paste the actual tree here]
Existing script source and custom attributes:
[paste relevant code/data here]
Task:
[describe the behavior]

Give each script's class, name, exact parent/path, complete Lua source,
and all editor setup steps. Identify required objects and attributes.
Use colon calls for engine methods, constructor dot calls, immutable
vectors, and Heartbeat-based timing. Use Script in standalone games and
LocalScript for multiplayer input/UI. Put authoritative multiplayer rules
in ServerScript and validate RemoteEvent requests on the server.
If a requested API is absent, say so and implement the behavior using
documented primitives when possible. Distinguish engine APIs from helpers
that your own code defines. Do not assume a Humanoid, automatic player
spawn, persistent accounts, task.wait, WaitForChild, TweenService or CFrame.
```

Prefer small complete tasks with the relevant scene tree. To share state across scripts in the same runtime, export it from a ModuleScript or use attributes. Each multiplayer side has its own Lua state; module tables are not shared across the network.

## 2. Language, globals and calling conventions

| Global                                                | Meaning                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `game:GetService(name)`                               | Look up a registered engine service; unknown names raise an error.                                                                                                                                                 |
| `workspace`                                           | Alias of `game:GetService("Workspace")`.                                                                                                                                                                           |
| `script`                                              | Current Script, controller or ModuleScript instance.                                                                                                                                                               |
| `Instance.new(className, parent?)`                    | Create an instance; optional parent attaches it immediately.                                                                                                                                                       |
| `Vector2.new(x=0, y=0)`                               | Immutable 2D vector.                                                                                                                                                                                               |
| `Vector3.new(x=0, y=0, z=0)`                          | Immutable 3D vector.                                                                                                                                                                                               |
| `UDim2.new(xScale=0, xOffset=0, yScale=0, yOffset=0)` | Immutable responsive UI dimension.                                                                                                                                                                                 |
| `require(moduleInstance)`                             | Execute/cache a ModuleScript; not a file path or package name.                                                                                                                                                     |
| `print(...)`                                          | Write to session output.                                                                                                                                                                                           |
| `warn(message)`                                       | Write one warning message to session output.                                                                                                                                                                       |
| `typeof(value)`                                       | Identifies engine values as `"Vector2"`, `"Vector3"`, `"UDim2"`, `"Instance"`. Other results follow the bridge's JavaScript representation, not Roblox's type system. Use standard `type` for ordinary Lua values. |

Engine instance/service/vector/connection methods use **colon syntax**: `object:Destroy()`, `run:IsClient()`, `v:Mul(2)`. Constructors and standard Lua functions use **dot syntax**: `Vector3.new(...)`, `math.sin(...)`, `table.insert(...)`.

Standard Lua base facilities, `math`, `string`, `table`, `utf8` and `coroutine` are available. Examples include `assert`, `error`, `pcall`, `xpcall`, `pairs`, `ipairs`, `next`, `select`, `tonumber`, `tostring`, `type`, `math.random`, `math.floor`, `string.format` and ordinary closures/metatables. Coroutine primitives do **not** supply an engine scheduler or a timed wait. Global `io`, `os`, `debug`, `dofile`, `loadfile` and `package` are removed. There is no filesystem/process gameplay API. Use ModuleScripts rather than package loaders or third-party `require("...")` calls. Fengari-specific/JavaScript interop internals are not a supported portable game API.

Engine-returned arrays are bridged with **one-based indexing**: use `ipairs`, `#players:GetPlayers()` and `children[1]`. Do not assume an engine-returned array is a mutable native Lua table; copy into `{}` before applying `table.insert`/`table.remove` to your own collection. Engine data dictionaries such as `GetAttributes()` support iteration with `pairs`.

Vectors and UDim2 values are immutable. Assign the whole value:

```lua
object.Position = object.Position:Add(Vector3.new(1, 0, 0))
-- Do not do object.Position.X = object.Position.X + 1.
-- Do not use vector + vector, vector * number, or CFrame.
```

Use `SetAttribute` for custom saved/replicated instance data. Arbitrary ad hoc properties are not a substitute for the documented serialized properties. Assigning `nil` is supported for `instance.Parent` and `Camera.Follow`; `SetAttribute("key", nil)` removes an attribute. Do not assume arbitrary host properties can be cleared with `property = nil`.

## 3. Scripts, modules and execution sides

| Class                                      | Standalone project | Multiplayer server | Multiplayer client                          |
| ------------------------------------------ | ------------------ | ------------------ | ------------------------------------------- |
| `Script`                                   | Runs               | Runs               | Excluded                                    |
| `ServerScript`                             | Runs               | Runs               | Excluded                                    |
| `LocalScript`                              | Inactive           | Inactive           | Runs                                        |
| `ModuleScript`                             | On `require`       | On `require`       | On `require`                                |
| `PlayerController2D`, `PlayerController3D` | Run                | Inactive           | Run for the directly owning player's object |

All script classes have `Source` (text, initially empty except controller templates) and `Enabled` (initially `true`). A runnable script executes when the game starts, or when attached to a running game on an eligible side. When creating scripts dynamically, set their Source and other settings **before** setting Parent. Re-enabling a runnable script executes its source again. Avoid relying on sibling script startup order.

Each script/module gets its own `script` binding. `_G` is shared within one runtime; locals are not. ModuleScript Enabled does not control explicit `require`. A module must return a non-nil value. Results are cached by module instance for that Play session; cycles raise an error. Cache state is separate on server and every client, and is not hot-reloaded when Source changes.

```lua
-- ModuleScript named DamageRules under ScriptService
local Rules = {}
function Rules.Apply(target, amount)
    local health = target:GetAttribute("Health") or 100
    target:SetAttribute("Health", math.max(0, health - amount))
end
return Rules
```

```lua
-- Script in a standalone game, or ServerScript in multiplayer
local scripts = game:GetService("ScriptService")
local Rules = require(scripts.DamageRules)
Rules.Apply(workspace.Target, 10)
```

In multiplayer, LocalScripts under a leased physical object's subtree run only on its current owner. LocalScripts outside such subtrees run on each client. Private modules belong under a ServerScript: its entire subtree is omitted from client distributions. A shared module under ScriptService is public to clients.

Destroying, disabling or detaching a runnable script disconnects subscriptions owned by that script and cancels its owned UI tweens. A module's subscriptions are made in its caller's current execution context; prefer exporting functions and connecting in the runnable script. A failed event callback disconnects that callback and logs its error. The VM applies a **200,000-instruction budget per invocation**. Split work across frames. Projects are trusted code; this budget is not a security sandbox.

## 4. Services

These are the exact registered names; capitalization matters.

| Name             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `Workspace`      | Physical scene hierarchy, raycast/radius queries and 3D world settings. |
| `ScriptService`  | Root Folder for game scripts, shared modules and templates.             |
| `UIService`      | Root instance for ScreenGui trees, plus legacy widget/HUD methods.      |
| `RunService`     | Frame signals, simulation time and execution-side queries.              |
| `InputService`   | Local keyboard/mouse state and input signals.                           |
| `PhysicsService` | Gravity, ground probing and upright character/vehicle motion.           |
| `Players`        | Connected player registry and lifecycle signals.                        |
| `Camera`         | Local rendering camera settings.                                        |
| `Math`           | Additional math helpers; distinct from standard Lua `math`.             |
| `AudioService`   | Synthesized effects, tones and file playback.                           |
| `AssetService`   | Lookup of named embedded assets.                                        |

Only Workspace, ScriptService and UIService are scene-tree roots. `game` supports `GetService`; it is not a SceneNode with arbitrary instance methods. Obtain ScriptService using `game:GetService("ScriptService")`, not an assumed `game.ScriptService` property.

## 5. Instances, hierarchy and attributes

Supported `Instance.new` class names:

```text
Folder, Object2D, Object3D, Script, ServerScript, LocalScript, ModuleScript,
RemoteEvent, PlayerController2D, PlayerController3D, ScreenGui, Frame,
TextLabel, TextButton, ImageLabel, TextInput, UIService
```

UIService is already provided; use `GetService`, not a second service. `PhysicsObject` is a legacy alias for Object2D. A project has one world dimension; use the matching physical object/controller class.

All instances have these public common properties:

| Property    | Meaning                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| `Id`        | Engine-generated identity string; read-only. Clones receive fresh IDs.            |
| `ClassName` | Canonical class string; read-only.                                                |
| `Name`      | Display/lookup name; initially the class name.                                    |
| `Parent`    | Parent instance or nil; setting it moves the subtree. Cycles are rejected.        |
| `Destroyed` | Read-only boolean; true after Destroy. A destroyed instance cannot be reparented. |

Child-name access is supported: `workspace.Crate`, `script.Parent`, `screen.Panel.Close`. Real properties/methods take precedence over child names. Use `FindFirstChild("name")` for names containing spaces, missing children or collisions with API property names. Lookup returns nil when absent; it never waits.

| Method                                       | Return / behavior                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node:GetChildren()`                         | Snapshot array of direct children, in sibling order.                                                                                                                                       |
| `node:GetDescendants()`                      | Snapshot array of all descendants.                                                                                                                                                         |
| `node:FindFirstChild(name, recursive=false)` | First matching child/descendant or nil.                                                                                                                                                    |
| `node:FindFirstChildOfClass(className)`      | First direct child of that class or nil.                                                                                                                                                   |
| `node:IsA(className)`                        | Exact class check, legacy PhysicsObject alias, or `"Instance"`. `IsA("Script")` also matches runnable server/local/controller scripts, not ModuleScript. No Roblox class inheritance tree. |
| `node:GetFullName()`                         | Hierarchy path, including the runtime `game` root.                                                                                                                                         |
| `node:Clone()`                               | Detached deep copy, fresh instance IDs, copied serialized properties/attributes/children. Does not copy active event connections or current physical Velocity.                             |
| `node:Destroy()`                             | Recursively detach/destroy children and self, remove bodies and clear instance signals. Repeated calls are harmless.                                                                       |
| `node:SetSiblingIndex(index)`                | One-based integer order in parent, clamped to the available range. Controls flow layouts and equal-layer sibling stacking.                                                                 |
| `node:GetSiblingIndex()`                     | One-based current index; 0 when detached.                                                                                                                                                  |
| `node:SetAttribute(name, value)`             | Set custom named data; nil removes it. Name must be a nonempty string.                                                                                                                     |
| `node:GetAttribute(name)`                    | Value or nil.                                                                                                                                                                              |
| `node:GetAttributes()`                       | Separate dictionary of attributes.                                                                                                                                                         |

Ordinary object transforms are **world-space**, not relative to a parent. Folders/parent objects do not move, rotate, scale, weld or physically attach descendants. UI is different: UI layout is relative to its UI parent.

Persistable attributes support finite numbers, strings, booleans, acyclic data records/arrays and Vector2/Vector3. Lua table values passed to `SetAttribute` are converted into data. Runtime-only function/instance attributes can exist in standalone execution but cannot be cloned/saved or replicated; keep such state in module/local tables. UDim2 is not a supported serialized attribute type; store its four numeric components if needed. Set the whole attribute again to publish changed nested data. Play-session edits do not modify the Studio authoring document or create disk persistence.

```lua
local crate = Instance.new("Object3D")
crate.Name = "Supply Crate"
crate.Position = Vector3.new(0, 2, 0)
crate:SetAttribute("Loot", {coins = 12, items = {"bandage"}})
crate.Parent = workspace
local found = workspace:FindFirstChild("Supply Crate")
print(found:GetAttribute("Loot").coins)
```

## 6. Vectors, UDim2 and math

2D world units are pixels, **positive Y down**. 3D world units are meters, **positive Y up**. Angles for transforms/camera are radians; maximum walkable slope uses degrees.

| Type    | Read-only components                     | Read-only derived values |
| ------- | ---------------------------------------- | ------------------------ |
| Vector2 | `X`, `Y`                                 | `Magnitude`, `Unit`      |
| Vector3 | `X`, `Y`, `Z`                            | `Magnitude`, `Unit`      |
| UDim2   | `XScale`, `XOffset`, `YScale`, `YOffset` | None                     |

Vector2 and Vector3 methods: `v:Add(other)`, `v:Sub(other)`, `v:Mul(number)`, `v:Div(number)`, `v:Dot(other)`, `v:Distance(other)`, `v:Lerp(other, t)`. Vector3 additionally has `v:Cross(other)`. Add/Sub/Mul/Div/Lerp/Cross return new vectors; Dot/Distance return numbers. Unit of a zero vector is a zero vector. Use finite values and avoid division by zero. Lerp does not clamp `t`.

`dimension:Lerp(otherUDim2, t)` interpolates all four components and returns a new UDim2. Scale is a fraction of the parent's available size; offset adds pixels. For example `UDim2.new(1, -48, 0, 300)` means full parent width minus 48 pixels and height 300 pixels. In Fit mode offsets are scaled with the artboard.

```lua
local Math = game:GetService("Math")
Math:Clamp(value, minimum, maximum) -- number
Math:Lerp(a, b, t)                 -- number; does not clamp t
Math:Distance(a, b)                -- vector distance
Math:OverlapCircle(a, radiusA, b, radiusB) -- distance <= radiusA + radiusB
```

Use standard `math.sin`, `math.cos`, `math.atan`, `math.pi`, `math.sqrt`, `math.min`, `math.max` and related Lua math functions for other calculations. There is no Color3; use color strings such as `"#86dacf"`.

## 7. Objects and world properties

Object2D/Object3D bodies and rendering exist only under Workspace. Set geometry and physics properties before parenting where possible. Assigning physical properties through Lua on a live body rebuilds it; avoid rewriting unchanged collider properties each frame.

| Property         | Object2D default        | Object3D default | Notes                                                        |
| ---------------- | ----------------------- | ---------------- | ------------------------------------------------------------ |
| `Position`       | `Vector2.new()`         | `Vector3.new()`  | Center in world coordinates. Setting it teleports the body.  |
| `Velocity`       | Zero Vector2            | Zero Vector3     | Units per second; assign whole vector.                       |
| `Rotation`       | `0`                     | Zero Vector3     | Radians; 3D Euler order YZX. No angular velocity API.        |
| `Size`           | `(64,64)`               | `(2,2,2)`        | Positive full extents; use Vector2/Vector3.                  |
| `Shape`          | `"Box"`                 | `"Box"`          | 2D: Box/Circle. 3D: Box/Sphere/Cylinder/Wedge.               |
| `Color`          | `"#748f94"`             | `"#c4c9d2"`      | Surface/sprite tint.                                         |
| `Texture`        | `""`                    | `""`             | Embedded data URL, permitted image URL or `"asset:name"`.    |
| `Anchored`       | `true`                  | `true`           | Static when true; dynamic when false.                        |
| `Sensor`         | `false`                 | `false`          | Overlap events without physical blocking; masks still apply. |
| `Visible`        | `true`                  | `true`           | Rendering only; does not disable collisions.                 |
| `CollisionGroup` | `"world"`               | `"world"`        | Built-in group string; see next section.                     |
| `Friction`       | `0.2`                   | `0.5`            | Contact friction.                                            |
| `Restitution`    | `0`                     | `0.1`            | Contact bounce.                                              |
| `Layer`          | `0`                     | Not supported    | 2D draw order.                                               |
| `ShowHealthBar`  | `false`                 | Not supported    | 2D renderer reads Health/MaxHealth attributes.               |
| `Mass`           | Not exposed             | `1`              | Positive mass for dynamic 3D bodies.                         |
| `FixedRotation`  | Always fixed in physics | `false`          | Keeps a 3D body upright when true.                           |
| `Material`       | Not supported           | `"Default"`      | Default, Grass, Rock, Brick, Wood, Metal.                    |
| `TextureScale`   | Not supported           | `1`              | Positive world units per texture repeat.                     |

Circle/sphere diameter uses Size.X. Cylinder diameter uses Size.X and height Size.Y; use Size.Z matching X for consistent rendering/physics. Wedge occupies its Size bounding box; low edge is local −Z and high edge local +Z. Its incline is `atan(Size.Y / Size.Z)`. Use Rotation.Y to orient it.

Workspace 3D settings: `Skybox = "builtin:sky"`, `BackgroundColor = "#000000"`, `FallenHeight = -50`. Skybox can be an embedded equirectangular image; `""` disables it. An Object3D below FallenHeight fires `OnFallen()` after physics, then is destroyed if it remains below. Teleport it above the threshold in that callback to recover it. There is no corresponding built-in 2D fallen boundary.

There is no built-in Health, MaxHealth, Damage, Score, Swag, inventory, death or NPC AI class. These are **game-defined attributes and Lua logic**, even when the examples use those names.

## 8. Collision events, queries and character physics

| Member                                                     | Meaning                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `object.OnCollisionStart:Connect(function(other) ... end)` | Enter contact/overlap with another physical instance.                                |
| `object.OnCollision`                                       | Alias of OnCollisionStart; subscribe to one, not both.                               |
| `object.OnCollisionEnd:Connect(function(other) ... end)`   | Separate, or end because a body is removed/destroyed/rebuilt/moved out of Workspace. |
| `object:GetTouchingObjects()`                              | Snapshot array of current overlapping/contacting instances.                          |
| `object.OnFallen:Connect(function() ... end)`              | 3D world-boundary callback; no arguments.                                            |

Enter fires once per instance pair, not every frame; multiple fixture contacts are aggregated. End is also delivered to remaining participants during teardown. Callbacks run outside the locked physics step, so they may destroy objects. Runtime body rebuilds can cause a leave and subsequent re-enter. Both bodies need enabled matching collision masks; normally at least one must be dynamic. Two anchored bodies do not generate contacts. `Sensor=true` does not override filtering. Player-player contact is excluded by the built-in masks.

| Group        | Groups it collides with           |
| ------------ | --------------------------------- |
| `world`      | world, player, zombie, projectile |
| `player`     | world, zombie                     |
| `zombie`     | world, player, zombie, projectile |
| `projectile` | world, zombie                     |
| `decoration` | None                              |

These are fixed engine convenience groups, not a runtime collision-group registration service. Use documented names. In particular, player-group objects do not hit projectile-group objects; a custom combat system may use server raycasts to hit players.

| API                                                                         | Return and semantics                                                                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace:Raycast(origin, direction, ignore?)`                             | Closest hit or nil. `direction` includes full ray length, **not** an endpoint. `ignore` is one instance, not a list.                                                                                |
| `workspace:GetObjectsInRadius(center, radius)`                              | Array of physical Workspace objects whose centers are within radius. Not an exact shape-overlap query; includes sensors/anchored bodies.                                                            |
| `Physics:SetGravity(vector)`                                                | Set global world gravity using matching Vector2/Vector3. Defaults are 2D `(0,0)` and 3D `(0,-24,0)`.                                                                                                |
| `Physics:GetGravity()`                                                      | Matching vector.                                                                                                                                                                                    |
| `Physics:GetGround(actor, maxSlopeAngle=50, distance?)`                     | Ground hit or nil from multiple foot probes; respects actor masks and ignores sensors. Probe distance defaults to 6 px/0.18 m, reduced for tiny actors.                                             |
| `Physics:MoveCharacter(actor, velocity, dt, stepHeight?, maxSlopeAngle=50)` | Set upright body movement, follow walkable slopes and attempt safe low-step lifting. Returns the ground-support hit or nil (support is probed before movement). Default stepHeight is 14 px/0.45 m. |

A hit record contains exactly `Instance`, `Position`, `Normal`, `Distance`. There is no Fraction, Material or raycast-params object. General Raycast ignores sensors but does not filter by the casting object's collision group. A zero-length ray returns nil. Avoid starting a ray inside the collider you want to detect. Ground helpers additionally respect collision masks; a normal's upward direction is −Y in 2D and +Y in 3D.

MoveCharacter needs a live physical actor under Workspace. Use an unanchored nonsensor body, dt in seconds, finite nonnegative step height, and a slope limit in 0–85 degrees. StepHeight=0 disables step lifting. The helper checks footing, body footprint and headroom; it does not climb arbitrary walls. It is suitable for upright characters/arcade cars, not wheel suspension. Call it from Heartbeat with the desired velocity including the vertical component; it does not independently provide input, gravity configuration, jumping, AI or a navigation mesh.

```lua
local hit = workspace:Raycast(
    Vector3.new(0, 10, 0), Vector3.new(0, -20, 0), script.Parent)
if hit then print(hit.Instance.Name, hit.Distance, hit.Normal.Y) end
```

## 9. Frame events and time

```lua
local Run = game:GetService("RunService")
local connection = Run.Heartbeat:Connect(function(dt)
    -- Input, gameplay timers and movement before physics; dt is seconds.
end)
Run.PostSimulation:Connect(function(dt)
    -- After physics, transform synchronization, contacts and UI tween updates.
end)
connection:Disconnect()
```

`Run.Time` is accumulated simulation seconds; `Run.DeltaTime` is the fixed step, 1/60. Physics and frame callbacks run at **60 Hz** when simulation advances. Standalone browser games pause while hidden; a separately hosted multiplayer server continues independently. These are simulation clocks, not wall-clock/calendar clocks.

`Run:IsServer()` is true for standalone/server; `Run:IsClient()` is true for standalone/client. Both are true in standalone. This does not cause LocalScripts to run in standalone.

All engine signals use `signal:Connect(callback)` and return a connection with `Connected` and `connection:Disconnect()`. There is no `signal:Wait()` or `signal:Once()`. Signals also expose `Fire(...)` and `Clear()` through the bridge, but manually firing/clearing an engine lifecycle or input signal does not perform its associated engine action; avoid using these as replacements for real lifecycle logic. Use RemoteEvent methods for network communication.

For delays/cooldowns use deadlines, not a busy loop or an invented wait function:

```lua
local Run = game:GetService("RunService")
local nextTick = Run.Time + 2
Run.Heartbeat:Connect(function(dt)
    if Run.Time >= nextTick then
        nextTick = Run.Time + 2
        print("Two simulation seconds elapsed")
    end
end)
```

## 10. Input

| InputService member                       | Result                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Input:IsKeyDown(key)`                    | Boolean; lowercase key string. Aliases space/ctrl/esc map to Space/Control/Escape state names.      |
| `Input:IsMouseDown(button=0)`             | Boolean; 0 left, 1 middle, 2 right.                                                                 |
| `Input:GetAxis(negativeKey, positiveKey)` | −1, 0 or +1 from the two held keys.                                                                 |
| `Input:ConsumeMouseDelta()`               | Vector2 of accumulated look movement; resets it. Movement is accumulated while right mouse is held. |
| `Input.MousePosition`                     | World-space Vector2/Vector3 pointer projection; not viewport pixels.                                |
| `Input.Began`                             | Signal `(keyString)` on a new key/button press.                                                     |
| `Input.Ended`                             | Signal `(keyString)` on key/button release.                                                         |

Use `"w"`, `"a"`, `"arrowleft"`, `"control"`, or literal `" "` for Space. Mouse signal strings are `"mouse0"`, `"mouse1"`, `"mouse2"`. Input events are strings, not Roblox InputObject objects. Tab and Escape are not captured as normal game keydown events. Game keys belong to the focused game canvas. Blur clears held state, so do not rely solely on Ended to clean up gameplay state. UI input focus releases canvas movement; click the canvas again to resume. No gamepad/touch movement API is implemented; native UI buttons/inputs can still receive touch interaction.

## 11. Camera

Get the local camera using `game:GetService("Camera")`; there is no Workspace.CurrentCamera. Camera state does not replicate.

| Property      | Default                   | Behavior                                                                                          |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `Position`    | 2D `(0,0)`; 3D `(0,4,10)` | 2D view center; 3D pivot unless using Target.                                                     |
| `Follow`      | nil                       | Follow a scene object; assign nil for manual camera control.                                      |
| `Offset`      | 2D zero; 3D `(0,1,0)`     | Added to a followed 3D object's position. 2D following centers directly on the object.            |
| `Zoom`        | `1`                       | 2D view scale.                                                                                    |
| `Yaw`         | `0`                       | 3D heading radians; zero points toward −Z, positive yaw turns toward −X.                          |
| `Pitch`       | `-0.2`                    | 3D vertical radians; positive looks upward.                                                       |
| `Distance`    | `7`                       | 3D separation behind the pivot along the viewing direction.                                       |
| `FirstPerson` | `false`                   | 3D zero separation when true.                                                                     |
| `Target`      | Unset                     | Optional Vector3 look-at point in 3D when Follow is nil; Position becomes actual camera location. |

Without Target, direction is `(-sin(Yaw)*cos(Pitch), sin(Pitch), -cos(Yaw)*cos(Pitch))` and actual view position is `Position - direction * Distance` (Distance becomes zero in FirstPerson). Target can be set for a fixed camera; because arbitrary nil property writes are unsupported, use `Camera.Target = false` to return to yaw/pitch control. Controllers may also write camera properties; avoid competing camera scripts.

## 12. Players, remotes and replication

Players are multiplayer connection records, **not Instance.new classes**. An empty standalone project has no automatically registered LocalPlayer. UserId is a generated **session UUID**, not an authenticated persistent account ID.

| API / property                                | Meaning                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Players:GetPlayers()`                        | Snapshot array of connected Players.                                                                                  |
| `Players:GetPlayerByUserId(id)`               | Player or nil.                                                                                                        |
| `Players:GetPlayerFromCharacter(character)`   | Player or nil.                                                                                                        |
| `Players.LocalPlayer`                         | This client's Player; assigned before client scripts start. Nil on server/standalone.                                 |
| `Players.PlayerAdded` / `OnPlayerAdded`       | Aliased signals `(player)`.                                                                                           |
| `Players.PlayerRemoving` / `OnPlayerRemoving` | Aliased signals `(player)`, fired before removal from the registry.                                                   |
| `player.UserId`                               | Session identity string. Treat as read-only.                                                                          |
| `player.Name`                                 | Display name; not necessarily unique. Treat as read-only.                                                             |
| `player.Character`                            | Assigned scene instance or nil.                                                                                       |
| `player.CharacterAdded`                       | Signal `(character)` when assigned a non-nil character.                                                               |
| `player:SetCharacter(character)`              | Server game logic assigns/publishes a character; it does not create one. Nil clears it without firing CharacterAdded. |

Subscribe to lifecycle signals **and enumerate existing players**, since they may already exist when a script starts. In a LocalScript, handle the current Character and subscribe to CharacterAdded for respawns. Your server game code creates, owns, destroys and respawns characters. Starter projects supply example logic; it is not an automatic engine Humanoid system.

RemoteEvent instances must exist in a shared replicated location such as Workspace before client scripts use them.

| Call / signal                    | Side and signature                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `remote:FireServer(...)`         | Client → server.                                                                   |
| `remote.OnServerEvent`           | Server callback `(sendingPlayer, ...)`; player identity comes from the connection. |
| `remote:FireClient(player, ...)` | Server → one client.                                                               |
| `remote:FireAllClients(...)`     | Server → all clients.                                                              |
| `remote.OnClientEvent`           | Client callback `(...)`; no automatic player argument.                             |

Remotes require multiplayer. Arguments support nil, booleans, finite numbers, strings, acyclic arrays/records, Vector2/Vector3 and references to replicated instances. Missing instance references decode as nil. Player objects, UDim2, functions, callbacks, Signals and cyclic/executable values are not supported remote values. Pass `player.UserId` to identify another player. Do not use protocol-reserved keys beginning with `$`, or `__proto__`, `constructor`, `prototype` in payload records. Limits: 32 positional arguments, nesting depth 12, client packet 16 KiB; the shared connection budget is 120 packets/second including physics. Validate types, ranges, cooldowns, permissions, distance, health and costs on the server.

Physics ownership methods on physical instances:

```lua
-- Multiplayer ServerScript, after parenting an unanchored object to Workspace
actor:SetNetworkOwner(player) -- one object's physics, not the whole subtree
actor:GetNetworkOwner()       -- Player or nil
actor:SetNetworkOwner(nil)    -- return authority to the server
```

Only an unanchored object in a multiplayer server can receive a lease. A direct child controller runs for the owner. Leases do not make gameplay attributes, rewards or scripts client-authoritative. Server Position teleports override stale client samples. The server validates owner samples with coarse movement bounds; this is not full competitive anti-cheat. Disconnecting revokes leases; the project decides what to destroy.

The server replicates instance properties, names, hierarchy, creations/removals, serializable attributes, gravity, ownership and character references. Simulation is 60 Hz; replication/owned-body samples are 20 Hz. Clients keep stable instance references. Remote render transforms interpolate; collision queries use simulation transforms. Client-created cosmetics remain local and are cleaned when their replicated parent is destroyed.

Authored UI **instance trees** also replicate from the server; locally edited UI properties are preserved unless that property changes on the authority. Legacy UI widgets/HUD state, audio playback, input, camera state and arbitrary module/local tables do not replicate. Keep presentation in LocalScripts. Persist authoritative game state in attributes for late joiners; remotes are transient messages. There is no built-in save database, account system, matchmaking, automatic reconnect, lag-compensated hit rewind or cross-version protocol negotiation.

## 13. Character controllers

Insert PlayerController2D under Object2D or PlayerController3D under Object3D. Controllers are editable runnable Lua scripts with Source/Enabled plus settings below. A parent must be a live Workspace body. Attach one movement controller per actor. Changing script settings does not guarantee hot reconfiguration: templates may read values once during startup; stop/restart Play or disable/re-enable deliberately.

| PlayerController2D setting                           | Default                                                  |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `Mode`                                               | `"TopDown"`; alternative `"Platformer"`                  |
| `Speed`                                              | `240` px/s                                               |
| `JumpSpeed`                                          | `480` px/s                                               |
| `StepHeight`                                         | `14` px                                                  |
| `MaxSlopeAngle`                                      | `50` degrees                                             |
| `Gravity`                                            | `980` px/s²; Platformer sets world gravity `(0,Gravity)` |
| `FollowCamera`                                       | `true`                                                   |
| `LeftKey`, `RightKey`, `UpKey`, `DownKey`, `JumpKey` | `"a"`, `"d"`, `"w"`, `"s"`, `" "`                        |

| PlayerController3D setting                                           | Default                                        |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `Mode`                                                               | `"Platformer"`; alternative `"FreeCamera"`     |
| `Speed`, `JumpSpeed`, `FlySpeed`                                     | `7`, `9`, `12` in meters/second                |
| `StepHeight`, `MaxSlopeAngle`                                        | `0.45` m, `50` degrees                         |
| `LookSensitivity`                                                    | `0.003`                                        |
| `FollowCamera`                                                       | `true`                                         |
| `LeftKey`, `RightKey`, `ForwardKey`, `BackKey`, `JumpKey`, `DownKey` | `"a"`, `"d"`, `"w"`, `"s"`, `" "`, `"control"` |

TopDown uses normalized 2D movement. Platformer modes use ground probes, a new jump press and the movement helper to traverse walkable ramps/low steps. The 3D template fixes body rotation, removes friction and handles right-drag look. FreeCamera anchors its actor, makes it a sensor, and moves directly through geometry; Space/DownKey move vertically. None of these supplies animation rigs, navigation or a built-in health/death system.

## 14. Authored UI and responsive layout

Required hierarchy:

```text
UIService
└── ScreenGui
    └── Frame
        ├── TextLabel
        ├── TextButton
        │   └── Script (standalone) or LocalScript (multiplayer)
        ├── ImageLabel
        └── TextInput
```

ScreenGui must be directly under UIService. Visual elements must be under ScreenGui or Frame; a TextButton cannot contain another visual element, but can contain scripts/modules. UI uses the same Name/Parent/Clone/FindFirstChild/Destroy/attribute methods as other instances.

ScreenGui properties:

| Property                      | Default / choices                                      |
| ----------------------------- | ------------------------------------------------------ |
| `Enabled`                     | `true`; hides entire screen at runtime when false.     |
| `DesignWidth`, `DesignHeight` | `1280`, `720`; positive design artboard dimensions.    |
| `ScaleMode`                   | `"Responsive"` or `"Fit"`.                             |
| `DisplayOrder`                | `0`; relative stacking order among screens.            |
| `SafeArea`                    | `true`; account for available device safe-area insets. |

Common properties for Frame/TextLabel/TextButton/ImageLabel/TextInput:

| Property                                     | Default / type / meaning                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Position`                                   | `UDim2.new(0,24,0,24)`; position relative to UI parent's content area.                                             |
| `Size`                                       | `UDim2.new(0,200,0,44)` before class overrides below.                                                              |
| `AnchorPoint`                                | `Vector2.new(0,0)`; pivot fractions, e.g. `(0.5,0.5)` centers it.                                                  |
| `Visible`, `Opacity`                         | `true`, `1`; Opacity 0–1 multiplies descendant opacity.                                                            |
| `BackgroundColor`, `BackgroundOpacity`       | `"#252d3b"`, `1`.                                                                                                  |
| `BorderColor`, `BorderWidth`, `CornerRadius` | `"#49546a"`, `0`, `8`; pixel lengths nonnegative.                                                                  |
| `ZIndex`                                     | `0`; stacking order within a UI parent.                                                                            |
| `ClipChildren`                               | `false`; clip descendants to this element.                                                                         |
| `MinSize`, `MaxSize`                         | Zero Vector2 each; design-pixel constraints. Max axis 0 means unbounded.                                           |
| `AspectRatio`                                | `0` disables; positive value fits width/height ratio.                                                              |
| `FlexGrow`                                   | `0`; positive relative weight for extra space in a flow parent's main axis.                                        |
| `Interactable`                               | `false` before class overrides; enable pointer interception. Event listeners can also make an element interactive. |
| `Disabled`                                   | `false`; prevent button/input interaction.                                                                         |
| `EnterEffect`, `HoverEffect`, `ClickEffect`  | `"None"` before class overrides; see next section.                                                                 |

Text properties for TextLabel, TextButton and TextInput:

| Property                              | Default / choices                                              |
| ------------------------------------- | -------------------------------------------------------------- |
| `Text`                                | `"Text"`; button/input override below. Plain text, never HTML. |
| `TextColor`, `TextSize`, `FontWeight` | `"#edf1fa"`, `16`, `400`.                                      |
| `FontFamily`                          | `"System"`, `"Serif"`, `"Monospace"`.                          |
| `TextAlign`                           | `"Left"`, `"Center"`, `"Right"`.                               |
| `TextVAlign`                          | `"Center"`, `"Top"`, `"Bottom"`.                               |
| `TextWrapped`                         | `true`.                                                        |

Class-specific properties/default overrides:

| Class        | Additional properties / overrides                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Frame`      | Size `(0,320,0,200)`; Layout=`"Absolute"`; Padding=16; Gap=12; Align=`"Start"`; Justify=`"Start"`; Wrap=false.                                                           |
| `TextLabel`  | BackgroundOpacity=0; CornerRadius=0.                                                                                                                                     |
| `TextButton` | Text=`"Button"`; Size `(0,160,0,44)`; TextAlign=`"Center"`; FontWeight=600; BackgroundColor=`"#4777c3"`; Interactable=true; HoverEffect=`"Grow"`; ClickEffect=`"Press"`. |
| `ImageLabel` | Size `(0,160,0,120)`; BackgroundOpacity=0; Image=`""` (image URL/data URL/`asset:name`); ImageFit=`"Contain"`, `"Cover"` or `"Stretch"`.                                 |
| `TextInput`  | Text=`""`; Placeholder=`"Type here…"`; MaxLength=256; BorderWidth=1; Interactable=true.                                                                                  |

Frame Layout choices: Absolute, Row, Column. Padding/Gap are pixel lengths. Align choices: Start, Center, End, Stretch (cross axis). Justify choices: Start, Center, End, SpaceBetween (main axis). Wrap applies to Row. Flow layouts ignore child Position/AnchorPoint for placement, use sibling order, omit hidden children and distribute spare space using FlexGrow subject to maximum sizes. Absolute positions/sizes use the padded content area. Constraints/aspect ratio may make a requested size smaller than a full-parent size.

Responsive ScreenGui fills the viewport without uniformly scaling pixel offsets/text. Fit uniformly scales its design artboard to fit the viewport and centers it. Use percentage widths plus MaxSize and row/column layouts for responsive panels; use Fit for a fixed-proportion artboard. There are no automatic breakpoints or automatic text fitting. Preview actual target sizes in Studio.

## 15. UI events and animation

| Signal                 | Arguments / behavior                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `element.OnClick`      | No arguments; activated UI click, including keyboard activation on native buttons.                           |
| `element.OnHoverStart` | No arguments; pointer enters.                                                                                |
| `element.OnHoverEnd`   | No arguments; pointer leaves.                                                                                |
| `input.OnValueChanged` | `(newText)` after user input; input.Text is updated. Programmatic Text assignment does not emit this signal. |

Properties can animate without scripts: EnterEffect choices None/Fade/SlideUp/Pop; HoverEffect None/Grow/Lift/Glow; ClickEffect None/Press/Pulse. These are local presentation effects. Disabled elements do not activate their normal click/input behavior. TextInput uses native focus/caret behavior.

```lua
local button = script.Parent
button.OnClick:Connect(function()
    print("Clicked", button.Name)
end)
button.OnHoverStart:Connect(function()
    button:Tween({BackgroundColor = "#609ce8"}, 0.15)
end)
button.OnHoverEnd:Connect(function()
    button:Tween({BackgroundColor = "#4777c3"}, 0.15)
end)
```

`element:Tween(goals, duration=0.25, easing="OutCubic")` starts immediately on a live UI element. Goals is a nonempty Lua table. Supported goals:

- Position/Size: UDim2.
- AnchorPoint: Vector2.
- BackgroundColor/TextColor/BorderColor: `#RRGGBB` strings; target must have that property.
- Opacity/BackgroundOpacity: numbers 0–1.
- CornerRadius/BorderWidth/TextSize: nonnegative numbers; target must have that property.

Easings: Linear, OutQuad, OutCubic, InOutCubic, OutBack. Duration is finite seconds from 0 to 3600; a zero-duration tween finishes on the next simulation update. Tween advances with fixed simulation time, not a background wall clock. ScreenGui itself is not a tween target; tween its child frame.

Returned tween contract: `Playing` boolean, `tween:Cancel()`, `tween.Completed:Connect(function(completed) ... end)`. Completed receives true for normal completion and false for cancellation; its listeners are cleared afterward. A new tween with any overlapping property cancels the entire older conflicting tween on that element. Destroying/detaching its target or stopping its owning script cancels it. No TweenService, TweenInfo or `tween:Play()` is required.

## 16. Legacy widgets, HUD and world labels

Legacy widget IDs are strings separate from SceneNode IDs and the authored UI tree. These methods operate on local UIService state; they are useful for simple overlays but are not editable UI instances. Creation with an existing ID replaces the widget. Subsequent setters require an existing widget.

| Method                                                         | Purpose                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UI:CreateLabel(id, text, x=20, y=100)`                        | Plain screen label.                                                                                                            |
| `UI:CreateButton(id, text, x=20, y=150, width=140, height=36)` | Screen button; emits OnAction(id).                                                                                             |
| `UI:CreateBar(id, value, maximum, x=20, y=200, width=200)`     | Progress bar, fixed height 8. Use a positive maximum.                                                                          |
| `UI:CreateWorldLabel(id, text, target, offset?)`               | Follow Object3D with world offset, default Vector3 `(0,2,0)`.                                                                  |
| `UI:SetText(id, text)`                                         | Change label/button/world-label text.                                                                                          |
| `UI:SetValue(id, value, maximum)`                              | Change a bar's numbers.                                                                                                        |
| `UI:SetPosition(id, x, y, anchor="TopLeft")`                   | Screen widget position in CSS pixels.                                                                                          |
| `UI:SetColor(id, color)`                                       | Text or bar-fill color.                                                                                                        |
| `UI:Remove(id)`                                                | Remove widget; unknown ID is harmless.                                                                                         |
| `UI.OnAction`                                                  | Signal `(actionId)` from widget buttons and convenience modal buttons.                                                         |
| `UI.Changed`                                                   | No-argument notification that legacy UI state changed. Usually renderer-owned; not an authored element property-change signal. |

Screen anchors: TopLeft/TopRight/BottomLeft/BottomRight/Center. Corner x/y values are insets; Center uses offsets from the center. World labels use world coordinates, not these screen anchors. World labels hide when out of view, beyond 80 meters, occluded by solid geometry, or targeting invisible/destroyed/non-Workspace objects. They follow rendered/interpolated poses. Use SetText/SetColor/Remove to update them.

Convenience survival HUD/modal methods:

| Method / property                                              | Purpose                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `UI:Set(key, value)`                                           | Set a HUD value, converted to string. Recognized survival fields: health, maxHealth, wave, remaining, points. |
| `UI:SetState(state, title="", subtitle="")`                    | `"playing"` hides the modal; `"upgrading"` shows choices/next; `"dead"` or `"complete"` offers restart.       |
| `UI:SetUpgrade(id, title, description, cost, affordable=true)` | Register/update an upgrade choice; affordability disables its button.                                         |
| `UI.State`, `UI.Title`, `UI.Subtitle`                          | Current legacy modal state. Prefer SetState so the renderer is notified.                                      |

OnAction emits the widget/upgrade ID or `"next"` / `"restart"`. The template only presents UI; your Lua must perform purchases, wave changes, restart and reset its game data. Use authored UI for a different game layout.

## 17. Audio and assets

| AudioService member                                              | Meaning                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Volume`                                                         | Master multiplier for newly started sounds; default `0.35`. Use 0–1.                                                      |
| `Audio:Play(name)`                                               | Built-in synthesized effect: shoot, hit, hurt, upgrade, wave. Unknown names error.                                        |
| `Audio:Tone(frequency=440, duration=0.1, volume=1, type="sine")` | Descending tone; frequency Hz, duration seconds. sine/square/triangle/sawtooth.                                           |
| `Audio:PlayFile(url, volume=1, loop=false)`                      | Start browser-supported file/data-URL audio; returns handle with `sound:Stop()`, or nil when playback API is unavailable. |

Audio belongs on the client/standalone presentation side. Browsers require user interaction to unlock playback; a canvas click unlocks synthesized audio. Changing Volume does not retroactively update an already playing file. Stopping the game closes audio and stops playback. File decoding depends on browser codec support. Desktop content policy permits embedded/local media; do not depend on external asset URLs for portable exports. No spatial Sound instances, mixer buses or network-replicated playback API exists.

`AssetService:Has(name)` returns whether an embedded named asset exists. `AssetService:Get(name)` returns its data URL or raises an error. Pass returned audio data to PlayFile or image data to Texture/Image. Both physical Texture and ImageLabel.Image can also use `"asset:name"`. Naming an asset does not load a file from an arbitrary machine path.

Source project asset entries may use `{ "SourceFile": "assets/image.png", "mimeType": "image/png" }` under the project's `assets` dictionary. CLI packaging resolves/embeds source files; portable documents contain each asset's `data` URL. Studio image uploads embed data as well. No runtime filesystem access or asset downloader service is needed.

## 18. Complete recipes

### A. Standalone 2D movement with a cooldown

Setup: a **2D standalone** project, Object2D `Hero` under Workspace, and a **Script** named `Movement` directly under Hero. Remove any other movement controller on Hero.

```lua
local actor = script.Parent
local Input = game:GetService("InputService")
local Run = game:GetService("RunService")
actor.Anchored = false
local nextAction = 0

Run.Heartbeat:Connect(function(dt)
    local direction = Vector2.new(Input:GetAxis("a", "d"), Input:GetAxis("w", "s"))
    actor.Velocity = direction.Unit:Mul(240)
    if Input:IsMouseDown(0) and Run.Time >= nextAction then
        nextAction = Run.Time + 0.3
        print("Action at", Input.MousePosition.X, Input.MousePosition.Y)
    end
end)
```

This is top-down movement with the default zero 2D gravity. It logs an action; it does not invent a projectile or weapon service.

### B. Standalone responsive proximity panel

Setup: **3D standalone** project. Workspace contains Object3D `Hero` with a PlayerController3D and Object3D `ShopZone` with Sensor=true, Anchored=true, Size `(6,4,6)`. Put them close enough to walk into the zone, using CollisionGroup=`"world"` for the zone. UIService contains ScreenGui `Shop`, then Frame `Panel`, then TextButton `Close`. Set Shop.Enabled=false. Put the following **Script** under Shop. Assign Panel.Position=`UDim2.new(0.5,0,0.5,0)`, Panel.AnchorPoint=`Vector2.new(0.5,0.5)`, Panel.Size=`UDim2.new(1,-48,0,260)` and Panel.MaxSize=`Vector2.new(520,0)` in code or Properties. Position Close inside Panel.

```lua
local screen = script.Parent
local panel = screen.Panel
local hero = workspace.Hero
local zone = workspace.ShopZone

zone.OnCollisionStart:Connect(function(other)
    if other ~= hero then return end
    screen.Enabled = true
    panel.Opacity = 0
    panel:Tween({Opacity = 1}, 0.2, "OutCubic")
end)
zone.OnCollisionEnd:Connect(function(other)
    if other == hero then screen.Enabled = false end
end)
panel.Close.OnClick:Connect(function()
    screen.Enabled = false
end)
```

For multiplayer use a LocalScript, compare `other` with `Players.LocalPlayer.Character`, and handle character death/replacement in your game's rules. Neon Borough's `Clinic.lua` demonstrates that version.

### C. Multiplayer spawning with an owned controller

Setup: **3D multiplayer** project. ScriptService contains Folder `Templates`, containing an **unparented-from-Workspace template** Object3D `Avatar`, Size `(0.85,1.9,0.85)`, with a child PlayerController3D. The template remains under Templates, not Workspace. Put this **ServerScript** directly under ScriptService. Remove the starter's spawning script if present, to avoid two spawners.

```lua
local Players = game:GetService("Players")
local template = script.Parent.Templates.Avatar

local function spawn(player)
    if player.Character then player.Character:Destroy() end
    local actor = template:Clone()
    actor.Name = player.Name
    actor.Anchored = false
    actor.Position = Vector3.new(0, 3, 0)
    actor:SetAttribute("Health", 100)
    actor.Parent = workspace
    actor:SetNetworkOwner(player)
    player:SetCharacter(actor)
end

Players.PlayerAdded:Connect(spawn)
Players.PlayerRemoving:Connect(function(player)
    if player.Character then player.Character:Destroy() end
end)
for _, player in ipairs(Players:GetPlayers()) do spawn(player) end
```

This spawns on join and cleans up on leave. Add explicit death detection and a Heartbeat deadline if you want respawning. Publishing Character does not automatically create Health or death behavior.

### D. Server-validated remote request and local UI

Setup: **multiplayer** project with a **RemoteEvent** named `RequestHeal` directly under Workspace. Your spawn script creates characters and sets a numeric Health attribute. Put the server code in a **ServerScript under ScriptService**. Put the client code in a **LocalScript under a TextButton** inside a ScreenGui/Frame. The action here is a free heal on a five-second cooldown; add server-side balance and proximity checks for a paid shop.

```lua
-- ServerScript: ScriptService/Healing
local Players = game:GetService("Players")
local Run = game:GetService("RunService")
local remote = workspace.RequestHeal
local nextAllowed = {}

remote.OnServerEvent:Connect(function(player, action)
    if action ~= "heal" then return end
    local actor = player.Character
    if not actor or actor.Destroyed then return end
    local health = actor:GetAttribute("Health")
    if type(health) ~= "number" or health <= 0 or health >= 100 then return end
    if Run.Time < (nextAllowed[player.UserId] or 0) then return end
    nextAllowed[player.UserId] = Run.Time + 5
    actor:SetAttribute("Health", math.min(100, health + 25))
    remote:FireClient(player, "Healed")
end)
Players.PlayerRemoving:Connect(function(player)
    nextAllowed[player.UserId] = nil
end)
```

```lua
-- LocalScript: UIService/HUD/Panel/HealButton/HealingUI
local button = script.Parent
local remote = workspace.RequestHeal
button.OnClick:Connect(function()
    remote:FireServer("heal")
end)
remote.OnClientEvent:Connect(function(message)
    if type(message) == "string" then button.Text = message end
end)
```

### E. Module-based timer helper without task.wait

Setup: ModuleScript `Timers` under ScriptService; require it from a runnable Script/LocalScript on the side that needs the timer. This helper is **your Lua code**, not a built-in service. Its subscription belongs to the calling runnable script and stops if that script stops.

```lua
-- ModuleScript: ScriptService/Timers
local Run = game:GetService("RunService")
local Timers = {}
function Timers.After(seconds, callback)
    local deadline = Run.Time + seconds
    local connection
    connection = Run.Heartbeat:Connect(function()
        if Run.Time < deadline then return end
        connection:Disconnect()
        callback()
    end)
    return connection -- :Disconnect() cancels before execution
end
return Timers
```

```lua
-- Script (standalone) or LocalScript (multiplayer presentation)
local Timers = require(game:GetService("ScriptService").Timers)
Timers.After(2, function() print("Ready") end)
```

## 19. Unsupported features and troubleshooting

Do not generate these unless you explicitly implement your own Lua helper or change the engine:

- Roblox `Part`, `Model`, `Humanoid`, `Player`/`Sound` as Instance.new classes, CFrame, Color3, BrickColor, Enum, UDim, RaycastParams, TweenInfo, TweenService, UserInputService, ReplicatedStorage, ServerStorage, Debris, DataStoreService or PathfindingService.
- `WaitForChild`, `FindFirstAncestor`, `GetService` on scene instances, `Touched`/`TouchEnded`, `MouseButton1Click`, `MouseEnter`/`MouseLeave`, `GetPropertyChangedSignal`, Changed on arbitrary instances, AttributeChanged signals, ChildAdded/ChildRemoved, signal Wait/Once.
- `task.wait`, `task.spawn`, `task.delay`, `wait`, `spawn`, `delay`, tick/time wall-clock helpers, Luau type annotations, `+=`, optional types or Luau `continue` syntax.
- `UDim2.fromScale/fromOffset`, `Vector3.zero`, vector arithmetic metamethods, Vector3.Magnitude as a function, automatic transform inheritance or automatic controller creation.
- Welds/joints, continuous force/constraint APIs, skeletal animation, mesh import, navigation/pathfinding, spatial audio, native save files, persistence across server restarts, authenticated accounts or built-in NPC combat/health rules.

| Symptom                              | Check                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| LocalScript never runs               | Multiplayer must be enabled; standalone UI/input uses Script. A leased object's LocalScript runs only for its owner.                                |
| Object is invisible or has no body   | Matching dimension, Visible=true, positive Size, and a Workspace ancestor. Sensor/Anchored are separate from visibility.                            |
| No collision event                   | Matching masks, at least one dynamic body, real overlap; decoration collides with nothing and player-player is excluded.                            |
| UI does not show                     | Correct ScreenGui/Frame parenting, ScreenGui.Enabled, element.Visible, nonzero computed Size and on-screen anchors. Flow layouts control placement. |
| UI button appears but game keys stop | The button/input took focus; click the game canvas again.                                                                                           |
| A nil child causes an error          | Verify exact scene names and initialization; FindFirstChild never waits. Handle asynchronous character arrival using CharacterAdded.                |
| Transform edit has no effect         | Assign a full vector; do not edit vector components. Another controller or server correction may be overwriting it.                                 |
| Client sees no score/health update   | Server must change replicated attributes; local module tables/legacy HUD state are not network state.                                               |
| RemoteEvent error                    | Correct side, multiplayer enabled, event in shared hierarchy, supported bounded payload, existing replicated instance references.                   |
| Module edit does not rerun           | Module result is cached until the runtime restarts.                                                                                                 |
| Instruction limit                    | Replace infinite polling loops with Heartbeat callbacks and finite per-frame work.                                                                  |
| Saved project loses runtime changes  | Play is an isolated copy; save authoring edits in Studio. Runtime persistence needs a separate implementation.                                      |

## 20. Source map and maintenance

This reference was checked against the 0.6.0 implementation. When APIs change, update it alongside the source. Relevant files:

| Source                                                                                         | Contract                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/engine/lua.js`                                                                            | Globals, bridge semantics, require/cache, instruction budget and script-owned cleanup. |
| `src/engine/scene.js`                                                                          | Classes, properties, hierarchy, serialization, ownership/remotes and instance methods. |
| `src/engine/engine.js`                                                                         | Registered services, execution sides, queries, camera defaults and fixed-step order.   |
| `src/engine/math.js`, `ui-types.js`                                                            | Vector, Math and UDim2 operations.                                                     |
| `src/engine/input.js`, `audio.js`                                                              | Input and audio APIs.                                                                  |
| `src/engine/controllers.js`, `character-motor.js`                                              | Controller defaults and upright movement helper.                                       |
| `src/engine/physics/`, `collision-events.js`                                                   | Physical shape behavior, masks, queries and collision transitions.                     |
| `src/network/players.js`, `codec.js`, `server.js`, `client.js`                                 | Player lifecycle, wire values, authority and replication.                              |
| `src/engine/ui-schema.js`, `ui-tweens.js`, `ui-service.js`                                     | UI defaults, animation and legacy widgets.                                             |
| `src/ui/`, `src/game-view.js`, `src/world-labels.js`                                           | Responsive layout, native UI behavior, HUD and projected labels.                       |
| `examples/neon-borough/scripts/`, `examples/zombie/scripts/`, `examples/parcel-panic/scripts/` | Complete game-defined rules using these APIs.                                          |

For a model with a small context window, provide sections 1–6 and 19 plus the sections relevant to the task. Include 12 for multiplayer and 14–15 for authored UI. Keep the execution-side and unsupported-API rules when shortening context.

## 0.6 additions: vehicles, impulse and modifiers

The APIs above remain supported. The supported classes additionally include `Car2D`, `Car3D`, `UIListLayout`, `UIGridLayout`, `UICorner`, `UIPadding`. See [VEHICLES.md](VEHICLES.md) for complete tuning defaults, coordinate conventions and multiplayer behavior.

Car2D/Car3D are native components under matching unanchored physical objects. `motor:SetInput(throttle, steering=0, brake=0)` clamps finite inputs to −1..1, −1..1 and 0..1. `motor.Speed` reports world units/second; `motor:GetWheelPosition(index)` returns a Vector2/Vector3 or nil (two wheels in 2D, four in 3D). Enabled=true by default. Car2D is side-view suspension/lean, Car3D is four-wheel suspension with front steering. Do not attach a PlayerController to a car chassis. Use Script for standalone input or LocalScript in a multiplayer owned chassis.

`physicalObject:ApplyImpulse(vector)` applies a finite center impulse. Use the correct world dimension. It requires a live body under Workspace.

UI modifiers are nonvisual instances parented under a Frame or ScreenGui. UIListLayout defaults: Direction="Column", Padding=12, Gap=12, Align="Start", Justify="Start", Wrap=false. UIGridLayout defaults: Columns=0 (automatic), CellWidth=160, CellHeight=44, Padding=12, Gap=12. Grid cells distribute available width, then wrap rows. UICorner.Radius=12 overrides CornerRadius; UIPadding.Padding=16 overrides layout padding. Modifiers affect sibling layout/parent styling; they do not create additional visible elements. The first of each kind is used; grid takes precedence over list.

Remote presentation now buffers 100 ms and extrapolates at most 150 ms on missing snapshots. Small owner corrections are visually eased; large teleports snap. This does not introduce input-history rollback or change physics/query authority.
