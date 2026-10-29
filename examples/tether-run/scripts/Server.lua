local Players = game:GetService("Players")
local Run = game:GetService("RunService")
local Physics = game:GetService("PhysicsService")
local Course = require(script.Parent.Course)
local template = script.Parent.Templates.Runner
local state = workspace.Match
local terrain = workspace.Course
local action = workspace.Action
local racers = {}
local segments = {}
local gates = {}
local phase, deadline, round, seed, winner = "Waiting", 0, 0, math.random(1, 1000000), ""
Physics:SetGravity(Vector2.new(0,980))

local function object(name, x, y, width, height, color, sensor)
    local node = Instance.new("Object2D")
    node.Name, node.Position, node.Size = name, Vector2.new(x,y), Vector2.new(width,height)
    node.Color, node.Sensor = color, sensor or false
    node.Parent = terrain
    return node
end
local function decoration(name, x, y, width, height, color, layer)
    local node=object(name,x,y,width,height,color,true)
    node.Layer=layer or -10;node.CollisionGroup="decoration"
    return node
end
local function anchor(name,x,y)
    local node=object(name,x,y,22,22,"#e8c56b")
    node.Shape="Circle";node:SetAttribute("Hookable",true)
    return node
end
local function build()
    for _, child in ipairs(terrain:GetChildren()) do child:Destroy() end
    gates={}
    segments = Course.Generate(seed)
    local palettes={{"#354d5a","#1c303b","#41636b"},{"#586061","#303f44","#739689"},{"#685970","#302c40","#907b92"}}
    for i, segment in ipairs(segments) do
        local palette=palettes[segment.palette]
        local platform = object("Deck "..i, segment.x, segment.y, segment.width, 22, palette[1])
        platform:SetAttribute("Deck", i)
        platform:SetAttribute("District",segment.district)
        decoration("Rooftop support",segment.x,segment.y+365,segment.width-12,700,palette[2],-20)
        decoration("Roof trim",segment.x,segment.y+16,segment.width+10,5,palette[3])
        -- Seeded facade silhouettes make districts recognizable without external artwork.
        for floor=1,3 do
            for column=-1,1 do
                decoration("Window",segment.x+column*48,segment.y+floor*60,16,24,palette[3],-15)
            end
        end
        decoration("Anchor mast",segment.x+segment.anchorX,segment.y-segment.anchorHeight-55,3,85,palette[3])
        anchor("Anchor "..i,segment.x+segment.anchorX,segment.y-segment.anchorHeight)
        if segment.bridge then
            anchor("Gap relay "..i,segment.x-195,segment.y-230)
            object("Service step",segment.x-180,segment.y+75,74,14,palette[1])
        end
        if segment.shortcut then
            object("Upper express "..i,segment.x-45,segment.y-115,115,14,palette[3])
            anchor("Express relay "..i,segment.x-135,segment.y-300)
        end
        if segment.boost then
            local pad = object("Boost", segment.x+55, segment.y-16, 70, 10, "#69d4c0", true)
            pad:SetAttribute("Boost", true)
        end
        if segment.hazard then
            local hazard=object("Pulse gate",segment.x+70,segment.y-42,18,65,"#ef746c",true)
            hazard:SetAttribute("Hazard",true)
            gates[#gates+1]={node=hazard,segment=segment}
        end
    end
    local finish=segments[#segments]
    decoration("Finish pole",finish.x+45,finish.y-75,7,140,"#f4eee1",2)
    for row=0,2 do
        for column=0,3 do
            decoration("Chequered flag",finish.x+59+column*12,finish.y-140+row*12,12,12,
                (row+column)%2==0 and "#f4eee1" or "#14252f",3)
        end
    end
    state:SetAttribute("DeckCount",#segments)
end
local function reset(player, checkpoint)
    local data = racers[player.UserId]
    if not data then return end
    local actor = player.Character
    if not actor or actor.Destroyed then
        actor = template:Clone()
        actor.Name = player.Name
        actor.Color = ({"#e8c56b","#69d4c0","#ef8b8b","#a9a1e0"})[data.slot%4+1]
        actor.Parent = workspace
        actor:SetNetworkOwner(player)
        player:SetCharacter(actor)
    end
    local segment = segments[checkpoint or 1]
    actor.Position = Vector2.new(segment.x-45, segment.y-50)
    actor.Velocity = Vector2.new()
    actor:SetAttribute("BoostSerial",0)
    actor:SetAttribute("HookActive",false)
    actor:SetAttribute("Checkpoint", checkpoint or 1)
    actor:SetAttribute("District",segment.district)
    actor:SetAttribute("Finished",false)
    data.checkpoint, data.lastHook = checkpoint or 1, -10
end
local function join(player)
    racers[player.UserId] = {slot=#Players:GetPlayers()-1, checkpoint=1, lastHook=-10, falls=0, lastBoost=-10,lastRecover=-10,wins=0}
    if phase=="Waiting" then phase="Countdown";deadline=Run.Time+6 end
    reset(player,1)
    player.Character:SetAttribute("Spectating", phase~="Countdown")
end
build()
Players.PlayerAdded:Connect(join)
Players.PlayerRemoving:Connect(function(player)
    racers[player.UserId]=nil
    if player.Character then player.Character:Destroy() end
end)
for _, player in ipairs(Players:GetPlayers()) do join(player) end

action.OnServerEvent:Connect(function(player, kind, point)
    local data, actor = racers[player.UserId], player.Character
    if not data or not actor or actor.Destroyed then return end
    if kind=="release" then actor:SetAttribute("HookActive",false);return end
    if kind=="recover" then
        if Run.Time-data.lastRecover<1 then return end
        data.lastRecover=Run.Time;data.falls=data.falls+1;reset(player,data.checkpoint);return
    end
    if kind~="hook" or typeof(point)~="Vector2" or phase~="Racing" or actor:GetAttribute("Spectating") then return end
    if Run.Time-data.lastHook<0.12 or actor.Position:Distance(point)>620 then return end
    local hit=workspace:Raycast(actor.Position,point:Sub(actor.Position):Mul(1.03),actor)
    if not hit or not hit.Instance:GetAttribute("Hookable") then return end
    data.lastHook=Run.Time
    actor:SetAttribute("HookX",hit.Instance.Position.X)
    actor:SetAttribute("HookY",hit.Instance.Position.Y)
    actor:SetAttribute("HookActive",true)
end)
Run.Heartbeat:Connect(function()
    if #Players:GetPlayers()==0 then phase="Waiting" end
    if phase=="Countdown" and Run.Time>=deadline then
        phase="Racing";deadline=Run.Time+110;round=round+1
    elseif (phase=="Results" or phase=="Racing") and Run.Time>=deadline then
        phase="Countdown";deadline=Run.Time+6;winner="";seed=seed+7919
        build()
        for _,player in ipairs(Players:GetPlayers()) do
            local data=racers[player.UserId];data.falls=0;reset(player,1)
            player.Character:SetAttribute("Spectating",false)
        end
    end
    for _, gate in ipairs(gates) do
        local active=(Run.Time+gate.segment.offset)%3.2<1.6
        gate.segment.active=active
        gate.node.Color=active and "#ef746c" or "#477066"
        gate.node:SetAttribute("Active",active)
    end
    for _, player in ipairs(Players:GetPlayers()) do
        local data, actor = racers[player.UserId], player.Character
        if data and actor and not actor.Destroyed then
            local active=phase=="Racing" and not actor:GetAttribute("Spectating") and not actor:GetAttribute("Finished")
            actor:SetAttribute("CanRace",active)
            if not active then actor:SetAttribute("HookActive",false) end
            if active then
                local pos=actor.Position
                if pos.Y>600 or pos.X < -300 then
                    data.falls=data.falls+1;reset(player,data.checkpoint)
                else
                    for i, segment in ipairs(segments) do
                        if math.abs(pos.X-segment.x)<110 and pos.Y>segment.y-200 and pos.Y<segment.y+70 then
                            if i>data.checkpoint and i<=data.checkpoint+3 then
                                data.checkpoint=i;actor:SetAttribute("Checkpoint",i);actor:SetAttribute("District",segment.district)
                            end
                            if segment.hazard and segment.active and math.abs(pos.X-segment.x-70)<25 and math.abs(pos.Y-segment.y+42)<52 then
                                data.falls=data.falls+1;reset(player,data.checkpoint)
                            elseif segment.boost and math.abs(pos.X-segment.x-55)<45 and Run.Time-data.lastBoost>1 then
                                data.lastBoost=Run.Time;actor:SetAttribute("BoostSerial",(actor:GetAttribute("BoostSerial") or 0)+1);actor.Velocity=Vector2.new(650,-420)
                            end
                        end
                    end
                    if data.checkpoint>=#segments-1 and pos.X>segments[#segments].x+30 and math.abs(pos.Y-segments[#segments].y)<130 then
                        data.wins=data.wins+1;winner=player.Name;actor:SetAttribute("Finished",true);phase="Results";deadline=Run.Time+7
                    end
                end
            end
            actor:SetAttribute("Falls",data.falls)
            actor:SetAttribute("Wins",data.wins)
        end
    end
    state:SetAttribute("Phase",phase);state:SetAttribute("Seconds",math.max(0,math.ceil(deadline-Run.Time)))
    state:SetAttribute("Round",round);state:SetAttribute("Seed",seed);state:SetAttribute("Winner",winner)
end)
