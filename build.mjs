/* Build the two deliverables from src/.
   dist/ratio.html : loads three.js from cdnjs — small, quick to iterate on
   index.html      : three.js inlined, zero external dependencies — what GitHub Pages serves
   Run: node build.mjs                                                            */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const sim = readFileSync('src/sim.js', 'utf8').split("if (typeof module !== 'undefined')")[0].trimEnd();
const template = readFileSync('src/game.html', 'utf8');

if (!template.includes('/*__SIM__*/')) throw new Error('src/game.html is missing the /*__SIM__*/ marker');
const cdnBuild = template.replace('/*__SIM__*/', sim);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/ratio.html', cdnBuild);

const CDN_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>';
if (!cdnBuild.includes(CDN_TAG)) throw new Error('three.js script tag not found — did the URL change?');

let three;
try {
  three = readFileSync('node_modules/three/build/three.min.js', 'utf8');
} catch {
  throw new Error('three.js not installed. Run: npm install');
}
if (three.includes('</script')) throw new Error('three.js contains a closing script tag — cannot inline safely');

const standalone = cdnBuild
  .replace(CDN_TAG, '<!-- three.js r128 inlined: this page has no external dependencies -->\n<script>\n' + three + '\n</script>')
  .replace("window.__fatal(e.message || 'Script error'", "window.__fatal(e.message || 'Unknown error'");

writeFileSync('index.html', standalone);
const kb = (s) => String(Math.round(s.length / 1024)).padStart(4) + ' KB';
console.log('dist/ratio.html  ' + kb(cdnBuild) + '   three.js from CDN');
console.log('index.html       ' + kb(standalone) + '   self-contained, served by Pages');
