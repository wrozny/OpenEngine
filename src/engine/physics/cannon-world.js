import * as CANNON from 'cannon-es';
import { Vector3 } from '../math.js';
import { GROUPS, MASKS } from './planck-world.js';
const vector = (v) => new CANNON.Vec3(v.X, v.Y, v.Z);

/** Cannon owns physical orientation; scene transforms stay independent of Three.js. */
export class CannonWorld {
  constructor(onContact) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0), allowSleep: true });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;
    for (const [event, name] of [
      ['beginContact', 'begin-contact'],
      ['endContact', 'end-contact'],
    ])
      this.world.addEventListener(event, ({ bodyA, bodyB }) => {
        // Cannon can retire an overlap after one body has already been removed.
        if (bodyA?.userData && bodyB?.userData)
          onContact({ a: bodyA.userData, b: bodyB.userData, event: name });
      });
  }
  setGravity(v) {
    this.world.gravity.copy(vector(v));
  }
  getGravity() {
    const g = this.world.gravity;
    return new Vector3(g.x, g.y, g.z);
  }
  create(node) {
    const shape =
      node.Shape === 'Sphere'
        ? new CANNON.Sphere(node.Size.X / 2)
        : node.Shape === 'Cylinder'
          ? new CANNON.Cylinder(node.Size.X / 2, node.Size.X / 2, node.Size.Y, 20)
          : new CANNON.Box(new CANNON.Vec3(node.Size.X / 2, node.Size.Y / 2, node.Size.Z / 2));
    const body = new CANNON.Body({
      mass: node.Anchored ? 0 : node.Mass,
      type: node.Anchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      position: vector(node.Position),
      velocity: vector(node.Velocity),
      fixedRotation: node.FixedRotation,
      shape,
      material: new CANNON.Material({ friction: node.Friction, restitution: node.Restitution }),
      collisionFilterGroup: GROUPS[node.CollisionGroup] || 1,
      collisionFilterMask: MASKS[node.CollisionGroup] ?? 0xffff,
      collisionResponse: !node.Sensor,
      linearDamping: 0.02,
      angularDamping: 0.15,
    });
    body.quaternion.setFromEuler(node.Rotation.X, node.Rotation.Y, node.Rotation.Z, 'YZX');
    body.userData = node;
    this.world.addBody(body);
    node._body = body;
  }
  remove(node) {
    if (node._body) this.world.removeBody(node._body);
    node._body = null;
  }
  setPosition(node, v) {
    if (node._body) {
      node._body.position.copy(vector(v));
      node._body.previousPosition.copy(node._body.position);
      node._body.aabbNeedsUpdate = true;
      node._body.wakeUp();
    }
  }
  setVelocity(node, v) {
    if (node._body) {
      node._body.velocity.copy(vector(v));
      node._body.wakeUp();
    }
  }
  setRotation(node) {
    if (node._body) {
      const r = node.Rotation;
      node._body.quaternion.setFromEuler(r.X, r.Y, r.Z, 'YZX');
      node._body.aabbNeedsUpdate = true;
      node._body.wakeUp();
    }
  }
  step(dt) {
    this.world.step(dt);
  }
  sync(node) {
    const b = node._body,
      r = new CANNON.Vec3();
    b.quaternion.toEuler(r, 'YZX');
    node._position = new Vector3(b.position.x, b.position.y, b.position.z);
    node._velocity = new Vector3(b.velocity.x, b.velocity.y, b.velocity.z);
    node._rotation = new Vector3(r.x, r.y, r.z);
  }
  raycast(origin, direction, ignore) {
    if (direction.Magnitude === 0) return;
    let closest;
    this.world.raycastAll(
      vector(origin),
      vector(origin.Add(direction)),
      { skipBackfaces: true, checkCollisionResponse: false },
      (hit) => {
        const node = hit.body.userData;
        if (
          node === ignore ||
          node.Sensor ||
          node.Destroyed ||
          (closest && hit.distance >= closest.Distance)
        )
          return;
        closest = {
          Instance: node,
          Position: new Vector3(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z),
          Normal: new Vector3(hit.hitNormalWorld.x, hit.hitNormalWorld.y, hit.hitNormalWorld.z),
          Distance: hit.distance,
        };
      },
    );
    return closest;
  }
}
