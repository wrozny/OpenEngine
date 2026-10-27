import { UI_DEFAULTS, isUINode, UI_EASINGS } from '../engine/ui-schema.js';
import { UDim2 } from '../engine/ui-types.js';
import { SceneNode } from '../engine/scene.js';
import { el } from './dom.js';
const choices = {
  ScaleMode: ['Responsive', 'Fit'],
  Layout: ['Absolute', 'Row', 'Column', 'Grid'],
  Direction: ['Row', 'Column'],
  Align: ['Start', 'Center', 'End', 'Stretch'],
  Justify: ['Start', 'Center', 'End', 'SpaceBetween'],
  TextAlign: ['Left', 'Center', 'Right'],
  TextVAlign: ['Top', 'Center', 'Bottom'],
  FontFamily: ['System', 'Serif', 'Monospace'],
  ImageFit: ['Contain', 'Cover', 'Stretch'],
  EnterEffect: ['None', 'Fade', 'SlideUp', 'Pop'],
  HoverEffect: ['None', 'Grow', 'Lift', 'Glow'],
  ClickEffect: ['None', 'Press', 'Pulse'],
};
/** Type-driven controls keep every serialized UI property editable, including responsive units. */
export function renderUIInspector(container, store, node, { section, field }) {
  if (!isUINode(node)) return;
  section('UI layout & appearance');
  container.append(
    el(
      'p',
      'inspector-note',
      'Scale uses a fraction of the parent (0.5 = 50%). Offset uses pixels. AnchorPoint is the pivot (0.5 = center). Row/Column parents arrange children in hierarchy order.',
    ),
  );
  for (const [key, initial] of Object.entries(UI_DEFAULTS[node.ClassName])) {
    if (typeof initial === 'object') {
      for (const axis of Object.keys(initial))
        field(
          key + ' ' + axis,
          node[key][axis],
          (value) => {
            const next = { ...node[key], [axis]: value };
            node[key] = key === 'Position' || key === 'Size' ? UDim2.from(next) : next;
          },
          'number',
        );
    } else
      field(
        key,
        node[key],
        (value) => (node[key] = value),
        typeof initial === 'boolean'
          ? 'checkbox'
          : typeof initial === 'number'
            ? 'number'
            : key.endsWith('Color')
              ? 'color'
              : 'text',
        choices[key],
      );
  }
  if (node.ClassName === 'ScreenGui' || node.ClassName.startsWith('UI')) return;
  section('Events');
  container.append(
    el(
      'p',
      'inspector-note',
      'Create a Lua event handler under this element. Multiplayer UI handlers run on the client.',
    ),
  );
  for (const event of [
    'OnClick',
    'OnHoverStart',
    'OnHoverEnd',
    ...(node.ClassName === 'TextInput' ? ['OnValueChanged'] : []),
  ]) {
    const button = el('button', 'subtle-button', 'Add ' + event + ' handler');
    button.onclick = () => {
      const script = new SceneNode(
        store.metadata.multiplayer ? 'LocalScript' : 'Script',
        event + 'Handler',
      );
      script.Source = `local element = script.Parent\n\nelement.${event}:Connect(function(${event === 'OnValueChanged' ? 'value' : ''})\n    print("${event}", element.Name)\nend)\n`;
      store.transact(() => (script.Parent = node));
      store.expanded.add(node.Id);
      store.select(script);
    };
    container.append(button);
  }
}
