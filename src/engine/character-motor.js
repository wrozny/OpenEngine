import { Vector2, Vector3 } from './math.js';

function settings(engine, actor, slopeAngle) {
  if (!engine.isPhysical(actor) || !actor._body || actor.Destroyed)
    throw new Error('Character movement needs a physical object in Workspace');
  if (!Number.isFinite(slopeAngle) || slopeAngle < 0 || slopeAngle > 85)
    throw new Error('MaxSlopeAngle must be between 0 and 85 degrees');
  const three = engine.dimension === '3D';
  const skin = Math.min(
    three ? 0.025 : 1,
    actor.Size.X / 10,
    actor.Size.Y / 10,
    three ? actor.Size.Z / 10 : Infinity,
  );
  return {
    three,
    skin,
    up: three ? new Vector3(0, 1, 0) : new Vector2(0, -1),
    probe: Math.min(three ? 0.18 : 6, actor.Size.Y / 4),
    minimumNormal: Math.cos((slopeAngle * Math.PI) / 180),
  };
}
function footprint(actor, { three, skin }) {
  const x = Math.max(0, actor.Size.X / 2 - skin);
  if (!three) return [new Vector2(), new Vector2(-x, 0), new Vector2(x, 0)];
  const z = Math.max(0, actor.Size.Z / 2 - skin),
    yaw = actor.Rotation.Y;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [
    new Vector3(),
    ...[-x, x].flatMap((a) => [-z, z].map((b) => new Vector3(a * c + b * s, 0, -a * s + b * c))),
  ];
}
function ground(engine, actor, config, distance) {
  const { up, skin, minimumNormal } = config;
  const halfHeight = actor.Size.Y / 2;
  let nearest;
  for (const offset of footprint(actor, config)) {
    const hit = engine.physicsWorld.raycast(
      actor.Position.Add(offset),
      up.Mul(-halfHeight - distance),
      actor,
      true,
    );
    if (!hit || hit.Normal.Dot(up) < minimumNormal || hit.Distance < halfHeight - skin * 2)
      continue;
    if (!nearest || hit.Distance < nearest.Distance) nearest = hit;
  }
  return nearest;
}

/** Multiple foot probes support edges and ramps; walls and sensors never count as ground. */
export function getCharacterGround(engine, actor, slopeAngle = 50, distance) {
  const config = settings(engine, actor, slopeAngle);
  distance ??= config.probe;
  if (!Number.isFinite(distance) || distance < 0)
    throw new Error('Ground probe distance must be nonnegative');
  return ground(engine, actor, config, distance);
}

/** Upright character/arcade-car motor. Steps require ground, a walkable top, and full body/head clearance. */
export function moveCharacter(engine, actor, velocity, deltaTime, stepHeight, slopeAngle = 50) {
  const config = settings(engine, actor, slopeAngle);
  const { up, skin, three, minimumNormal } = config;
  velocity = actor.vector(velocity);
  stepHeight ??= three ? 0.45 : 14;
  if (
    !Number.isFinite(stepHeight) ||
    stepHeight < 0 ||
    !Number.isFinite(deltaTime) ||
    deltaTime < 0
  )
    throw new Error('StepHeight and delta time must be finite and nonnegative');
  if (actor.Anchored || actor.Sensor) return;
  const vertical = velocity.Dot(up),
    horizontal = velocity.Sub(up.Mul(vertical));
  const support = ground(engine, actor, config, config.probe);
  const tolerance = three ? 0.5 : 15;
  const walking =
    horizontal.Magnitude > 1e-6 &&
    (vertical <= tolerance || (support && velocity.Dot(support.Normal) <= tolerance));
  if (support && walking) {
    const direction = horizontal.Unit;
    const travel = horizontal.Mul(Math.min(deltaTime, 0.1));
    const offsets = footprint(actor, config);
    const foot = actor.Position.Sub(up.Mul(actor.Size.Y / 2));
    // Probe the whole footprint. A single center ray misses corners at oblique curb approaches.
    const obstacles = offsets
      .map((offset) =>
        engine.physicsWorld.raycast(
          foot.Add(offset).Add(up.Mul(skin)),
          direction.Mul(travel.Magnitude + skin * 2),
          actor,
          true,
        ),
      )
      .filter(Boolean);
    if (obstacles.some((hit) => hit.Normal.Dot(up) > 0.01 && hit.Normal.Dot(up) < minimumNormal)) {
      actor.Velocity = up.Mul(Math.min(0, vertical));
      return support;
    }
    let top;
    if (obstacles.length && stepHeight > 0)
      for (const offset of offsets) {
        const ahead = foot
          .Add(offset)
          .Add(travel)
          .Add(direction.Mul(skin * 2));
        const hit = engine.physicsWorld.raycast(
          ahead.Add(up.Mul(stepHeight + skin)),
          up.Mul(-stepHeight - config.probe - skin),
          actor,
          true,
        );
        if (
          hit &&
          hit.Normal.Dot(up) >= minimumNormal &&
          (!top || hit.Position.Dot(up) > top.Position.Dot(up))
        )
          top = hit;
      }
    if (top && top.Normal.Dot(up) >= minimumNormal && stepHeight > 0) {
      const rise = top.Position.Sub(foot).Dot(up);
      if (rise > skin && rise <= stepHeight + skin) {
        const lift = rise + skin;
        const shrunken = three
          ? new Vector3(
              Math.max(skin, actor.Size.X - skin * 2),
              actor.Size.Y - skin * 2,
              Math.max(skin, actor.Size.Z - skin * 2),
            )
          : new Vector2(Math.max(skin, actor.Size.X - skin * 2), actor.Size.Y - skin * 2);
        const sweptSize = three
          ? new Vector3(shrunken.X, shrunken.Y + lift, shrunken.Z)
          : new Vector2(shrunken.X, shrunken.Y + lift);
        const raised = actor.Position.Add(up.Mul(lift));
        if (
          !engine.physicsWorld.overlapsBox(
            actor.Position.Add(up.Mul(lift / 2)),
            sweptSize,
            actor,
          ) &&
          !engine.physicsWorld.overlapsBox(raised.Add(travel), shrunken, actor)
        )
          actor.Position = raised;
      }
    }
    const slopeVelocity = horizontal
      .Sub(support.Normal.Mul(horizontal.Dot(support.Normal)))
      .Unit.Mul(horizontal.Magnitude);
    // Jump velocity is left untouched; ground walking follows the support plane in either direction.
    velocity = slopeVelocity;
  }
  actor.Velocity = velocity;
  return support;
}
