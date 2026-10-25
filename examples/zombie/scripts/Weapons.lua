local Workspace = game:GetService("Workspace")
local Audio = game:GetService("AudioService")
local Weapons = {}

-- Each projectile is a real sensor body. Collision dispatch happens after physics,
-- so destroying an instance inside the handler is safe.
function Weapons.Fire(player, direction, damage, onHit)
    local bullet = Instance.new("PhysicsObject")
    bullet.Name = "Projectile"
    bullet.Shape = "Circle"
    bullet.Size = Vector2.new(8, 8)
    bullet.Position = player.Position:Add(direction:Mul(34))
    bullet.Velocity = direction:Mul(900)
    bullet.Color = "#ffdc94"
    bullet.Anchored = false
    bullet.Sensor = true
    bullet.Layer = 5
    bullet.CollisionGroup = "projectile"
    bullet:SetAttribute("Lifetime", 2)
    bullet.OnCollision:Connect(function(other)
        if bullet.Destroyed then return end
        if other.CollisionGroup == "zombie" then
            onHit(other, damage)
            bullet:Destroy()
        elseif other.CollisionGroup == "world" then
            bullet:Destroy()
        end
    end)
    bullet.Parent = Workspace.Projectiles
    Audio:Play("shoot")
    return bullet
end

return Weapons
