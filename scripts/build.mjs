import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
if (out !== resolve(root, 'dist')) throw new Error('Unexpected build path');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, 'web'), out, { recursive: true });
await readFile(resolve(out, 'index.html'));
await mkdir(resolve(out, 'docs'), { recursive: true });
await cp(resolve(root, 'docs'), resolve(out, 'docs'), { recursive: true });
console.log('Built static application in dist/');
