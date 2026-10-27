import { InsertLibrary } from './library.js';
import { UIEditor } from './ui-editor.js';
import { isUINode } from '../engine/ui-schema.js';
import { StudioNetworkSession } from './network-session.js';
import '../game.css';
import './studio.css';
import { StudioStore } from './store.js';
import { ProjectFiles, createProject } from './projects.js';
import { ProjectLauncher } from './launcher.js';
import { StudioDock } from './dock.js';
import { SceneViewport } from './viewport.js';
import { ContextMenu, sceneMenu } from './context-menu.js';
import { LuaEditor } from './code-editor.js';
import { renderHierarchy } from './hierarchy.js';
import { renderInspector } from './inspector.js';
import { el } from './dom.js';
import { decorateButton } from './icons.js';
import { showGuide, showSettings, showBuild } from './dialogs.js';
import { isScriptNode } from '../engine/scene.js';
import { exampleProjects } from '../example.js';
import { GameView } from '../game-view.js';

const app = document.querySelector('#app');
app.innerHTML = `
<header class="app-header">
  <button id="home" class="brand" title="Project launcher"><span class="brand-icon"></span><strong>OpenEngine</strong></button>
  <button id="project-settings" class="document-title" title="Project settings"><span id="project-name">No project</span><span id="project-dimension"></span><span id="dirty-mark"></span></button>
  <div class="header-actions"><button id="reset-layout" title="Restore panel layout">Reset layout</button><button id="docs">Guide</button></div>
</header>
<nav class="toolbar" aria-label="Studio toolbar">
  <div class="toolbar-group"><button id="new-project">New</button><button id="open-project">Open</button><button id="save-project" title="Save · Ctrl+S">Save</button></div>
  <div class="toolbar-group"><button id="undo" title="Undo · Ctrl+Z" aria-label="Undo"></button><button id="redo" title="Redo · Ctrl+Shift+Z" aria-label="Redo"></button></div>
  <button id="insert-object">Insert</button><button id="insert-library">Library</button><div class="toolbar-spacer"></div><button id="build-project">Build game</button><button id="play" class="primary"><span>Play</span><kbd>F5</kbd></button>
</nav>
<main id="dock-host"></main>
<footer class="statusbar"><span id="status">Ready</span><span id="selection-info">No selection</span><span>OpenEngine 0.6</span></footer>
<div id="play-host" hidden></div><div id="launch-host" hidden></div><div id="dialog-host"></div><input type="file" id="open-file" accept=".openengine,.json" hidden>
`;
const $ = (id) => document.getElementById(id);
for (const [id, name] of Object.entries({
  home: 'House',
  'new-project': 'FilePlus',
  'open-project': 'FolderOpen',
  'save-project': 'Save',
  undo: 'Undo2',
  redo: 'Redo2',
  'insert-object': 'Plus',
  'build-project': 'Box',
  play: 'Play',
  'reset-layout': 'LayoutTemplate',
  docs: 'CircleHelp',
}))
  decorateButton($(id), name);

const explorer = el('section', 'panel explorer-panel');
explorer.innerHTML =
  '<div class="panel-subheader"><span>Scene hierarchy</span><span id="object-count"></span></div><input id="hierarchy-search" class="property-search" aria-label="Search hierarchy" placeholder="Search names or classes…"><div id="tree" role="tree" aria-label="Scene hierarchy" aria-multiselectable="true"></div><div class="panel-footer">Ctrl/Cmd-click to select more · Right-click for actions</div>';
const scene = el('section', 'panel scene-panel');
scene.innerHTML =
  '<div class="scene-toolbar"><div class="transform-tools"><button id="move-tool" title="Move" aria-label="Move tool"></button><button id="rotate-tool" title="Rotate" aria-label="Rotate tool"></button><button id="scale-tool" title="Scale" aria-label="Scale tool"></button></div><span id="breadcrumb">Workspace</span><button id="frame-selection" title="Frame selection · F">Frame</button><button id="grid" class="active">Grid</button><button id="snap">Snap</button></div><div id="viewport"><div id="viewport-hint">Drag objects · Wheel zoom · Middle drag pan</div></div>';
const scriptPanel = el('section', 'panel script-panel');
scriptPanel.innerHTML =
  '<div class="panel-subheader"><span id="code-path">Select a Script or controller in Explorer</span><span>Lua 5.3</span></div><div id="code-editor"></div>';
const output = el('section', 'panel output-panel');
output.innerHTML =
  '<div class="panel-subheader"><span>Session output <span id="log-count">0</span></span><button id="clear-console">Clear</button></div><div id="console" role="log" aria-label="Engine output"></div>';
const inspector = el('section', 'panel inspector-panel');
inspector.innerHTML = '<div id="inspector"></div>';
// Panels are detached until the dock registers them, so references are captured locally.
const find = (id) =>
  [explorer, scene, scriptPanel, output, inspector]
    .map((panel) => panel.querySelector('#' + id))
    .find(Boolean) || $(id);
const store = new StudioStore(createProject());
let projectOpen = false,
  gameView = null,
  dirty = false,
  saveTimer,
  logCount = 0,
  lastScriptId;
function status(message) {
  $('status').textContent = message;
}
function log(level, message) {
  const row = el('div', 'log-row ' + level);
  row.append(
    el('span', 'log-time', new Date().toLocaleTimeString([], { hour12: false })),
    el('span', 'log-level', level === 'error' ? '×' : '›'),
    el('span', 'log-text', message),
  );
  find('console').append(row);
  while (find('console').children.length > 250) find('console').firstChild.remove();
  find('log-count').textContent = String(++logCount);
  find('console').scrollTop = find('console').scrollHeight;
  if (level === 'error') status(message);
}
const onError = (message) => log('error', message),
  files = new ProjectFiles(status),
  menu = new ContextMenu();
const library = new InsertLibrary(store, onError);
$('insert-library').onclick = () => library.show();
const viewport = new SceneViewport(find('viewport'), store, {
  onMenu: (x, y, position) => openContext(x, y, position),
  onStatus: status,
  onError,
});
const uiEditor = new UIEditor(store, onError);
const code = new LuaEditor(find('code-editor'), store);
const dock = new StudioDock(
  $('dock-host'),
  { explorer, scene, ui: uiEditor.host, script: scriptPanel, output, inspector },
  () => code.layout(),
);
for (const [id, name] of Object.entries({
  'move-tool': 'Move3d',
  'rotate-tool': 'Rotate3d',
  'scale-tool': 'Scaling',
  'frame-selection': 'Crosshair',
  grid: 'Grid3x3',
  snap: 'Magnet',
}))
  decorateButton(find(id), name);
const launcher = new ProjectLauncher($('launch-host'), {
  files,
  onOpen: activateProject,
  onBrowse: browse,
  examples: exampleProjects,
  onError,
});
function activateProject(project) {
  stopPlay();
  code.clearProject();
  store.load(project);
  store.undoStack = [];
  store.redoStack = [];
  projectOpen = true;
  dirty = false;
  lastScriptId = undefined;
  launcher.hide();
  files.rememberBrowser(project);
  render();
  status(project.name + ' · ' + store.dimension);
  dock.activate('scene');
}
function insert(className, position) {
  try {
    store.add(className, { position });
  } catch (error) {
    onError(error.message);
  }
}
function openContext(x, y, position) {
  if (!projectOpen || gameView) return;
  menu.show(
    x,
    y,
    sceneMenu(
      store,
      {
        frame: () => viewport.frameSelection(),
        insert,
        onError,
        rename: () => find('tree').onrename?.(),
      },
      position,
    ),
  );
}
find('hierarchy-search').oninput = (event) => {
  store.hierarchyQuery = event.target.value;
  store.Changed.Fire('filter');
};
find('hierarchy-search').onkeydown = (event) => {
  if (event.key === 'Escape') {
    event.target.value = '';
    store.hierarchyQuery = '';
    store.Changed.Fire('filter');
  }
};
function render() {
  renderHierarchy(find('tree'), store, onError, (event) =>
    openContext(event.clientX, event.clientY),
  );
  uiEditor.refresh();
  renderInspector(find('inspector'), store, onError);
  $('project-name').textContent = projectOpen ? store.metadata.name : 'No project';
  $('project-dimension').textContent = store.dimension;
  $('dirty-mark').textContent = dirty ? '●' : '';
  document.title = projectOpen ? store.metadata.name + ' — OpenEngine Studio' : 'OpenEngine Studio';
  find('object-count').textContent = String(store.nodes.length);
  $('selection-info').textContent =
    store.selection.length > 1
      ? store.selection.length + ' selected'
      : store.selected
        ? store.selected.Name + ' · ' + store.selected.ClassName
        : 'No selection';
  find('breadcrumb').textContent =
    store.selected?.GetFullName().replace('game.', '') || 'Workspace';
  $('undo').disabled = !store.undoStack.length;
  $('redo').disabled = !store.redoStack.length;
  for (const id of ['save-project', 'play', 'insert-object', 'build-project'])
    $(id).disabled = !projectOpen;
  const three = store.dimension === '3D';
  find('grid').classList.toggle('active', viewport.grid);
  for (const id of ['move-tool', 'rotate-tool', 'scale-tool']) find(id).hidden = !three;
  find('viewport-hint').textContent = three
    ? 'Right drag look · WASD fly · Middle drag pan'
    : 'Drag objects · Wheel zoom · Middle drag pan';
  if (store.selected && isScriptNode(store.selected)) {
    code.setNode(store.selected);
    find('code-path').textContent = store.selected.GetFullName();
    if (lastScriptId !== store.selected.Id) {
      lastScriptId = store.selected.Id;
      dock.activate('script');
    }
  } else {
    const previous = store.nodes.find((node) => node.Id === code.node?.Id && isScriptNode(node));
    code.setNode(previous);
    if (!previous) find('code-path').textContent = 'Select a Script or controller in Explorer';
    lastScriptId = undefined;
    if (store.selected)
      dock.activate(
        isUINode(store.selected) || store.selected === store.uiService ? 'ui' : 'scene',
      );
  }
}
store.Changed.Connect((reason) => {
  render();
  if (reason === 'document' && projectOpen) {
    dirty = true;
    $('dirty-mark').textContent = '●';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      files.rememberBrowser(store.project);
      try {
        localStorage.setItem('openengine.recovery.v2', JSON.stringify(store.project));
      } catch {
        status('Autosave storage full · use Save to keep a file backup');
      }
    }, 350);
  }
});
async function save(saveAs = false) {
  try {
    if (await files.save(store.project, saveAs)) {
      dirty = false;
      render();
      status('Project saved');
    }
  } catch (error) {
    onError(error.message);
  }
}
async function browse() {
  try {
    if (window.desktop) {
      const project = await files.openNative();
      if (project) activateProject(project);
    } else $('open-file').click();
  } catch (error) {
    onError(error.message);
  }
}
$('open-file').onchange = async (event) => {
  try {
    if (event.target.files[0]) activateProject(await files.importFile(event.target.files[0]));
  } catch (error) {
    onError(error.message);
  }
  event.target.value = '';
};
function stopPlay() {
  if (!gameView) return;
  gameView.dispose();
  gameView = null;
  $('play-host').hidden = true;
  viewport.active = true;
  $('play').querySelector('span').textContent = 'Play';
  status('Stopped · edit document restored');
}
function play() {
  if (gameView) {
    stopPlay();
    return;
  }
  if (!projectOpen) return;
  try {
    $('play-host').hidden = false;
    viewport.active = false;
    gameView = new (store.metadata.multiplayer ? StudioNetworkSession : GameView)(
      $('play-host'),
      store.project,
      {
        onLog: (entry) => log(entry.level, entry.message),
        onStop: stopPlay,
      },
    );
    $('play').querySelector('span').textContent = 'Stop';
    status('Playing');
  } catch (error) {
    stopPlay();
    $('play-host').hidden = true;
    viewport.active = true;
    onError(error.message);
  }
}
$('home').onclick = $('new-project').onclick = () => {
  stopPlay();
  launcher.show(projectOpen);
};
$('open-project').onclick = browse;
$('save-project').onclick = () => save();
$('undo').onclick = () => store.undo();
$('redo').onclick = () => store.redo();
$('insert-object').onclick = () => {
  const rect = $('insert-object').getBoundingClientRect();
  openContext(rect.left, rect.bottom + 5);
};
$('play').onclick = play;
$('docs').onclick = () => showGuide($('dialog-host'));
$('project-settings').onclick = () => {
  if (projectOpen) showSettings($('dialog-host'), store);
};
$('reset-layout').onclick = () => dock.reset();
$('build-project').onclick = () =>
  showBuild($('dialog-host'), store, { status, onError, onLog: log });
find('clear-console').onclick = () => {
  find('console').replaceChildren();
  logCount = 0;
  find('log-count').textContent = '0';
};
find('frame-selection').onclick = () => viewport.frameSelection();
find('grid').onclick = () => {
  viewport.grid = !viewport.grid;
  find('grid').classList.toggle('active', viewport.grid);
};
find('snap').onclick = () => {
  viewport.snap = !viewport.snap;
  find('snap').classList.toggle('active', viewport.snap);
};
for (const [id, mode] of [
  ['move-tool', 'translate'],
  ['rotate-tool', 'rotate'],
  ['scale-tool', 'scale'],
])
  find(id).onclick = () => {
    viewport.setMode(mode);
    for (const tool of ['move-tool', 'rotate-tool', 'scale-tool'])
      find(tool).classList.toggle('active', tool === id);
  };
find('move-tool').classList.add('active');
window.addEventListener('keydown', (event) => {
  if (!$('launch-host').hidden || $('dialog-host').childElementCount) return;
  const typing =
      code.editor.hasTextFocus() ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName),
    mod = event.ctrlKey || event.metaKey;
  if (event.key === 'F5' && projectOpen) {
    event.preventDefault();
    play();
    return;
  }
  if (
    gameView ||
    !projectOpen ||
    (!$('dialog-host').childElementCount && $('launch-host').hidden === false)
  )
    return;
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save(event.shiftKey);
  }
  if (typing || $('dialog-host').childElementCount) return;
  if (event.key === 'F2') {
    event.preventDefault();
    find('tree').onrename?.();
    return;
  }
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
  }
  if (mod && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    store.duplicate();
  }
  if (['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault();
    store.remove();
  }
  if (event.key.toLowerCase() === 'f') viewport.frameSelection();
});
window.addEventListener('beforeunload', () => {
  if (projectOpen) {
    files.rememberBrowser(store.project);
    try {
      localStorage.setItem('openengine.recovery.v2', JSON.stringify(store.project));
    } catch {}
  }
  gameView?.dispose();
  viewport.dispose();
  code.dispose();
  library.dispose();
  uiEditor.dispose();
  dock.dispose();
});
render();
launcher.show();
log('info', 'Studio ready. Create or open a project from Home.');
