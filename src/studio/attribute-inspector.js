import { el } from './dom.js';
export function renderAttributes(container, store, node, { section, field }, onError) {
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
}
