local Run = game:GetService('RunService')
local Input = game:GetService('InputService')
local UI = game:GetService('UIService')
local Audio = game:GetService('AudioService')
local Mission = require(script.Parent.Mission)
local player = workspace.Player
local ball = workspace.Football
local template = ball:Clone()
local parcels = workspace.Parcels
local stage, collected, elapsed, noticeTimer = 1, 0, 0, 0
local previousInteract = false

UI:CreateLabel('title', 'PARCEL PANIC  ·  A very normal first day', 24, 24)
UI:CreateLabel('task', Mission.Tasks[1], 24, 64)
UI:CreateLabel('progress', 'Parcels found: 0 / 3', 24, 104)
UI:CreateLabel('notice', 'The manager says this island is perfectly safe.', 24, 144)

local function notice(text)
    UI:SetText('notice', text)
    noticeTimer = 4
end
local function advance()
    stage = stage + 1
    Audio:Play('upgrade')
    if stage <= 4 then UI:SetText('task', Mission.Tasks[stage]) end
end
local function respawnBall()
    if not ball.Destroyed then ball:Destroy() end
    ball = template:Clone()
    ball.Name = 'Football'
    ball.Position = Mission.BallSpawn
    ball.Velocity = Vector3.new()
    ball.Parent = workspace
    workspace:SetAttribute('BallsRespawned', (workspace:GetAttribute('BallsRespawned') or 0) + 1)
end

Run.Heartbeat:Connect(function(dt)
    elapsed = elapsed + dt
    noticeTimer = math.max(0, noticeTimer - dt)
    if noticeTimer == 0 then UI:SetText('notice', 'E: interact / kick  ·  R: return to spawn') end
    if player.Position.Y < -10 or Input:IsKeyDown('r') then
        player.Position = Mission.Spawn
        player.Velocity = Vector3.new()
        notice('Gravity training complete. Back to work!')
    end
    if ball.Destroyed or ball.Position.Y < -8 or ball.Position.Magnitude > 70 then
        respawnBall()
    end
    if stage == 1 then
        for _, parcel in ipairs(parcels:GetChildren()) do
            if player.Position:Distance(parcel.Position) < 2 then
                parcel:Destroy()
                collected = collected + 1
                UI:SetText('progress', 'Parcels found: ' .. collected .. ' / 3')
                Audio:Play('upgrade')
            end
        end
        if collected == 3 then advance(); notice('Three parcels. One suspiciously light pay cheque.') end
    end
    local interact = Input:IsKeyDown('e')
    if interact and not previousInteract then
        if stage == 2 and player.Position:Distance(workspace.PostBox.Position) < 3 then
            advance()
            notice('Parcels delivered. The manager insists football is mandatory.')
        elseif stage == 4 and player.Position:Distance(workspace.Bell.Position) < 3 then
            advance()
            UI:SetState('complete', 'Employee of the island', 'All four tasks complete in ' .. math.floor(elapsed) .. ' seconds. Your reward: tomorrow off!')
            player.Velocity = Vector3.new()
        elseif player.Position:Distance(ball.Position) < 4 then
            local yaw = game:GetService('Camera').Yaw
            ball.Velocity = Vector3.new(-math.sin(yaw) * 16, 4.5, -math.cos(yaw) * 16)
            Audio:Play('hit')
            notice('A powerful contribution to workplace culture.')
        end
    end
    previousInteract = interact
    if stage == 3 and math.abs(ball.Position.X) < 2.7 and ball.Position.Z < -15.2 and ball.Position.Z > -17.5 and ball.Position.Y < 3 then
        advance()
        notice('GOAL! Your performance review has improved dramatically.')
        workspace:SetAttribute('GoalScored', true)
    end
end)

UI.OnAction:Connect(function(action)
    if action ~= 'restart' then return end
    -- Rebuild the run through a fresh page/session using a project-owned reset event.
    for _, parcel in ipairs(parcels:GetChildren()) do parcel:Destroy() end
    for i, position in ipairs({Vector3.new(-12,1,-4), Vector3.new(12,1,3), Vector3.new(4,2,-9)}) do
        local parcel = Instance.new('Object3D')
        parcel.Name = 'Parcel ' .. i
        parcel.Size = Vector3.new(1.2,1.2,1.2)
        parcel.Position = position
        parcel.Color = '#e9b766'
        parcel.Material = 'Wood'
        parcel.Parent = parcels
    end
    stage, collected, elapsed = 1, 0, 0
    workspace:SetAttribute('GoalScored', false)
    player.Position = Mission.Spawn
    player.Velocity = Vector3.new()
    respawnBall()
    UI:SetText('task', Mission.Tasks[1])
    UI:SetText('progress', 'Parcels found: 0 / 3')
    UI:SetState('playing')
    notice('Another completely normal first day.')
end)
print('Parcel Panic ready. Collect parcels, deliver them, score a goal, and ring the bell.')
