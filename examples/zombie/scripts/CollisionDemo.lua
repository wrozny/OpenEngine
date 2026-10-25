-- Disabled by default to keep the example console quiet. Enable in the inspector.
local object = script.Parent
object.OnCollision:Connect(function(with)
    print("Collision!", with.Name)
end)
