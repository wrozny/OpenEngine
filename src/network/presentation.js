const shortest = (from, to, alpha) =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * alpha;

/** Rendering smooths remote snapshots without changing authoritative collision/query transforms. */
export class ReplicaPresentation {
  constructor() {
    this.samples = new Map();
  }
  capture(node, position, rotation, snap = false, now = performance.now()) {
    const current = this.get(node, now);
    this.samples.set(node.Id, {
      from: snap ? position : current.Position,
      to: position,
      rotationFrom: snap ? rotation : current.Rotation,
      rotationTo: rotation,
      at: now,
    });
  }
  get(node, now = performance.now()) {
    const sample = this.samples.get(node.Id);
    if (!sample) return node;
    const alpha = Math.min(1, Math.max(0, (now - sample.at) / 50));
    const rotation =
      typeof sample.rotationTo === 'number'
        ? shortest(sample.rotationFrom, sample.rotationTo, alpha)
        : new sample.rotationTo.constructor(
            ...['X', 'Y', 'Z'].map((key) =>
              shortest(sample.rotationFrom[key], sample.rotationTo[key], alpha),
            ),
          );
    return { Position: sample.from.Lerp(sample.to, alpha), Rotation: rotation };
  }
}
