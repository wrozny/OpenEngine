-- Server-only pedestrian movement and recovery, separate from combat and player state.
local run = game:GetService("RunService")
local physics = game:GetService("PhysicsService")
local config = require(script.Parent.Parent.Config)
local Residents = {}
function Residents.Load()
    local residents = {}
    for i, actor in ipairs(workspace.Pedestrians:GetChildren()) do
        table.insert(residents, { actor = actor, template = actor:Clone(), home = actor.Position,
            direction = i % 2 == 0 and 1 or -1, progress = actor.Position, checkedAt = run.Time })
    end
    return residents
end
local function recover(npc)
    if npc.actor.Destroyed then npc.actor = npc.template:Clone(); npc.actor.Parent = workspace.Pedestrians end
    local actor = npc.actor
    actor:SetAttribute("RespawnAt", nil)
    actor:SetAttribute("Health", config.Health)
    actor.Position, actor.Velocity, actor.Visible, actor.Sensor = npc.home, Vector3.new(), true, false
    npc.progress, npc.checkedAt = npc.home, run.Time
end
function Residents.Update(residents, dt)
    for _, npc in ipairs(residents) do
        local actor = npc.actor
        if actor.Destroyed or actor.Position.Y < -10 then recover(npc); actor = npc.actor end
        local respawnAt = actor:GetAttribute("RespawnAt")
        if respawnAt and run.Time >= respawnAt then recover(npc)
        elseif not respawnAt then
            if math.abs(actor.Position.Z-npc.home.Z) > 12 and (actor.Position.Z-npc.home.Z)*npc.direction > 0 then npc.direction = -npc.direction end
            if run.Time - npc.checkedAt >= 1 then
                if actor.Position:Sub(npc.progress).Magnitude < 0.25 then npc.direction = -npc.direction end
                npc.progress, npc.checkedAt = actor.Position, run.Time
            end
            physics:MoveCharacter(actor, Vector3.new(0,actor.Velocity.Y,npc.direction*1.7), dt, 0.35, 50)
            actor.Rotation = Vector3.new(0,npc.direction > 0 and math.pi or 0,0)
        end
    end
end
return Residents
