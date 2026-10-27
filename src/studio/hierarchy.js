import { el } from './dom.js';
import { nodeGlyph, glyph } from './icons.js';
import { isScriptNode } from '../engine/scene.js';
export function renderHierarchy(container, store, onError, onMenu = () => {}) {
  container.replaceChildren();
  const visible = [];
  function rename(node, item) {
    if (!store.canRemove(node)) return;
    const input = el('input', 'tree-rename');
    input.value = node.Name;
    input.setAttribute('aria-label', 'Rename ' + node.Name);
    item.querySelector('.tree-name').replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      try {
        if (commit) store.rename(node, input.value);
      } catch (error) {
        onError(error.message);
      }
      renderHierarchy(container, store, onError, onMenu);
    };
    input.onclick = (e) => e.stopPropagation();
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    input.onblur = () => finish(true);
  }
  container.onrename = () => {
    const node = store.selected,
      item = container.querySelector('[data-id="' + node?.Id + '"]');
    if (item) rename(node, item);
  };
  function row(node, depth) {
    visible.push(node);
    const children = node.GetChildren();
    const selected = store.selectedIds.has(node.Id);
    const item = el('div', `tree-row ${selected ? 'selected' : ''}`);
    item.style.paddingLeft = `${8 + depth * 18}px`;
    item.dataset.id = node.Id;
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = 0;
    const arrow = el('button', 'tree-arrow');
    arrow.type = 'button';
    arrow.setAttribute('aria-label', 'Expand ' + node.Name);
    arrow.tabIndex = -1;
    if (children.length)
      arrow.append(glyph(store.expanded.has(node.Id) ? 'ChevronDown' : 'ChevronRight', 14));
    arrow.onclick = (event) => {
      event.stopPropagation();
      store.expanded.has(node.Id) ? store.expanded.delete(node.Id) : store.expanded.add(node.Id);
      renderHierarchy(container, store, onError, onMenu);
    };
    const icon = el('span', 'tree-icon ' + node.ClassName.toLowerCase());
    icon.append(nodeGlyph(node));
    item.append(arrow, icon, el('span', 'tree-name', node.Name));
    if (isScriptNode(node) && !node.Enabled) item.classList.add('disabled-script');
    item.onclick = (event) => {
      if (event.shiftKey && store.selectedId) {
        const a = visible.findIndex((n) => n.Id === store.selectedId),
          b = visible.indexOf(node);
        if (a >= 0) {
          store.selectMany(
            visible.slice(Math.min(a, b), Math.max(a, b) + 1),
            event.ctrlKey || event.metaKey,
          );
          return;
        }
      }
      store.select(node, event.ctrlKey || event.metaKey);
    };
    item.onkeydown = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        rename(node, item);
        return;
      }
      if (event.key === 'Enter') store.select(node, event.ctrlKey || event.metaKey);
    };
    item.ondblclick = () => rename(node, item);
    item.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selected) store.select(node);
      onMenu(event);
    };
    item.draggable = store.canRemove(node);
    item.ondragstart = (event) => {
      if (!selected) store.select(node);
      event.dataTransfer.setData(
        'text/openengine',
        JSON.stringify(store.topSelection().map((n) => n.Id)),
      );
    };
    item.ondragover = (event) => {
      if (event.dataTransfer.types.includes('text/openengine') && !isScriptNode(node)) {
        event.preventDefault();
        item.classList.add('drop-target');
      }
    };
    item.ondragleave = () => item.classList.remove('drop-target');
    item.ondrop = (event) => {
      event.preventDefault();
      item.classList.remove('drop-target');
      try {
        if (isScriptNode(node)) throw new Error('Scripts cannot contain scene objects');
        const ids = JSON.parse(event.dataTransfer.getData('text/openengine'));
        const targets = store.nodes.filter((n) => ids.includes(n.Id) && store.canRemove(n));
        store.transact(() => {
          for (const target of targets) target.Parent = node;
        });
        store.expanded.add(node.Id);
        store.Changed.Fire('selection');
      } catch (error) {
        onError(error.message);
      }
    };
    container.append(item);
    if (store.expanded.has(node.Id)) children.forEach((child) => row(child, depth + 1));
  }
  store.root.GetChildren().forEach((node) => row(node, 0));
  container.oncontextmenu = (event) => {
    event.preventDefault();
    onMenu(event);
  };
}
