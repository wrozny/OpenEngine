import { Signal } from './signal.js';
import { SceneNode } from './scene.js';
import { Vector3 } from './math.js';
export class UIService {
  constructor() {
    this.State = 'playing';
    this.Title = '';
    this.Subtitle = '';
    this.hud = Object.create(null);
    this.upgrades = Object.create(null);
    this.widgets = Object.create(null);
    this.OnAction = new Signal();
    this.Changed = new Signal();
  }
  CreateLabel(id, text, x = 20, y = 100) {
    this.widgets[id] = {
      type: 'label',
      text: String(text),
      x,
      y,
      anchor: 'TopLeft',
      color: '#d5e9df',
    };
    this.Changed.Fire();
  }
  CreateWorldLabel(id, text, target, offset = new Vector3(0, 2, 0)) {
    if (!(target instanceof SceneNode) || target.ClassName !== 'Object3D')
      throw new Error('World labels need an Object3D target');
    this.widgets[id] = {
      type: 'world-label',
      text: String(text),
      target,
      offset: new Vector3(offset.X, offset.Y, offset.Z),
      color: '#f3e8bd',
    };
    this.Changed.Fire();
  }
  CreateButton(id, text, x = 20, y = 150, width = 140, height = 36) {
    this.widgets[id] = {
      type: 'button',
      text: String(text),
      x,
      y,
      width,
      height,
      anchor: 'TopLeft',
    };
    this.Changed.Fire();
  }
  CreateBar(id, value, maximum, x = 20, y = 200, width = 200) {
    this.widgets[id] = {
      type: 'bar',
      value,
      maximum,
      x,
      y,
      width,
      height: 8,
      anchor: 'TopLeft',
      color: '#a0dfce',
    };
    this.Changed.Fire();
  }
  SetText(id, text) {
    if (this.widget(id).text === String(text)) return;
    this.widget(id).text = String(text);
    this.Changed.Fire();
  }
  SetValue(id, value, maximum) {
    Object.assign(this.widget(id), { value, maximum });
    this.Changed.Fire();
  }
  SetPosition(id, x, y, anchor = 'TopLeft') {
    if (!['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight', 'Center'].includes(anchor))
      throw new Error('Unknown UI anchor');
    Object.assign(this.widget(id), { x, y, anchor });
    this.Changed.Fire();
  }
  SetColor(id, color) {
    if (this.widget(id).color === color) return;
    this.widget(id).color = color;
    this.Changed.Fire();
  }
  Remove(id) {
    delete this.widgets[id];
    this.Changed.Fire();
  }
  widget(id) {
    if (!this.widgets[id]) throw new Error('Unknown UI widget: ' + id);
    return this.widgets[id];
  }
  Set(key, value) {
    if (this.hud[key] === String(value)) return;
    this.hud[key] = String(value);
    this.Changed.Fire();
  }
  SetState(state, title = '', subtitle = '') {
    this.State = state;
    this.Title = title;
    this.Subtitle = subtitle;
    this.Changed.Fire();
  }
  SetUpgrade(id, title, description, cost, affordable = true) {
    this.upgrades[id] = { title, description, cost, affordable };
    this.Changed.Fire();
  }
}

/** Expose the legacy widget API on the actual hierarchy service instance. */
export function initializeUIService(root) {
  const controller = new UIService();
  for (const key of Object.keys(controller))
    Object.defineProperty(root, key, {
      configurable: true,
      get: () => controller[key],
      set: (value) => {
        controller[key] = value;
      },
    });
  for (const key of Object.getOwnPropertyNames(UIService.prototype))
    if (key !== 'constructor') root[key] = controller[key].bind(controller);
  return root;
}
