-- The host owns combat, pedestrians, cars, respawning and player lifecycle.
local players = game:GetService("Players")
local run = game:GetService("RunService")
local config = require(script.Parent.Config)
local remote = workspace.CityAction
local templates = script.Parent.Templates
local state = {}
local cars = {}
local pedestrians = {}
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
    actor.Position = config.Spawn:Add(Vector3.new((data.slot % 5) * 2 - 4, 0, 0))
    actor.Color = ({"#62b6f2", "#f5b85b", "#c891f2", "#65ce9b", "#f07883"})[data.slot % 5 + 1]
    actor:SetAttribute("Health", config.Health)
    actor:SetAttribute("Driving", "")
    actor:SetAttribute("UserId", player.UserId)
    actor.Parent = workspace
    actor:SetNetworkOwner(player)
    player:SetCharacter(actor)
    data.respawnAt = nil
end

local function join(player)
    state[player.UserId] = { slot = #players:GetPlayers(), lastShot = -10, lastAction = -10, kills = 0 }
    spawn(player)
end
players.PlayerAdded:Connect(join)
players.PlayerRemoving:Connect(function(player)
    exitCar(player)
    if player.Character then player.Character:Destroy() end
    state[player.UserId] = nil
end)

for _, body in ipairs(workspace.Cars:GetChildren()) do
    if body:IsA("Object3D") and body:GetAttribute("Vehicle") then
        local parts = {}
        for _, part in ipairs(workspace.CarDetails:GetChildren()) do
            if part:GetAttribute("Car") == body.Name then
                table.insert(parts, { object = part, offset = part.Position:Sub(body.Position) })
            end
        end
        table.insert(cars, { body = body, home = body.Position, parts = parts,
            heading = 0, throttle = 0, steer = 0, lastInput = 0 })
    end
end
for i, actor in ipairs(workspace.Pedestrians:GetChildren()) do
    table.insert(pedestrians, { actor = actor, home = actor.Position, direction = i % 2 == 0 and 1 or -1 })
end

local function damage(target, amount, attacker)
    local health = target:GetAttribute("Health")
    if not health or health <= 0 then return end
    health = math.max(0, health - amount)
    target:SetAttribute("Health", health)
    if health > 0 then return end
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
        target:SetAttribute("RespawnAt", run.Time + 8)
    end
    if attacker and state[attacker.UserId] then
        local data = state[attacker.UserId]
        data.kills = data.kills + 1
        if attacker.Character then attacker.Character:SetAttribute("Score", data.kills) end
        notify(attacker, "+1 takedown")
    end
end

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
    if hit then damage(hit.Instance, config.Damage, player) end
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
    if action == "shoot" then shoot(player, value)
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
    for _, car in ipairs(cars) do
        if car.driver and run.Time - car.lastInput > 0.5 then car.throttle, car.steer = 0, 0 end
        local speed = car.throttle * (car.throttle >= 0 and config.CarSpeed or config.CarReverseSpeed)
        if math.abs(speed) > 0.1 then car.heading = car.heading - car.steer * config.CarTurnSpeed * dt * (speed > 0 and 1 or -1) end
        car.body.Rotation = Vector3.new(0, car.heading, 0)
        car.body.Velocity = Vector3.new(-math.sin(car.heading) * speed, car.body.Velocity.Y, -math.cos(car.heading) * speed)
        if car.body.Position.Y < -10 or car.body.Position.Magnitude > 200 then
            if car.driver then exitCar(car.driver) end
            car.body.Position = car.home
            car.body.Velocity = Vector3.new()
            car.heading = 0
        end
        local c, s = math.cos(car.heading), math.sin(car.heading)
        for _, part in ipairs(car.parts) do
            local o = part.offset
            part.object.Position = car.body.Position:Add(Vector3.new(o.X * c + o.Z * s, o.Y, -o.X * s + o.Z * c))
            part.object.Rotation = car.body.Rotation
        end
        if car.driver and car.driver.Character then
            car.driver.Character.Position = car.body.Position:Add(Vector3.new(0, 0.8, 0))
            car.driver.Character.Velocity = Vector3.new()
            car.driver.Character.Visible = false
        end
    end
    for _, npc in ipairs(pedestrians) do
        local actor = npc.actor
        local respawnAt = actor:GetAttribute("RespawnAt")
        if respawnAt and run.Time >= respawnAt then
            actor:SetAttribute("RespawnAt", nil)
            actor:SetAttribute("Health", config.Health)
            actor.Position, actor.Visible, actor.Sensor = npc.home, true, false
        elseif not respawnAt then
            if math.abs(actor.Position.Z - npc.home.Z) > 12 and (actor.Position.Z - npc.home.Z) * npc.direction > 0 then npc.direction = -npc.direction end
            actor.Velocity = Vector3.new(0, actor.Velocity.Y, npc.direction * 1.7)
            actor.Rotation = Vector3.new(0, npc.direction > 0 and math.pi or 0, 0)
        end
    end
    for i = #tracers, 1, -1 do
        if run.Time >= tracers[i].expires then tracers[i].object:Destroy(); table.remove(tracers, i) end
    end
end)
