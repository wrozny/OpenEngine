const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

/** Recent paths authorize explicit reopen/save requests; the renderer cannot read arbitrary files. */
class ProjectRegistry {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.authorizedPaths = new Set();
  }
  async entries() {
    try {
      const list = JSON.parse(await fs.readFile(this.storagePath, 'utf8'));
      return Array.isArray(list)
        ? list
            .filter((item) => typeof item.path === 'string' && typeof item.name === 'string')
            .slice(0, 20)
        : [];
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return [];
      throw error;
    }
  }
  async writeEntries(entries) {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    const temp = `${this.storagePath}.tmp`;
    await fs.writeFile(temp, JSON.stringify(entries, null, 2));
    await fs.rename(temp, this.storagePath);
  }
  async remember(file, name) {
    file = path.resolve(file);
    const entries = await this.entries();
    await this.writeEntries(
      [
        { path: file, name, openedAt: Date.now() },
        ...entries.filter((item) => item.path !== file),
      ].slice(0, 20),
    );
  }
  async list() {
    return Promise.all(
      (await this.entries()).map(async (item) => {
        try {
          return { ...item, exists: (await fs.stat(item.path)).isFile() };
        } catch {
          return { ...item, exists: false };
        }
      }),
    );
  }
  async forget(file) {
    await this.writeEntries((await this.entries()).filter((item) => item.path !== file));
  }
  async authorize(file) {
    if (this.authorizedPaths.has(file)) return;
    if (!(await this.entries()).some((item) => item.path === file))
      throw new Error('Choose this project using Open first');
  }
  async read(file, selectedByDialog = false) {
    if (!selectedByDialog) await this.authorize(file);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES)
      throw new Error('Project is missing or exceeds 64 MB');
    const text = await fs.readFile(file, 'utf8'),
      project = JSON.parse(text);
    if (
      project.format !== 'openengine' ||
      project.version !== 1 ||
      typeof project.name !== 'string'
    )
      throw new Error('Invalid OpenEngine project');
    this.authorizedPaths.add(file);
    await this.remember(file, project.name);
    return { text, path: file, name: project.name };
  }
  async save(file, text, selectedByDialog = false) {
    if (!selectedByDialog) await this.authorize(file);
    if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_BYTES)
      throw new Error('Project exceeds 64 MB');
    const project = JSON.parse(text);
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, text, 'utf8');
    await fs.rename(temp, file);
    this.authorizedPaths.add(file);
    await this.remember(file, project.name);
    return { path: file, name: project.name };
  }
}
module.exports = { ProjectRegistry, MAX_PROJECT_BYTES };
