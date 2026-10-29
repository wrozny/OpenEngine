local Players=game:GetService("Players")
local Run=game:GetService("RunService")
local Input=game:GetService("InputService")
local Physics=game:GetService("PhysicsService")
local Camera=game:GetService("Camera")
local UI=game:GetService("UIService")
local Audio=game:GetService("AudioService")
local player=Players.LocalPlayer
local state=workspace.Match
local screen=UI.RaceHUD
local panel=screen.Header
local action=workspace.Action
local hook, ropeLength, actor, rope = nil, 0, nil, nil
local hookRequestedAt=0
local lastPosition=nil
local lastBoost=0
local tethers={}
local jumpUntil, groundedUntil, dashAt, releaseAt = 0,0,-10,-10
Physics:SetGravity(Vector2.new(0,980))
Camera.Zoom=0.95

local function detach()
    hook=nil;releaseAt=Run.Time
    action:FireServer("release")
    if rope and not rope.Destroyed then rope:Destroy() end
    rope=nil
end
Input.Began:Connect(function(key)
    if key==" " then jumpUntil=Run.Time+0.14 end
    if key=="r" then detach();action:FireServer("recover") end
    if key=="shift" and actor and actor:GetAttribute("CanRace") and Run.Time-dashAt>=2 then
        dashAt=Run.Time
        actor.Velocity=Vector2.new(Input:IsKeyDown("a") and -650 or 650,math.min(actor.Velocity.Y,0))
        Audio:Play("upgrade")
    end
    if key~="mouse0" or not actor or not actor:GetAttribute("CanRace") then return end
    local closest, distance = nil, 110
    for _, candidate in ipairs(workspace.Course:GetChildren()) do
        if candidate:GetAttribute("Hookable") and actor.Position:Distance(candidate.Position)<600 then
            local d=Input.MousePosition:Distance(candidate.Position)
            if d<distance then closest=candidate;distance=d end
        end
    end
    if closest then
        local hit=workspace:Raycast(actor.Position,closest.Position:Sub(actor.Position):Mul(1.03),actor)
        if hit and hit.Instance==closest then
            hookRequestedAt=Run.Time;hook=closest.Position;ropeLength=math.max(70,actor.Position:Distance(hook))
            action:FireServer("hook",hook);Audio:Play("hit")
        end
    end
end)
Input.Ended:Connect(function(key) if key=="mouse0" then detach() end end)
Run.Heartbeat:Connect(function(dt)
    local nextActor=player.Character
    if nextActor~=actor then hook=nil;actor=nextActor;lastBoost=0 end
    if not actor or actor.Destroyed then return end
    if hook and lastPosition and lastPosition:Distance(actor.Position)>250 then detach() end
    lastPosition=actor.Position
    Camera.Follow=actor
    local phase=state:GetAttribute("Phase") or "Waiting"
    panel.Phase.Text=phase=="Results" and ((state:GetAttribute("Winner") or "").." takes the round") or (actor:GetAttribute("Spectating") and "NEXT ROUND / SPECTATING" or phase:upper())
    local seconds=state:GetAttribute("Seconds") or 0
    panel.Clock.Text=string.format("%d:%02d",math.floor(seconds/60),seconds%60)
    panel.Course.Text=string.format("%s / SEED %d",(actor:GetAttribute("District") or "Departure"):upper(),state:GetAttribute("Seed") or 0)
    screen.Footer.Progress.Text=string.format("DECK %02d / %02d     %d RECOVERIES",actor:GetAttribute("Checkpoint") or 1,state:GetAttribute("DeckCount") or 14,actor:GetAttribute("Falls") or 0)
    screen.Footer.Dash.Text=Run.Time-dashAt>=2 and "SHIFT  /  DASH READY" or "DASH RECHARGING"
    if not actor:GetAttribute("CanRace") then
        actor.Velocity=Vector2.new(0,actor.Velocity.Y);hook=nil;return
    end
    if hook and Run.Time-hookRequestedAt>0.35 and not actor:GetAttribute("HookActive") then detach() end
    if not Input:IsMouseDown(0) and hook then detach() end
    local support=Physics:GetGround(actor,50)
    if support then groundedUntil=Run.Time+0.12 end
    local boost=actor:GetAttribute("BoostSerial") or 0
    if boost>lastBoost then actor.Velocity=Vector2.new(650,-420) end
    lastBoost=boost
    local velocity=actor.Velocity
    local target=Input:GetAxis("a","d")*330
    local acceleration=hook and 500 or (support and 2100 or 850)
    local vx=velocity.X+math.max(-acceleration*dt,math.min(acceleration*dt,target-velocity.X))
    local vy=velocity.Y
    if jumpUntil>=Run.Time and groundedUntil>=Run.Time then
        vy=-550;jumpUntil=0;groundedUntil=0;Audio:Play("wave")
    end
    if hook then
        ropeLength=math.max(70,math.min(560,ropeLength+Input:GetAxis("w","s")*180*dt))
        local radial=actor.Position:Sub(hook)
        if radial.Magnitude>ropeLength then
            actor.Position=hook:Add(radial.Unit:Mul(ropeLength))
            local outward=Vector2.new(vx,vy):Dot(radial.Unit)
            if outward>0 then local projected=Vector2.new(vx,vy):Sub(radial.Unit:Mul(outward));vx,vy=projected.X,projected.Y end
        end
        actor.Velocity=Vector2.new(vx,math.min(900,vy))
    else Physics:MoveCharacter(actor,Vector2.new(vx,math.min(900,vy)),dt,12,50) end
end)
Run.PostSimulation:Connect(function()
    local alive={}
    for _, connected in ipairs(Players:GetPlayers()) do
        local target=connected.Character
        local point=nil
        if connected==player then point=hook
        elseif target and target:GetAttribute("HookActive") then
            point=Vector2.new(target:GetAttribute("HookX"),target:GetAttribute("HookY"))
        end
        if target and not target.Destroyed and point then
            alive[connected.UserId]=true
            local line=tethers[connected.UserId]
            if not line or line.Destroyed then
                line=Instance.new("Object2D");line.Name=connected==player and "Local tether" or "Remote tether"
                line.Color=target.Color;line.Sensor=true;line.CollisionGroup="decoration";line.Layer=5;line.Parent=target
                tethers[connected.UserId]=line
            end
            local start=Run:GetRenderTransform(target).Position
            local delta=point:Sub(start)
            line.Size=Vector2.new(math.max(1,delta.Magnitude),3)
            line.Position=start:Add(delta:Mul(0.5))
            line.Rotation=math.atan(delta.Y,delta.X)
        end
    end
    for id,line in pairs(tethers) do
        if not alive[id] then if not line.Destroyed then line:Destroy() end;tethers[id]=nil end
    end
end)
