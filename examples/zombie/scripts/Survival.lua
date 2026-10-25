-- Dead Signal is implemented entirely against the public Lua engine API.
local Workspace = game:GetService("Workspace")
local Run = game:GetService("RunService")
local Input = game:GetService("InputService")
local Audio = game:GetService("AudioService")
local UI = game:GetService("UIService")
local Camera = game:GetService("Camera")
local Config = require(script.Parent.Config)
local Weapons = require(script.Parent.Weapons)
local player = Workspace.Player
local zombies, projectiles = Workspace.Zombies, Workspace.Projectiles
local wave, kills, points, health = 0, 0, 0, Config.StartingHealth
local maxHealth, damage = Config.StartingHealth, Config.StartingDamage
local fireRate, speed = Config.StartingFireRate, Config.StartingSpeed
local shotTimer, hurtTimer, spawnTimer, spawnRemaining = 0, 0, 0, 0
local state = "playing"
local levels = { health = 0, damage = 0, firerate = 0, speed = 0 }
local buttons = {
    { id = "health", title = "Field medicine", description = "+25 max health · full heal" },
    { id = "damage", title = "Heavy rounds", description = "+10 projectile damage" },
    { id = "firerate", title = "Quick action", description = "+1 shot per second" },
    { id = "speed", title = "Light footing", description = "+25 movement speed" },
}
Camera.Follow = player
Camera.Zoom = 0.9

local function hud()
    UI:Set("health", math.ceil(health))
    UI:Set("maxHealth", maxHealth)
    UI:Set("wave", wave)
    UI:Set("kills", kills)
    UI:Set("points", points)
    UI:Set("remaining", spawnRemaining + #zombies:GetChildren())
    UI:Set("damage", damage)
    UI:Set("fireRate", fireRate)
    UI:Set("speed", speed)
end

local function maxed(id)
    return (id == "firerate" and fireRate >= 20) or (id == "speed" and speed >= 600)
end

local function shop()
    for _, button in ipairs(buttons) do
        local cost = Config.UpgradeBaseCost + levels[button.id] * 25
        UI:SetUpgrade(button.id, button.title, maxed(button.id) and "Maximum level reached" or button.description, cost, points >= cost and not maxed(button.id))
    end
end

local function startWave()
    wave = wave + 1
    spawnRemaining = math.min(4 + wave * 3, 150)
    spawnTimer = 0.5
    state = "playing"
    UI:SetState("playing")
    Audio:Play("wave")
    hud()
end

local function clear(folder)
    for _, child in ipairs(folder:GetChildren()) do child:Destroy() end
end

local function restart()
    clear(zombies)
    clear(projectiles)
    wave, kills, points = 0, 0, 0
    maxHealth, health = Config.StartingHealth, Config.StartingHealth
    damage, fireRate, speed = Config.StartingDamage, Config.StartingFireRate, Config.StartingSpeed
    for key in pairs(levels) do levels[key] = 0 end
    player.Position = Vector2.new(0, 0)
    player.Velocity = Vector2.new(0, 0)
    player.Color = "#9bdccd"
    hurtTimer, shotTimer = 0, 0
    startWave()
end

local function hitZombie(zombie, amount)
    local hp = zombie:GetAttribute("Health") - amount
    zombie:SetAttribute("Health", hp)
    Audio:Play("hit")
    if hp <= 0 then
        zombie:Destroy()
        kills = kills + 1
        points = points + Config.KillReward
    end
    hud()
end

local function spawnZombie()
    local zombie = Instance.new("PhysicsObject")
    zombie.Name = "Zombie"
    zombie.Shape = "Circle"
    zombie.Size = Vector2.new(34, 34)
    zombie.Texture = Config.ZombieTexture
    zombie.ShowHealthBar = true
    zombie.Color = "#839c61"
    zombie.Anchored = false
    zombie.CollisionGroup = "zombie"
    zombie.Layer = 2
    local angle = math.random() * math.pi * 2
    -- Spawn around the arena edge, at a safe distance from the survivor.
    local position = Vector2.new(math.cos(angle) * 800, math.sin(angle) * 500)
    if position:Distance(player.Position) < 320 then position = position:Mul(-1) end
    zombie.Position = position
    local hp = 42 + wave * 8
    zombie:SetAttribute("Health", hp)
    zombie:SetAttribute("MaxHealth", hp)
    zombie:SetAttribute("Speed", math.min(65 + wave * 8, 320))
    zombie.Parent = zombies
end

UI.OnAction:Connect(function(action)
    if action == "restart" and state == "dead" then restart(); return end
    if action == "next" and state == "upgrading" then startWave(); return end
    if state ~= "upgrading" or levels[action] == nil then return end
    local cost = Config.UpgradeBaseCost + levels[action] * 25
    if points < cost or maxed(action) then return end
    points = points - cost
    levels[action] = levels[action] + 1
    if action == "health" then maxHealth = maxHealth + 25; health = maxHealth
    elseif action == "damage" then damage = damage + 10
    elseif action == "firerate" then fireRate = math.min(fireRate + 1, 20)
    elseif action == "speed" then speed = math.min(speed + 25, 600) end
    Audio:Play("upgrade")
    hud()
    shop()
end)

Run.Heartbeat:Connect(function(dt)
    if state ~= "playing" then player.Velocity = Vector2.new(0, 0); return end
    local movement = Vector2.new(Input:GetAxis("a", "d"), Input:GetAxis("w", "s"))
    if Input:IsKeyDown("arrowleft") then movement = movement:Add(Vector2.new(-1, 0)) end
    if Input:IsKeyDown("arrowright") then movement = movement:Add(Vector2.new(1, 0)) end
    if Input:IsKeyDown("arrowup") then movement = movement:Add(Vector2.new(0, -1)) end
    if Input:IsKeyDown("arrowdown") then movement = movement:Add(Vector2.new(0, 1)) end
    player.Velocity = movement.Unit:Mul(speed)
    local aim = Input.MousePosition:Sub(player.Position)
    if aim.Magnitude > 1 then player.Rotation = math.atan(aim.Y, aim.X) end
    shotTimer = math.max(0, shotTimer - dt)
    if (Input:IsMouseDown(0) or Input:IsKeyDown(" ")) and shotTimer <= 0 then
        local direction = aim.Magnitude > 1 and aim.Unit or Vector2.new(1, 0)
        Weapons.Fire(player, direction, damage, hitZombie)
        shotTimer = 1 / fireRate
    end
    spawnTimer = spawnTimer - dt
    if spawnRemaining > 0 and spawnTimer <= 0 then
        spawnZombie()
        spawnRemaining = spawnRemaining - 1
        spawnTimer = 0.45
        hud()
    end
    hurtTimer = math.max(0, hurtTimer - dt)
    player.Color = hurtTimer > 0 and "#e8a08d" or "#9bdccd"
    for _, zombie in ipairs(zombies:GetChildren()) do
        local delta = player.Position:Sub(zombie.Position)
        zombie.Velocity = delta.Unit:Mul(zombie:GetAttribute("Speed"))
        zombie.Rotation = math.atan(delta.Y, delta.X)
        if delta.Magnitude < 45 and hurtTimer <= 0 then
            health = math.max(0, health - (10 + math.floor(wave / 4)))
            hurtTimer = 0.65
            Audio:Play("hurt")
            hud()
            if health <= 0 then
                state = "dead"
                player.Velocity = Vector2.new(0, 0)
                clear(projectiles)
                for _, z in ipairs(zombies:GetChildren()) do z.Velocity = Vector2.new(0, 0) end
                UI:SetState("dead", "Signal lost", "Survived to wave " .. wave .. " · " .. kills .. " infected eliminated")
                return
            end
        end
    end
    for _, bullet in ipairs(projectiles:GetChildren()) do
        local lifetime = bullet:GetAttribute("Lifetime") - dt
        bullet:SetAttribute("Lifetime", lifetime)
        if lifetime <= 0 then bullet:Destroy() end
    end
    if spawnRemaining == 0 and #zombies:GetChildren() == 0 then
        state = "upgrading"
        clear(projectiles)
        player.Velocity = Vector2.new(0, 0)
        UI:SetState("upgrading", "A moment to breathe", "Wave " .. wave .. " cleared. Spend your points or keep them for later.")
        shop()
        hud()
    end
end)

print("Dead Signal ready. WASD to move · mouse to aim · hold left click to fire.")
startWave()
