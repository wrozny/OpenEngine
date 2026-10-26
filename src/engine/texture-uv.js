/** Give each primitive face world-sized texture repeats instead of stretching one tile. */
export function tileGeometry(geometry, node) {
  const uv = geometry.attributes.uv,
    normal = geometry.attributes.normal,
    scale = node.TextureScale;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i)),
      ny = Math.abs(normal.getY(i)),
      nz = Math.abs(normal.getZ(i));
    let width, height;
    if (node.Shape === 'Wedge') {
      width = nx > 0.9 ? node.Size.Z : node.Size.X;
      height =
        ny > 0.9 ? node.Size.Z : ny > 0.1 ? Math.hypot(node.Size.Y, node.Size.Z) : node.Size.Y;
    } else if (node.Shape === 'Box') {
      width = nx > 0.5 ? node.Size.Z : node.Size.X;
      height = ny > 0.5 ? node.Size.Z : node.Size.Y;
    } else if (node.Shape === 'Cylinder' && ny > 0.9) {
      width = node.Size.X;
      height = node.Size.Z;
    } else {
      width = Math.PI * node.Size.X;
      height = node.Size.Y;
    }
    uv.setXY(i, (uv.getX(i) * width) / scale, (uv.getY(i) * height) / scale);
  }
  uv.needsUpdate = true;
  return geometry;
}
