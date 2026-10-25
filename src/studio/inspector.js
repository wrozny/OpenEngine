import { el, icon } from './dom.js';
import { Vector2 } from '../engine/math.js';

export function renderInspector(container, store, onError) {
  container.replaceChildren();
  const node = store.selected;
  if (!node) {
    container.append(el('div', 'empty-state', 'Select an object to edit its properties.'));
    return;
  }
  const header = el('div', 'inspector-object');
  header.append(
    el('div', 'object-icon', icon(node)),
    el('strong', '', node.Name),
    el('small', '', node.ClassName),
  );
  container.append(header);
  function section(name) {
    container.append(el('h3', 'property-section', name));
  }
  function field(label, value, callback, type = 'text', options) {
    const row = el('label', 'property-row');
    row.append(el('span', 'property-label', label));
    let input;
    if (options) {
      input = el('select');
      for (const option of options) {
        const opt = el('option', '', option);
        opt.value = option;
        input.append(opt);
      }
    } else {
      input = el('input');
      input.type = type;
    }
    input.setAttribute('aria-label', label);
    if (type === 'checkbox') input.checked = value;
    else input.value = value;
    if (type === 'number') input.step = 'any';
    input.onchange = () => {
      try {
        store.transact(() =>
          callback(
            type === 'checkbox'
              ? input.checked
              : type === 'number'
                ? Number(input.value)
                : input.value,
          ),
        );
      } catch (error) {
        onError(error.message);
        renderInspector(container, store, onError);
      }
    };
    row.append(input);
    container.append(row);
    return input;
  }
  const finite = (n) => {
    if (!Number.isFinite(n)) throw new Error('Enter a finite number');
    return n;
  };
  section('INSTANCE');
  const nameField = field('Name', node.Name, (value) => {
    if (!value.trim()) throw new Error('Name cannot be empty');
    node.Name = value.trim();
  });
  nameField.disabled = node.Parent === store.root;
  field('Parent', node.Parent?.Name || '', () => {}).disabled = true;
  if (node.ClassName === 'Object2D') {
    section('TRANSFORM');
    field(
      'Position X',
      Number(node.Position.X.toFixed(2)),
      (value) => {
        node.Position = new Vector2(finite(value), node.Position.Y);
      },
      'number',
    );
    field(
      'Position Y',
      Number(node.Position.Y.toFixed(2)),
      (value) => {
        node.Position = new Vector2(node.Position.X, finite(value));
      },
      'number',
    );
    field(
      'Width',
      node.Size.X,
      (value) => {
        if (finite(value) <= 0) throw new Error('Width must be positive');
        node.Size = { ...node.Size, X: value };
      },
      'number',
    );
    field(
      'Height',
      node.Size.Y,
      (value) => {
        if (finite(value) <= 0) throw new Error('Height must be positive');
        node.Size = { ...node.Size, Y: value };
      },
      'number',
    );
    field(
      'Rotation °',
      Number(((node.Rotation * 180) / Math.PI).toFixed(1)),
      (value) => {
        node.Rotation = (finite(value) * Math.PI) / 180;
      },
      'number',
    );
    section('APPEARANCE');
    field(
      'Shape',
      node.Shape,
      (value) => {
        node.Shape = value;
      },
      'text',
      ['Box', 'Circle'],
    );
    field(
      'Color',
      node.Color,
      (value) => {
        node.Color = value;
      },
      'color',
    );
    const textureRow = el('div', 'texture-row');
    const upload = el('input');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    upload.setAttribute('aria-label', 'Sprite image');
    upload.onchange = () => {
      const file = upload.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        onError('Sprite images must be below 4 MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        store.transact(() => {
          node.Texture = reader.result;
        });
      reader.readAsDataURL(file);
    };
    const clear = el('button', 'subtle-button', node.Texture ? 'Remove sprite' : 'No sprite');
    clear.disabled = !node.Texture;
    clear.onclick = () =>
      store.transact(() => {
        node.Texture = '';
      });
    textureRow.append(el('span', '', 'Sprite image'), upload, clear);
    container.append(textureRow);
    field(
      'Health bar',
      node.ShowHealthBar,
      (value) => {
        node.ShowHealthBar = value;
      },
      'checkbox',
    );
    field(
      'Visible',
      node.Visible,
      (value) => {
        node.Visible = value;
      },
      'checkbox',
    );
    field(
      'Layer',
      node.Layer,
      (value) => {
        node.Layer = finite(value);
      },
      'number',
    );
    section('PHYSICS');
    for (const key of ['Anchored', 'Sensor'])
      field(
        key,
        node[key],
        (value) => {
          node[key] = value;
        },
        'checkbox',
      );
    field(
      'Collision group',
      node.CollisionGroup,
      (value) => {
        node.CollisionGroup = value;
      },
      'text',
      ['world', 'player', 'zombie', 'projectile', 'decoration'],
    );
    field(
      'Friction',
      node.Friction,
      (value) => {
        node.Friction = Math.max(0, finite(value));
      },
      'number',
    );
    field(
      'Restitution',
      node.Restitution,
      (value) => {
        node.Restitution = Math.max(0, Math.min(1, finite(value)));
      },
      'number',
    );
  }
  if (node.ClassName.endsWith('Script')) {
    section('SCRIPT');
    field(
      'Enabled',
      node.Enabled,
      (value) => {
        node.Enabled = value;
      },
      'checkbox',
    );
    container.append(
      el(
        'p',
        'inspector-note',
        node.ClassName === 'ModuleScript'
          ? 'Modules return a value and run once when required.'
          : 'Scripts run when Play starts, or when parented into a running scene.',
      ),
    );
  }
  section('ATTRIBUTES');
  for (const [name, value] of Object.entries(node.GetAttributes())) {
    const composite = value !== null && typeof value === 'object';
    const input = field(
      name,
      composite ? JSON.stringify(value) : value,
      (v) => node.SetAttribute(name, composite ? JSON.parse(v) : v),
      typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text',
    );
    const remove = el('button', 'attribute-remove', 'Remove ' + name);
    remove.type = 'button';
    remove.onclick = () => store.transact(() => node.SetAttribute(name, undefined));
    input.parentElement.append(remove);
  }
  const addAttribute = el('form', 'attribute-add');
  const attributeName = el('input');
  attributeName.placeholder = 'Attribute name';
  attributeName.required = true;
  attributeName.setAttribute('aria-label', 'Attribute name');
  const attributeType = el('select');
  attributeType.setAttribute('aria-label', 'Attribute type');
  for (const type of ['String', 'Number', 'Boolean', 'JSON']) {
    const option = el('option', '', type);
    option.value = type;
    attributeType.append(option);
  }
  const attributeValue = el('input');
  attributeValue.placeholder = 'Value';
  attributeValue.setAttribute('aria-label', 'Attribute value');
  const add = el('button', 'subtle-button', 'Add attribute');
  add.type = 'submit';
  addAttribute.append(attributeName, attributeType, attributeValue, add);
  addAttribute.onsubmit = (event) => {
    event.preventDefault();
    try {
      const name = attributeName.value.trim();
      if (!name) return;
      let value = attributeValue.value;
      if (attributeType.value === 'Number') {
        value = Number(value);
        if (!Number.isFinite(value)) throw new Error('Attribute must be a finite number');
      }
      if (attributeType.value === 'Boolean') {
        if (!['true', 'false'].includes(value))
          throw new Error('Boolean value must be true or false');
        value = value === 'true';
      }
      if (attributeType.value === 'JSON') value = JSON.parse(value);
      store.transact(() => node.SetAttribute(name, value));
    } catch (error) {
      onError(error.message);
    }
  };
  container.append(addAttribute);
  if (store.canRemove(node)) {
    const actions = el('div', 'inspector-actions');
    const duplicate = el('button', 'subtle-button', 'Duplicate');
    duplicate.onclick = () => store.duplicate();
    const remove = el('button', 'subtle-button danger', 'Delete');
    remove.onclick = () => store.remove();
    actions.append(duplicate, remove);
    container.append(actions);
  }
}
