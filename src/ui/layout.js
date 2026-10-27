import { isUIElement } from '../engine/ui-schema.js';
const children = (node) =>
  node
    .GetChildren()
    .flatMap((child) =>
      isUIElement(child) ? [child] : child.ClassName === 'Folder' ? children(child) : [],
    );
const limit = (value, min, max) => Math.max(min || 0, Math.min(max > 0 ? max : Infinity, value));
function dimensions(node, width, height, scale) {
  let w = limit(
    width * node.Size.XScale + node.Size.XOffset * scale,
    node.MinSize.X * scale,
    node.MaxSize.X * scale,
  );
  let h = limit(
    height * node.Size.YScale + node.Size.YOffset * scale,
    node.MinSize.Y * scale,
    node.MaxSize.Y * scale,
  );
  if (node.AspectRatio > 0) {
    if (w / h > node.AspectRatio) w = h * node.AspectRatio;
    else h = w / node.AspectRatio;
  }
  return { width: Math.max(0, w), height: Math.max(0, h) };
}
/** One deterministic layout implementation drives Studio artboards and every runtime viewport. */
export function computeUILayout(
  service,
  width,
  height,
  { screenId, editing = false, insets = { left: 0, right: 0, top: 0, bottom: 0 } } = {},
) {
  const result = new Map();
  function visit(node, rect) {
    result.set(node.Id, { ...rect, node });
    const items = children(node);
    if (!items.length) return;
    const list = node.GetChildren().find((n) => n.ClassName === 'UIListLayout'),
      grid = node.GetChildren().find((n) => n.ClassName === 'UIGridLayout'),
      pad = node.GetChildren().find((n) => n.ClassName === 'UIPadding');
    const config = {
      ...node,
      ...(list ? { ...list, Layout: list.Direction } : {}),
      ...(grid ? { ...grid, Layout: 'Grid' } : {}),
      ...(pad ? { Padding: pad.Padding } : {}),
    };
    const padding = (config.Padding || 0) * rect.scale,
      gap = (config.Gap || 0) * rect.scale;
    const innerW = Math.max(0, rect.width - padding * 2),
      innerH = Math.max(0, rect.height - padding * 2);
    const specs = items.map((child) => ({
      node: child,
      ...dimensions(child, innerW, innerH, rect.scale),
    }));
    if (config.Layout === 'Grid') {
      const columns = Math.max(
        1,
        Math.min(
          100,
          Math.floor(
            config.Columns || (innerW + gap) / ((config.CellWidth || 160) * rect.scale + gap),
          ) || 1,
        ),
      );
      const cellWidth = Math.max(0, (innerW - gap * (columns - 1)) / columns),
        cellHeight = (config.CellHeight || 44) * rect.scale;
      items
        .filter((child) => child.Visible)
        .forEach((child, index) => {
          const x = padding + (index % columns) * (cellWidth + gap),
            y = padding + Math.floor(index / columns) * (cellHeight + gap);
          visit(child, {
            x: rect.x + x,
            y: rect.y + y,
            left: x,
            top: y,
            width: cellWidth,
            height: cellHeight,
            scale: rect.scale,
            parentId: node.Id,
            visible: rect.visible,
          });
        });
      return;
    }
    const flow = config.Layout && config.Layout !== 'Absolute';
    if (!flow) {
      for (const item of specs) {
        const n = item.node,
          x =
            padding +
            innerW * n.Position.XScale +
            n.Position.XOffset * rect.scale -
            item.width * n.AnchorPoint.X,
          y =
            padding +
            innerH * n.Position.YScale +
            n.Position.YOffset * rect.scale -
            item.height * n.AnchorPoint.Y;
        visit(n, {
          x: rect.x + x,
          y: rect.y + y,
          left: x,
          top: y,
          width: item.width,
          height: item.height,
          scale: rect.scale,
          parentId: node.Id,
          visible: rect.visible && n.Visible,
        });
      }
      return;
    }
    const row = config.Layout === 'Row',
      extent = row ? innerW : innerH,
      crossExtent = row ? innerH : innerW;
    const lines = [[]];
    let used = 0;
    for (const item of specs.filter((item) => item.node.Visible)) {
      const main = row ? item.width : item.height;
      if (config.Wrap && row && lines.at(-1).length && used + gap + main > extent) {
        lines.push([]);
        used = 0;
      }
      lines.at(-1).push(item);
      used += (lines.at(-1).length > 1 ? gap : 0) + main;
    }
    let crossCursor = 0;
    for (const line of lines) {
      const fixed =
        line.reduce((sum, item) => sum + (row ? item.width : item.height), 0) +
        Math.max(0, line.length - 1) * gap;
      let spare = Math.max(0, extent - fixed);
      let growing = line.filter((item) => item.node.FlexGrow > 0);
      while (spare > 0.001 && growing.length) {
        const weight = growing.reduce((sum, item) => sum + item.node.FlexGrow, 0);
        let consumed = 0;
        for (const item of growing) {
          const key = row ? 'width' : 'height',
            max = item.node.MaxSize[row ? 'X' : 'Y'] * rect.scale;
          const addition = Math.max(
            0,
            Math.min((spare * item.node.FlexGrow) / weight, max > 0 ? max - item[key] : Infinity),
          );
          item[key] += addition;
          consumed += addition;
        }
        if (consumed < 0.001) break;
        spare -= consumed;
        growing = growing.filter((item) => {
          const max = item.node.MaxSize[row ? 'X' : 'Y'] * rect.scale;
          return !max || item[row ? 'width' : 'height'] < max - 0.001;
        });
      }
      const total =
        line.reduce((sum, item) => sum + (row ? item.width : item.height), 0) +
        Math.max(0, line.length - 1) * gap;
      const remaining = Math.max(0, extent - total),
        lineCross =
          config.Wrap && row ? Math.max(0, ...line.map((item) => item.height)) : crossExtent;
      let cursor =
        config.Justify === 'Center' ? remaining / 2 : config.Justify === 'End' ? remaining : 0;
      const spacing =
        config.Justify === 'SpaceBetween' && line.length > 1
          ? gap + remaining / (line.length - 1)
          : gap;
      for (const item of line) {
        let cross = row ? item.height : item.width;
        if (config.Align === 'Stretch') {
          const axis = row ? 'Y' : 'X';
          cross = limit(
            lineCross,
            item.node.MinSize[axis] * rect.scale,
            item.node.MaxSize[axis] * rect.scale,
          );
          if (item.node.AspectRatio > 0)
            cross = row ? item.width / item.node.AspectRatio : item.height * item.node.AspectRatio;
          if (row) item.height = cross;
          else item.width = cross;
        }
        const shift =
          config.Align === 'Center'
            ? (lineCross - cross) / 2
            : config.Align === 'End'
              ? lineCross - cross
              : 0;
        const x = padding + (row ? cursor : crossCursor + shift),
          y = padding + (row ? crossCursor + shift : cursor);
        visit(item.node, {
          x: rect.x + x,
          y: rect.y + y,
          left: x,
          top: y,
          width: item.width,
          height: item.height,
          scale: rect.scale,
          parentId: node.Id,
          visible: rect.visible,
        });
        cursor += (row ? item.width : item.height) + spacing;
      }
      crossCursor += lineCross + gap;
    }
  }
  for (const screen of service
    .GetChildren()
    .filter((n) => n.ClassName === 'ScreenGui' && (!screenId || n.Id === screenId))) {
    const safe = screen.SafeArea ? insets : { left: 0, right: 0, top: 0, bottom: 0 };
    const w = Math.max(0, width - safe.left - safe.right),
      h = Math.max(0, height - safe.top - safe.bottom);
    const scale =
      screen.ScaleMode === 'Fit' ? Math.min(w / screen.DesignWidth, h / screen.DesignHeight) : 1;
    const sw = screen.ScaleMode === 'Fit' ? screen.DesignWidth * scale : w,
      sh = screen.ScaleMode === 'Fit' ? screen.DesignHeight * scale : h;
    visit(screen, {
      x: safe.left + (w - sw) / 2,
      y: safe.top + (h - sh) / 2,
      left: safe.left + (w - sw) / 2,
      top: safe.top + (h - sh) / 2,
      width: sw,
      height: sh,
      scale,
      parentId: null,
      visible: editing || screen.Enabled,
    });
  }
  return result;
}
