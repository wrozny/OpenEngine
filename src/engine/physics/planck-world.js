import * as planck from 'planck';
import { Vector2 } from '../math.js';
export const SCALE = 50;
export const GROUPS = { world: 1, player: 2, zombie: 4, projectile: 8, decoration: 16 };
export const MASKS = { world: 15, player: 5, zombie: 15, projectile: 5, decoration: 0 };

/** Owns Box2D bodies and converts pixel coordinates only at this boundary. */
export class PlanckWorld {
  constructor(onContact) {
    this.world = new planck.World(planck.Vec2(0, 0));
    for (const event of ['begin-contact', 'end-contact'])
      this.world.on(event, (contact) =>
        onContact({
          a: contact.getFixtureA().getBody().getUserData(),
          b: contact.getFixtureB().getBody().getUserData(),
          event,
        }),
      );
  }
  vector(v) {
    return planck.Vec2(v.X / SCALE, v.Y / SCALE);
  }
  setGravity(v) {
    this.world.setGravity(this.vector(v));
  }
  getGravity() {
    const v = this.world.getGravity();
    return new Vector2(v.x * SCALE, v.y * SCALE);
  }
  create(node) {
    const body = this.world.createBody({
      type: node.Anchored ? 'static' : 'dynamic',
      position: this.vector(node.Position),
      angle: node.Rotation || 0,
      fixedRotation: true,
      bullet: node.CollisionGroup === 'projectile',
      userData: node,
    });
    const shape =
      node.Shape === 'Circle'
        ? planck.Circle(node.Size.X / (2 * SCALE))
        : planck.Box(node.Size.X / (2 * SCALE), node.Size.Y / (2 * SCALE));
    body.createFixture(shape, {
      density: 1,
      friction: node.Friction,
      restitution: node.Restitution,
      isSensor: node.Sensor,
      filterCategoryBits: GROUPS[node.CollisionGroup] || 1,
      filterMaskBits: MASKS[node.CollisionGroup] ?? 0xffff,
    });
    body.setLinearVelocity(this.vector(node.Velocity));
    node._body = body;
  }
  remove(node) {
    if (node._body) this.world.destroyBody(node._body);
    node._body = null;
  }
  setPosition(node, v) {
    node._body?.setPosition(this.vector(v));
  }
  setVelocity(node, v) {
    node._body?.setLinearVelocity(this.vector(v));
  }
  setRotation(node) {
    node._body?.setAngle(node.Rotation);
  }
  step(dt) {
    this.world.step(dt, 8, 3);
  }
  sync(node) {
    const p = node._body.getPosition(),
      v = node._body.getLinearVelocity();
    node._position = new Vector2(p.x * SCALE, p.y * SCALE);
    node._velocity = new Vector2(v.x * SCALE, v.y * SCALE);
    node._rotation = node._body.getAngle();
  }
  canCollide(a, b) {
    const x = a?._body?.getFixtureList(),
      y = b?._body?.getFixtureList();
    return (
      x &&
      y &&
      x.getFilterCategoryBits() & y.getFilterMaskBits() &&
      y.getFilterCategoryBits() & x.getFilterMaskBits()
    );
  }
  overlapsBox(center, size, ignore) {
    const shape = planck.Box(size.X / (2 * SCALE), size.Y / (2 * SCALE));
    const transform = planck.Transform(this.vector(center), 0);
    let overlaps = false;
    const half = this.vector(size).mul(0.5),
      point = this.vector(center);
    this.world.queryAABB(
      new planck.AABB(planck.Vec2.sub(point, half), planck.Vec2.add(point, half)),
      (fixture) => {
        const node = fixture.getBody().getUserData();
        if (
          node !== ignore &&
          !node.Sensor &&
          this.canCollide(node, ignore) &&
          planck.testOverlap(
            shape,
            0,
            fixture.getShape(),
            0,
            transform,
            fixture.getBody().getTransform(),
          )
        ) {
          overlaps = true;
          return false;
        }
        return true;
      },
    );
    return overlaps;
  }
  raycast(origin, direction, ignore, respectCollision = false) {
    let result;
    if (direction.Magnitude === 0) return;
    this.world.rayCast(
      this.vector(origin),
      this.vector(origin.Add(direction)),
      (fixture, point, normal, fraction) => {
        const node = fixture.getBody().getUserData();
        if (
          node === ignore ||
          node.Sensor ||
          node.Destroyed ||
          (respectCollision && !this.canCollide(node, ignore))
        )
          return -1;
        result = {
          Instance: node,
          Position: new Vector2(point.x * SCALE, point.y * SCALE),
          Normal: new Vector2(normal.x, normal.y),
          Distance: direction.Magnitude * fraction,
        };
        return fraction;
      },
    );
    return result;
  }
}
