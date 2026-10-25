/** Shared completion/hover descriptions for the public scripting API. */
export const API = {
  Instance: { new: ['className, parent', 'Create a detached instance, or parent it immediately.'] },
  Vector2: { new: ['x, y', 'Create an immutable two-dimensional value.'] },
  Vector3: { new: ['x, y, z', 'Create an immutable Y-up vector measured in meters.'] },
  game: { GetService: ['name', 'Get an engine service by its registered name.'] },
  Object: {
    GetChildren: ['', 'Snapshot of direct children; use ipairs to iterate.'],
    GetDescendants: ['', 'Snapshot of the entire subtree.'],
    FindFirstChild: ['name, recursive', 'Return a named child, or nil.'],
    FindFirstChildOfClass: ['className', 'Find a direct child of a class.'],
    IsA: ['className', 'Check an instance class.'],
    Clone: ['', 'Deep detached copy with fresh IDs.'],
    Destroy: ['', 'Remove this instance, descendants, bodies and owned subscriptions.'],
    SetAttribute: [
      'attributeName, attributeValue',
      'Set custom instance data. nil removes an attribute.',
    ],
    GetAttribute: ['attributeName', 'Read custom instance data, or nil.'],
    GetAttributes: ['', 'Get a snapshot of all custom attributes.'],
    GetFullName: ['', 'Get the hierarchy path.'],
  },
  Workspace: {
    Raycast: [
      'origin, direction, ignore',
      'Closest non-sensor collision along a finite direction vector.',
    ],
    GetObjectsInRadius: ['center, radius', 'Find objects whose centers are within a radius.'],
  },
  Signal: { Connect: ['callback', 'Subscribe to an event. Returns a disconnectable connection.'] },
  Connection: { Disconnect: ['', 'Stop receiving event callbacks.'] },
  InputService: {
    IsKeyDown: ['key', 'Whether a lowercase keyboard key is held.'],
    IsMouseDown: ['button', 'Mouse buttons: 0 left, 1 middle, 2 right.'],
    GetAxis: ['negativeKey, positiveKey', 'Return -1, 0 or 1.'],
    ConsumeMouseDelta: ['', 'Read and reset pointer movement for mouse look.'],
  },
  PhysicsService: {
    SetGravity: ['vector', 'Set the world acceleration. 2D uses pixels/s²; 3D uses meters/s².'],
    GetGravity: ['', 'Read the current gravity vector.'],
  },
  UIService: {
    CreateLabel: ['id, text, x, y', 'Create a screen-space label.'],
    CreateButton: ['id, text, x, y, width, height', 'Create a button; OnAction receives its ID.'],
    CreateBar: ['id, value, maximum, x, y, width', 'Create a progress bar.'],
    SetText: ['id, text', 'Change widget text.'],
    SetValue: ['id, value, maximum', 'Update a progress bar.'],
    SetPosition: ['id, x, y, anchor', 'Move a widget relative to an anchor.'],
    SetColor: ['id, color', 'Change widget color.'],
    Remove: ['id', 'Remove a widget.'],
    Set: ['key, value', 'Update the survival HUD.'],
    SetState: ['state, title, subtitle', 'Show playing, upgrading, dead or complete UI.'],
    SetUpgrade: ['id, title, description, cost, affordable', 'Configure a survival upgrade card.'],
  },
  AudioService: {
    Play: ['name', 'Play shoot, hit, hurt, upgrade or wave.'],
    Tone: ['frequency, duration, volume, type', 'Synthesize a short tone.'],
    PlayFile: ['url, volume, loop', 'Play local/embedded audio.'],
  },
  AssetService: {
    Get: ['name', 'Get a named embedded asset URL.'],
    Has: ['name', 'Check whether an asset exists.'],
  },
  Math: {
    Clamp: ['value, min, max', 'Clamp a number.'],
    Lerp: ['a, b, t', 'Linear interpolation.'],
    Distance: ['a, b', 'Distance between vectors.'],
    OverlapCircle: ['a, radiusA, b, radiusB', 'Circle overlap helper.'],
  },
  Vector: {
    Add: ['vector', 'Add two vectors.'],
    Sub: ['vector', 'Subtract a vector.'],
    Mul: ['scalar', 'Multiply by a scalar.'],
    Div: ['scalar', 'Divide by a scalar.'],
    Dot: ['vector', 'Dot product.'],
    Cross: ['vector', '3D cross product.'],
    Distance: ['vector', 'Distance to another vector.'],
    Lerp: ['vector, t', 'Interpolate toward a vector.'],
  },
};
export const PROPERTIES = {
  Object: [
    'Name',
    'Parent',
    'Id',
    'ClassName',
    'Position',
    'Rotation',
    'Velocity',
    'Size',
    'Shape',
    'Color',
    'Texture',
    'Visible',
    'Anchored',
    'Sensor',
    'CollisionGroup',
    'Friction',
    'Restitution',
    'OnCollision',
    'OnCollisionEnd',
    'OnFallen',
    'Material',
    'TextureScale',
    'Mass',
    'FixedRotation',
  ],
  Script: [
    'Source',
    'Enabled',
    'Speed',
    'Mode',
    'JumpSpeed',
    'FlySpeed',
    'FollowCamera',
    'LeftKey',
    'RightKey',
    'JumpKey',
  ],
  Workspace: ['Skybox', 'FallenHeight', 'BackgroundColor'],
  RunService: ['Heartbeat', 'Time', 'DeltaTime'],
  InputService: ['MousePosition', 'Began', 'Ended'],
  UIService: ['OnAction'],
  Camera: ['Position', 'Follow', 'Zoom', 'Yaw', 'Pitch', 'Distance', 'FirstPerson'],
  Vector: ['X', 'Y', 'Z', 'Magnitude', 'Unit'],
};
export const SERVICES = [
  'Workspace',
  'ScriptService',
  'RunService',
  'InputService',
  'AudioService',
  'UIService',
  'Camera',
  'Math',
  'PhysicsService',
  'AssetService',
];
export function completionContext(receiver, source, node, workspace) {
  let type = receiver,
    instance;
  if (receiver === 'workspace') {
    type = 'Workspace';
    instance = workspace;
  }
  if (receiver === 'script') {
    type = 'Script';
    instance = node;
  }
  if (receiver === 'script.Parent') {
    type = 'Object';
    instance = node?.Parent;
  }
  if (receiver?.startsWith('workspace.')) {
    instance = receiver
      .slice(10)
      .split('.')
      .reduce((value, key) => value?.FindFirstChild(key), workspace);
    type = 'Object';
  }
  const escaped = receiver?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const service = source.match(
    new RegExp(
      '(?:local\\s+)?' + escaped + '\\s*=\\s*game:GetService\\(["\\\']([^"\\\']+)["\\\']\\)',
    ),
  );
  if (service) type = service[1];
  if (/\.OnCollision(?:End)?$|\.Heartbeat$|\.OnAction$|\.Began$|\.Ended$/.test(receiver || ''))
    type = 'Signal';
  if (/\.(Position|Velocity|Size|Unit)$/.test(receiver || '')) type = 'Vector';
  if (!API[type] && !PROPERTIES[type]) type = 'Object';
  const methods = {
    ...(type === 'Object' || type === 'Workspace' || type === 'Script' ? API.Object : {}),
    ...API[type],
  };
  const properties = [
    ...(type === 'Object' || type === 'Workspace' || type === 'Script' ? PROPERTIES.Object : []),
    ...(PROPERTIES[type] || []),
  ];
  return {
    type,
    methods,
    properties,
    children: instance?.GetChildren().map((child) => child.Name) || [],
  };
}
