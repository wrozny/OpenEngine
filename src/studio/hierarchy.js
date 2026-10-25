import { el, icon } from './dom.js';
export function renderHierarchy(container, store, onError) {
  container.replaceChildren();
  function row(node, depth) {
    const children = node.GetChildren();
    const item = el('div', `tree-row ${node.Id === store.selectedId ? 'selected' : ''}`);
    item.style.paddingLeft = `${10 + depth * 16}px`;
    item.dataset.id = node.Id;
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-selected', String(node.Id === store.selectedId));
    item.tabIndex = 0;
    const arrow = el(
      'button',
      'tree-arrow',
      children.length ? (store.expanded.has(node.Id) ? '▾' : '▸') : '',
    );
    arrow.setAttribute('aria-label', `Expand ${node.Name}`);
    arrow.tabIndex = -1;
    arrow.onclick = (event) => {
      event.stopPropagation();
      store.expanded.has(node.Id) ? store.expanded.delete(node.Id) : store.expanded.add(node.Id);
      renderHierarchy(container, store, onError);
    };
    item.append(
      arrow,
      el('span', `tree-icon ${node.ClassName.toLowerCase()}`, icon(node)),
      el('span', 'tree-name', node.Name),
    );
    if (node.ClassName.endsWith('Script') && !node.Enabled) item.classList.add('disabled-script');
    item.onclick = () => store.select(node);
    item.onkeydown = (event) => {
      if (event.key === 'Enter') store.select(node);
    };
    item.draggable = store.canRemove(node);
    item.ondragstart = (event) => {
      event.dataTransfer.setData('text/openengine', node.Id);
    };
    item.ondragover = (event) => {
      if (event.dataTransfer.types.includes('text/openengine')) {
        event.preventDefault();
        item.classList.add('drop-target');
      }
    };
    item.ondragleave = () => item.classList.remove('drop-target');
    item.ondrop = (event) => {
      event.preventDefault();
      item.classList.remove('drop-target');
      const source = store.nodes.find(
        (n) => n.Id === event.dataTransfer.getData('text/openengine'),
      );
      if (source)
        try {
          store.reparent(source, node);
        } catch (error) {
          onError(error.message);
        }
    };
    container.append(item);
    if (store.expanded.has(node.Id)) children.forEach((child) => row(child, depth + 1));
  }
  store.root.GetChildren().forEach((node) => row(node, 0));
}
