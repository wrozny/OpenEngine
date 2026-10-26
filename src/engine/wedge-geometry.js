import { BufferGeometry, Float32BufferAttribute } from 'three';
import { WEDGE_VERTICES, WEDGE_FACES } from './wedge.js';

export function wedgeGeometry() {
  const positions = [],
    uvs = [];
  for (let face = 0; face < WEDGE_FACES.length; face++) {
    const indices = WEDGE_FACES[face];
    for (let i = 1; i < indices.length - 1; i++)
      for (const index of [indices[0], indices[i], indices[i + 1]]) {
        const [x, y, z] = WEDGE_VERTICES[index];
        positions.push(x, y, z);
        uvs.push(
          (face === 2 || face === 3 ? z : x) + 0.5,
          (face === 0 || face === 4 ? z : y) + 0.5,
        );
      }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
