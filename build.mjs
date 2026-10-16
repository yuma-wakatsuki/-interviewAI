import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/background.ts'], bundle: true, format: 'esm', outfile: 'dist/background.js' }),
  build({ entryPoints: ['src/offscreen.ts'], bundle: true, format: 'esm', outfile: 'dist/offscreen.js' }),
  build({ entryPoints: ['src/sidepanel.ts'], bundle: true, format: 'esm', outfile: 'dist/sidepanel.js' }),
  build({ entryPoints: ['src/microphone.ts'], bundle: true, format: 'esm', outfile: 'dist/microphone.js' }),
  build({ entryPoints: ['src/audio-worklet.ts'], bundle: true, format: 'iife', outfile: 'dist/audio-worklet.js' }),
  cp('public', 'dist', { recursive: true })
]);
