const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'b02-standard-picker.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'b02-standard-picker.html'), 'utf8');
const ids = {
  root: 'rootFolder123456', ready: 'readyFolder123456', ledger: 'ledgerFolder123456',
  child: 'childFolder123456', other: 'otherFolder123456',
};

function harness({parent = ids.ready, authorized = true, http = 200, legacy = false} = {}) {
  const listeners = {};
  const elements = {};
  for (const name of ['client', 'key', 'app', 'root', 'ready', 'ledger', 'target', 'pick', 'read', 'read-child', 'clear', 'result']) {
    elements[name] = {value: ids[name] || '', disabled: true, textContent: '',
      addEventListener(event, fn) { listeners[`${name}:${event}`] = fn; }};
  }
  Object.assign(elements, {
    client: {...elements.client, value: '123456-abc.apps.googleusercontent.com'},
    key: {...elements.key, value: 'AIza' + 'a'.repeat(25)},
    app: {...elements.app, value: '123456789'},
    target: {...elements.target, value: 'child'},
  });
  const ticks = [];
  let callback;
  let fetches = 0;
  let pickerParent = null;
  const google = {
    accounts: {oauth2: {
      initTokenClient({callback: cb}) { return {requestAccessToken() { cb({access_token: 'SECRET_TOKEN', scope: 'https://www.googleapis.com/auth/drive.file'}); }}; },
      hasGrantedAllScopes() { return true; },
    }},
    picker: {
      ViewId: {FOLDERS: 'FOLDERS'}, DocsViewMode: {LIST: 'LIST'},
      Response: {ACTION: 'action', DOCUMENTS: 'docs'}, Action: {PICKED: 'picked'}, Document: {ID: 'id'},
      DocsView: class { setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } setMode() { return this; } setParent(value) { pickerParent = value; return this; } },
      PickerBuilder: class {
        addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; }
        setAppId() { return this; } setOrigin() { return this; }
        setCallback(fn) { callback = fn; return this; } build() { return this; } setVisible() {}
      },
    },
  };
  const context = {
    document: {getElementById: name => elements[name]}, google,
    window: {google, gapi: {load(_name, cb) { cb(); }}, isSecureContext: true},
    location: {protocol: 'https:', origin: 'https://example.github.io'},
    gapi: {load(_name, cb) { cb(); }},
    setInterval(fn) { ticks.push(fn); return ticks.length; }, clearInterval() {}, setTimeout() {},
    URL, crypto: {subtle: {digest: async () => new ArrayBuffer(32)}},
    async fetch(url, options) {
      fetches++;
      assert.equal(options.headers.Authorization, 'Bearer SECRET_TOKEN');
      const parsed = new URL(url);
      if (legacy) {
        const fileId = parsed.pathname.split('/').at(-1);
        const item = {
          [ids.root]: {id: ids.root, mimeType: 'application/vnd.google-apps.folder'},
          [ids.ready]: {id: ids.ready, mimeType: 'application/vnd.google-apps.folder', parents: [ids.root]},
          [ids.ledger]: {id: ids.ledger, mimeType: 'application/vnd.google-apps.folder', parents: [ids.root]},
          packageFolder123: {id: 'packageFolder123', mimeType: 'application/vnd.google-apps.folder', parents: [ids.ready]},
        }[fileId];
        const children = parsed.searchParams.get('q')?.includes(ids.ready)
          ? [item || {id: 'packageFolder123', mimeType: 'application/vnd.google-apps.folder'}]
          : ['post.json', 'review.json', 'manifest.json', 'one.png', 'two.png'].map((name, index) => ({id: `file${index}123456789`, name, size: 16}));
        return {ok: true, status: 200, async json() { return parsed.pathname.endsWith('/files') ? {files: children} : item; },
          async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer; }};
      }
      assert.equal(parsed.pathname, `/drive/v3/files/${ids.child}`);
      return {ok: http === 200, status: http,
        async json() { return {id: ids.child, mimeType: 'application/vnd.google-apps.folder', parents: [parent], isAppAuthorized: authorized}; }};
    },
  };
  vm.runInNewContext(script, context);
  ticks.forEach(fn => fn());
  function pick(action = 'picked', folderId = ids.child) {
    listeners['pick:click']();
    callback({action, docs: [{id: folderId}]});
  }
  return {elements, listeners, pick, fetchCount: () => fetches, pickerParent: () => pickerParent};
}

test('Galaxy page retains responsive viewport and a separate disabled child read action', () => {
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /<option value="child">READY 하위 폴더<\/option>/);
  assert.match(html, /<button id="read-child" disabled>/);
});

test('Picker navigation alone grants no child selection', () => {
  const h = harness(); h.pick('cancel');
  assert.equal(h.elements['read-child'].disabled, true);
  assert.equal(h.fetchCount(), 0);
});

test('PICKED keeps child ID and token off the page and performs no automatic Drive call', () => {
  const h = harness(); h.pick();
  assert.equal(h.pickerParent(), ids.ready);
  assert.equal(h.elements['read-child'].disabled, false);
  assert.equal(h.fetchCount(), 0);
  assert.doesNotMatch(h.elements.result.textContent, new RegExp(`${ids.child}|SECRET_TOKEN`));
});

test('Parent folder cannot be accepted as the READY child', () => {
  const h = harness(); h.pick('picked', ids.ready);
  assert.equal(h.elements['read-child'].disabled, true);
});

test('Original read action unlocks only after all three distinct folders are selected', () => {
  const h = harness();
  for (const target of ['root', 'ready', 'ledger']) {
    h.elements.target.value = target;
    h.pick('picked', ids[target]);
    assert.equal(h.elements.read.disabled, target !== 'ledger');
  }
  assert.equal(h.fetchCount(), 0);
});

test('Editing a folder ID disables both actions without exposing prior selection', () => {
  const h = harness();
  for (const target of ['root', 'ready', 'ledger']) {
    h.elements.target.value = target; h.pick('picked', ids[target]);
  }
  h.elements.target.value = 'child'; h.pick();
  assert.equal(h.elements.read.disabled, false);
  assert.equal(h.elements['read-child'].disabled, false);
  h.elements.ready.value = ids.other;
  h.listeners['ready:input']();
  assert.equal(h.elements.read.disabled, true);
  assert.equal(h.elements['read-child'].disabled, true);
  assert.doesNotMatch(h.elements.result.textContent, /SECRET_TOKEN|childFolder123456/);
});

test('Existing folder selection rejects an unexpected callback ID', () => {
  const h = harness(); h.elements.target.value = 'ready'; h.pick('picked', ids.other);
  assert.match(h.elements.result.textContent, /^중단:/);
  assert.equal(h.elements.read.disabled, true);
});

test('Existing package read remains available after the optional child selection', async () => {
  const h = harness({legacy: true});
  for (const target of ['root', 'ready', 'ledger']) {
    h.elements.target.value = target;
    h.pick('picked', ids[target]);
  }
  h.elements.target.value = 'child'; h.pick();
  await h.listeners['read:click']();
  assert.match(h.elements.result.textContent, /패키지 JSON·PNG 읽기에 성공/);
});

test('Read-only GET verifies exact READY parent and app authorization', async () => {
  const h = harness(); h.pick(); await h.listeners['read-child:click']();
  assert.equal(h.fetchCount(), 1);
  assert.match(h.elements.result.textContent, /직접 조회와 부모·앱 접근 확인에 성공/);
  assert.doesNotMatch(h.elements.result.textContent, new RegExp(`${ids.child}|SECRET_TOKEN`));
});

test('Wrong parent, absent app grant, and HTTP 404 fail closed', async t => {
  for (const options of [{parent: ids.other}, {authorized: false}, {http: 404}]) {
    await t.test(JSON.stringify(options), async () => {
      const h = harness(options); h.pick(); await h.listeners['read-child:click']();
      assert.match(h.elements.result.textContent, /^중단:/);
      assert.doesNotMatch(h.elements.result.textContent, /성공|SECRET_TOKEN|childFolder123456/);
    });
  }
});

test('Clearing the tab token disables every read action', () => {
  const h = harness(); h.pick(); h.listeners['clear:click']();
  assert.equal(h.elements['read-child'].disabled, true);
  assert.equal(h.elements.read.disabled, true);
});
