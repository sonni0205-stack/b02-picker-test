#!/usr/bin/env node
// Build a two-file public preview bundle locally. This never deploys or calls Google.
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '..');
const output = process.argv[2] && path.resolve(process.argv[2]);
if (!output || output === sourceRoot || output.startsWith(sourceRoot + path.sep))
  throw Error('Choose an empty output directory outside this repository.');
if (fs.existsSync(output) && (fs.lstatSync(output).isSymbolicLink() || fs.readdirSync(output).length))
  throw Error('Preview output must be an empty, non-symlink directory.');

const html = fs.readFileSync(path.join(sourceRoot, 'b02-standard-picker.html'), 'utf8');
const script = fs.readFileSync(path.join(sourceRoot, 'b02-standard-picker.js'), 'utf8');
function removeBlock(text, name) {
  const start = `<!-- PREVIEW_${name}_START -->`;
  const end = `<!-- PREVIEW_${name}_END -->`;
  if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(start) > text.indexOf(end))
    throw Error('Preview source markers are missing or duplicated.');
  return text.slice(0, text.indexOf(start)) + text.slice(text.indexOf(end) + end.length);
}
let preview = removeBlock(removeBlock(html, 'SETTINGS_PANEL'), 'SETTINGS_SCRIPT');
preview = preview.replace(/(<input id="(?:root|ready|ledger)")/g, '$1 type="password"');

for (const field of ['client', 'key', 'app', 'root', 'ready', 'ledger']) {
  const tag = preview.match(new RegExp(`<input id="${field}"[^>]*>`))?.[0];
  if (!tag || /\bvalue\s*=/.test(tag)) throw Error('A required input is missing or prefilled.');
  if (['key', 'root', 'ready', 'ledger'].includes(field) && !/\btype="password"/.test(tag))
    throw Error('A sensitive input is not masked.');
}
if (!preview.includes('<script src="./b02-standard-picker.js" defer></script>'))
  throw Error('Preview does not reference the same audited Picker code.');
const sources = [...preview.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
if (sources.length !== 3 || sources.some(src => ![
  'https://apis.google.com/js/api.js',
  'https://accounts.google.com/gsi/client',
  './b02-standard-picker.js',
].includes(src))) throw Error('Preview contains an unexpected script source.');
if (/localStorage|sessionStorage|indexedDB|document\.cookie/.test(preview + script) ||
    /AIza[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9._-]+|ghp_[A-Za-z0-9]+/.test(preview + script) ||
    /\bmethod\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(script))
  throw Error('Preview security check failed; no files were written.');

fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, 'b02-standard-picker.html'), preview, {mode: 0o600});
fs.writeFileSync(path.join(output, 'b02-standard-picker.js'), script, {mode: 0o600});
process.stdout.write('Prepared two static preview files. No login, Drive call, or deployment was performed.\n');
