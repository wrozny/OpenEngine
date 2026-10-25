import {
  createElement,
  Box,
  Square,
  Folder,
  FileCode,
  Braces,
  PersonStanding,
  Play,
  Save,
  FilePlus,
  FolderOpen,
  Undo2,
  Redo2,
  Settings2,
  CircleHelp,
  Plus,
  Move3d,
  Rotate3d,
  Scaling,
  Crosshair,
  Grid3x3,
  Magnet,
  LayoutTemplate,
  Terminal,
  Code,
  ChevronDown,
  ChevronRight,
  Trash2,
  Copy,
  House,
} from 'lucide';
const icons = {
  Box,
  Square,
  Folder,
  FileCode,
  Braces,
  PersonStanding,
  Play,
  Save,
  FilePlus,
  FolderOpen,
  Undo2,
  Redo2,
  Settings2,
  CircleHelp,
  Plus,
  Move3d,
  Rotate3d,
  Scaling,
  Crosshair,
  Grid3x3,
  Magnet,
  LayoutTemplate,
  Terminal,
  Code,
  ChevronDown,
  ChevronRight,
  Trash2,
  Copy,
  House,
};
export function glyph(name, size = 18) {
  const svg = createElement(icons[name] || Box);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('stroke-width', '1.7');
  return svg;
}
export function nodeGlyph(node) {
  return glyph(
    {
      Folder: 'Folder',
      Object2D: 'Square',
      Object3D: 'Box',
      Script: 'FileCode',
      ModuleScript: 'Braces',
      PlayerController2D: 'PersonStanding',
      PlayerController3D: 'PersonStanding',
    }[node.ClassName],
  );
}
export function decorateButton(button, name) {
  button.prepend(glyph(name));
  return button;
}
