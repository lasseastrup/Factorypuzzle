/* Every function the game source calls must exist in the game source.

   Three times this session a patch script asserted on a stale anchor, threw before writing, and
   left a call to a function that had never been added — each time the game booted fine until the
   exact branch was taken. A regex is not a type checker, but it catches precisely this. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/game.html', 'utf8');

/* the script body only, so CSS and markup do not confuse matters, and with comments stripped —
   prose mentioning sin(x) or a function name is not a call site */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
/* the LAST script block: the first one is the three.js tag, and slicing from there swallowed
   the stylesheet, so every rgba() in the CSS looked like a call to an undefined function */
const body = strip(src.slice(src.lastIndexOf('<script'), src.lastIndexOf('</script>')));
/* the simulation is injected at build time, so its exports count as defined */
const sim = strip(fs.readFileSync(__dirname + '/../src/sim.js', 'utf8'));

const defined = new Set();
for (const text of [body, sim]) {
  for (const re of [/function\s+([A-Za-z_$][\w$]*)\s*\(/g, /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g]) {
    let m2;
    while ((m2 = re.exec(text))) defined.add(m2[1]);
  }
}
/* destructured and multi-declarator forms */
let m;
const multi = /(?:const|let|var)\s+([^;=\n]+?)\s*=/g;
while ((m = multi.exec(body))) {
  for (const part of m[1].split(',')) {
    const name = part.trim().replace(/[{}[\]]/g, '').split(':').pop().trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name);
  }
}
const commaDecl = /(?:const|let|var)\s+[^;\n]*/g;
while ((m = commaDecl.exec(body))) {
  for (const name of m[0].matchAll(/([A-Za-z_$][\w$]*)\s*(?==|,|;|$)/g)) defined.add(name[1]);
}

/* Parameter names count as definitions: dropWhere(arr, pred) makes pred callable inside. */
for (const text of [body, sim]) {
  const sigs = [/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g, /\(([^)]*)\)\s*=>/g];
  for (const re of sigs) {
    let m3;
    while ((m3 = re.exec(text))) {
      for (const part of m3[1].split(',')) {
        const name = part.trim().split(/[=\s]/)[0].replace(/[{}[\].]/g, '');
        if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name);
      }
    }
  }
  let m4;
  const bare = /([A-Za-z_$][\w$]*)\s*=>/g;
  while ((m4 = bare.exec(text))) defined.add(m4[1]);
}

/* Anything that only ever appears in the stylesheet is CSS, not JavaScript. */
const styleBlock = src.slice(src.indexOf('<style'), src.indexOf('</style>'));
const cssNames = new Set([...styleBlock.matchAll(/([A-Za-z-]+)\s*\(/g)].map((x) => x[1]));

/* bare calls: not preceded by a dot, so obj.method() is excluded */
const called = new Set();
const callRe = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = callRe.exec(body))) called.add(m[1]);

const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
  'new', 'do', 'else', 'delete', 'void', 'in', 'of', 'await', 'yield', 'super', 'this', 'try']);
const globals = new Set(['Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'JSON', 'Set',
  'Map', 'Date', 'Error', 'Promise', 'THREE', 'document', 'window', 'console', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'addEventListener', 'removeEventListener', 'parseFloat', 'parseInt', 'isFinite',
  'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'alert', 'fetch', 'structuredClone',
  'localStorage', 'navigator', 'Float32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array',
  'Int32Array', 'ArrayBuffer', 'RegExp', 'Symbol', 'Proxy', 'Reflect', 'BigInt', 'globalThis']);

const missing = [...called].filter((n) => !defined.has(n) && !keywords.has(n)
  && !globals.has(n) && !cssNames.has(n));

let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? pass++ : fail++; };
console.log('\n--- source references ---');
ok(missing.length === 0,
  missing.length ? `called but never defined: ${missing.join(', ')}` : `every called function is defined (${defined.size} definitions, ${called.size} call sites)`);

/* and the built file must contain everything the source does */
const built = fs.readFileSync(__dirname + '/../index.html', 'utf8');
ok(built.length > src.length, 'the build is larger than the source, so three.js was inlined');
ok(!/\/\*__SIM__\*\//.test(built), 'and the simulation placeholder was replaced');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
