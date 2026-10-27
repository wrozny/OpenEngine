local Players = game:GetService("Players")
local Run = game:GetService("RunService")
local Input = game:GetService("InputService")
local Camera = game:GetService("Camera")
local UI = game:GetService("UIService")
local player = Players.LocalPlayer
local state = workspace.RaceState
UI:CreateLabel("title", "APEX CIRCUIT / RAYCAST RACING", 24, 24)
UI:SetColor("title", "#86dacf")
UI:CreateLabel("status", "Waiting for grid", 24, 58)
UI:CreateLabel("progress", "", 24, 90)
UI:CreateLabel("help", "W/S throttle / reverse · A/D steer · Space brake · R recover", 24, 122)
local wheels = {}
local cabin = nil
Input.Began:Connect(function(key)
    if key == "r" then workspace.Recover:FireServer() end
end)
Run.Heartbeat:Connect(function()
    local car = player.Character
    if not car or car.Destroyed then return end
    local motor = car:FindFirstChild("Drive")
    if not motor then return end
    local enabled = car:GetAttribute("CanDrive")
    motor:SetInput(enabled and Input:GetAxis("s", "w") or 0, -Input:GetAxis("a", "d"),
        (not enabled or Input:IsKeyDown("space")) and 1 or 0)
    Camera.Follow = car
    Camera.Offset = Vector3.new(0, 1.7, 0)
    Camera.Yaw = car.Rotation.Y
    Camera.Pitch = -0.2
    Camera.Distance = 9 + math.min(4, motor.Speed * 0.08)
    local phase = state:GetAttribute("Phase") or "Countdown"
    local winner = state:GetAttribute("Winner") or ""
    UI:SetText("status", phase == "Results" and (winner ~= "" and winner .. " WINS!" or "Time expired") or (phase .. " · " .. tostring(state:GetAttribute("Remaining") or 0) .. "s"))
    UI:SetText("progress", string.format("Round %d · Checkpoint %d / 4 · %d km/h", state:GetAttribute("Round") or 0,
        math.min(4, car:GetAttribute("Checkpoint") or 1), math.floor(motor.Speed * 3.6)))
end)
Run.PostSimulation:Connect(function()
    local car = player.Character
    if not car or car.Destroyed then return end
    local motor = car:FindFirstChild("Drive")
    if not motor then return end
    if not cabin or cabin.Destroyed then
        cabin = Instance.new("Object3D")
        cabin.Name = "Local cockpit"
        cabin.Size = Vector3.new(1.35, 0.55, 1.6)
        cabin.Color, cabin.CollisionGroup = "#294151", "decoration"
        cabin.Parent = car
    end
    cabin.Position = car.Position:Add(Vector3.new(0,0.5,0))
    cabin.Rotation = car.Rotation
    for i = 1, 4 do
        local point = motor:GetWheelPosition(i)
        if point then
            if not wheels[i] or wheels[i].Destroyed then
                local wheel = Instance.new("Object3D")
                wheel.Name, wheel.Shape = "Local wheel", "Sphere"
                wheel.Size = Vector3.new(0.5, 0.76, 0.76)
                wheel.Color, wheel.CollisionGroup = "#171e28", "decoration"
                wheel.Parent = car
                wheels[i] = wheel
            end
            wheels[i].Position = point
        end
    end
end)
