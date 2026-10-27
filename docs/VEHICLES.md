# Native raycast vehicles and editor workflow (0.6)

Use **Library** to find objects, UI modifiers and behavior snippets. Click to insert, or drag an item onto an Explorer parent. The selected project dimension determines whether Car2D or Car3D can be inserted. Dropping a car without a physical parent creates its chassis. Add the **Drive car** behavior under the motor for local control: Script in standalone, LocalScript in multiplayer. Configure gravity before driving a 2D side-view car.

## Car3D

Car3D is a native **component**, directly under an unanchored Object3D chassis. It uses Cannon's established RaycastVehicle: four independent suspension rays, spring/damper response, wheel contact friction, rear-wheel drive and front-wheel steering. No wheel rigid-body constraints or hand-built wheel solver is used. The chassis can roll, pitch and collide normally; keep FixedRotation=false. A useful chassis is Size `(1.8,0.65,3.6)`, Mass `700`, starting Position `(0,2,0)`. Forward is local **−Z**. Never put a PlayerController on the same chassis.

```lua
local motor = script.Parent -- Car3D or Car2D
local input = game:GetService("InputService")
local run = game:GetService("RunService")
run.Heartbeat:Connect(function()
    motor:SetInput(input:GetAxis("s", "w"), -input:GetAxis("a", "d"),
        input:IsKeyDown("space") and 1 or 0)
end)
```

`SetInput(throttle, steering=0, brake=0)` accepts finite numbers. Throttle and steering clamp to −1..1; brake clamps to 0..1. Default idle input holds the brakes. Steering ramps at SteerSpeed and reduces its maximum at high speed. Inputs remain until changed; your script should submit neutral/brake input when gameplay loses control. InputService itself clears held input on blur.

`Speed` is the current unsigned speed in world units/second. `GetWheelPosition(index)` returns the world position of a suspension wheel or nil before initialization. Indices 1/2 are front left/right, 3/4 rear left/right. Wheel graphics are deliberately separate from physics: create cosmetic objects and follow these positions in PostSimulation. Apex Circuit demonstrates local wheel cosmetics. They are visual spheres rather than skeletal/tire animations.

| Property                              | Default                                           |
| ------------------------------------- | ------------------------------------------------- |
| Enabled                               | true                                              |
| WheelRadius, WheelBase, TrackWidth    | 0.38 m, 2.5 m, 1.65 m                             |
| SuspensionRestLength                  | 0.45 m                                            |
| SuspensionStiffness                   | 35                                                |
| DampingCompression, DampingRelaxation | 4.4, 5.2                                          |
| FrictionSlip                          | 3                                                 |
| MaxSpeed, ReverseSpeed                | 42 m/s, 12 m/s; power tapers near these speeds    |
| EngineForce, BrakeForce               | 3200, 60                                          |
| MaxSteer, SteerSpeed                  | 0.48 radians, 3 normalized units/second           |
| HighSpeedSteer                        | 0.35; larger values reduce steering more at speed |

Car properties serialize and appear in Properties. Changing tuning rebuilds the native vehicle on the next simulation step. Disabling/removing a component releases its solver subscription while leaving the chassis as a normal rigid body. Destroying a chassis or replacing its body cleans up its vehicle. Avoid multiple motors on one chassis.

## Car2D

Car2D is a **side-view** suspension car, not a top-down kart. Put it directly under an unanchored Object2D, typically Size `(100,30)`. Use `PhysicsService:SetGravity(Vector2.new(0,980))` and terrain below it (positive Y is down). Two rays support its front/rear wheel contact, spring forces act at each attachment, and throttle drives along the chassis's local X direction. Steering provides lean/rotation assistance; it does not turn a 2D side-view car around a 3D road. The component allows chassis rotation while active and restores the normal fixed-rotation 2D mode when removed.

Defaults: WheelRadius=14 px, WheelBase=80 px, SuspensionRestLength=20 px, SuspensionStiffness=50, DampingCompression=8, EngineForce=40, BrakeForce=10, MaxSteer=0.35, SteerSpeed=3. `GetWheelPosition` has indices 1 and 2. These are an arcade driving foundation: tune against your chassis size and world gravity. A body alone does not draw wheels automatically.

## More physics

`object:ApplyImpulse(vector)` applies an instantaneous impulse at the center of a live Object2D/Object3D body. Use a matching finite Vector2/Vector3. The 2D adapter converts pixel-space impulse components to physics units; 3D uses Cannon's meter-based impulse. This is distinct from assigning Velocity; mass affects impulse response. Existing Raycast, GetGround, MoveCharacter, collision transitions and GetTouchingObjects remain available. There is no public arbitrary force-at-point/joint/wheel constraint API.

## Multiplayer presentation

An owned car simulates immediately on its owning client. The server controls the lease and game rules. Remote objects render through a short **100 ms snapshot buffer**, interpolate shortest-path angles, and extrapolate velocity for at most **150 ms** if updates pause; after that they hold position. Small owner position corrections ease out over roughly 90 ms; large teleports snap. Collision/query bodies receive authoritative state immediately and are not displaced by render smoothing.

This handles ordinary jitter and gives local physics immediate response. It is not input-history rollback, a competitive anti-cheat system or a way to hide arbitrary packet loss. Visual latency and prediction error still depend on the connection. Leased physics uses the existing server movement bounds; keep sensitive racing/combat rules on the host.

## Apex Circuit

Open the **Apex Circuit** example in Studio and press Play; Add client tests multiple drivers. WASD drives, Space brakes, R recovers with a server-side cooldown. A countdown starts a three-minute race; the first driver through all four checkpoints in order wins. Results show for eight seconds, then cars reset for another round. A solo connection can practice. Late arrivals during a race spectate until the next round.

The host tracks checkpoints and results; client scripts control owned motors, camera and local HUD/wheels. The circuit contains barriers, an infield, road markings and rolling terrain. Recovery returns to the last completed checkpoint (or the grid before the first). Physics leases have coarse movement guards rather than racing anti-cheat. Track cutting and high-latency competitive fairness need additional game-specific rules for production competition.
