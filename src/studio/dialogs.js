import { zipSync, strToU8 } from 'fflate';
import { el, download } from './dom.js';

export function showDialog(host, title, content) {
  const previous = document.activeElement,
    backdrop = el('div', 'dialog-backdrop'),
    dialog = el('section', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);
  const heading = el('div', 'dialog-heading'),
    close = el('button', 'dialog-close', '×');
  close.setAttribute('aria-label', 'Close dialog');
  const dismiss = () => {
    backdrop.remove();
    previous?.focus();
  };
  close.onclick = dismiss;
  heading.append(el('h2', '', title), close);
  dialog.append(heading, content);
  backdrop.append(dialog);
  host.replaceChildren(backdrop);
  close.focus();
  backdrop.onpointerdown = (event) => {
    if (event.target === backdrop) dismiss();
  };
  backdrop.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
    if (event.key === 'Tab') {
      const focusable = [
        ...dialog.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href]',
        ),
      ];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    }
  };
  return dismiss;
}
export function showGuide(host) {
  const content = el('div', 'guide-content');
  for (const [title, text] of [
    [
      'Arrange your workspace',
      'Drag panel tabs to dock beside other panels. Drag dividers to resize. Double-click a panel tab to maximize; use Reset layout to restore the defaults.',
    ],
    [
      'Edit a scene',
      'Right-click the viewport or Explorer to insert objects. Ctrl/Cmd-click selects multiple objects; right-click to duplicate or delete the selection. F frames the active object. In 2D drag to move, middle-drag to pan, and scroll to zoom.',
    ],
    [
      'Work in 3D',
      'Use the Move, Rotate and Scale tools on the viewport. Right-drag orbits, middle-drag pans, and the wheel zooms. Hold right mouse and WASD to fly; Space/Control move vertically and Shift speeds up.',
    ],
    [
      'Script in Lua',
      'Select any Script, ModuleScript or controller to open Monaco. Syntax coloring, engine completions, hover descriptions, signature hints and syntax diagnostics are available. Ctrl+Space opens completion suggestions.',
    ],
    [
      'Play and export',
      'F5 starts or stops a fresh session. Play changes never overwrite the edit document. Save downloads a .openengine file in browser mode, or writes a real file in desktop Studio. Build exports web or native games.',
    ],
    [
      'Projects and examples',
      'Home opens the launcher. Choose 2D or 3D before creating a scene. Missing recent files are crossed out; the × removes an entry. Examples open only when you choose them.',
    ],
  ])
    content.append(el('h3', '', title), el('p', '', text));
  showDialog(host, 'Studio guide', content);
}
export function showSettings(host, store) {
  const form = el('form', 'project-settings'),
    fields = {};
  for (const [key, title] of [
    ['name', 'Game name'],
    ['description', 'Description'],
    ['controls', 'Control hint'],
  ]) {
    const row = el('label');
    row.append(el('span', '', title));
    const input = el('input');
    input.name = key;
    input.value = store.metadata[key] || '';
    input.maxLength = key === 'name' ? 80 : 300;
    input.required = key === 'name';
    row.append(input);
    form.append(row);
    fields[key] = input;
  }
  form.append(
    el(
      'p',
      'muted',
      `Project dimension: ${store.dimension}. Choose a dimension when creating a new project.`,
    ),
  );
  const apply = el('button', 'primary', 'Save settings');
  apply.type = 'submit';
  form.append(apply);
  const dismiss = showDialog(host, 'Project settings', form);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!fields.name.value.trim()) return;
    store.transact(() => {
      for (const [key, input] of Object.entries(fields)) store.metadata[key] = input.value.trim();
    });
    dismiss();
  };
}
export function showBuild(host, store, { status, onError, onLog }) {
  const content = el('div', 'build-content');
  content.append(el('p', '', 'Export the scene, Lua scripts, embedded assets and game runtime.'));
  const web = el('button', 'export-option');
  web.append(
    el('strong', '', 'Web game ZIP'),
    el('span', '', 'Offline HTML game. Extract the ZIP and open index.html.'),
  );
  web.onclick = async () => {
    web.disabled = true;
    status('Building web game…');
    try {
      const response = await fetch('./runtime-template.html');
      if (!response.ok)
        throw new Error('Runtime template is missing. Restart Studio or run npm run build.');
      const template = await response.text();
      if (!template.includes('__OPENENGINE_PROJECT_BASE64__'))
        throw new Error('Invalid runtime template');
      const bytes = new TextEncoder().encode(JSON.stringify(store.project));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const html = template.replace('__OPENENGINE_PROJECT_BASE64__', btoa(binary));
      download(
        store.metadata.name + '-web.zip',
        zipSync({
          'index.html': strToU8(html),
          'README.txt': strToU8(
            store.metadata.name +
              '\n\nOpen index.html in a modern browser.\n' +
              (store.metadata.controls || '') +
              '\n\nThird-party notices are embedded in index.html.\n',
          ),
        }),
        'application/zip',
      );
      status('Web game built');
    } catch (error) {
      onError(error.message);
    } finally {
      web.disabled = false;
    }
  };
  content.append(web);
  if (window.desktop) {
    const native = el('button', 'export-option');
    native.append(
      el('strong', '', 'Desktop game'),
      el('span', '', 'Standalone game for the installed Studio’s operating system.'),
    );
    native.onclick = async () => {
      native.disabled = true;
      status('Packaging desktop game…');
      try {
        const path = await window.desktop.buildGame(JSON.stringify(store.project));
        if (path) {
          onLog('info', 'Game built: ' + path);
          status('Desktop game built');
        }
      } catch (error) {
        onError(error.message);
      } finally {
        native.disabled = false;
      }
    };
    content.append(native);
  } else {
    content.append(
      el('h3', '', 'Windows executable'),
      el(
        'p',
        '',
        'Use packaged desktop Studio to export directly, or save your project and run this command from the repository:',
      ),
      el(
        'code',
        'build-command',
        'npm run package:game -- --project "My Game.openengine" --platform win32',
      ),
    );
  }
  showDialog(host, 'Build game', content);
}
