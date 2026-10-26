import { SceneNode } from '../engine/scene.js';
import { Vector2, Vector3 } from '../engine/math.js';

/** Small, bounded value protocol. No executable values or arbitrary object prototypes cross it. */
export function encode(value, depth = 0) {
  if (depth > 12) throw new Error('Remote payload is too deeply nested');
  if (value == null) return null;
  if (value instanceof SceneNode) return { $instance: value.Id };
  if (value instanceof Vector3) return { $vector: [value.X, value.Y, value.Z] };
  if (value instanceof Vector2) return { $vector: [value.X, value.Y] };
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => encode(v, depth + 1));
  if (
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    const result = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Reserved remote payload key');
      result[key] = encode(item, depth + 1);
    }
    return result;
  }
  throw new Error('Unsupported remote payload value');
}
export function decode(value, nodes, depth = 0) {
  if (depth > 12) throw new Error('Remote payload is too deeply nested');
  if (value == null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number');
    return value;
  }
  if (value.$instance) return nodes.get(value.$instance) || null;
  if (value.$vector) {
    const v = value.$vector;
    if (![2, 3].includes(v.length) || !v.every(Number.isFinite)) throw new Error('Invalid vector');
    return v.length === 3 ? new Vector3(...v) : new Vector2(...v);
  }
  if (Array.isArray(value)) return value.map((v) => decode(v, nodes, depth + 1));
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Reserved remote payload key');
    result[key] = decode(item, nodes, depth + 1);
  }
  return result;
}
export function packet(message, limit = 16384) {
  if (message?.type === 'remote' && (!Array.isArray(message.args) || message.args.length > 32))
    throw new Error('RemoteEvents accept at most 32 arguments');
  const text = JSON.stringify(message);
  if (new TextEncoder().encode(text).length > limit) throw new Error('Network packet too large');
  return text;
}
