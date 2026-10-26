import { SceneNode } from '../engine/scene.js';
import { UDim2 } from '../engine/ui-types.js';
/** A phone-friendly dialog built entirely from editable public UI instances. */
export function createDialog(name = 'Dialog') {
  const screen = new SceneNode('ScreenGui', name);
  const make = (type, name, parent, properties) => {
    const node = new SceneNode(type, name);
    Object.assign(node, properties);
    node.Parent = parent;
    return node;
  };
  const panel = make('Frame', 'Panel', screen, {
    Position: new UDim2(0.5, 0, 0.5, 0),
    AnchorPoint: { X: 0.5, Y: 0.5 },
    Size: new UDim2(1, -48, 0, 300),
    MaxSize: { X: 520, Y: 0 },
    Layout: 'Column',
    Padding: 24,
    Gap: 12,
    EnterEffect: 'Pop',
    BackgroundColor: '#202b3c',
    BorderWidth: 1,
  });
  make('TextLabel', 'Title', panel, {
    Text: 'Welcome',
    Size: new UDim2(1, 0, 0, 36),
    TextSize: 26,
    FontWeight: 700,
  });
  make('TextLabel', 'Description', panel, {
    Text: 'This panel adapts to its parent. Edit it in the UI tab.',
    Size: new UDim2(1, 0, 0, 80),
    FlexGrow: 1,
    TextVAlign: 'Top',
  });
  const actions = make('Frame', 'Actions', panel, {
    Size: new UDim2(1, 0, 0, 44),
    BackgroundOpacity: 0,
    Layout: 'Row',
    Padding: 0,
    Gap: 12,
  });
  make('TextButton', 'Confirm', actions, {
    Text: 'Confirm',
    Size: new UDim2(0.5, -6, 1, 0),
    HoverEffect: 'Glow',
  });
  make('TextButton', 'Close', actions, {
    Text: 'Close',
    Size: new UDim2(0.5, -6, 1, 0),
    BackgroundColor: '#39455a',
  });
  return screen;
}
