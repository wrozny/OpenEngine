-- This LocalScript is authored under UIService. The sensor opens only this player's UI.
local screen = script.Parent
local panel = screen.Panel
local actions = panel.Actions
local players = game:GetService("Players")
local run = game:GetService("RunService")
local zone = workspace.ClinicZone
local actor = nil
local inside = false

local function close()
    inside = false
    screen.Enabled = false
end

zone.OnCollisionStart:Connect(function(other)
    if other ~= players.LocalPlayer.Character then return end
    actor, inside = other, true
    panel.Opacity = 0
    screen.Enabled = true
    panel:Tween({Opacity = 1}, 0.2, "OutCubic")
end)
zone.OnCollisionEnd:Connect(function(other)
    if other == actor then close() end
end)
actions.Close.OnClick:Connect(close)
actions.Confirm.OnClick:Connect(function()
    if inside then workspace.CityAction:FireServer("heal") end
end)
actions.Confirm.OnHoverStart:Connect(function()
    actions.Confirm:Tween({BackgroundColor = "#609ce8"}, 0.15)
end)
actions.Confirm.OnHoverEnd:Connect(function()
    actions.Confirm:Tween({BackgroundColor = "#4777c3"}, 0.15)
end)
run.Heartbeat:Connect(function()
    if not inside then return end
    if not actor or actor.Destroyed or actor ~= players.LocalPlayer.Character
        or (actor:GetAttribute("Health") or 0) <= 0 or actor:GetAttribute("Driving") ~= "" then
        close()
        return
    end
    actions.Confirm.Text = "Heal · 25 SWAG (" .. tostring(actor:GetAttribute("Swag") or 0) .. ")"
end)
