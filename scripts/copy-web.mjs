/**
 * Copies the interface's static files into the build (SMS-36).
 *
 * `tsc -p src/web/tsconfig.json` emits the browser modules into
 * `dist/src/web/assets/`; the HTML shell and the stylesheet are not TypeScript,
 * so they are copied here: `index.html` to `dist/src/web/`, `styles.css` to
 * `dist/src/web/assets/` (the paths `src/modules/web/routes.ts` serves).
 */

import { copyFileSync, mkdirSync } from 'node:fs';

const copies = [
  ['src/web/index.html', 'dist/src/web/index.html'],
  ['src/web/styles.css', 'dist/src/web/assets/styles.css'],
];

mkdirSync('dist/src/web/assets', { recursive: true });
for (const [source, target] of copies) {
  copyFileSync(source, target);
  console.log(`copy-web: ${source} -> ${target}`);
}
