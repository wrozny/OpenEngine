import { Vector2 } from './math.js';

/** Attribute documents contain data, never executable values or engine references. */
export function encodeAttribute(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value))
    throw new Error('Saved attributes must be finite, acyclic data values');
  seen.add(value);
  let result;
  if (value instanceof Vector2) result = { $type: 'Vector2', X: value.X, Y: value.Y };
  else if (Array.isArray(value)) result = value.map((item) => encodeAttribute(item, seen));
  else if (
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null
  ) {
    result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeAttribute(item, seen)]),
    );
  } else throw new Error('Saved attributes cannot contain engine instances or executable values');
  seen.delete(value);
  return result;
}
export function decodeAttribute(value) {
  if (value?.$type === 'Vector2') return new Vector2(value.X, value.Y);
  if (Array.isArray(value)) return value.map(decodeAttribute);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeAttribute(item)]),
    );
  return value;
}
