import { el } from './dom.js';
import { createProject } from './projects.js';

/** The launcher never executes project code or silently reopens an autosave. */
export class ProjectLauncher {
  constructor(host, { files, onOpen, onBrowse, examples, onError }) {
    Object.assign(this, { host, files, onOpen, onBrowse, examples, onError });
  }
  async show(canClose = false) {
    this.host.hidden = false;
    this.host.replaceChildren();
    const shell = el('section', 'launcher');
    shell.setAttribute('aria-label', 'Project launcher');
    const header = el('header', 'launcher-heading');
    header.append(
      el('div', 'launcher-logo', 'OpenEngine'),
      el('p', '', 'Create a project. Make something yours.'),
    );
    if (canClose) {
      const back = el('button', 'subtle-button', 'Back to editor');
      back.onclick = () => this.hide();
      header.append(back);
    }
    const columns = el('div', 'launcher-columns'),
      left = el('div', 'launcher-create'),
      right = el('div', 'launcher-recents');
    const form = el('form', 'new-project-form');
    form.append(el('h2', '', 'New project'));
    const name = el('input');
    name.placeholder = 'Project name';
    name.value = 'My game';
    name.required = true;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'New project name');
    const modes = el('div', 'dimension-picker');
    for (const mode of ['2D', '3D']) {
      const label = el('label');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'dimension';
      radio.value = mode;
      radio.checked = mode === '2D';
      label.append(
        radio,
        el('strong', '', mode),
        el('span', '', mode === '2D' ? 'Sprites & 2D physics' : 'Meshes & 3D physics'),
      );
      modes.append(label);
    }
    const template = el('select');
    template.setAttribute('aria-label', 'Project template');
    for (const [value, text] of [
      ['starter', 'Starter with player controller'],
      ['platformer', 'Platformer starter'],
      ['empty', 'Empty scene'],
    ]) {
      const opt = el('option', '', text);
      opt.value = value;
      template.append(opt);
    }
    const create = el('button', 'primary', 'Create project');
    create.type = 'submit';
    form.append(name, modes, template, create);
    form.onsubmit = (event) => {
      event.preventDefault();
      const dimension = form.querySelector('input[name=dimension]:checked').value;
      this.open(
        createProject(
          name.value.trim() || 'My game',
          dimension,
          template.value !== 'empty',
          template.value === 'platformer',
        ),
      );
    };
    const browse = el('button', 'launcher-open', 'Open project…');
    browse.onclick = () => this.onBrowse();
    left.append(form, browse);
    right.append(el('h2', '', 'Recent projects'));
    const list = el('div', 'recent-projects');
    right.append(list);
    try {
      const records = await this.files.recents();
      if (!records.length)
        list.append(el('p', 'muted', 'Projects you open or save will appear here.'));
      for (const record of records) {
        const row = el('div', 'recent-project' + (!record.exists ? ' missing' : ''));
        const open = el('button', 'recent-open');
        open.disabled = !record.exists;
        open.append(
          el('strong', '', record.name),
          el('span', '', record.path),
          ...(!record.exists ? [el('small', '', 'File no longer exists')] : []),
        );
        open.onclick = async () => {
          try {
            this.open(await this.files.reopen(record), false);
          } catch (error) {
            this.onError(error.message);
            this.show(canClose);
          }
        };
        const remove = el('button', 'recent-remove', '×');
        remove.setAttribute('aria-label', 'Remove recent ' + record.name);
        remove.onclick = async () => {
          try {
            await this.files.forget(record);
            this.show(canClose);
          } catch (error) {
            this.onError(error.message);
          }
        };
        row.append(open, remove);
        list.append(row);
      }
    } catch (error) {
      list.append(el('p', 'muted', error.message));
    }
    const demos = el('div', 'launcher-examples');
    demos.append(el('h2', '', 'Example projects'));
    for (const example of this.examples) {
      const button = el('button', 'example-card');
      button.append(el('strong', '', example.name), el('span', '', example.description));
      button.onclick = () => {
        this.files.newDocument();
        this.open(example.load());
      };
      demos.append(button);
    }
    columns.append(left, right);
    shell.append(header, columns, demos);
    this.host.append(shell);
  }
  open(project, reset = true) {
    if (reset) this.files.newDocument();
    this.onOpen(project);
    this.hide();
  }
  hide() {
    this.host.hidden = true;
  }
}
