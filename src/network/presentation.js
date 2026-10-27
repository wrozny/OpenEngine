const shortest = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const rotation = (a, b, t) =>
  typeof b === 'number'
    ? shortest(a, b, t)
    : new b.constructor(...['X', 'Y', 'Z'].map((k) => shortest(a[k], b[k], t)));
/** Jitter-buffered remote rendering and bounded extrapolation never change query bodies. */
export class ReplicaPresentation {
  constructor() {
    this.samples = new Map();
    this.corrections = new Map();
  }
  capture(node, position, angle, snap = false, now = performance.now(), velocity = node.Velocity) {
    let history = this.samples.get(node.Id) || [];
    const last = history.at(-1),
      threshold = node.ClassName === 'Object2D' ? 500 : 12;
    if (snap || (last && last.Position.Distance(position) > threshold)) history = [];
    history.push({ Position: position, Rotation: angle, Velocity: velocity, at: now });
    while (history.length > 8) history.shift();
    this.samples.set(node.Id, history);
  }
  correct(node, position, now = performance.now()) {
    const current = this.owned(node, now).Position,
      error = current.Sub(position),
      limit = node.ClassName === 'Object2D' ? 150 : 3;
    if (error.Magnitude > limit) this.corrections.delete(node.Id);
    else this.corrections.set(node.Id, { error, at: now });
  }
  owned(node, now = performance.now()) {
    const correction = this.corrections.get(node.Id);
    if (!correction) return node;
    const t = Math.exp(-(now - correction.at) / 90);
    if (t < 0.005) {
      this.corrections.delete(node.Id);
      return node;
    }
    return { Position: node.Position.Add(correction.error.Mul(t)), Rotation: node.Rotation };
  }
  get(node, now = performance.now()) {
    const history = this.samples.get(node.Id);
    if (!history?.length) return node;
    const newest = history.at(-1),
      target = now - 100;
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1],
        b = history[i];
      if (target >= a.at && target <= b.at) {
        const t = (target - a.at) / Math.max(1, b.at - a.at);
        return {
          Position: a.Position.Lerp(b.Position, t),
          Rotation: rotation(a.Rotation, b.Rotation, t),
        };
      }
    }
    if (target < history[0].at) return history[0];
    const dt = Math.max(0, Math.min(0.15, (target - newest.at) / 1000));
    return {
      Position: newest.Velocity ? newest.Position.Add(newest.Velocity.Mul(dt)) : newest.Position,
      Rotation: newest.Rotation,
    };
  }
}
