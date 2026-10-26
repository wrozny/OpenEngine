import { LEGACY_CONTROLLERS } from './legacy-controllers.js';
/** Editable Lua templates: controllers use the same API as project-authored Scripts. */
export const CONTROLLER_2D = `local actor = script.Parent
assert(actor and actor:IsA("Object2D"), "PlayerController2D must be inside an Object2D")
local input = game:GetService("InputService")
local run = game:GetService("RunService")
local camera = game:GetService("Camera")
local physics = game:GetService("PhysicsService")
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
        local probe = physics:GetGround(actor, script.MaxSlopeAngle)
        local vy = actor.Velocity.Y
        if jumpDown and not jumpWasDown and probe and probe.Normal.Y < -0.5 and vy >= -1 then
            vy = -script.JumpSpeed
        end
        physics:MoveCharacter(actor, Vector2.new(horizontal * script.Speed, vy), dt, script.StepHeight, script.MaxSlopeAngle)
        jumpWasDown = jumpDown
    end
end)
`;

export const CONTROLLER_DEFAULTS_2D = {
  Mode: 'TopDown',
  Speed: 240,
  JumpSpeed: 480,
  StepHeight: 14,
  MaxSlopeAngle: 50,
  Gravity: 980,
  FollowCamera: true,
  LeftKey: 'a',
  RightKey: 'd',
  UpKey: 'w',
  DownKey: 's',
  JumpKey: ' ',
};

export const CONTROLLER_DEFAULTS_3D = {
  Mode: 'Platformer',
  Speed: 7,
  JumpSpeed: 9,
  StepHeight: 0.45,
  MaxSlopeAngle: 50,
  FlySpeed: 12,
  LookSensitivity: 0.003,
  FollowCamera: true,
  LeftKey: 'a',
  RightKey: 'd',
  ForwardKey: 'w',
  BackKey: 's',
  JumpKey: ' ',
  DownKey: 'control',
};
export const CONTROLLER_3D = `local actor = script.Parent
assert(actor and actor:IsA("Object3D"), "PlayerController3D must be inside an Object3D")
local input = game:GetService("InputService")
local camera = game:GetService("Camera")
local run = game:GetService("RunService")
local physics = game:GetService("PhysicsService")
local free = script.Mode == "FreeCamera"
actor.Anchored = free
actor.Friction = 0
actor.FixedRotation = true
if free then actor.Sensor = true end
if script.FollowCamera then camera.Follow = actor; camera.FirstPerson = free end
local jumpWasDown = false
run.Heartbeat:Connect(function(dt)
    if input:IsMouseDown(2) then
        local delta = input:ConsumeMouseDelta()
        camera.Yaw = camera.Yaw - delta.X * script.LookSensitivity
        camera.Pitch = math.max(-1.35, math.min(1.35, camera.Pitch - delta.Y * script.LookSensitivity))
    end
    local x = input:GetAxis(script.LeftKey, script.RightKey)
    local forward = input:GetAxis(script.BackKey, script.ForwardKey)
    local yaw = camera.Yaw
    local direction = Vector3.new(x * math.cos(yaw) - forward * math.sin(yaw), 0, -x * math.sin(yaw) - forward * math.cos(yaw))
    if free then
        local vertical = input:GetAxis(script.DownKey, script.JumpKey)
        direction = direction:Add(Vector3.new(0, vertical + forward * math.sin(camera.Pitch), 0))
        actor.Position = actor.Position:Add(direction.Unit:Mul(script.FlySpeed * dt))
        actor.Velocity = Vector3.new()
    else
        local vy = actor.Velocity.Y
        local jump = input:IsKeyDown(script.JumpKey)
        local probe = physics:GetGround(actor, script.MaxSlopeAngle)
        if jump and not jumpWasDown and probe and probe.Normal.Y > 0.5 and vy < 1 then vy = script.JumpSpeed end
        local walk = direction.Unit:Mul(script.Speed)
        physics:MoveCharacter(actor, Vector3.new(walk.X, vy, walk.Z), dt, script.StepHeight, script.MaxSlopeAngle)
        jumpWasDown = jump
    end
end)
`;

export function upgradeControllerSource(source, className) {
  return source === undefined || LEGACY_CONTROLLERS[className]?.includes(source)
    ? className === 'PlayerController3D'
      ? CONTROLLER_3D
      : CONTROLLER_2D
    : source;
}
