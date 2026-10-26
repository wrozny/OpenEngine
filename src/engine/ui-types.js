/** Scale follows the parent; offset adds design pixels. Immutable values tween and serialize safely. */
export class UDim2 {
  constructor(xScale = 0, xOffset = 0, yScale = 0, yOffset = 0) {
    if (![xScale, xOffset, yScale, yOffset].every(Number.isFinite))
      throw new Error('UDim2 components must be finite');
    Object.assign(this, { XScale: xScale, XOffset: xOffset, YScale: yScale, YOffset: yOffset });
    Object.freeze(this);
  }
  Lerp(other, t) {
    return new UDim2(
      ...['XScale', 'XOffset', 'YScale', 'YOffset'].map(
        (key) => this[key] + (other[key] - this[key]) * t,
      ),
    );
  }
  static from(value) {
    return new UDim2(value.XScale, value.XOffset, value.YScale, value.YOffset);
  }
}
