-- The host owns rounds and ordered checkpoint validation. Cars predict on their owners.
local Players = game:GetService("Players")
local Run = game:GetService("RunService")
local template = script.Parent.Templates.Racer
local state = workspace.RaceState
local racers = {}
local deadline = Run.Time + 8
local phase = "Waiting"
local winner = ""
local round = 0

local function spawn(player, slot)
    if player.Character then player.Character:Destroy() end
    local car = template:Clone()
    car.Name = player.Name
    car.Color = ({"#f2a65e", "#62b6f2", "#86dacf", "#cf91e9"})[slot % 4 + 1]
    car.Position = Vector3.new((slot % 3) * 3 - 3, 1.8, 4 - math.floor(slot / 3) * 5)
    car:SetAttribute("Checkpoint", 1)
    car.Parent = workspace
    car:SetNetworkOwner(player)
    player:SetCharacter(car)
    racers[player.UserId] = {last = car.Position, checkpoint = 1, finished = false}
end
local function join(player)
    if phase == "Waiting" then phase = "Countdown"; deadline = Run.Time + 8 end
    spawn(player, #Players:GetPlayers()-1)
    player.Character:SetAttribute("Spectating", phase ~= "Countdown")
end
Players.PlayerAdded:Connect(join)
Players.PlayerRemoving:Connect(function(player)
    if #Players:GetPlayers() == 1 then phase = "Waiting"; winner = "" end
    racers[player.UserId] = nil
    if player.Character then player.Character:Destroy() end
end)
for _, player in ipairs(Players:GetPlayers()) do join(player) end

Run.Heartbeat:Connect(function()
    if phase == "Countdown" and Run.Time >= deadline then
        phase = "Racing"
        deadline = Run.Time + 180
        round = round + 1
    elseif (phase == "Results" or phase == "Racing") and Run.Time >= deadline then
        phase, winner = "Countdown", ""
        deadline = Run.Time + 8
        for i, player in ipairs(Players:GetPlayers()) do spawn(player, i-1) end
    end
    for _, player in ipairs(Players:GetPlayers()) do
        local data, actor = racers[player.UserId], player.Character
        if data and actor and not actor.Destroyed then
            if actor.Position.Y < -5 then
                spawn(player, 0)
                actor = player.Character
                data = racers[player.UserId]
            end
            local permitted = phase == "Racing" and not actor:GetAttribute("Spectating")
            actor:SetAttribute("CanDrive", permitted)
            if permitted and not data.finished then
                local gate = workspace.Checkpoints:FindFirstChild(tostring(data.checkpoint))
                -- A checkpoint requires an actual crossing through the ordered gate.
                if gate and actor.Position:Distance(gate.Position) < 8 and data.last:Distance(actor.Position) < 8 then
                    data.checkpoint = data.checkpoint + 1
                    actor:SetAttribute("Checkpoint", data.checkpoint)
                    if data.checkpoint > #workspace.Checkpoints:GetChildren() then
                        data.finished = true
                        phase, winner, deadline = "Results", player.Name, Run.Time + 8
                    end
                end
            end
            data.last = actor.Position
        end
    end
    state:SetAttribute("Phase", phase)
    state:SetAttribute("Remaining", math.max(0, math.ceil(deadline - Run.Time)))
    state:SetAttribute("Winner", winner)
    state:SetAttribute("Round", round)
end)
