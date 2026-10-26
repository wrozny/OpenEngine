-- Input and presentation belong to this client; no combat results are decided here.
local players = game:GetService("Players")
local input = game:GetService("InputService")
local run = game:GetService("RunService")
local ui = game:GetService("UIService")
local audio = game:GetService("AudioService")
local camera = game:GetService("Camera")
local remote = workspace.CityAction
local config = require(script.Parent.Config)
local appearance = require(script.Parent.Appearance)
local player = players.LocalPlayer
local lastShot, lastDrive, messageUntil = -10, -10, 0

ui:CreateLabel("brand", "NEON BOROUGH / ONLINE", 22, 22)
ui:SetColor("brand", "#86dacf")
ui:CreateLabel("identity", "", 22, 52)
ui:CreateLabel("stats", "", 22, 82)
ui:CreateLabel("notice", "Meet friends at the plaza. Cars are parked along the main avenue.", 22, 112)
ui:CreateLabel("crosshair", "+", 0, 0)
ui:SetPosition("crosshair", 0, 0, "Center")
camera.Distance = 5
camera.Pitch = -0.08

remote.OnClientEvent:Connect(function(action, value)
    if action == "notice" then ui:SetText("notice", value); messageUntil = run.Time + 5
    elseif action == "shot" and player.Character and player.Character.Position:Distance(value) < 50 then audio:Play("shoot") end
end)
input.Began:Connect(function(key)
    if key == "e" then remote:FireServer("interact") end
end)
run.Heartbeat:Connect(function()
    for _, connected in ipairs(players:GetPlayers()) do appearance.Update(connected.Character, true) end
    for _, resident in ipairs(workspace.Pedestrians:GetChildren()) do appearance.Update(resident, false) end
    appearance.Clean()
    local actor = player.Character
    if not actor or actor.Destroyed then return end
    local health = actor:GetAttribute("Health") or config.Health
    local carId = actor:GetAttribute("Driving")
    local driving = carId and carId ~= ""
    ui:SetText("identity", player.Name .. " · " .. string.sub(player.UserId, 1, 8) .. " · " .. string.format("%d", #players:GetPlayers()) .. " online")
    ui:SetText("stats", string.format("HP %d / %d    TAKEDOWNS %d", health, config.Health, actor:GetAttribute("Score") or 0))
    if run.Time > messageUntil then
        ui:SetText("notice", driving and "WASD drive · E leave car" or "WASD walk · Space jump · Right drag aim · Left click shoot · E enter car")
    end
    if driving then
        local car = nil
        for _, candidate in ipairs(workspace.Cars:GetChildren()) do if candidate.Id == carId then car = candidate end end
        if car then camera.Follow = car; camera.Distance = 8; camera.Offset = Vector3.new(0,1.4,0) end
        if input:IsMouseDown(2) then
            local delta = input:ConsumeMouseDelta()
            camera.Yaw = camera.Yaw - delta.X * 0.003
            camera.Pitch = math.max(-1.2, math.min(1.2, camera.Pitch - delta.Y * 0.003))
        end
        if run.Time - lastDrive >= 0.1 then
            lastDrive = run.Time
            remote:FireServer("drive", input:GetAxis("s", "w"), input:GetAxis("a", "d"))
        end
    else
        camera.Follow, camera.Distance = actor, 5
        camera.Offset = Vector3.new(math.cos(camera.Yaw), 1.4, -math.sin(camera.Yaw))
        if health > 0 and input:IsMouseDown(0) and run.Time - lastShot >= config.ShotInterval then
            lastShot = run.Time
            local direction = Vector3.new(-math.sin(camera.Yaw) * math.cos(camera.Pitch), math.sin(camera.Pitch), -math.cos(camera.Yaw) * math.cos(camera.Pitch))
            -- Aim through the actual shoulder-camera crosshair, then fire from the server muzzle.
            local eye = actor.Position:Add(camera.Offset):Sub(direction:Mul(camera.Distance))
            local target = workspace:Raycast(eye, direction:Mul(config.Range), actor)
            local point = target and target.Position or eye:Add(direction:Mul(config.Range))
            local muzzle = actor.Position:Add(Vector3.new(0,0.4,0))
            remote:FireServer("shoot", point:Sub(muzzle).Unit)
        end
    end
end)
