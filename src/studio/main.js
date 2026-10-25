import '../game.css';
import './studio.css';
import { zipSync, strToU8 } from 'fflate';
import { StudioStore } from './store.js';
import { el, download } from './dom.js';
import { renderHierarchy } from './hierarchy.js';
import { renderInspector } from './inspector.js';
import { Renderer } from '../engine/renderer.js';
import { Vector2 } from '../engine/math.js';
import { validateProject, SceneNode, serializeNode } from '../engine/scene.js';
import { exampleProject } from '../example.js';
import { GameView } from '../game-view.js';

const STORAGE_KEY = 'openengine.document.v1';
const app = document.querySelector('#app');
app.innerHTML = `
  <header class="app-header">
    <div class="brand"><span class="brand-mark">◈</span> OpenEngine <span class="studio-tag">STUDIO</span></div>
    <div class="document-title"><span class="document-dot"></span><span id="project-name"></span><span class="version-label">2D · Lua</span></div>
    <button id="docs" class="icon-button" title="Quick guide">? <span>Guide</span></button>
  </header>
  <nav class="toolbar" aria-label="Studio toolbar">
    <div class="toolbar-group"><button id="new-project" title="Create empty project">New</button><button id="open-project">Open</button><button id="save-project" title="Save project · Ctrl+S">Save <kbd>⌘ S</kbd></button></div>
    <div class="toolbar-group"><button id="undo" title="Undo · Ctrl+Z">↶</button><button id="redo" title="Redo · Ctrl+Shift+Z">↷</button></div>
    <div class="toolbar-group"><select id="add-class" aria-label="Insert object"><option value="">＋ Insert</option><option>PhysicsObject</option><option>Folder</option><option>Script</option><option>ModuleScript</option></select></div>
    <div class="toolbar-spacer"></div>
    <button id="build-project" class="build-button">↗ Build game</button>
    <button id="play" class="primary play-button">▶ <span>Play</span><kbd>F5</kbd></button>
  </nav>
  <main class="studio-layout">
    <aside class="hierarchy-panel"><div class="panel-heading"><span>EXPLORER</span><span id="object-count"></span></div><div id="tree" role="tree" aria-label="Scene hierarchy"></div><div class="hierarchy-footer">Drag objects to reparent</div></aside>
    <section class="center-panel">
      <div class="viewport-tabs"><button id="scene-tab" class="active">◈ Scene</button><button id="script-tab" hidden>⌁ Script</button><span id="breadcrumb"></span></div>
      <div id="viewport"><canvas id="scene-canvas" aria-label="Scene editor. Drag objects to move them."></canvas><div class="viewport-label"><span class="live-dot"></span> EDITOR <span>TOP · ORTHOGRAPHIC</span></div><div class="viewport-tools"><button id="frame-selection" title="Frame selected object · F">⌖ Frame</button><button id="grid" class="active" title="Toggle grid">▦ Grid</button><button id="snap" title="Snap movement to 25 units">⌗ Snap</button><span id="zoom-label">70%</span></div><div class="viewport-hint">Drag to move · Wheel to zoom · Middle drag to pan</div><div class="axis"><span>X</span> ─<br>│ <span>Y</span></div></div>
      <div id="code-panel" hidden><div class="code-heading"><span id="code-path"></span><span>LUA 5.3</span></div><div class="code-editor"><pre id="line-numbers" aria-hidden="true"></pre><textarea id="source" spellcheck="false" aria-label="Lua script source" autocapitalize="off"></textarea></div><div class="code-footer">Scripts execute only during Play. Modules run when required.</div></div>
      <section class="console-panel"><div class="console-heading"><span>OUTPUT <span id="log-count">0</span></span><div><button id="clear-console">Clear</button><button id="toggle-console" title="Toggle output">⌄</button></div></div><div id="console" role="log" aria-label="Engine output"></div></section>
    </section>
    <aside class="inspector-panel"><div class="panel-heading"><span>PROPERTIES</span><span>⚙</span></div><div id="inspector"></div></aside>
  </main>
  <footer class="statusbar"><span><i></i> <span id="status">Ready</span></span><span id="selection-info"></span><span>OpenEngine 0.1</span></footer>
  <div id="play-host" hidden></div><div id="dialog-host"></div><input type="file" id="open-file" accept=".openengine,.json" hidden>
`;
const $ = (id) => document.getElementById(id);
let initial = exampleProject();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) initial = validateProject(JSON.parse(saved));
} catch {
  /* Invalid old autosaves must not prevent Studio startup. */
}
const store = new StudioStore(initial);
const renderer = new Renderer($('scene-canvas'));
renderer.camera.Zoom = 0.7;
let gameView = null,
  codeId,
  codeMode = false,
  grid = true,
  snap = false,
  drag,
  saveTimer,
  logCount = 0;
let statusTimer;
function status(message) {
  $('status').textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    $('status').textContent = 'Ready · autosaved locally';
  }, 4000);
}
function log(level, message) {
  const row = el('div', `log-row ${level}`);
  row.append(
    el('span', 'log-time', new Date().toLocaleTimeString([], { hour12: false })),
    el('span', 'log-level', level === 'error' ? '×' : level === 'warning' ? '!' : '›'),
    el('span', 'log-text', message),
  );
  $('console').append(row);
  while ($('console').children.length > 250) $('console').firstChild.remove();
  $('log-count').textContent = String(++logCount);
  $('console').scrollTop = $('console').scrollHeight;
  if (level === 'error') status(message);
}
const error = (message) => log('error', message);
function showDialog(title, content) {
  const backdrop = el('div', 'dialog-backdrop'),
    dialog = el('section', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);
  const heading = el('div', 'dialog-heading');
  heading.append(el('h2', '', title));
  const close = el('button', 'icon-button', '×');
  close.setAttribute('aria-label', 'Close guide');
  close.onclick = () => backdrop.remove();
  heading.append(close);
  dialog.append(heading, content);
  backdrop.append(dialog);
  $('dialog-host').replaceChildren(backdrop);
  backdrop.onclick = (event) => {
    if (event.target === backdrop) backdrop.remove();
  };
  close.focus();
  backdrop.onkeydown = (event) => {
    if (event.key === 'Escape') backdrop.remove();
  };
}
function guide() {
  const content = el('div', 'guide-content');
  for (const [title, description] of [
    [
      'Build something',
      'Insert PhysicsObjects, folders, scripts and modules from the toolbar. Select a node in Explorer to edit its properties. Drag nodes onto other nodes to change their Parent.',
    ],
    [
      'Shape the scene',
      'Drag objects in the viewport. Scroll to zoom, middle-drag or Alt-drag to pan, and press F to frame the selection. Snap aligns movement to a 25-unit grid. Rotation and dimensions are in Properties.',
    ],
    [
      'Write Lua',
      'Select a Script or ModuleScript to edit its source. Use script.Parent, game:GetService("Workspace"), Instance.new, events and require(module). See docs/API.md for the full API.',
    ],
    [
      'Play & iterate',
      'F5 starts or stops a fresh play session. The zombie example uses WASD, mouse aim and hold-to-fire. Play changes never overwrite your scene.',
    ],
    [
      'Save & ship',
      'Save downloads a self-contained .openengine file, including scripts. Build creates an offline web game; packaged desktop Studio also exports a native game. The CLI can produce a Windows .exe from this repository.',
    ],
    [
      'Your work',
      'Edits autosave in this browser. Keep downloaded project files as backups. Undo/redo covers scene edits, script changes, imports, and new projects. Ctrl/Cmd+S saves, Ctrl/Cmd+D duplicates, Delete removes.',
    ],
  ]) {
    content.append(el('h3', '', title), el('p', '', description));
  }
  const load = el('button', 'primary', 'Load Dead Signal example');
  load.onclick = () => {
    store.load(exampleProject());
    $('dialog-host').replaceChildren();
    status('Example loaded · undo restores your previous project');
  };
  content.append(load);
  showDialog('Welcome to OpenEngine', content);
}
function updateLines() {
  $('line-numbers').textContent = Array.from(
    { length: $('source').value.split('\n').length },
    (_, i) => i + 1,
  ).join('\n');
}
function showCode(show) {
  codeMode = show && !!store.selected?.ClassName.endsWith('Script');
  $('viewport').hidden = codeMode;
  $('code-panel').hidden = !codeMode;
  $('scene-tab').classList.toggle('active', !codeMode);
  $('script-tab').classList.toggle('active', codeMode);
}
function render() {
  renderer.assets = store.metadata.assets || {};
  renderHierarchy($('tree'), store, error);
  renderInspector($('inspector'), store, error);
  $('project-name').textContent = store.metadata.name;
  document.title = `${store.metadata.name} — OpenEngine Studio`;
  $('object-count').textContent = String(store.nodes.length);
  const selected = store.selected;
  $('breadcrumb').textContent = selected?.GetFullName().replace('game.', '') || 'Workspace';
  $('selection-info').textContent = selected
    ? `${selected.Name} · ${selected.ClassName}`
    : 'No selection';
  $('undo').disabled = !store.undoStack.length;
  $('redo').disabled = !store.redoStack.length;
  const isScript = selected?.ClassName.endsWith('Script');
  $('script-tab').hidden = !isScript;
  if (isScript) {
    $('script-tab').textContent = `⌁ ${selected.Name}`;
    $('code-path').textContent = selected.GetFullName();
    if (document.activeElement !== $('source') || codeId !== selected.Id) {
      $('source').value = selected.Source;
      updateLines();
    }
    if (codeId !== selected.Id) {
      codeId = selected.Id;
      showCode(true);
    }
  } else {
    codeId = undefined;
    showCode(false);
  }
}
store.Changed.Connect((reason) => {
  if (reason !== 'code') render();
  if (reason === 'document') {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.project));
        status('Saved locally');
      } catch {
        status('Local autosave unavailable · use Save to back up your project');
      }
    }, 300);
  }
});
$('source').addEventListener('input', () => {
  if (!store.selected?.ClassName.endsWith('Script')) return;
  store.transact(() => {
    store.selected.Source = $('source').value;
  }, `source:${codeId}`);
  updateLines();
});
$('source').addEventListener('scroll', () => {
  $('line-numbers').scrollTop = $('source').scrollTop;
});
$('source').addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const input = $('source');
    input.setRangeText('    ', input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input'));
  }
});
$('scene-tab').onclick = () => showCode(false);
$('script-tab').onclick = () => showCode(true);
$('add-class').onchange = () => {
  if ($('add-class').value) store.add($('add-class').value);
  $('add-class').value = '';
};
$('undo').onclick = () => store.undo();
$('redo').onclick = () => store.redo();
$('grid').onclick = () => {
  grid = !grid;
  $('grid').classList.toggle('active', grid);
};
$('snap').onclick = () => {
  snap = !snap;
  $('snap').classList.toggle('active', snap);
};
$('frame-selection').onclick = () => {
  const node = store.selected;
  renderer.camera.Position =
    node?.ClassName === 'PhysicsObject'
      ? new Vector2(node.Position.X, node.Position.Y)
      : new Vector2();
};
$('clear-console').onclick = () => {
  $('console').replaceChildren();
  logCount = 0;
  $('log-count').textContent = '0';
};
$('toggle-console').onclick = () =>
  document.querySelector('.console-panel').classList.toggle('collapsed');
$('docs').onclick = guide;
const titleButton = document.querySelector('.document-title');
titleButton.tabIndex = 0;
titleButton.setAttribute('role', 'button');
titleButton.setAttribute('aria-label', 'Project settings');
function settings() {
  const form = el('form', 'project-settings');
  const fields = {};
  for (const [key, title] of [
    ['name', 'Game name'],
    ['description', 'Description'],
    ['controls', 'Control hint'],
  ]) {
    const row = el('label');
    row.append(el('span', '', title));
    const input = el('input');
    input.value = store.metadata[key] || '';
    input.name = key;
    input.maxLength = key === 'name' ? 80 : 300;
    if (key === 'name') input.required = true;
    row.append(input);
    form.append(row);
    fields[key] = input;
  }
  const apply = el('button', 'primary', 'Save settings');
  apply.type = 'submit';
  form.append(apply);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!fields.name.value.trim()) return;
    store.transact(() => {
      for (const [key, input] of Object.entries(fields)) store.metadata[key] = input.value.trim();
    });
    $('dialog-host').replaceChildren();
    status('Project settings saved');
  };
  showDialog('Project settings', form);
  fields.name.focus();
}
titleButton.onclick = settings;
titleButton.onkeydown = (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    settings();
  }
};

$('new-project').onclick = () => {
  const services = ['Workspace', 'ScriptService'].map((name) =>
    serializeNode(new SceneNode('Folder', name)),
  );
  store.load({ format: 'openengine', version: 1, name: 'Untitled game', services });
  for (const service of store.root.GetChildren()) store.expanded.add(service.Id);
  render();
  status('New project · undo restores your previous project');
};
async function save() {
  try {
    const text = JSON.stringify(store.project, null, 2);
    const name = `${store.metadata.name.replace(/[^\w -]/g, '') || 'Project'}.openengine`;
    if (window.desktop) {
      const result = await window.desktop.saveProject(text, name);
      if (!result) return;
    } else download(name, text);
    status('Project saved');
  } catch (e) {
    error(e.message);
  }
}
$('save-project').onclick = save;
async function importProject(text) {
  const project = validateProject(JSON.parse(text));
  const hasRefs = (node) => node.SourceFile || node.children.some(hasRefs);
  if (
    project.services.some(hasRefs) ||
    Object.values(project.assets || {}).some((asset) => asset.SourceFile)
  )
    throw new Error(
      'This source project references external Lua files. Open a self-contained Studio save, or use the bundled example from Guide.',
    );
  store.load(project);
  status('Project opened');
}
$('open-project').onclick = async () => {
  try {
    if (window.desktop) {
      const text = await window.desktop.openProject();
      if (text) await importProject(text);
    } else $('open-file').click();
  } catch (e) {
    error(e.message);
  }
};
$('open-file').onchange = async (event) => {
  try {
    if (event.target.files[0]) await importProject(await event.target.files[0].text());
  } catch (e) {
    error(e.message);
  }
  event.target.value = '';
};
function stopPlay() {
  gameView?.dispose();
  gameView = null;
  $('play-host').hidden = true;
  $('play').querySelector('span').textContent = 'Play';
  status('Stopped · scene restored');
}
function play() {
  if (gameView) {
    stopPlay();
    return;
  }
  try {
    $('play-host').hidden = false;
    gameView = new GameView($('play-host'), store.project, {
      onLog: (entry) => log(entry.level, entry.message),
      onStop: stopPlay,
    });
    $('play').querySelector('span').textContent = 'Stop';
    status('Playing');
  } catch (e) {
    stopPlay();
    error(e.message);
  }
}
$('play').onclick = play;
$('build-project').onclick = async () => {
  const content = el('div', 'build-content');
  content.append(
    el(
      'p',
      '',
      'Export a playable game with its scene, Lua scripts, physics and runtime. No editor is included in the game UI.',
    ),
  );
  const web = el('button', 'export-option');
  web.append(
    el('strong', '', 'Web game  ↗'),
    el('span', '', 'Offline HTML runtime in a ZIP. Unzip and open index.html.'),
  );
  web.onclick = async () => {
    web.disabled = true;
    status('Building web game…');
    try {
      const response = await fetch('./runtime-template.html');
      if (!response.ok)
        throw new Error('Runtime template missing. Run npm run build or restart npm run dev.');
      const template = await response.text();
      if (!template.includes('__OPENENGINE_PROJECT_BASE64__'))
        throw new Error('Invalid runtime template');
      const bytes = new TextEncoder().encode(JSON.stringify(store.project));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const html = template.replace('__OPENENGINE_PROJECT_BASE64__', btoa(binary));
      const zip = zipSync({
        'index.html': strToU8(html),
        'README.txt': strToU8(
          `${store.metadata.name}\n\nOpen index.html in a modern browser. No installation or server is required.\nWASD: move; mouse: aim; hold left click: fire.\n\nPowered by OpenEngine. Third-party license notices are embedded in index.html.\n`,
        ),
      });
      download(`${store.metadata.name}-web.zip`, zip, 'application/zip');
      status('Web game built');
    } catch (e) {
      error(e.message);
    } finally {
      web.disabled = false;
    }
  };
  content.append(web);
  if (window.desktop) {
    const native = el('button', 'export-option');
    native.append(
      el('strong', '', 'Desktop game  ↗'),
      el(
        'span',
        '',
        'Export a standalone game for this operating system using the installed Studio runtime.',
      ),
    );
    native.onclick = async () => {
      native.disabled = true;
      status('Packaging desktop game…');
      try {
        const path = await window.desktop.buildGame(JSON.stringify(store.project));
        if (path) {
          log('info', `Game built: ${path}`);
          status('Desktop game built');
        }
      } catch (e) {
        error(e.message);
      } finally {
        native.disabled = false;
      }
    };
    content.append(native);
  } else {
    content.append(el('h3', '', 'Windows executable'));
    content.append(
      el(
        'p',
        '',
        'Use desktop Studio to export directly, or save this project and run the following command from the repository:',
      ),
    );
    content.append(
      el(
        'code',
        'build-command',
        'npm run package:game -- --project "Your Game.openengine" --platform win32',
      ),
    );
    content.append(
      el(
        'p',
        'muted',
        'The release folder contains the .exe and runtime files. Distribute the entire folder or its ZIP.',
      ),
    );
  }
  showDialog('Build game', content);
};

const canvas = $('scene-canvas');
function pointerWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return renderer.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}
canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const point = pointerWorld(event);
  if (event.button === 1 || event.altKey)
    drag = { pan: true, x: event.clientX, y: event.clientY, position: renderer.camera.Position };
  else if (event.button === 0) {
    const node = renderer.hitTest(store.workspace.GetDescendants(), point);
    store.select(node);
    if (node) drag = { node, start: point, position: node.Position, before: store.project };
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (drag.pan)
    renderer.camera.Position = drag.position.Sub(
      new Vector2(
        (event.clientX - drag.x) / renderer.camera.Zoom,
        (event.clientY - drag.y) / renderer.camera.Zoom,
      ),
    );
  else {
    let position = drag.position.Add(pointerWorld(event).Sub(drag.start));
    if (snap)
      position = new Vector2(Math.round(position.X / 25) * 25, Math.round(position.Y / 25) * 25);
    drag.node.Position = position;
    $('selection-info').textContent =
      `${drag.node.Name} · ${position.X.toFixed(0)}, ${position.Y.toFixed(0)}`;
  }
});
function endDrag() {
  if (drag && !drag.pan && drag.node.Position.Distance(drag.position) > 0.01)
    store.record(drag.before);
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const before = pointerWorld(event);
    renderer.camera.Zoom = Math.max(
      0.15,
      Math.min(3, renderer.camera.Zoom * Math.exp(-event.deltaY * 0.001)),
    );
    const after = pointerWorld(event);
    renderer.camera.Position = renderer.camera.Position.Add(before.Sub(after));
    $('zoom-label').textContent = `${Math.round(renderer.camera.Zoom * 100)}%`;
  },
  { passive: false },
);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'F5') {
    event.preventDefault();
    play();
    return;
  }
  if (gameView) return;
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    document.activeElement?.blur();
    save();
  }
  if (mod && event.key.toLowerCase() === 'z' && !typing) {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
  }
  if (mod && event.key.toLowerCase() === 'd' && !typing) {
    event.preventDefault();
    store.duplicate();
  }
  if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    store.remove();
  }
  if (!typing && event.key.toLowerCase() === 'f') $('frame-selection').click();
});
window.addEventListener('beforeunload', () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.project));
  } catch {}
  gameView?.dispose();
});
function frame() {
  if (!gameView && !codeMode)
    renderer.draw(store.workspace.GetDescendants(), { grid, selected: store.selected });
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
log('info', 'Studio ready. Select an object to edit, or press Play to try Dead Signal.');
