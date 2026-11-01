'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.resolve(__dirname, '../web/app.js'), 'utf8');
const markup = fs.readFileSync(path.resolve(__dirname, '../web/index.html'), 'utf8');

// Exercise the actual application event handlers, using the real HTML hierarchy
// for bubbling. Browser decoding and the worker are controlled boundaries: these
// tests cover UI lifecycle and input routing, not CV or native browser rendering.
function application(options = {}) {
  const ids = new Map(), elements = [], frames = [], timers = new Map();
  const calls = { picker: 0, scroll: [], focus: [], decodes: [], workers: [] };
  let now = 0, nextTimer = 1, activeElement = null;
  const context2d = () => ({
    fillRect() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, arc() {}, fill() {}, fillText() {}, setLineDash() {}, save() {}, restore() {}, translate() {}, scale() {},
    measureText: text => ({ width: text.length * 6 }),
    getImageData: () => ({ width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) }),
  });
  function matches(element, selector) {
    if (selector.includes(',')) return selector.split(',').some(part => matches(element, part.trim()));
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return element.hasAttribute(attribute[1]) && (attribute[2] === undefined || element.getAttribute(attribute[1]) === attribute[2]);
    return element.tagName.toLowerCase() === selector.toLowerCase();
  }
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.attributes = new Map(); this.children = [];
      this.parentElement = null; this.listeners = new Map(); this.hidden = false; this.disabled = false;
      this.textContent = ''; this.value = ''; this.files = []; this.dataset = {}; this.style = {};
      this.width = 128; this.height = 128; this.clientWidth = 390; this.clientHeight = 844;
      const classes = new Set();
      this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, force) { const set = force === undefined ? !classes.has(name) : force; if (set) classes.add(name); else classes.delete(name); return set; } };
      elements.push(this);
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'id') { this.id = String(value); ids.set(this.id, this); }
      if (name === 'class') this.classList.add(...String(value).split(/\s+/));
      if (name === 'hidden') this.hidden = true;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); if (name === 'hidden') this.hidden = false; }
    addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
    removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
    dispatchEvent(event) {
      event.target ||= this;
      event.preventDefault ||= () => { event.defaultPrevented = true; };
      event.stopPropagation ||= () => { event.stopped = true; };
      let current = this;
      while (current) {
        event.currentTarget = current;
        for (const listener of current.listeners.get(event.type) || []) listener.call(current, event);
        if (event.stopped || event.bubbles === false) break;
        current = current.parentElement;
      }
      return !event.defaultPrevented;
    }
    click() {
      if (this.disabled) return;
      if (this.id === 'file-input') {
        calls.picker += 1;
        // HTML suppresses reentrant activation; still count attempted calls so
        // the test detects a bubbling handler trying to open a second picker.
        if (this.activating) return;
      }
      this.activating = true;
      try { this.dispatchEvent({ type: 'click', bubbles: true }); }
      finally { this.activating = false; }
    }
    append(...children) { for (const child of children) { this.children.push(child); if (child instanceof Element) child.parentElement = this; } }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    contains(child) { for (let current = child; current; current = current.parentElement) if (current === this) return true; return false; }
    closest(selector) { for (let current = this; current; current = current.parentElement) if (matches(current, selector)) return current; return null; }
    querySelectorAll(selector) { return elements.filter(element => element !== this && this.contains(element) && matches(element, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus(settings) { activeElement = this; calls.focus.push({ id: this.id, settings }); }
    scrollIntoView(settings) { calls.scroll.push({ id: this.id, settings }); }
    getBoundingClientRect() { return { top: 900, bottom: 1300, left: 0, right: 390, width: 390, height: 400 }; }
    getContext() { return this.context ||= context2d(); }
  }

  const root = new Element('document'), stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline']);
  for (const token of markup.matchAll(/<(\/?)(([a-zA-Z][\w-]*))\b([^>]*)>/g)) {
    const closing = token[1], tag = token[2].toLowerCase(), tail = token[4];
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName.toLowerCase() === tag) { stack.length = i; break; }
      continue;
    }
    const element = new Element(tag);
    for (const attr of tail.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g)) element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    stack.at(-1).append(element);
    if (!voidTags.has(tag) && !tail.trimEnd().endsWith('/')) stack.push(element);
  }
  const get = id => { const element = ids.get(id); assert.ok(element, `HTML must contain #${id}`); return element; };
  const document = {
    baseURI: 'https://example.invalid/', hidden: false,
    get activeElement() { return activeElement; },
    getElementById: get, createElement: tag => new Element(tag), createTextNode: text => text,
    querySelectorAll: selector => root.querySelectorAll(selector), querySelector: selector => root.querySelector(selector),
    addEventListener: (...args) => root.addEventListener(...args),
    body: elements.find(element => element.tagName === 'BODY'), documentElement: elements.find(element => element.tagName === 'HTML'),
  };
  function timer(callback, delay = 0, interval = false) { const id = nextTimer++; timers.set(id, { callback, delay, due: now + delay, interval }); return id; }
  class FakeWorker {
    constructor() { this.requests = []; this.terminated = false; calls.workers.push(this); }
    postMessage(message) { this.requests.push(message); }
    terminate() { this.terminated = true; }
    respond(result) { const request = this.requests.at(-1); assert.ok(request, 'A pixel request must reach the worker'); this.onmessage({ data: { type: 'result', requestId: request.requestId, result } }); }
  }
  const window = {
    addEventListener() {}, removeEventListener() {}, innerHeight: 844, innerWidth: 390, scrollY: 700,
    matchMedia: () => ({ matches: false }), scrollTo: settings => calls.scroll.push({ id: 'window', settings }),
  };
  const sandbox = {
    document, window, navigator: { userAgent: 'App lifecycle test' }, performance: { now: () => now },
    URL, Blob, File, Uint8ClampedArray, Uint8Array, ArrayBuffer, AbortController, DOMException,
    Worker: FakeWorker, Image: class { set src(value) { this.url = value; if (!options.hangDecode) queueMicrotask(() => { this.width = this.naturalWidth = 128; this.height = this.naturalHeight = 128; this.onload?.(); }); } },
    createImageBitmap(file) { calls.decodes.push(file); return options.decode ? options.decode(file) : options.hangDecode ? new Promise(() => {}) : Promise.resolve({ width: 128, height: 128, close() {} }); },
    fetch: options.fetch || (() => Promise.reject(new Error('Unexpected network request in app-flow test'))),
    setTimeout: (callback, delay) => timer(callback, delay), clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => timer(callback, delay, true), clearInterval: id => timers.delete(id),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
    console,
  };
  Object.assign(window, { requestAnimationFrame: sandbox.requestAnimationFrame, setTimeout: sandbox.setTimeout });
  vm.runInNewContext(appSource, sandbox, { filename: 'app.js', timeout: 1000 });
  async function flush() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); const batch = frames.splice(0); for (const frame of batch) frame(now); } }
  async function choose(file) { get('file-input').files = file ? [file] : []; get('file-input').dispatchEvent({ type: 'change', bubbles: true }); await flush(); }
  async function finish(result = accepted()) { assert.ok(calls.workers.length, 'A supported photo must reach the worker'); calls.workers.at(-1).respond(result); await flush(); }
  async function advanceNextTimeout() {
    const next = [...timers].filter(([, task]) => !task.interval).sort((a, b) => a[1].due - b[1].due)[0];
    if (!next) return false;
    const [id, task] = next; timers.delete(id); now = task.due; task.callback(); await flush(); return true;
  }
  return { get, calls, choose, finish, flush, advanceNextTimeout, sample: filename => root.querySelector(`[data-sample="${filename}"]`), now: () => now };
}

function accepted() { return { status: 'ok', diameterMm: 18, uncertaintyMm: 0.5, checks: [], metrics: { processingMs: 1 } }; }
function refused() { return { status: 'retake', code: 'multiple_rings', message: 'More than one ring.', guidance: 'Choose a photo with one ring.', checks: [], metrics: { processingMs: 1 } }; }
// Signature fixtures exercise validation routing. Pixel decoding is deliberately
// mocked above, independently of the production CV and real-photo tests.
function jpeg(type = 'image/jpeg') { return new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])], 'phone-photo.jpg', { type }); }

test('upload button opens one native picker; direct input click does not recurse through bubbling', async () => {
  const app = application();
  app.get('choose-photo').click();
  assert.equal(app.calls.picker, 1);
  app.get('file-input').click();
  assert.equal(app.calls.picker, 2, 'Each activation must issue exactly one input click');
});

test('marker step opens the capture guide and keeps an existing result', async () => {
  const app = application(); await app.choose(jpeg()); await app.finish();
  assert.equal(app.get('step-marker').tagName, 'BUTTON', 'Step must be a native keyboard and touch control');
  app.get('step-marker').querySelector('.step-number').click();
  assert.equal(app.get('guide-dialog').hasAttribute('open'), true);
  assert.equal(app.calls.picker, 0, 'Marker help must not open the photo picker');
  assert.equal(app.get('result-section').hidden, false);
  assert.equal(app.get('diameter-value').textContent, '18.0');
  assert.ok(app.get('guide-dialog').querySelector('a'), 'The guide must retain its marker download');
});

test('upload step opens one picker when its numbered target is tapped', () => {
  const app = application();
  assert.equal(app.get('step-upload').tagName, 'BUTTON');
  app.get('step-upload').querySelector('.step-number').click();
  assert.equal(app.calls.picker, 1, 'A tap anywhere inside the step must open exactly one picker');
  assert.equal(app.get('upload-section').hidden, false);
});

for (const [button, result] of [['replace-photo', accepted()], ['retake-upload', refused()], ['step-upload', accepted()], ['step-upload', refused()]]) {
  test(`${button} opens one picker and cancellation preserves the current result`, async () => {
    const app = application(); await app.choose(jpeg()); await app.finish(result);
    const oldName = app.get('photo-name').textContent;
    app.get(button).click();
    assert.equal(app.calls.picker, 1, 'Picker must open synchronously within the button gesture');
    app.get('file-input').dispatchEvent({ type: 'cancel', bubbles: true });
    await app.choose(null);
    assert.equal(app.get('result-section').hidden, false, 'Cancelling file selection must keep the previous result');
    assert.equal(app.get('photo-name').textContent, oldName);
    assert.equal(app.get('upload-section').hidden, true);
  });
}

for (const result of [accepted(), refused()]) {
  test(`result step is unavailable before analysis and focuses a completed ${result.status} outcome`, async () => {
    const app = application();
    assert.equal(app.get('step-result').disabled, true);
    app.get('step-result').click();
    assert.equal(app.calls.scroll.length, 0, 'An unavailable estimate must not navigate to an empty result');
    assert.equal(app.get('step-upload').getAttribute('aria-current'), 'step');
    await app.choose(jpeg()); await app.finish(result);
    assert.equal(app.get('step-result').disabled, false);
    assert.equal(app.get('step-result').getAttribute('aria-current'), 'step');
    assert.equal(app.get('step-upload').getAttribute('aria-current'), 'false');
    app.calls.scroll.length = 0; app.calls.focus.length = 0;
    app.get('step-result').click();
    assert.equal(app.calls.scroll.at(-1).id, 'result-section');
    assert.equal(app.calls.focus.at(-1).id, 'result-section');
    assert.equal(app.get('result-section').hidden, false);
  });
}

test('steps block competing actions during processing and recover after cancellation', async () => {
  const app = application({ hangDecode: true }); await app.choose(jpeg());
  for (const id of ['step-marker', 'step-upload', 'step-result']) {
    assert.equal(app.get(id).disabled, true);
    app.get(id).click();
    app.get(id).dispatchEvent({ type: 'click', bubbles: true });
  }
  assert.equal(app.calls.picker, 0);
  assert.equal(app.get('guide-dialog').hasAttribute('open'), false);
  assert.equal(app.get('processing-section').hidden, false);
  app.get('cancel-processing').click(); await app.flush();
  assert.equal(app.get('step-marker').disabled, false);
  assert.equal(app.get('step-upload').disabled, false);
  assert.equal(app.get('step-result').disabled, true);
  app.get('step-upload').click();
  assert.equal(app.calls.picker, 1);
});

test('late failure of a sample fetch cannot replace a newly selected photo', async () => {
  let failSample;
  const app = application({ fetch: () => new Promise((resolve, reject) => { failSample = reject; }) });
  app.get('upload-section').querySelector('.sample-button').click();
  await app.choose(jpeg());
  assert.equal(app.get('processing-section').hidden, false);
  failSample(new Error('Older sample request failed')); await app.flush();
  assert.equal(app.get('processing-section').hidden, false, 'An obsolete fetch error must not hide active processing');
  assert.equal(app.get('upload-error').hidden, true);
  await app.finish();
  assert.equal(app.get('result-section').hidden, false);
  assert.equal(app.get('photo-name').textContent, 'phone-photo.jpg');
});

test('the last clicked sample wins when an earlier sample download finishes first', async () => {
  const downloads = new Map();
  const app = application({ fetch: url => new Promise(resolve => downloads.set(url, resolve)) });
  app.sample('cutout-17.png').click();
  app.sample('cutout-20.png').click();
  const response = identity => ({ ok: true, blob: async () => new Blob([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, identity]),
  ], { type: 'image/png' }) });
  downloads.get('samples/cutout-17.png')(response(17)); await app.flush();
  assert.equal(app.calls.decodes.length, 0, 'The earlier response must not start analysis after the user chose another sample');
  downloads.get('samples/cutout-20.png')(response(20)); await app.flush();
  assert.equal(app.calls.decodes.length, 1);
  const selectedBytes = new Uint8Array(await app.calls.decodes[0].arrayBuffer());
  assert.equal(selectedBytes.at(-1), 20, 'Only bytes belonging to the most recent selection reach the decoder');
  await app.finish();
  assert.equal(app.get('result-section').hidden, false);
  assert.equal(app.get('photo-name').textContent, '20 mm synthetic cut-out');
});

for (const type of ['image/jpg', 'application/octet-stream']) {
  test(`JPEG file with provider MIME ${type} reaches decoder and worker`, async () => {
    const app = application(); await app.choose(jpeg(type));
    assert.equal(app.get('upload-error').hidden, true, app.get('upload-error').textContent);
    assert.equal(app.calls.decodes.length, 1);
    await app.finish(); assert.equal(app.get('result-section').hidden, false);
  });
}

test('generic MIME does not turn arbitrary bytes with a .jpg suffix into a supported photo', async () => {
  const app = application();
  await app.choose(new File(['This is not an image'], 'misleading.jpg', { type: 'application/octet-stream' }));
  assert.equal(app.get('upload-error').hidden, false);
  assert.equal(app.calls.workers.length, 0);
});

test('a stalled decode exits processing with actionable feedback within a bounded time', async () => {
  const app = application({ hangDecode: true }); await app.choose(jpeg());
  assert.equal(app.get('processing-section').hidden, false);
  for (let i = 0; i < 8 && !app.get('processing-section').hidden; i++) {
    if (!await app.advanceNextTimeout()) break;
  }
  assert.equal(app.get('processing-section').hidden, true, 'Decode needs its own watchdog before worker startup');
  assert.equal(app.get('upload-error').hidden, false);
  assert.match(app.get('upload-error').textContent, /open|decode|time|long|try|photo/i);
  assert.ok(app.now() <= 75000, 'Do not leave users waiting indefinitely before the worker starts');
  assert.equal(app.calls.workers.length, 0);
});

test('cancelling decode discards and closes a bitmap that arrives after cancellation', async () => {
  let completeDecode, closed = 0;
  const app = application({ decode: () => new Promise(resolve => { completeDecode = resolve; }) });
  await app.choose(jpeg());
  assert.equal(app.calls.decodes.length, 1);
  app.get('cancel-processing').click(); await app.flush();
  assert.equal(app.get('upload-section').hidden, false);
  completeDecode({ width: 128, height: 128, close() { closed += 1; } }); await app.flush();
  assert.equal(app.calls.workers.length, 0, 'The cancelled photo must never start a worker operation');
  assert.equal(app.get('upload-section').hidden, false);
  assert.equal(app.get('processing-section').hidden, true);
  assert.equal(app.get('upload-error').hidden, true, 'Late cancellation must not surface as an upload error');
  assert.equal(closed, 1, 'Discarded decoded pixels must be released');
});

test('result arrival and explicit processing cancellation bring the visible section into view', async () => {
  const app = application(); await app.choose(jpeg());
  app.calls.scroll.length = 0; app.calls.focus.length = 0;
  await app.finish();
  assert.ok(app.calls.scroll.length, 'Asynchronous result arrival must scroll to the result');
  assert.ok(app.calls.focus.some(call => ['result-section', 'result-title'].includes(call.id)), 'Result must receive focus');
  await app.choose(jpeg()); app.calls.scroll.length = 0; app.calls.focus.length = 0;
  app.get('cancel-processing').click(); await app.flush();
  assert.equal(app.get('upload-section').hidden, false);
  assert.ok(app.calls.scroll.length, 'Returning to upload must not retain a deep mobile result scroll position');
  assert.ok(app.calls.focus.some(call => ['upload-section', 'upload-title', 'choose-photo'].includes(call.id)));
});
