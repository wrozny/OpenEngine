import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadProject } from './project.mjs';

// Keep the editable source layout and provide a second, self-contained Studio document.
const output = 'release/DeadSignal-source';
const project = await loadProject('examples/zombie/project.openengine');
await mkdir(output, { recursive: true });
await cp('examples/zombie', output, { recursive: true });
await cp('LICENSE', join(output, 'LICENSE'));
await writeFile(join(output, 'DeadSignal.openengine'), JSON.stringify(project, null, 2) + '\n');
console.log(`Dead Signal source exported to ${output}`);
