# Engine and Lua API

For the self-contained 0.5.0 scripting contract, exact defaults, complete recipes and a prompt to give another coding model, use [LUA_REFERENCE.md](LUA_REFERENCE.md). This page is the shorter narrative guide.

## Execution model

Each Play/game session owns one Lua 5.3 VM. Player controllers are ordinary editable Lua templates with exposed properties and the same lifecycle as Scripts. Enabled `Script` instances execute
once at startup, in scene order; newly parented Scripts execute immediately.
`ModuleScript` instances execute on their first `require(instance)` and must
return a non-nil value. Results are cached by module instance until Stop/restart.
Circular requires report an error. Required modules can require other modules.

Every Script and ModuleScript has its own `script` binding. Modules should export
functions rather than depend on the execution order of other Scripts. Locals and
closures work normally. `_G` is shared within the session. There is no Luau syntax,
Roblox API compatibility, coroutine scheduler, `WaitForChild`, or `task.wait`.
Use `RunService.Heartbeat` for time-based work.

`print(...)` and `warn(message)` appear in Studio Output. Syntax/runtime failures
include their scene path. A failing event callback disconnects itself. Destroying,
unparenting, or disabling a Script disconnects its owned engine event handlers.
Setting an attached Script's `Enabled` back to true executes it afresh. ModuleScript
Enabled flags do not affect explicit `require` calls.

Lua callbacks have a 200,000-instruction limit to catch ordinary accidental infinite
loops. This is **not a security or resource sandbox**. Projects are trusted code.
Filesystem/process/debug libraries are not exposed as engine APIs. Do not use this
runtime to execute untrusted code from a server or marketplace.

## Services

```lua
local Workspace = game:GetService("Workspace")
local Scripts = game:GetService("ScriptService")
local Run = game:GetService("RunService")
local Input = game:GetService("InputService")
local Audio = game:GetService("AudioService")
local UI = game:GetService("UIService")
local Camera = game:GetService("Camera")
local Physics = game:GetService("PhysicsService")
local Math = game:GetService("Math")
local Assets = game:GetService("AssetService")
```

`workspace` is also a global alias for Workspace. Unknown service names raise errors.
Workspace contains scene nodes; ScriptService is a convenient place for game controllers
and modules. Folders are organizational: transforms use world coordinates and are
not inherited from parents. Object2Ds must be descendants of Workspace to be
visible in the editor; only Workspace descendants create physics bodies. ScriptService is for scripts/modules.

## Instances and hierarchy

Supported classes: `Folder`, `Object2D`, `Object3D`, `Script`, `ServerScript`, `LocalScript`, `ModuleScript`, `RemoteEvent`,
`PlayerController2D`, `PlayerController3D`, `ScreenGui`, `Frame`, `TextLabel`, `TextButton`, `ImageLabel`, `TextInput`, and the built-in `UIService` root. Legacy PhysicsObject names are accepted as Object2D aliases.

```lua
local object = Instance.new("Object2D")
object.Name = "Crate"
object.Position = Vector2.new(150, 100)
object.Size = Vector2.new(64, 48)
object.Color = "#aebf93"
object.Anchored = false
object.Parent = Workspace  -- Configure before parenting to avoid unnecessary body rebuilds.

print(Workspace.Crate.Name)
print(script.Parent.Name)
local crate = Workspace:FindFirstChild("Crate", true)
for _, child in ipairs(Workspace:GetChildren()) do print(child.Name) end
```

| Member                                             | Meaning                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Name`                                             | Display/hierarchy name; sibling names may repeat, so lookup returns the first match.      |
| `Id`, `ClassName`, `Destroyed`                     | Read-only identity, type and lifecycle state.                                             |
| `Parent`                                           | Parent instance; assigning nil detaches a node and its subtree. Cycles are rejected.      |
| `GetChildren()` / `GetDescendants()`               | Snapshot collections, **1-indexed** for Lua `ipairs` and `#`.                             |
| `FindFirstChild(name, recursive=false)`            | First matching child, or nil.                                                             |
| `FindFirstChildOfClass(className)`                 | First immediate child of that class, or nil.                                              |
| `IsA(className)`                                   | Exact class check; every node is also an `Instance`.                                      |
| `GetFullName()`                                    | Dot-separated path starting with `game`.                                                  |
| `Clone()`                                          | Detached deep copy, including attributes, child scripts and fresh IDs.                    |
| `Destroy()`                                        | Removes the node and descendants, physics bodies and events. Idempotent.                  |
| `SetAttribute(name, value)` / `GetAttribute(name)` | Per-instance values. nil removes an attribute. Add/edit/remove data attributes in Studio. |

A property/method takes precedence over a child with the same name. Use
`FindFirstChild` when a child's name collides with an API member. Cloning copies
script source, not running callbacks or a module's cached return value.

```lua
local object = script.Parent
object.OnCollision:Connect(function(with)
    print("Collision!", with.Name)
end)
```

## Object2D

| Property                  | Default / units                                                               |
| ------------------------- | ----------------------------------------------------------------------------- |
| `Position`, `Velocity`    | Vector2; world pixels and pixels/second. Assign a whole new vector.           |
| `Size`                    | Vector2-like X/Y pair; width/height. Must be positive.                        |
| `Rotation`                | Radians, clockwise because positive Y points down. Inspector uses degrees.    |
| `Shape`                   | `"Box"` or `"Circle"`. Circles use Size.X as their diameter.                  |
| `Color`                   | CSS color; default `#748f94`.                                                 |
| `Texture`                 | Image URL or embedded image data URL; rendered inside the object's rectangle. |
| `Visible`                 | true; affects rendering, not physics.                                         |
| `Layer`                   | 0; higher values draw later.                                                  |
| `Anchored`                | true = static body; false = dynamic body.                                     |
| `Sensor`                  | false; true reports contacts without physical response.                       |
| `CollisionGroup`          | `"world"`; see table below.                                                   |
| `Friction`, `Restitution` | 0.2 and 0; restitution 0–1 is a useful range.                                 |
| `ShowHealthBar`           | false; shows Health/MaxHealth attributes above a damaged object.              |

Assigning Size, Shape, Anchored, Sensor, CollisionGroup, Friction or Restitution
from Lua rebuilds the fixture. Assign a complete Size value rather than changing
`Size.X` in place. Position/Velocity vectors are immutable values. 2D bodies have
fixed angular rotation; scripts can set Rotation directly. No joints, torque API,
or polygon collider editor are provided in this release.

Physics uses Planck (Box2D), a fixed 60 Hz timestep, and 50 pixels per meter.
The default world has zero gravity for top-down games. Frame stalls simulate at
most 100 ms per frame to prevent a runaway catch-up loop. Background tabs pause
simulation. Physics collision callbacks are queued until after the physics step;
you can safely destroy objects inside them.

```lua
Physics:SetGravity(Vector2.new(0, 980)) -- e.g. a simple platformer
local gravity = Physics:GetGravity()

local connection = object.OnCollision:Connect(function(other) print(other.Name) end)
connection:Disconnect()
object.OnCollisionEnd:Connect(function(other) print("Separated", other.Name) end)
```

Begin-contact fires once when contact begins, not every frame of sustained contact.
Two anchored/static bodies do not generate contacts. Body removal, destruction or rebuilding also ends an overlap and emits OnCollisionEnd to remaining participants. Sensors need an involved dynamic body.

| Group        | Collides with                     |
| ------------ | --------------------------------- |
| `world`      | world, player, zombie, projectile |
| `player`     | world, zombie                     |
| `zombie`     | world, player, zombie, projectile |
| `projectile` | world, zombie                     |
| `decoration` | nothing                           |

These are built-in convenience groups for the example; extend `GROUPS` and `MASKS`
in `src/engine/physics/planck-world.js` for different filtering (both physics adapters share them). `Sensor=true` does not override filtering.

```lua
local origin = Vector2.new(0, 0)
local direction = Vector2.new(500, 0) -- Vector length is the maximum cast distance.
local hit = Workspace:Raycast(origin, direction, object) -- Optional single ignored instance.
if hit then
    print(hit.Instance.Name, hit.Distance, hit.Position.X, hit.Normal.Y)
end
for _, nearby in ipairs(Workspace:GetObjectsInRadius(origin, 200)) do
    print(nearby.Name)
end
```

Raycast returns the closest non-sensor body or nil, independent of collision groups.
A zero-length ray returns nil. As in Box2D, rays starting inside a collider do not
report that collider. Radius queries test object centers, not exact fixture overlap.

## Math and camera

```lua
local a, b = Vector2.new(1, 2), Vector2.new(8, 9)
local delta = b:Sub(a)
print(delta.X, delta.Y, delta.Magnitude)
local direction = delta.Unit -- Zero vector's Unit is safely zero.
local position = a:Add(direction:Mul(100))
local halfway = a:Lerp(b, 0.5)
print(a:Distance(b), a:Dot(b))
-- Other vector method: Div(number). Use methods, not vector arithmetic operators.
print(Math:Clamp(12, 0, 10), Math:Lerp(0, 100, 0.3))
print(Math:Distance(a, b), Math:OverlapCircle(a, 10, b, 5))

Camera.Position = Vector2.new(0, 0)
Camera.Zoom = 1  -- Practical range: 0.1 to 4.
Camera.Follow = Workspace.Player
Camera.Follow = nil -- Stops following; Position can now be controlled manually.
```

Lua userdata methods use **colon** syntax; `Vector2.new`, `Instance.new` and
standard Lua functions use **dot** syntax. Standard `math` is the Lua math library;
`game:GetService("Math")` supplies additional engine helpers.

## Input and frames

```lua
Run.Heartbeat:Connect(function(dt)
    local move = Vector2.new(Input:GetAxis("a", "d"), Input:GetAxis("w", "s"))
    Workspace.Player.Velocity = move.Unit:Mul(200)
    if Input:IsMouseDown(0) then print(Input.MousePosition.X) end
end)
Input.Began:Connect(function(key) print("Pressed", key) end)
Input.Ended:Connect(function(key) print("Released", key) end)
```

Heartbeat runs **before** each physics step and receives seconds. `Run.Time`
is accumulated simulation time; `Run.DeltaTime` is 1/60. Keys use lowercase DOM
key names (`"w"`, `"arrowleft"`, `" "` for Space); mouse names in events are
`"mouse0"`, `"mouse1"`, `"mouse2"`. `IsMouseDown` takes 0/1/2 for left/middle/right.
`MousePosition` is world space and follows camera changes even with a stationary mouse.
Click the game canvas to focus it. Blur clears held keys and buttons, preventing
stuck movement. Input is keyboard/mouse; touch and gamepad control are not implemented.

## Custom UI

UI is rendered as HTML over the canvas. Widget IDs are independent from scene node IDs.
Coordinates are CSS pixels and do not follow the world camera.

```lua
UI:CreateLabel("score", "Score: 0", 24, 100)
UI:CreateButton("heal", "Heal", 24, 140, 140, 36)
UI:CreateBar("energy", 75, 100, 24, 190, 200)
UI:SetPosition("energy", 24, 24, "BottomRight")
UI:SetColor("energy", "#eacb87")
UI:SetText("score", "Score: 10")
UI:SetValue("energy", 50, 100)
UI.OnAction:Connect(function(id)
    if id == "heal" then print("Heal button clicked") end
end)
UI:Remove("heal")
```

Anchors: TopLeft (default), TopRight, BottomLeft, BottomRight, Center. X/Y are
insets from the selected corner; Center uses offsets from the center. Widget types
are label, button and bar; creation with an existing ID replaces it. `SetText`,
`SetValue`, `SetPosition` and `SetColor` require an existing widget. Text uses
textContent, so it is not interpreted as HTML.

A convenience **survival HUD and modal template** is also available:

```lua
UI:Set("health", 100)
UI:Set("maxHealth", 100)
UI:Set("wave", 1)
UI:Set("remaining", 7)
UI:Set("points", 50)
UI:SetUpgrade("damage", "Heavy rounds", "+10 damage", 50, true)
UI:SetState("upgrading", "Wave cleared", "Spend your points")
-- OnAction receives upgrade ID or 'next'.
UI:SetState("dead", "Game over", "Try again")
-- OnAction receives 'restart'.
UI:SetState("playing") -- Hides the modal.
```

Use custom widgets for a different game rather than relying on the survival template.
The bottom control hint comes from the project document's optional `controls` text.

## Audio

```lua
Audio:Play("shoot") -- shoot, hit, hurt, upgrade, wave
Audio:Tone(440, 0.2, 0.4, "sine") -- Hz, seconds, volume, oscillator type
Audio.Volume = 0.25 -- Master volume for new sounds, 0 to 1.
local sound = Audio:PlayFile("data:audio/wav;base64,...", 0.5, true)
if sound then sound:Stop() end
```

Browsers require a user gesture to unlock audio. Click the game canvas or an in-game
button. Supported tone types: sine, square, triangle, sawtooth. File decoding depends
on the browser. Desktop CSP permits local/embedded media and images; remote asset URLs are browser-only. File URLs must remain available to players; use embedded data URLs
for fully self-contained exports. AudioService closes its context and stops file
playback when the session ends. Changing Volume affects newly started sounds.

## Assets

Studio sprite uploads are embedded in the saved project. Source projects can also
keep named assets in their JSON document:

```json
{
  "assets": {
    "hero": { "SourceFile": "assets/hero.png", "mimeType": "image/png" }
  }
}
```

The CLI resolves relative SourceFile paths and embeds their bytes before packaging.
The example loader does the same for the checked-in SVGs. Exported/saved projects
contain a data URL in each asset's `data` field instead of SourceFile.

```lua
local assets = game:GetService("AssetService")
if assets:Has("hero") then
    object.Texture = assets:Get("hero")
end
-- Scene documents may also set Texture to "asset:hero".
```

Use audio/wav or another browser-supported MIME type for named audio and pass
the result of Get to AudioService:PlayFile. Missing named assets raise an error.

## Attributes and persistence

`SetAttribute(name, value)` and `GetAttribute(name)` accept/return runtime values.
`GetAttributes()` returns a separate dictionary of all current attributes. Nil removes
an attribute. Plain Lua tables are converted into data records/arrays at the bridge.

```lua
object:SetAttribute("Inventory", { coins = 12, items = {"key", "map"} })
object:SetAttribute("Spawn", Vector3.new(0, 5, 0))
for name, value in pairs(object:GetAttributes()) do print(name, value) end
```

Numbers, strings, booleans, nested acyclic records/arrays, and Vector2/Vector3 values
round-trip through saving/cloning. Runtime-only functions or instance references may
be stored while running, but cannot be serialized into a project document.

## Player controllers

Insert a PlayerController2D/3D under an object of the corresponding dimension.
Inserting one without a suitable selection creates an owner object. Controllers have
Source/Enabled and are edited like Scripts. Their exposed values are stored with
the project; edits apply when Play starts. Avoid attaching multiple movement scripts
to one actor, since they would compete for the same velocity.

| Controller         | Settings                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PlayerController2D | Mode: TopDown or Platformer; Speed, JumpSpeed, Gravity, FollowCamera, LeftKey, RightKey, UpKey, DownKey, JumpKey.                                    |
| PlayerController3D | Mode: Platformer or FreeCamera; Speed, JumpSpeed, FlySpeed, LookSensitivity, FollowCamera, LeftKey, RightKey, ForwardKey, BackKey, JumpKey, DownKey. |

2D Platformer sets world gravity to (0, Gravity). Platformers use multiple foot probes and
a new jump-key press to prevent air jumping. The 3D platformer keeps its actor upright
and removes actor friction so movement does not fight ground contact. FreeCamera
anchors its actor and moves it directly, passing through geometry. Hold right mouse
to look; Space and DownKey (Control by default) move vertically in FreeCamera.

## Object3D, world settings and coordinates

Choose a 3D project when creating it. 3D scenes use **meters, Y up**, with forward
being negative Z at camera yaw zero. Rotation is a Vector3 of radians in YZX order.

```lua
local ball = Instance.new("Object3D")
ball.Shape = "Sphere" -- Box, Sphere, Cylinder or Wedge
ball.Size = Vector3.new(1, 1, 1)
ball.Position = Vector3.new(0, 5, 0)
ball.Rotation = Vector3.new(0, math.pi / 4, 0)
ball.Anchored = false
ball.Mass = 1
ball.Restitution = 0.5
ball.Material = "Rock"
ball.TextureScale = 2
ball.Parent = workspace
ball.Velocity = Vector3.new(4, 8, 0)

local hit = workspace:Raycast(Vector3.new(0, 10, 0), Vector3.new(0, -20, 0), ball)
if hit then print(hit.Instance.Name, hit.Distance, hit.Normal.Y) end
```

Common properties mirror Object2D: Position, Rotation, Velocity, Size, Shape, Color,
Texture, Anchored, Sensor, Visible, CollisionGroup, Friction, Restitution. 3D adds
Mass (positive), FixedRotation (false by default), Material, and TextureScale (positive
world units per repeat). Shapes are physical primitives, not arbitrary imported meshes.
Sphere diameter and cylinder radius use Size.X; use matching circular dimensions.

Materials: Default, Grass, Rock, Brick, Wood, Metal. Built-in textures are original
embedded SVG patterns. Texture overrides a material's pattern and can be an embedded
image, a local URL, or asset:name. Color tints the surface.

Select Workspace to edit Skybox, BackgroundColor and FallenHeight:

```lua
workspace.Skybox = "builtin:sky" -- Or an embedded equirectangular image URL.
workspace.Skybox = "" -- Empty background, using BackgroundColor.
workspace.BackgroundColor = "#000000"
workspace.FallenHeight = -100
ball.OnFallen:Connect(function()
    ball.Position = Vector3.new(0, 5, 0) -- Move above the barrier to cancel removal.
    ball.Velocity = Vector3.new()
end)
```

After physics, every Object3D below FallenHeight fires OnFallen, then is destroyed
with its descendants if it is still below the barrier. The story example recovers
its player and ball before they reach the barrier. Raise/lower the barrier in Properties.
Sky images are interpreted as equirectangular panoramas; there is no six-face cubemap
editor. Built-in hemispheric/directional lighting and shadows are supplied by the renderer.

Camera in 3D exposes Position, Follow, Yaw, Pitch, Distance and FirstPerson. Following
a character targets a point one meter above its center. Distance controls third-person
separation; FirstPerson uses zero separation. Set Follow=nil to control Position directly.
The view direction at yaw/pitch zero is (0,0,-1); a positive yaw turns toward negative X.

Vector3 supports X/Y/Z, Magnitude, Unit, Add/Sub/Mul/Div/Dot/Cross/Distance/Lerp with
the same immutable-value conventions as Vector2. Assign whole vectors to transforms.
Parent transform inheritance, joints and skeletons are not provided. Multiplayer replication is supported when enabled; see below.

## Multiplayer APIs (0.3)

See [Multiplayer](MULTIPLAYER.md) for ServerScript/LocalScript execution, Players and session IDs, RemoteEvents, physics ownership, replication, deployable web/native servers, examples and practical limits. Single-player projects remain standalone unless multiplayer is enabled in their project settings.

`Camera.Offset` is the Vector3 offset added to a followed 3D object's position (default `(0, 1, 0)`). LocalScripts can use it for shoulder cameras; Neon Borough computes its crosshair ray from this camera position and converts the target into a server muzzle direction.

## Traversal and wedges (0.4)

`Object3D.Shape = "Wedge"` creates a triangular ramp with matching rendered and convex physics geometry. The low edge is local −Z and the high edge is local +Z; rotate around Y to aim the ramp. Width, Height and Depth define its bounding box. The incline angle is `atan(Height / Depth)`. Its faces support world-sized tiled materials, collisions and raycasts.

Default PlayerController3D and platformer PlayerController2D scripts now use an upright movement helper:

```lua
local physics = game:GetService("PhysicsService")
local support = physics:GetGround(actor, 50) -- maximum walkable slope, in degrees
physics:MoveCharacter(actor, desiredVelocity, dt, script.StepHeight, script.MaxSlopeAngle)
```

`GetGround(actor, maxSlopeAngle = 50, distance?)` casts multiple foot probes and returns a normal raycast result, or nil. The optional probe distance defaults to 0.18 meters in 3D or 6 pixels in 2D, reduced for tiny bodies. Sensors and bodies excluded by the actor's collision mask are ignored. Edges and rotated footprints are supported.

`MoveCharacter(actor, velocity, dt, stepHeight?, maxSlopeAngle = 50)` sets the body's velocity, follows walkable slopes, and lifts it onto low steps only while grounded and not jumping. The helper checks the full footprint, swept headroom and the destination body volume; it does not climb tall walls, steep ramps, or steps without clearance. It targets upright character/arcade-vehicle bodies; it is not a wheel-suspension or arbitrary-orientation controller. `dt` is seconds; movement lookahead is capped at 0.1 seconds. Maximum slope must be 0–85 degrees. A zero StepHeight disables step lifting.

Default editable properties are `StepHeight = 0.45`, `MaxSlopeAngle = 50` for 3D, and `StepHeight = 14`, `MaxSlopeAngle = 50` for 2D platformers. Units are meters and pixels respectively. Top-down 2D and free-camera movement retain their existing behavior. On import, exact untouched pre-0.4 controller templates upgrade; customized Lua source is preserved.

`RunService.PostSimulation` fires once per fixed step after physics, transform synchronization and contact callbacks. Use it for visual followers and passenger attachments. Heartbeat remains before physics for input/movement logic. Connections follow normal script cleanup rules.

## World labels (0.4)

```lua
-- LocalScript: UI stays local; display server-replicated data.
local ui = game:GetService("UIService")
ui:CreateWorldLabel("badge", "Alice\n50 SWAG", actor, Vector3.new(0, 2.1, 0))
ui:SetText("badge", "Alice\n60 SWAG")
ui:SetColor("badge", "#ffe4a1")
-- ui:Remove("badge")
```

`CreateWorldLabel(id, text, target, offset?)` follows an Object3D with a world-space Vector3 offset (default `(0, 2, 0)`). Labels use the rendered camera and smoothed replica pose. They hide behind solid geometry, behind/outside the camera, beyond 80 meters, or when their target is invisible, destroyed or outside Workspace. Text is plain text, not HTML. Reuse SetText, SetColor and Remove; normal screen anchors/SetPosition apply to screen widgets. Unchanged text/color updates do not rebuild the UI every frame.

## Authored UI and collision transitions (0.5)

UIService is a hierarchy service containing ScreenGui roots. Frame, TextLabel, TextButton, ImageLabel and TextInput are editable scene instances. They support `Instance.new`, `FindFirstChild`, `Clone`, `Destroy`, child Scripts/LocalScripts and serialization. `UDim2.new(xScale, xOffset, yScale, yOffset)` provides responsive Position/Size; AnchorPoint uses Vector2. UI elements expose OnClick, OnHoverStart, OnHoverEnd and OnValueChanged (text inputs). `element:Tween(goals, seconds, easing)` returns a cancellable tween with Playing and Completed(completed). `SetSiblingIndex(index)` and `GetSiblingIndex()` use one-based indices and control flow/stacking order.

`OnCollisionStart` aliases `OnCollision`; `OnCollisionEnd` handles separation and body teardown. `object:GetTouchingObjects()` returns an instance array.

See [Visual UI authoring](UI_EDITOR.md) for layout rules, properties, animation presets and full examples. Legacy CreateLabel/CreateButton/widget APIs remain available.
