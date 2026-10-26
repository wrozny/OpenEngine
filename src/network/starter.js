/** Editable starter scripts, deliberately built on the same public API available to developers. */
export const STARTER_SERVER = `local players = game:GetService("Players")
local template = script.Parent.Templates.Player
local controller = template:FindFirstChildOfClass("PlayerController2D")
if controller and controller.Mode == "Platformer" then
    game:GetService("PhysicsService"):SetGravity(Vector2.new(0, controller.Gravity))
end
players.PlayerAdded:Connect(function(player)
    local actor = template:Clone()
    actor.Name = player.Name
    actor.Parent = workspace
    actor:SetNetworkOwner(player)
    player:SetCharacter(actor)
    actor.OnFallen:Connect(function()
        actor.Position = template.Position
        actor.Velocity = template.Velocity
    end)
end)
players.PlayerRemoving:Connect(function(player)
    if player.Character then player.Character:Destroy() end
end)
`;
export const STARTER_CLIENT = `local players = game:GetService("Players")
local ui = game:GetService("UIService")
ui:CreateLabel("identity", "Connected as " .. players.LocalPlayer.Name, 20, 20)
`;
