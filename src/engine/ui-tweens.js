import { UDim2 } from './ui-types.js';
import { Vector2 } from './math.js';
import { Signal } from './signal.js';
import { isUIElement, UI_EASINGS } from './ui-schema.js';
const easing = {
  Linear: (t) => t,
  OutQuad: (t) => 1 - (1 - t) ** 2,
  OutCubic: (t) => 1 - (1 - t) ** 3,
  InOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  OutBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};
const colors = new Set(['BackgroundColor', 'TextColor', 'BorderColor']);
const scalars = new Set([
  'Opacity',
  'BackgroundOpacity',
  'CornerRadius',
  'BorderWidth',
  'TextSize',
]);
const rgb = (value) =>
  /^#[a-f\d]{6}$/i.test(value) ? [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) : null;
function interpolate(from, to, t) {
  if (typeof from === 'number') return from + (to - from) * t;
  if (from instanceof UDim2 || from instanceof Vector2) return from.Lerp(to, t);
  const a = rgb(from),
    b = rgb(to);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(Math.max(0, Math.min(255, v + (b[i] - v) * t)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export class UITweens {
  constructor(engine) {
    this.engine = engine;
    this.active = new Set();
  }
  create(target, goals, duration = 0.25, curve = 'OutCubic') {
    if (
      !isUIElement(target) ||
      target.Destroyed ||
      !goals ||
      typeof goals !== 'object' ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 3600 ||
      !UI_EASINGS.includes(curve)
    )
      throw new Error('Invalid UI tween');
    const values = [];
    for (const [key, value] of Object.entries(goals)) {
      let goal = value,
        from = target[key];
      if (key === 'Position' || key === 'Size') {
        from = UDim2.from(from);
        goal = UDim2.from(value);
      } else if (key === 'AnchorPoint') {
        from = new Vector2(from.X, from.Y);
        goal = new Vector2(value.X, value.Y);
      } else if (colors.has(key)) {
        if (!rgb(from) || !rgb(value)) throw new Error('Tween colors must use #RRGGBB');
      } else if (
        !scalars.has(key) ||
        !Number.isFinite(value) ||
        value < 0 ||
        (['Opacity', 'BackgroundOpacity'].includes(key) && value > 1)
      )
        throw new Error('Unsupported tween property: ' + key);
      values.push({ key, from, goal });
    }
    if (!values.length) throw new Error('Tween needs at least one property');
    for (const existing of [...this.active])
      if (
        existing.target === target &&
        existing.values.some((v) => values.some((next) => next.key === v.key))
      )
        existing.Cancel();
    const tween = {
      target,
      values,
      elapsed: 0,
      duration,
      curve,
      owner: this.engine.lua?.currentScript,
      Completed: new Signal((e) => this.engine.log('error', e.message)),
      Playing: true,
    };
    const finish = (completed) => {
      if (!tween.Playing) return;
      tween.Playing = false;
      this.active.delete(tween);
      tween.Completed.Fire(completed);
      tween.Completed.Clear();
    };
    tween.Cancel = () => finish(false);
    tween.finish = finish;
    this.active.add(tween);
    return tween;
  }
  update(dt) {
    for (const tween of [...this.active]) {
      if (!tween.Playing) continue;
      if (tween.target.Destroyed) {
        tween.Cancel();
        continue;
      }
      tween.elapsed += dt;
      const progress = tween.duration === 0 ? 1 : Math.min(1, tween.elapsed / tween.duration),
        t = easing[tween.curve](progress);
      for (const { key, from, goal } of tween.values) {
        let value = progress === 1 ? goal : interpolate(from, goal, t);
        if (['Opacity', 'BackgroundOpacity'].includes(key)) value = Math.max(0, Math.min(1, value));
        tween.target[key] = value;
      }
      if (progress === 1) tween.finish(true);
    }
  }
  cancelTarget(target) {
    for (const tween of [...this.active]) if (tween.target === target) tween.Cancel();
  }
  cancelOwner(owner) {
    for (const tween of [...this.active]) if (tween.owner === owner) tween.Cancel();
  }
  dispose() {
    for (const tween of [...this.active]) tween.Cancel();
  }
}
