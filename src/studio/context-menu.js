import { el } from './dom.js';

/** A keyboard-accessible context menu with explicit operations, never HTML from project data. */
export class ContextMenu {
  show(x, y, items) {
    this.close();
    const root = el('div', 'context-menu');
    root.setAttribute('role', 'menu');
    for (const item of items) {
      if (item.separator) {
        root.append(el('div', 'menu-separator'));
        continue;
      }
      const button = el('button', item.danger ? 'danger' : '');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.disabled = !!item.disabled;
      button.append(el('span', '', item.label));
      if (item.shortcut) button.append(el('kbd', '', item.shortcut));
      button.onclick = () => {
        this.close();
        item.action();
      };
      root.append(button);
    }
    document.body.append(root);
    this.root = root;
    root.style.left = Math.min(x, window.innerWidth - root.offsetWidth - 8) + 'px';
    root.style.top = Math.min(y, window.innerHeight - root.offsetHeight - 8) + 'px';
    this.abort = new AbortController();
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (!root.contains(event.target)) this.close();
      },
      { signal: this.abort.signal, capture: true },
    );
    root.onkeydown = (event) => {
      const buttons = [...root.querySelectorAll('button:not(:disabled)')],
        index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        this.close();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        buttons[
          (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus();
      }
    };
    root.querySelector('button:not(:disabled)')?.focus();
  }
  close() {
    this.root?.remove();
    this.root = null;
    this.abort?.abort();
  }
}

export function sceneMenu(store, { frame, insert, onError, rename }, position) {
  const safe = (action) => () => {
    try {
      action();
    } catch (error) {
      onError(error.message);
    }
  };
  const object = store.dimension === '3D' ? 'Object3D' : 'Object2D';
  return [
    {
      label: 'Rename',
      shortcut: 'F2',
      disabled: !store.canRemove(store.selected),
      action: () => rename?.(),
    },
    ...[
      object,
      store.dimension === '3D' ? 'Car3D' : 'Car2D',
      'UIListLayout',
      'UIGridLayout',
      'UICorner',
      'UIPadding',
      'ScreenGui',
      'Frame',
      'TextLabel',
      'TextButton',
      'ImageLabel',
      'TextInput',
      'Folder',
      'Script',
      'ServerScript',
      'LocalScript',
      'RemoteEvent',
      'ModuleScript',
      store.dimension === '3D' ? 'PlayerController3D' : 'PlayerController2D',
    ].map((className) => ({
      label: 'Insert ' + className,
      action: safe(() => insert(className, position)),
    })),
    { separator: true },
    { label: 'Frame selection', shortcut: 'F', disabled: !store.selected, action: frame },
    {
      label: 'Duplicate selection',
      shortcut: 'Ctrl+D',
      disabled: !store.topSelection().length,
      action: safe(() => store.duplicate()),
    },
    {
      label: 'Delete selection',
      shortcut: 'Delete',
      danger: true,
      disabled: !store.topSelection().length,
      action: safe(() => store.remove()),
    },
  ];
}
