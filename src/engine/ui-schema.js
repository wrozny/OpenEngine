export const UI_ELEMENTS = ['Frame', 'TextLabel', 'TextButton', 'ImageLabel', 'TextInput'];
export const isUIElement = (node) => UI_ELEMENTS.includes(node?.ClassName);
export const isUINode = (node) => isUIElement(node) || node?.ClassName === 'ScreenGui';
const dimension = (xScale, xOffset, yScale, yOffset) => ({
  XScale: xScale,
  XOffset: xOffset,
  YScale: yScale,
  YOffset: yOffset,
});
const base = {
  Position: dimension(0, 24, 0, 24),
  Size: dimension(0, 200, 0, 44),
  AnchorPoint: { X: 0, Y: 0 },
  Visible: true,
  Opacity: 1,
  BackgroundColor: '#252d3b',
  BackgroundOpacity: 1,
  BorderColor: '#49546a',
  BorderWidth: 0,
  CornerRadius: 8,
  ZIndex: 0,
  ClipChildren: false,
  MinSize: { X: 0, Y: 0 },
  MaxSize: { X: 0, Y: 0 },
  AspectRatio: 0,
  FlexGrow: 0,
  Interactable: false,
  Disabled: false,
  EnterEffect: 'None',
  HoverEffect: 'None',
  ClickEffect: 'None',
};
const text = {
  Text: 'Text',
  TextColor: '#edf1fa',
  TextSize: 16,
  FontWeight: 400,
  FontFamily: 'System',
  TextAlign: 'Left',
  TextVAlign: 'Center',
  TextWrapped: true,
};
export const UI_DEFAULTS = {
  ScreenGui: {
    Enabled: true,
    DesignWidth: 1280,
    DesignHeight: 720,
    ScaleMode: 'Responsive',
    DisplayOrder: 0,
    SafeArea: true,
  },
  Frame: {
    ...base,
    Size: dimension(0, 320, 0, 200),
    Layout: 'Absolute',
    Padding: 16,
    Gap: 12,
    Align: 'Start',
    Justify: 'Start',
    Wrap: false,
  },
  TextLabel: { ...base, ...text, BackgroundOpacity: 0, CornerRadius: 0 },
  TextButton: {
    ...base,
    ...text,
    Text: 'Button',
    Size: dimension(0, 160, 0, 44),
    TextAlign: 'Center',
    FontWeight: 600,
    BackgroundColor: '#4777c3',
    Interactable: true,
    HoverEffect: 'Grow',
    ClickEffect: 'Press',
  },
  ImageLabel: {
    ...base,
    Size: dimension(0, 160, 0, 120),
    Image: '',
    ImageFit: 'Contain',
    BackgroundOpacity: 0,
  },
  TextInput: {
    ...base,
    ...text,
    Text: '',
    Placeholder: 'Type here…',
    MaxLength: 256,
    BorderWidth: 1,
    Interactable: true,
  },
};
export const UI_EASINGS = ['Linear', 'OutQuad', 'OutCubic', 'InOutCubic', 'OutBack'];
export function validateUIData(data) {
  const defaults = UI_DEFAULTS[data.className];
  if (!defaults) return;
  for (const [key, initial] of Object.entries(defaults)) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof initial === 'object') {
      if (
        !value ||
        typeof value !== 'object' ||
        !Object.keys(initial).every((axis) => Number.isFinite(value[axis]))
      )
        throw new Error('Invalid UI value: ' + key);
    } else if (
      typeof value !== typeof initial ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error('Invalid UI property: ' + key);
  }
  for (const key of ['Text', 'Image', 'Placeholder'])
    if (data[key]?.length > 10000000) throw new Error('UI content is too large');
  for (const key of ['Opacity', 'BackgroundOpacity'])
    if (data[key] !== undefined && (data[key] < 0 || data[key] > 1))
      throw new Error(key + ' must be between 0 and 1');
  for (const key of [
    'TextSize',
    'CornerRadius',
    'BorderWidth',
    'Gap',
    'Padding',
    'FlexGrow',
    'AspectRatio',
    'MaxLength',
  ])
    if (data[key] !== undefined && data[key] < 0) throw new Error(key + ' must be nonnegative');
  for (const key of ['DesignWidth', 'DesignHeight'])
    if (data[key] !== undefined && data[key] <= 0)
      throw new Error('Canvas dimensions must be positive');
  for (const key of ['MinSize', 'MaxSize'])
    if (data[key] && (data[key].X < 0 || data[key].Y < 0))
      throw new Error('UI constraints must be nonnegative');
  const enums = {
    ScaleMode: ['Responsive', 'Fit'],
    Layout: ['Absolute', 'Row', 'Column'],
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
  for (const [key, values] of Object.entries(enums))
    if (data[key] !== undefined && !values.includes(data[key]))
      throw new Error('Unknown UI ' + key);
}
