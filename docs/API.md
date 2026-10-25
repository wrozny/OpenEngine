# Engine and Lua API

## Execution model

Each Play/game session owns one Lua 5.3 VM. Enabled `Script` instances execute
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
not inherited from parents. PhysicsObjects must be descendants of Workspace to be
visible in the editor; only Workspace descendants create physics bodies. ScriptService is for scripts/modules.

## Instances and hierarchy

Supported classes: `Folder`, `PhysicsObject`, `Script`, `ModuleScript`.

```lua
local object = Instance.new("PhysicsObject")
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

| Member                                             | Meaning                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Name`                                             | Display/hierarchy name; sibling names may repeat, so lookup returns the first match. |
| `Id`, `ClassName`, `Destroyed`                     | Read-only identity, type and lifecycle state.                                        |
| `Parent`                                           | Parent instance; assigning nil detaches a node and its subtree. Cycles are rejected. |
| `GetChildren()` / `GetDescendants()`               | Snapshot collections, **1-indexed** for Lua `ipairs` and `#`.                        |
| `FindFirstChild(name, recursive=false)`            | First matching child, or nil.                                                        |
| `FindFirstChildOfClass(className)`                 | First immediate child of that class, or nil.                                         |
| `IsA(className)`                                   | Exact class check; every node is also an `Instance`.                                 |
| `GetFullName()`                                    | Dot-separated path starting with `game`.                                             |
| `Clone()`                                          | Detached deep copy, including attributes, child scripts and fresh IDs.               |
| `Destroy()`                                        | Removes the node and descendants, physics bodies and events. Idempotent.             |
| `SetAttribute(name, value)` / `GetAttribute(name)` | Per-instance data: finite numbers, strings, booleans; nil removes an attribute.      |

A property/method takes precedence over a child with the same name. Use
`FindFirstChild` when a child's name collides with an API member. Cloning copies
script source, not running callbacks or a module's cached return value.

```lua
local object = script.Parent
object.OnCollision:Connect(function(with)
    print("Collision!", with.Name)
end)
```

## PhysicsObject

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
`Size.X` in place. Position/Velocity vectors are immutable values. All bodies have
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
Two anchored/static bodies do not generate contacts. Destroyed bodies do not emit
end-contact callbacks. Sensors need an involved dynamic body.

| Group        | Collides with                     |
| ------------ | --------------------------------- |
| `world`      | world, player, zombie, projectile |
| `player`     | world, zombie                     |
| `zombie`     | world, player, zombie, projectile |
| `projectile` | world, zombie                     |
| `decoration` | nothing                           |

These are built-in convenience groups for the example; extend `GROUPS` and `MASKS`
in `engine.js` for different filtering. `Sensor=true` does not override filtering.

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
