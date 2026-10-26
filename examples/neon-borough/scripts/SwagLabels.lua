-- World labels are client presentation; every value comes from a server-replicated character attribute.
local players = game:GetService("Players")
local ui = game:GetService("UIService")
local Labels = {}
local targets = {}
function Labels.Update()
    local seen = {}
    for _, player in ipairs(players:GetPlayers()) do
        local actor, id = player.Character, "swag-" .. player.UserId
        if actor and not actor.Destroyed then
            seen[id] = true
            local text = string.format("%s\n%d SWAG", player.Name, actor:GetAttribute("Swag") or 0)
            if targets[id] ~= actor then
                ui:CreateWorldLabel(id, text, actor, Vector3.new(0, 2.1, 0))
                targets[id] = actor
            else ui:SetText(id, text) end
        end
    end
    for id in pairs(targets) do
        if not seen[id] then ui:Remove(id); targets[id] = nil end
    end
end
return Labels
