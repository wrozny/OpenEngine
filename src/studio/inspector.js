import { CAR_DEFAULTS } from '../engine/vehicles.js';
import { validateProject } from '../engine/scene.js';
import { renderUIInspector } from './ui-inspector.js';
import { el } from './dom.js';
import { nodeGlyph } from './icons.js';
import { Vector2, Vector3 } from '../engine/math.js';
import { isObject, isScriptNode, isController } from '../engine/scene.js';
import { CONTROLLER_DEFAULTS_2D, CONTROLLER_DEFAULTS_3D } from '../engine/controllers.js';
import { MATERIALS } from '../engine/materials.js';
import { renderAttributes } from './attribute-inspector.js';

export function renderInspector(container, store, onError) {
  const scroll = container.scrollTop;
  const searchText = container.dataset.search || '';
  container.replaceChildren();
  const node = store.selected;
  if (!node) {
    container.append(el('p', 'empty-state', 'Select an object to see its properties.'));
    return;
  }
  const header = el('div', 'inspector-object'),
    icon = el('div', 'object-icon');
  icon.append(nodeGlyph(node));
  header.append(
    icon,
    el('strong', '', node.Name),
    el(
      'small',
      '',
      store.selection.length > 1
        ? `${store.selection.length} selected · editing active object`
        : node.ClassName,
    ),
  );
  container.append(header);
  const search = el('input', 'property-search');
  search.placeholder = 'Search properties…';
  search.setAttribute('aria-label', 'Search properties');
  search.value = searchText;
  container.append(search);
  const filter = () => {
    const query = search.value.toLowerCase().trim();
    container.dataset.search = search.value;
    let visible = 0;
    for (const row of container.querySelectorAll('.property-row')) {
      row.hidden = !row.textContent.toLowerCase().includes(query);
      if (!row.hidden) visible++;
    }
    for (const heading of container.querySelectorAll('.property-section')) {
      let next = heading.nextElementSibling,
        found = false;
      while (next && !next.classList.contains('property-section')) {
        if (next.classList.contains('property-row') && !next.hidden) found = true;
        next = next.nextElementSibling;
      }
      heading.hidden = !!query && !found;
    }
    container.dataset.matches = String(visible);
  };
  search.oninput = filter;
  search.onkeydown = (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      filter();
    }
  };

  function section(name) {
    container.append(el('h3', 'property-section', name));
  }
  function field(label, value, callback, type = 'text', options) {
    const row = el('label', 'property-row');
    row.append(el('span', 'property-label', label));
    const input = el(options ? 'select' : 'input');
    if (options)
      for (const option of options) {
        const item = el('option', '', option);
        item.value = option;
        input.append(item);
      }
    else input.type = type;
    input.setAttribute('aria-label', label);
    if (type === 'checkbox') input.checked = value;
    else input.value = value ?? '';
    if (type === 'number') input.step = 'any';
    input.onchange = () => {
      try {
        store.transact(() => {
          const value =
            type === 'checkbox'
              ? input.checked
              : type === 'number'
                ? Number(input.value)
                : input.value;
          if (type === 'number' && !Number.isFinite(value))
            throw new Error('Enter a finite number');
          callback(value);
          validateProject(store.project);
        });
      } catch (error) {
        onError(error.message);
        store.Changed.Fire('selection');
      }
    };
    row.append(input);
    container.append(row);
    return input;
  }
  const set = (key, type = 'text', options) =>
    field(key, node[key], (value) => (node[key] = value), type, options);
  section('Instance');
  const name = field('Name', node.Name, (value) => {
    if (!value.trim()) throw new Error('Name cannot be empty');
    node.Name = value.trim();
  });
  name.disabled = node.Parent === store.root;
  field('Parent', node.Parent?.Name || '', () => {}).disabled = true;
  if (node === store.workspace && store.dimension === '3D') {
    section('World');
    set('FallenHeight', 'number');
    set('BackgroundColor', 'color');
    const customSky = node.Skybox && node.Skybox !== 'builtin:sky';
    const sky = field(
      'Skybox',
      customSky ? 'custom' : node.Skybox,
      (value) => {
        if (value !== 'custom') node.Skybox = value;
      },
      'text',
      ['builtin:sky', '', ...(customSky ? ['custom'] : [])],
    );
    sky.options[0].textContent = 'Simple sky';
    sky.options[1].textContent = 'None';
    if (customSky) sky.options[2].textContent = 'Custom image';
    texturePicker(container, store, node, 'Skybox', 'Upload sky image', onError);
    container.append(
      el(
        'p',
        'inspector-note',
        'Y-up world. Objects below FallenHeight are destroyed. Clear Skybox for an empty background.',
      ),
    );
  }
  if (isObject(node)) {
    const three = node.ClassName === 'Object3D',
      axes = three ? ['X', 'Y', 'Z'] : ['X', 'Y'];
    section('Transform');
    for (const axis of axes)
      field(
        'Position ' + axis,
        round(node.Position[axis]),
        (value) => (node.Position = vectorWith(node.Position, axis, value, three)),
        'number',
      );
    for (const [axis, title] of [
      ['X', 'Width'],
      ['Y', 'Height'],
      ...(three ? [['Z', 'Depth']] : []),
    ])
      field(
        title,
        node.Size[axis],
        (value) => {
          if (value <= 0) throw new Error('Dimensions must be positive');
          node.Size = { ...node.Size, [axis]: value };
        },
        'number',
      );
    if (three)
      for (const axis of axes)
        field(
          'Rotation ' + axis + ' °',
          round((node.Rotation[axis] * 180) / Math.PI),
          (value) =>
            (node.Rotation = vectorWith(node.Rotation, axis, (value * Math.PI) / 180, true)),
          'number',
        );
    else
      field(
        'Rotation °',
        round((node.Rotation * 180) / Math.PI),
        (value) => (node.Rotation = (value * Math.PI) / 180),
        'number',
      );
    section('Appearance');
    set('Shape', 'text', three ? ['Box', 'Sphere', 'Cylinder', 'Wedge'] : ['Box', 'Circle']);
    set('Color', 'color');
    set('Visible', 'checkbox');
    if (three) {
      set('Material', 'text', Object.keys(MATERIALS));
      field(
        'TextureScale',
        node.TextureScale,
        (value) => {
          if (value <= 0) throw new Error('Texture scale must be positive');
          node.TextureScale = value;
        },
        'number',
      );
    } else {
      set('Layer', 'number');
      set('ShowHealthBar', 'checkbox');
    }
    texturePicker(
      container,
      store,
      node,
      'Texture',
      three ? 'Texture image' : 'Sprite image',
      onError,
    );
    section('Physics');
    for (const key of ['Anchored', 'Sensor', ...(three ? ['FixedRotation'] : [])])
      set(key, 'checkbox');
    set('CollisionGroup', 'text', ['world', 'player', 'zombie', 'projectile', 'decoration']);
    set('Friction', 'number');
    set('Restitution', 'number');
    if (three)
      field(
        'Mass',
        node.Mass,
        (value) => {
          if (value <= 0) throw new Error('Mass must be positive');
          node.Mass = value;
        },
        'number',
      );
  }
  if (isScriptNode(node)) {
    section('Script');
    set('Enabled', 'checkbox');
    container.append(
      el(
        'p',
        'inspector-note',
        node.ClassName === 'ModuleScript'
          ? 'Modules run when required and return a shared value.'
          : 'Select the Script tab to edit its Lua source. Changes apply on the next Play.',
      ),
    );
  }
  if (isController(node)) {
    section('Controller');
    const defaults =
      node.ClassName === 'PlayerController3D' ? CONTROLLER_DEFAULTS_3D : CONTROLLER_DEFAULTS_2D;
    for (const [key, value] of Object.entries(defaults))
      set(
        key,
        typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text',
        key === 'Mode'
          ? node.ClassName === 'PlayerController3D'
            ? ['Platformer', 'FreeCamera']
            : ['TopDown', 'Platformer']
          : undefined,
      );
  }
  if (CAR_DEFAULTS[node.ClassName]) {
    section('Vehicle');
    set('Enabled', 'checkbox');
    for (const key of Object.keys(CAR_DEFAULTS[node.ClassName])) set(key, 'number');
  }
  renderUIInspector(container, store, node, { section, field });
  if (node.ClassName === 'ImageLabel')
    texturePicker(container, store, node, 'Image', 'Upload UI image', onError);
  renderAttributes(container, store, node, { section, field }, onError);
  if (store.canRemove(node)) {
    const actions = el('div', 'inspector-actions'),
      duplicate = el('button', 'subtle-button', 'Duplicate'),
      remove = el('button', 'subtle-button danger', 'Delete');
    duplicate.onclick = () => store.duplicate();
    remove.onclick = () => store.remove();
    actions.append(duplicate, remove);
    container.append(actions);
  }
  filter();
  container.scrollTop = scroll;
}
function round(value) {
  return Number(value.toFixed(3));
}
function vectorWith(vector, axis, value, three) {
  const next = { ...vector, [axis]: value };
  return three ? new Vector3(next.X, next.Y, next.Z) : new Vector2(next.X, next.Y);
}
function texturePicker(container, store, node, key, title, onError) {
  const row = el('div', 'texture-row');
  row.append(el('span', '', title));
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
  input.setAttribute('aria-label', title);
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      onError('Choose an image smaller than 8 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => store.transact(() => (node[key] = reader.result));
    reader.readAsDataURL(file);
  };
  const clear = el('button', 'subtle-button', 'Clear ' + key);
  clear.disabled = !node[key];
  clear.onclick = () => store.transact(() => (node[key] = ''));
  row.append(input, clear);
  container.append(row);
}
