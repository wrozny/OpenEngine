export function el(tag, className = '', text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const icon = (node) =>
  ({
    Folder: node.Name === 'Workspace' ? '◈' : node.Name === 'ScriptService' ? '⌘' : '▱',
    PhysicsObject: node.Shape === 'Circle' ? '●' : '◆',
    Script: '⌁',
    ModuleScript: '◇',
  })[node.ClassName];
