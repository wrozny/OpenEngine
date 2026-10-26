-- Cosmetic parts exist only on clients. Their sensors never affect authoritative physics.
local Appearance = {}
local models = {}
local function part(actor, name, size, color, shape)
    local object = Instance.new("Object3D")
    object.Name, object.Size, object.Color = name, size, color
    object.Shape = shape or "Box"
    object.Anchored, object.Sensor = true, true
    object.Parent = actor
    return object
end
function Appearance.Update(actor, armed)
    if not actor or actor.Destroyed then return end
    local model = models[actor.Id]
    if not model then
        model = {
            actor = actor,
            head = part(actor, "Head", Vector3.new(0.6,0.6,0.6), "#c99776", "Sphere"),
            hat = part(actor, "Cap", Vector3.new(0.65,0.15,0.65), actor.Color),
        }
        if armed then model.gun = part(actor, "Sidearm", Vector3.new(0.18,0.22,0.7), "#29323e") end
        models[actor.Id] = model
    end
    model.head.Position = actor.Position:Add(Vector3.new(0,1.2,0))
    model.hat.Position = actor.Position:Add(Vector3.new(0,1.48,0))
    model.head.Visible, model.hat.Visible = actor.Visible, actor.Visible
    if model.gun then
        local yaw = actor.Rotation.Y
        model.gun.Position = actor.Position:Add(Vector3.new(0.5 * math.cos(yaw) - 0.3 * math.sin(yaw),0.2,-0.5 * math.sin(yaw) - 0.3 * math.cos(yaw)))
        model.gun.Rotation = actor.Rotation
        model.gun.Visible = actor.Visible
    end
end
function Appearance.Clean()
    for id, model in pairs(models) do
        if model.actor.Destroyed then models[id] = nil end
    end
end
return Appearance
