/** World units are pixels; angles are radians; positive Y points down. */
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.X = Number(x);
    this.Y = Number(y);
    Object.freeze(this);
  }
  get Magnitude() {
    return Math.hypot(this.X, this.Y);
  }
  get Unit() {
    return this.Magnitude > 0 ? this.Div(this.Magnitude) : new Vector2();
  }
  Add(v) {
    return new Vector2(this.X + v.X, this.Y + v.Y);
  }
  Sub(v) {
    return new Vector2(this.X - v.X, this.Y - v.Y);
  }
  Mul(n) {
    return new Vector2(this.X * n, this.Y * n);
  }
  Div(n) {
    return new Vector2(this.X / n, this.Y / n);
  }
  Dot(v) {
    return this.X * v.X + this.Y * v.Y;
  }
  Distance(v) {
    return this.Sub(v).Magnitude;
  }
  Lerp(v, t) {
    return this.Add(v.Sub(this).Mul(t));
  }
}
export const math = {
  Clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  Lerp: (a, b, t) => a + (b - a) * t,
  Distance: (a, b) => a.Distance(b),
  OverlapCircle: (a, radiusA, b, radiusB) => a.Distance(b) <= radiusA + radiusB,
};
