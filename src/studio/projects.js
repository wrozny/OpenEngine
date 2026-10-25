import { SceneNode, serializeNode, validateProject } from '../engine/scene.js';
import { Vector2, Vector3 } from '../engine/math.js';
import { download } from './dom.js';
const RECENTS = 'openengine.recents.v2';
const DOCUMENT = 'openengine.project.';

export function createProject(
  name = 'Untitled game',
  dimension = '2D',
  starter = false,
  platformer = false,
) {
  const workspace = new SceneNode('Folder', 'Workspace', 'workspace');
  const scripts = new SceneNode('Folder', 'ScriptService', 'scripts');
  if (starter) {
    const actor = new SceneNode(dimension === '3D' ? 'Object3D' : 'Object2D', 'Player', 'player');
    actor.Anchored = false;
    actor.CollisionGroup = 'player';
    actor.Color = '#78a7e0';
    actor.Size = dimension === '3D' ? new Vector3(1, 2, 1) : new Vector2(36, 48);
    actor.Position = dimension === '3D' ? new Vector3(0, 2, 0) : new Vector2(0, -40);
    actor.Parent = workspace;
    const controller = new SceneNode(
      dimension === '3D' ? 'PlayerController3D' : 'PlayerController2D',
    );
    if (dimension === '2D') controller.Mode = platformer ? 'Platformer' : 'TopDown';
    controller.Parent = actor;
    if (dimension === '3D' || platformer) {
      const floor = new SceneNode(dimension === '3D' ? 'Object3D' : 'Object2D', 'Ground');
      floor.Size = dimension === '3D' ? new Vector3(30, 1, 30) : new Vector2(1600, 60);
      floor.Position = dimension === '3D' ? new Vector3(0, -0.5, 0) : new Vector2(0, 30);
      floor.Color = '#879780';
      if (dimension === '3D') floor.Material = 'Grass';
      floor.Parent = workspace;
    }
  }
  return {
    format: 'openengine',
    version: 1,
    dimension,
    name,
    controls:
      dimension === '3D'
        ? 'WASD move · Space jump · Right drag look'
        : 'WASD move · Space jump (platformer)',
    services: [workspace, scripts].map(serializeNode),
  };
}

/** Desktop uses real paths; browser recents refer to explicit local document copies. */
export class ProjectFiles {
  constructor(onWarning = () => {}) {
    this.currentPath = null;
    this.currentId = null;
    this.onWarning = onWarning;
  }
  parse(record) {
    const project = validateProject(JSON.parse(record.text));
    this.currentPath = record.path || null;
    this.currentId = record.id || null;
    return project;
  }
  async recents() {
    if (window.desktop) return window.desktop.getRecentProjects();
    try {
      return JSON.parse(localStorage.getItem(RECENTS) || '[]').map((item) => ({
        ...item,
        exists: !!localStorage.getItem(DOCUMENT + item.id),
      }));
    } catch {
      return [];
    }
  }
  async forget(record) {
    if (window.desktop) return window.desktop.forgetProject(record.path);
    const list = (await this.recents()).filter((item) => item.id !== record.id);
    localStorage.setItem(RECENTS, JSON.stringify(list));
    localStorage.removeItem(DOCUMENT + record.id);
  }
  async reopen(record) {
    if (window.desktop) return this.parse(await window.desktop.reopenProject(record.path));
    const text = localStorage.getItem(DOCUMENT + record.id);
    if (!text) throw new Error('This local project copy no longer exists');
    return this.parse({ text, id: record.id });
  }
  async openNative() {
    const record = await window.desktop.openProjectRecord();
    return record ? this.parse(record) : null;
  }
  rememberBrowser(project) {
    if (window.desktop) return;
    this.currentId ||= crypto.randomUUID();
    try {
      localStorage.setItem(DOCUMENT + this.currentId, JSON.stringify(project));
      const previous = JSON.parse(localStorage.getItem(RECENTS) || '[]');
      localStorage.setItem(
        RECENTS,
        JSON.stringify(
          [
            {
              id: this.currentId,
              name: project.name,
              path: 'Browser storage · download a file for a permanent backup',
              openedAt: Date.now(),
            },
            ...previous.filter((item) => item.id !== this.currentId),
          ].slice(0, 20),
        ),
      );
    } catch {
      this.onWarning('Browser storage is full. Save a downloaded project file to keep your work.');
    }
  }
  newDocument() {
    this.currentPath = null;
    this.currentId = null;
  }
  async importFile(file) {
    const project = this.parse({ text: await file.text() });
    this.rememberBrowser(project);
    return project;
  }
  async save(project, saveAs = false) {
    const text = JSON.stringify(project, null, 2),
      name = (project.name.replace(/[^\w -]/g, '') || 'Project') + '.openengine';
    if (window.desktop) {
      const record = await window.desktop.saveProjectRecord(
        text,
        name,
        saveAs ? null : this.currentPath,
      );
      if (!record) return false;
      this.currentPath = record.path;
      return true;
    }
    download(name, text);
    this.rememberBrowser(project);
    return true;
  }
}
