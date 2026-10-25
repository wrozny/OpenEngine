# Your first game

This small collectible demo shows how to build something independent of Dead Signal.

1. In Studio create a **2D** project with the **Empty scene** template, then right-click
   Workspace and insert an Object2D.
2. Name it **Player**, set Shape to Circle, dimensions to 36 × 36, uncheck Anchored,
   and set Collision group to **player**. Give it a color or upload a sprite.
3. Select Workspace and insert another Object2D named **Coin**. Set Position X
   to 180, Shape to Circle, dimensions to 24 × 24, Color to yellow, Sensor checked,
   and leave it Anchored. Keep its Collision group **world** so it detects the player.
4. Select Player and insert a Script named **Movement**. Paste:

```lua
local player = script.Parent
local input = game:GetService("InputService")
local run = game:GetService("RunService")
local camera = game:GetService("Camera")
camera.Follow = player
run.Heartbeat:Connect(function(dt)
    local move = Vector2.new(input:GetAxis("a", "d"), input:GetAxis("w", "s"))
    player.Velocity = move.Unit:Mul(220)
end)
```

5. Select Coin and insert a Script named **Collect**. Paste:

```lua
local coin = script.Parent
local ui = game:GetService("UIService")
local audio = game:GetService("AudioService")
ui:CreateLabel("hint", "Find the yellow coin!", 24, 24)
coin.OnCollision:Connect(function(other)
    if other.Name ~= "Player" then return end
    ui:SetText("hint", "Collected! Make something bigger next.")
    audio:Play("upgrade")
    coin:Destroy()
end)
```

6. Play and move into the coin. Stop restores it to the scene. Save your project,
   then use **Build game → Web game**. Unzip the export and open `index.html`;
   this is your game running with its own runtime, without Studio.

## Extract shared behavior into a module

Insert a ModuleScript named **Settings** under ScriptService:

```lua
return { Speed = 220, PointsPerCoin = 10 }
```

Read it in Movement:

```lua
local settings = require(game:GetService("ScriptService").Settings)
-- Inside Heartbeat:
-- player.Velocity = move.Unit:Mul(settings.Speed)
```

The same module instance returns the same table to each requiring Script in a play
session. Restart Play to reload edited module source.

## A few extension ideas

- Add static Object2Ds for walls; the player collides with them automatically.
- Use `Workspace:Raycast` for a hitscan weapon or interaction check.
- Use an anchored sensor for a checkpoint or exit zone.
- Read elapsed time from Heartbeat to implement cooldowns, timers, and moving hazards.
- Set downward gravity for a platformer, using a raycast below the player to check grounding.
- Build menus with UI labels/buttons/bars and OnAction callbacks.

Keep global controllers in ScriptService, object-specific scripts under their objects,
and reusable functions in modules. Object2D transforms are world space, so parenting
is for organization and script ownership rather than automatic transform inheritance.

## Try a 3D project

Use Home → New project, choose 3D and the starter template, then Create project.
The Player has a PlayerController3D with editable speed, jumping and key properties.
Select Ground to try the Grass, Rock or Brick materials and change TextureScale.
Select Workspace to change the sky or FallenHeight. Play with WASD and Space; hold
right mouse to look around. Change the controller Mode to FreeCamera to fly through
objects with Space/Control controlling height.

For a larger example, explicitly open Parcel Panic from Home or from Example Projects.zip.
Its Story Script handles goals and recovery using the public Lua API.
