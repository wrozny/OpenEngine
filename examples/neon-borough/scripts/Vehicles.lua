-- Server-only arcade handling. Cosmetic parts follow in PostSimulation, after physics has moved the chassis.
local physics = game:GetService("PhysicsService")
local run = game:GetService("RunService")
local config = require(script.Parent.Parent.Config)
local Vehicles = {}
local function approach(value, target, amount)
    if value < target then return math.min(target, value + amount) end
    return math.max(target, value - amount)
end
function Vehicles.Load(onImpact)
    local cars = {}
    for _, body in ipairs(workspace.Cars:GetChildren()) do
        if body:IsA("Object3D") and body:GetAttribute("Vehicle") then
            -- The velocity motor supplies traction and braking; contact friction would fight low-speed acceleration.
            body.Friction = 0
            local car = { body = body, home = body.Position, parts = {}, heading = 0,
                speed = 0, throttle = 0, steer = 0, lastInput = 0, lastImpact = -10 }
            for _, part in ipairs(workspace.CarDetails:GetChildren()) do
                if part:GetAttribute("Car") == body.Name then
                    table.insert(car.parts, { object = part, offset = part.Position:Sub(body.Position) })
                end
            end
            body.OnCollision:Connect(function(target)
                local speed = Vector3.new(body.Velocity.X,0,body.Velocity.Z).Magnitude
                if car.driver and target ~= car.driver.Character and speed >= config.RamMinSpeed
                    and run.Time - car.lastImpact > 0.75 and target:GetAttribute("Health") then
                    car.lastImpact = run.Time
                    onImpact(target, config.RamDamage, car.driver)
                end
            end)
            table.insert(cars, car)
        end
    end
    return cars
end
function Vehicles.Update(cars, dt, exitCar)
    for _, car in ipairs(cars) do
        if not car.driver or run.Time - car.lastInput > 0.5 then car.throttle, car.steer = 0, 0 end
        local target = car.throttle * (car.throttle >= 0 and config.CarSpeed or config.CarReverseSpeed)
        local braking = target == 0 or target * car.speed < 0
        car.speed = approach(car.speed, target, (braking and config.CarBraking or config.CarAcceleration) * dt)
        if math.abs(car.speed) > 0.1 then
            car.heading = car.heading - car.steer * config.CarTurnSpeed * dt
                * math.min(1, math.abs(car.speed) / 5) * (car.speed > 0 and 1 or -1)
        end
        car.body.Rotation = Vector3.new(0, car.heading, 0)
        local velocity = Vector3.new(-math.sin(car.heading) * car.speed, car.body.Velocity.Y, -math.cos(car.heading) * car.speed)
        physics:MoveCharacter(car.body, velocity, dt, config.CarStepHeight, 40)
        if car.body.Position.Y < -10 or car.body.Position.Magnitude > 200 then
            if car.driver then exitCar(car.driver) end
            car.body.Position, car.body.Velocity = car.home, Vector3.new()
            car.heading, car.speed = 0, 0
        end
    end
end
function Vehicles.Follow(cars)
    for _, car in ipairs(cars) do
        local c, s = math.cos(car.heading), math.sin(car.heading)
        for _, part in ipairs(car.parts) do
            local o = part.offset
            part.object.Position = car.body.Position:Add(Vector3.new(o.X*c+o.Z*s, o.Y, -o.X*s+o.Z*c))
            part.object.Rotation = car.body.Rotation
        end
        if car.driver and car.driver.Character then
            local actor = car.driver.Character
            actor.Position = car.body.Position:Add(Vector3.new(0, 0.8, 0))
            actor.Velocity, actor.Visible = Vector3.new(), false
        end
    end
end
return Vehicles
