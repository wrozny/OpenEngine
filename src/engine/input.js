import { Signal } from './signal.js';
import { Vector2 } from './math.js';

/** Input is scoped to the game canvas; blur always releases held keys/buttons. */
export class InputService {
  constructor() {
    this.keys = new Set();
    this.buttons = new Set();
    this.MousePosition = new Vector2();
    this.screenPosition = null;
    this.mouseDelta = new Vector2();
    this.updatePointer = () => {};
    this.Began = new Signal();
    this.Ended = new Signal();
    this.cleanup = [];
  }
  IsKeyDown(key) {
    return this.keys.has(String(key).toLowerCase());
  }
  IsMouseDown(button = 0) {
    return this.buttons.has(button);
  }
  ConsumeMouseDelta() {
    const delta = this.mouseDelta;
    this.mouseDelta = new Vector2();
    return delta;
  }
  GetAxis(negative, positive) {
    return Number(this.IsKeyDown(positive)) - Number(this.IsKeyDown(negative));
  }
  attach(canvas, screenToWorld, onGesture) {
    const on = (target, event, callback, options) => {
      target.addEventListener(event, callback, options);
      this.cleanup.push(() => target.removeEventListener(event, callback, options));
    };
    canvas.tabIndex = 0;
    on(canvas, 'keydown', (event) => {
      if (['Tab', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      const key = event.key.toLowerCase();
      if (!this.keys.has(key)) this.Began.Fire(key);
      this.keys.add(key);
    });
    on(window, 'keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
      this.Ended.Fire(event.key.toLowerCase());
    });
    this.updatePointer = () => {
      if (this.screenPosition)
        this.MousePosition = screenToWorld(this.screenPosition.X, this.screenPosition.Y);
    };
    const updatePointer = (event) => {
      this.mouseDelta = this.mouseDelta.Add(
        new Vector2(event.movementX || 0, event.movementY || 0),
      );
      const rect = canvas.getBoundingClientRect();
      this.screenPosition = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
      this.updatePointer();
    };
    on(canvas, 'pointermove', updatePointer);
    on(canvas, 'pointerdown', (event) => {
      updatePointer(event);
      canvas.focus();
      onGesture?.();
      this.buttons.add(event.button);
      this.Began.Fire(`mouse${event.button}`);
    });
    on(window, 'pointerup', (event) => {
      this.buttons.delete(event.button);
      this.Ended.Fire(`mouse${event.button}`);
    });
    on(canvas, 'contextmenu', (event) => event.preventDefault());
    on(window, 'blur', () => this.release());
    on(canvas, 'blur', () => this.release());
    canvas.focus();
  }
  release() {
    this.keys.clear();
    this.buttons.clear();
  }
  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.release();
    this.Began.Clear();
    this.Ended.Clear();
  }
}
