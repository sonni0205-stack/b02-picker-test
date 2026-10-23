const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const builder = path.join(root, 'tools', 'prepare-independent-preview.cjs');

test('preview bundle has only the audited Picker files and no browser storage or prefilled IDs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'b02-picker-preview-'));
  const out = path.join(temp, 'site');
  try {
    const result = spawnSync(process.execPath, [builder, out], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(out).sort(), ['b02-standard-picker.html', 'b02-standard-picker.js']);
    const html = fs.readFileSync(path.join(out, 'b02-standard-picker.html'), 'utf8');
    const js = fs.readFileSync(path.join(out, 'b02-standard-picker.js'), 'utf8');
    assert.equal(js, fs.readFileSync(path.join(root, 'b02-standard-picker.js'), 'utf8'));
    assert.doesNotMatch(html + js, /localStorage|sessionStorage|indexedDB|document\.cookie|AIza[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(html, /save-settings|forget-settings|<input[^>]+value\s*=/);
    for (const id of ['key', 'root', 'ready', 'ledger'])
      assert.match(html, new RegExp(`<input id="${id}" type="password"`));
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('preview builder refuses an output path inside the operating repository', () => {
  const result = spawnSync(process.execPath, [builder, path.join(root, 'preview-output')], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'preview-output')), false);
});
