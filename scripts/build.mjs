import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'chrome130', outfile: 'dist/main.js', sourcemap: true });
await build({ entryPoints: ['src/ai/service.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node22', outfile: 'dist/ai.cjs' });
await copyFile('src/index.html', 'dist/index.html');
await copyFile('src/style.css', 'dist/style.css');
console.log('Protótipo compilado. Nenhuma janela foi aberta.');
