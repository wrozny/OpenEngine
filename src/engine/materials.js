/** Original vector textures, embedded at build time; no external asset services. */
const svg = (body, width = 128, height = width) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
export const MATERIALS = {
  Default: '',
  Grass: svg(
    '<rect width="128" height="128" fill="#6c8b50"/><path d="M5 12l5-8m19 44l-4-9m36-5l5-12m34 55l-5-8m-73 31l7-11m42 27l3-10m37-87l5-10M9 72l5-7m66-4l8-5m32 64l-6-7" stroke="#9eaf6e" stroke-width="3"/><path d="M12 30h8m50 13h6m-31 67h9m43-9h9" stroke="#50713e" stroke-width="3"/>',
  ),
  Rock: svg(
    '<rect width="128" height="128" fill="#878d91"/><path d="M0 32L36 0 74 19 96 0m-96 74l34-25 43 11 51-18M20 128L37 87 0 74m77-14l21 35 30-9m-30 9l-7 33" fill="none" stroke="#677176" stroke-width="5"/><path d="M5 6l20 3m17 59l19-3m42 53l17 2" stroke="#b8bebc" stroke-width="4"/>',
  ),
  Brick: svg(
    '<rect width="128" height="128" fill="#86574c"/><path d="M0 0h128M0 32h128M0 64h128M0 96h128M0 128h128M64 0v32M32 32v32m64-32v32M64 64v32M32 96v32m64-32v32" stroke="#d5c1aa" stroke-width="4"/>',
  ),
  Wood: svg(
    '<rect width="128" height="128" fill="#a77b4f"/><path d="M0 32h128M0 64h128M0 96h128M40 0v32m45 0v32m-60 0v32m60 0v32" stroke="#5d4635" stroke-width="3"/><path d="M3 11c30 12 56-14 116 3M5 49c25-8 63 9 116-4M3 80c30 9 56-9 119 3M4 112c50-8 80 8 117-2" stroke="#c99a62" stroke-width="2" fill="none"/>',
  ),
  Metal: svg(
    '<rect width="128" height="128" fill="#8998a4"/><path d="M0 0l128 128M-32 0l128 128M32 0l96 96M0 32l96 96M64 0l64 64M0 64l64 64" stroke="#a8b4be" stroke-width="5"/><circle cx="10" cy="10" r="4" fill="#455664"/><circle cx="118" cy="118" r="4" fill="#455664"/>',
  ),
};
export const BUILTIN_SKY = svg(
  '<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#5e99d9"/><stop offset=".45" stop-color="#b1d7ed"/><stop offset=".56" stop-color="#e0e9dc"/><stop offset="1" stop-color="#8eae91"/></linearGradient></defs><rect width="2048" height="1024" fill="url(#sky)"/><g fill="#fff" opacity=".65"><ellipse cx="270" cy="300" rx="190" ry="48"/><ellipse cx="390" cy="285" rx="130" ry="70"/><ellipse cx="1140" cy="350" rx="160" ry="40"/><ellipse cx="1250" cy="335" rx="100" ry="55"/><ellipse cx="1830" cy="270" rx="150" ry="45"/></g>',
  2048,
  1024,
);
