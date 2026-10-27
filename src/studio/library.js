import { el } from './dom.js';
const snippets = {
  'Frame update':
    'local run = game:GetService("RunService")\nrun.Heartbeat:Connect(function(dt)\n    -- Update gameplay here.\nend)\n',
  'Collision trigger':
    'local object = script.Parent\nobject.OnCollisionStart:Connect(function(other)\n    print("Entered", other.Name)\nend)\nobject.OnCollisionEnd:Connect(function(other)\n    print("Left", other.Name)\nend)\n',
  'Drive car':
    'local input = game:GetService("InputService")\nlocal run = game:GetService("RunService")\nlocal motor = script.Parent\nrun.Heartbeat:Connect(function()\n    motor:SetInput(input:GetAxis("s", "w"), -input:GetAxis("a", "d"), input:IsKeyDown("space") and 1 or 0)\nend)\n',
};
/** Searchable local catalog. Dropping into Explorer uses the exact target as parent. */
export class InsertLibrary {
  constructor(store, onError) {
    this.store = store;
    this.onError = onError;
    this.host = el('dialog', 'insert-library');
    const header = el('div', 'panel-subheader', '', ''),
      title = el('strong', '', 'Insert library'),
      close = el('button', '', 'Close');
    close.onclick = () => this.host.close();
    header.append(title, close);
    const search = el('input', 'property-search');
    search.placeholder = 'Find objects, layouts or behaviors';
    search.setAttribute('aria-label', 'Search insert library');
    const list = el('div', 'library-items');
    this.host.append(header, search, list);
    document.body.append(this.host);
    this.items = [
      'Object2D',
      'Object3D',
      'Car2D',
      'Car3D',
      'Folder',
      'RemoteEvent',
      'ScreenGui',
      'Frame',
      'TextLabel',
      'TextButton',
      'ImageLabel',
      'TextInput',
      'UIListLayout',
      'UIGridLayout',
      'UICorner',
      'UIPadding',
      ...Object.keys(snippets),
    ];
    const render = () => {
      list.replaceChildren();
      for (const name of this.items.filter((n) =>
        n.toLowerCase().includes(search.value.toLowerCase()),
      )) {
        const b = el('button', 'library-item', name);
        b.draggable = true;
        b.ondragstart = (e) => {
          e.dataTransfer.setData('text/openengine-insert', name);
        };
        b.onclick = () => {
          this.insert(name);
          this.host.close();
        };
        list.append(b);
      }
    };
    search.oninput = render;
    render();
    this.abort = new AbortController();
    document.addEventListener(
      'dragover',
      (e) => {
        if (e.dataTransfer.types.includes('text/openengine-insert')) e.preventDefault();
      },
      { signal: this.abort.signal },
    );
    document.addEventListener(
      'drop',
      (e) => {
        const name = e.dataTransfer.getData('text/openengine-insert');
        if (!this.items.includes(name)) return;
        e.preventDefault();
        const row = e.target.closest('.tree-row');
        if (row) {
          const target = store.nodes.find((n) => n.Id === row.dataset.id);
          if (target) store.select(target);
        }
        this.insert(name);
        this.host.close();
      },
      { signal: this.abort.signal },
    );
  }
  insert(name) {
    try {
      if (snippets[name]) {
        const node = this.store.add(this.store.metadata.multiplayer ? 'LocalScript' : 'Script');
        this.store.transact(() => {
          node.Name = name;
          node.Source = snippets[name];
        });
      } else this.store.add(name);
    } catch (error) {
      this.onError(error.message);
    }
  }
  show() {
    this.host.show();
    this.host.querySelector('input').focus();
  }
  dispose() {
    this.abort.abort();
    this.host.remove();
  }
}
