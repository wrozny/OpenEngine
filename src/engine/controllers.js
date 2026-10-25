/** Editable Lua templates: controllers use the same API as project-authored Scripts. */
export const CONTROLLER_2D = `local actor = script.Parent
assert(actor and actor:IsA("Object2D"), "PlayerController2D must be inside an Object2D")
local input = game:GetService("InputService")
local run = game:GetService("RunService")
local camera = game:GetService("Camera")
actor.Anchored = false
if script.FollowCamera then camera.Follow = actor end
if script.Mode == "Platformer" then
    game:GetService("PhysicsService"):SetGravity(Vector2.new(0, script.Gravity))
end
local jumpWasDown = false
run.Heartbeat:Connect(function(dt)
    local horizontal = input:GetAxis(script.LeftKey, script.RightKey)
    if script.Mode == "TopDown" then
        local movement = Vector2.new(horizontal, input:GetAxis(script.UpKey, script.DownKey))
        actor.Velocity = movement.Unit:Mul(script.Speed)
    else
        local jumpDown = input:IsKeyDown(script.JumpKey)
        local probe = workspace:Raycast(actor.Position, Vector2.new(0, actor.Size.Y / 2 + 6), actor)
        local vy = actor.Velocity.Y
        if jumpDown and not jumpWasDown and probe and probe.Normal.Y < -0.5 and vy >= -1 then
            vy = -script.JumpSpeed
        end
        actor.Velocity = Vector2.new(horizontal * script.Speed, vy)
        jumpWasDown = jumpDown
    end
end)
`;

export const CONTROLLER_DEFAULTS_2D = {
  Mode: 'TopDown',
  Speed: 240,
  JumpSpeed: 480,
  Gravity: 980,
  FollowCamera: true,
  LeftKey: 'a',
  RightKey: 'd',
  UpKey: 'w',
  DownKey: 's',
  JumpKey: ' ',
};
