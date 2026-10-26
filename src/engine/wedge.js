/** Unit triangular prism shared by rendering and physics. The ramp rises toward local +Z. */
export const WEDGE_VERTICES = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [-0.5, 0.5, 0.5],
  [0.5, 0.5, 0.5],
];
export const WEDGE_FACES = [
  [0, 1, 3, 2], // underside (-Y)
  [2, 3, 5, 4], // back (+Z)
  [0, 2, 4], // left (-X)
  [1, 5, 3], // right (+X)
  [0, 4, 5, 1], // walkable ramp (+Y, -Z)
];
