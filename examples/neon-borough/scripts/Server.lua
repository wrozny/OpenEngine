-- The host owns combat, pedestrians, cars, respawning and player lifecycle.
local players = game:GetService("Players")
local run = game:GetService("RunService")
local config = require(script.Parent.Config)
local remote = workspace.CityAction
local templates = script.Parent.Templates
local Vehicles = require(script.Vehicles)
local Residents = require(script.Residents)
local state = {}
local cars = {}
local pedestrians = Residents.Load()
local nextSlot = 0
local tracers = {}

local function notify(player, text)
    remote:FireClient(player, "notice", text)
end

local function exitCar(player)
    local data = state[player.UserId]
    if not data or not data.car then return end
    local car = data.car
    car.driver = nil
    car.throttle, car.steer = 0, 0
    car.body:SetAttribute("Driver", "")
    data.car = nil
    if player.Character and not player.Character.Destroyed then
        local actor = player.Character
        actor.Position = car.body.Position:Add(Vector3.new(3, 2, 0))
        actor.Velocity = Vector3.new()
        actor.Sensor = false
        actor.Visible = true
        actor:SetAttribute("Driving", "")
        actor:SetNetworkOwner(player)
    end
end

local function spawn(player)
    local data = state[player.UserId]
    if not data then return end
    exitCar(player)
    if player.Character then player.Character:Destroy() end
    local actor = templates.Avatar:Clone()
    actor.Name = player.Name
    actor.Position = config.Spawn:Add(Vector3.new((data.slot % 5) * 2 - 4, 0, math.floor(data.slot / 5) * 2))
    actor.Color = ({"#62b6f2", "#f5b85b", "#c891f2", "#65ce9b", "#f07883"})[data.slot % 5 + 1]
    actor:SetAttribute("Health", config.Health)
    actor:SetAttribute("Score", data.kills)
    actor:SetAttribute("Swag", data.swag)
    actor:SetAttribute("Driving", "")
    actor:SetAttribute("UserId", player.UserId)
    actor.Parent = workspace
    actor:SetNetworkOwner(player)
    player:SetCharacter(actor)
    data.respawnAt = nil
end

local function join(player)
    nextSlot = nextSlot + 1
    state[player.UserId] = { slot = nextSlot, lastShot = -10, lastAction = -10, kills = 0, swag = 0 }
    spawn(player)
end
players.PlayerAdded:Connect(join)
players.PlayerRemoving:Connect(function(player)
    exitCar(player)
    if player.Character then player.Character:Destroy() end
    state[player.UserId] = nil
end)

local function damage(target, amount, attacker)
    local health = target:GetAttribute("Health")
    if not health or health <= 0 then return end
    health = math.max(0, health - amount)
    target:SetAttribute("Health", health)
    if health > 0 then return true end
    local victim = players:GetPlayerFromCharacter(target)
    if victim then
        exitCar(victim)
        target:SetNetworkOwner(nil)
        target.Velocity = Vector3.new()
        target.Anchored = true
        target.Visible = false
        target.Sensor = true
        state[victim.UserId].respawnAt = run.Time + config.RespawnDelay
        notify(victim, "Down! Returning to the plaza in four seconds…")
    else
        target.Visible = false
        target.Sensor = true
        target.Velocity = Vector3.new()
        target:SetAttribute("RespawnAt", run.Time + config.ResidentRespawnDelay)
    end
    if attacker and state[attacker.UserId] then
        local data = state[attacker.UserId]
        data.kills = data.kills + 1
        local reward = victim and config.PlayerSwag or config.ResidentSwag
        data.swag = data.swag + reward
        if attacker.Character then
            attacker.Character:SetAttribute("Score", data.kills)
            attacker.Character:SetAttribute("Swag", data.swag)
        end
        notify(attacker, string.format("+%d SWAG · %s takedown", reward, victim and "player" or "resident"))
        remote:FireAllClients("feed", string.format("%s earned +%d SWAG", attacker.Name, reward))
    end
    return true
end

cars = Vehicles.Load(damage)

local function shoot(player, direction)
    local data = state[player.UserId]
    local actor = player.Character
    if not data or not actor or data.respawnAt or data.car then return end
    if run.Time - data.lastShot < config.ShotInterval then return end
    if typeof(direction) ~= "Vector3" then return end
    local aim = Vector3.new(direction.X, direction.Y, direction.Z)
    if aim.Magnitude < 0.9 or aim.Magnitude > 1.1 then return end
    data.lastShot = run.Time
    local origin = actor.Position:Add(Vector3.new(0, 0.4, 0))
    local hit = workspace:Raycast(origin, aim:Mul(config.Range), actor)
    local finish = hit and hit.Position or origin:Add(aim:Mul(config.Range))
    -- A short replicated streak makes shots visible to every connected player.
    local delta = finish:Sub(origin)
    local streak = Instance.new("Object3D")
    streak.Name = "Shot"
    streak.Anchored, streak.Sensor = true, true
    streak.Size = Vector3.new(0.045, 0.045, delta.Magnitude)
    streak.Position = origin:Add(delta:Mul(0.5))
    streak.Rotation = Vector3.new(-math.asin(aim.Y), math.atan(aim.X, aim.Z), 0)
    streak.Color = "#ffe3a1"
    streak.Parent = workspace
    table.insert(tracers, { object = streak, expires = run.Time + 0.12 })
    if hit and damage(hit.Instance, config.Damage, player) then remote:FireClient(player, "hit") end
    remote:FireAllClients("shot", origin)
end

local function interact(player)
    local data, actor = state[player.UserId], player.Character
    if not data or not actor or data.respawnAt then return end
    if run.Time - data.lastAction < 0.35 then return end
    data.lastAction = run.Time
    if data.car then exitCar(player); notify(player, "Back on foot"); return end
    local nearest, distance = nil, 4.5
    for _, car in ipairs(cars) do
        local d = actor.Position:Distance(car.body.Position)
        if not car.driver and d < distance then nearest, distance = car, d end
    end
    if not nearest then notify(player, "Walk beside a car and press E"); return end
    nearest.driver, data.car = player, nearest
    nearest.lastInput = run.Time
    nearest.body:SetAttribute("Driver", player.UserId)
    actor:SetAttribute("Driving", nearest.body.Id)
    actor:SetNetworkOwner(nil)
    actor.Sensor = true
    notify(player, "Driving · WASD steer / accelerate · E exit")
end

remote.OnServerEvent:Connect(function(player, action, value, steer)
    local data = state[player.UserId]
    if not data then return end
    if action == "heal" then
        local actor = player.Character
        if not actor or actor.Destroyed or data.respawnAt or data.car then return end
        local health = actor:GetAttribute("Health") or 0
        if health <= 0 or actor.Position:Distance(workspace.ClinicZone.Position) > 5 then return end
        if health >= config.Health then notify(player, "You are already at full health."); return end
        if data.swag < 25 then notify(player, "Clinic treatment costs 25 SWAG."); return end
        data.swag = data.swag - 25
        actor:SetAttribute("Swag", data.swag)
        actor:SetAttribute("Health", config.Health)
        notify(player, "Clinic treatment complete.")
    elseif action == "shoot" then shoot(player, value)
    elseif action == "interact" then interact(player)
    elseif action == "drive" and data.car and type(value) == "number" and type(steer) == "number" then
        if math.abs(value) > 1 or math.abs(steer) > 1 then return end
        data.car.throttle, data.car.steer = value, steer
        data.car.lastInput = run.Time
    end
end)

run.Heartbeat:Connect(function(dt)
    for _, player in ipairs(players:GetPlayers()) do
        local data, actor = state[player.UserId], player.Character
        if data and (not actor or actor.Destroyed or (data.respawnAt and run.Time >= data.respawnAt)) then
            spawn(player)
        elseif actor and actor.Position.Y < -12 and not data.respawnAt then
            damage(actor, config.Health, nil)
        end
    end
    Vehicles.Update(cars, dt, exitCar)
    Residents.Update(pedestrians, dt)
    for i = #tracers, 1, -1 do
        if run.Time >= tracers[i].expires then tracers[i].object:Destroy(); table.remove(tracers, i) end
    end
end)

run.PostSimulation:Connect(function() Vehicles.Follow(cars) end)
