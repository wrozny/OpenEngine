import * as CANNON from 'cannon-es';
import * as planck from 'planck';
import { Vector2, Vector3 } from './math.js';
import { SCALE } from './physics/planck-world.js';

export const CAR_DEFAULTS = {
  Car3D: {
    WheelRadius: 0.38,
    WheelBase: 2.5,
    TrackWidth: 1.65,
    SuspensionRestLength: 0.45,
    SuspensionStiffness: 35,
    DampingCompression: 4.4,
    DampingRelaxation: 5.2,
    FrictionSlip: 3,
    EngineForce: 3200,
    MaxSpeed: 42,
    ReverseSpeed: 12,
    BrakeForce: 60,
    MaxSteer: 0.48,
    SteerSpeed: 3,
    HighSpeedSteer: 0.35,
  },
  Car2D: {
    WheelRadius: 14,
    WheelBase: 80,
    SuspensionRestLength: 20,
    SuspensionStiffness: 50,
    DampingCompression: 8,
    EngineForce: 40,
    BrakeForce: 10,
    MaxSteer: 0.35,
    SteerSpeed: 3,
  },
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
/** Native components own solver lifetime; scripts supply bounded driving intentions. */
export class VehicleSystem {
  constructor(engine) {
    this.engine = engine;
    this.entries = new Map();
  }
  update(dt) {
    const alive = new Set();
    for (const component of this.engine.nodes) {
      if (!CAR_DEFAULTS[component.ClassName] || !component.Enabled) continue;
      const actor = component.Parent;
      if (!actor?._body || actor.Anchored) continue;
      if (
        this.engine.role === 'client' &&
        actor._networkOwner !== this.engine.players.LocalPlayer?.UserId
      )
        continue;
      const three = component.ClassName === 'Car3D';
      if (actor.ClassName !== (three ? 'Object3D' : 'Object2D')) continue;
      alive.add(component);
      let state = this.entries.get(component);
      const signature = JSON.stringify(
        Object.keys(CAR_DEFAULTS[component.ClassName]).map((k) => component[k]),
      );
      if (state && (state.body !== actor._body || signature !== state.signature)) {
        this.remove(component);
        state = null;
      }
      if (!state) {
        state = { body: actor._body, actor, signature, steer: 0 };
        this.entries.set(component, state);
        if (three) this.create3D(component, state);
        else state.body.setFixedRotation(false);
      }
      const input = component._driveInput || { throttle: 0, steering: 0, brake: 1 };
      const maxDelta = component.SteerSpeed * dt;
      state.steer += clamp(input.steering - state.steer, -maxDelta, maxDelta);
      if (three) this.drive3D(component, state, input);
      else this.drive2D(component, state, input, dt);
    }
    for (const component of this.entries.keys()) if (!alive.has(component)) this.remove(component);
  }
  create3D(c, state) {
    const vehicle = new CANNON.RaycastVehicle({
      chassisBody: state.body,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });
    for (const z of [-c.WheelBase / 2, c.WheelBase / 2])
      for (const x of [-c.TrackWidth / 2, c.TrackWidth / 2])
        vehicle.addWheel({
          radius: c.WheelRadius,
          chassisConnectionPointLocal: new CANNON.Vec3(x, -state.actor.Size.Y * 0.25, z),
          directionLocal: new CANNON.Vec3(0, -1, 0),
          axleLocal: new CANNON.Vec3(-1, 0, 0),
          suspensionRestLength: c.SuspensionRestLength,
          suspensionStiffness: c.SuspensionStiffness,
          dampingCompression: c.DampingCompression,
          dampingRelaxation: c.DampingRelaxation,
          frictionSlip: c.FrictionSlip,
          rollInfluence: 0.06,
          maxSuspensionForce: 100000,
          maxSuspensionTravel: c.SuspensionRestLength,
          customSlidingRotationalSpeed: -30,
          useCustomSlidingRotationalSpeed: true,
        });
    vehicle.addToWorld(this.engine.world);
    state.vehicle = vehicle;
  }
  drive3D(c, state, input) {
    if (Math.abs(input.throttle) > 0.001) state.body.wakeUp();
    const forward = state.body.quaternion.vmult(new CANNON.Vec3(0, 0, -1)),
      signedSpeed = state.body.velocity.dot(forward);
    const cap = input.throttle >= 0 ? c.MaxSpeed : c.ReverseSpeed;
    const power =
      input.throttle * signedSpeed < 0
        ? 1
        : clamp(1 - Math.abs(signedSpeed) / Math.max(0.1, cap), 0, 1);
    const speed = state.body.velocity.length(),
      limit = c.MaxSteer / (1 + speed * c.HighSpeedSteer * 0.1);
    for (let i = 0; i < 4; i++) {
      state.vehicle.setSteeringValue(i < 2 ? state.steer * limit : 0, i);
      state.vehicle.applyEngineForce(i >= 2 ? input.throttle * c.EngineForce * power : 0, i);
      state.vehicle.setBrake(input.brake * c.BrakeForce, i);
    }
    c.Speed = speed;
  }
  drive2D(c, state, input, dt) {
    const body = state.body;
    let contacts = 0;
    const points = [];
    for (const x of [-c.WheelBase / 2, c.WheelBase / 2]) {
      const anchor = body.getWorldPoint(planck.Vec2(x / SCALE, 0));
      const down = body.getWorldVector(planck.Vec2(0, 1));
      const origin = new Vector2(anchor.x * SCALE, anchor.y * SCALE),
        length = c.SuspensionRestLength + c.WheelRadius;
      const hit = this.engine.raycast(
        origin,
        new Vector2(down.x * length, down.y * length),
        state.actor,
      );
      if (!hit) {
        points.push(origin.Add(new Vector2(down.x * length, down.y * length)));
        continue;
      }
      const compression = clamp((length - hit.Distance) / SCALE, 0, c.SuspensionRestLength / SCALE),
        velocity = body.getLinearVelocityFromWorldPoint(anchor),
        rate = velocity.x * down.x + velocity.y * down.y;
      const force = Math.max(0, compression * c.SuspensionStiffness + rate * c.DampingCompression);
      body.applyForce(planck.Vec2(-down.x * force, -down.y * force), anchor, true);
      points.push(hit.Position.Add(hit.Normal.Mul(c.WheelRadius)));
      contacts++;
    }
    const forward = body.getWorldVector(planck.Vec2(1, 0));
    if (contacts) {
      body.applyForceToCenter(
        planck.Vec2(
          forward.x * input.throttle * c.EngineForce,
          forward.y * input.throttle * c.EngineForce,
        ),
        true,
      );
      const velocity = body.getLinearVelocity();
      body.applyForceToCenter(
        planck.Vec2(
          -velocity.x * input.brake * c.BrakeForce,
          -velocity.y * input.brake * c.BrakeForce,
        ),
        true,
      );
    }
    body.setAngularVelocity(
      body.getAngularVelocity() * Math.exp(-dt * 2) + state.steer * c.MaxSteer * dt,
    );
    state.points = points;
    c.Speed = state.actor.Velocity.Magnitude;
  }
  wheel(component, index) {
    const state = this.entries.get(component);
    if (!state) return null;
    if (state.vehicle) {
      if (!Number.isInteger(index) || index < 1 || index > 4) return null;
      state.vehicle.updateWheelTransform(index - 1);
      const p = state.vehicle.wheelInfos[index - 1].worldTransform.position;
      return new Vector3(p.x, p.y, p.z);
    }
    return state.points?.[index - 1] || null;
  }
  remove(component) {
    const state = this.entries.get(component);
    if (!state) return;
    if (state.vehicle) {
      state.vehicle.removeFromWorld(this.engine.world);
      if (!this.disposed && state.actor._body === state.body && state.actor._engine === this.engine)
        this.engine.world.addBody(state.body);
    }
    if (component.ClassName === 'Car2D') state.body.setFixedRotation(true);
    this.entries.delete(component);
  }
  dispose() {
    this.disposed = true;
    for (const c of this.entries.keys()) this.remove(c);
  }
}
