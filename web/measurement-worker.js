/* Keep image processing off the UI thread. No network calls contain image data. */
'use strict';

let runtime;

async function initialize() {
  self.postMessage({ type: 'progress', message: 'Loading the local measurement engine…' });
  importScripts('vendor/opencv.js', 'engine.js');
  const candidate = self.cv;
  // Emscripten's Module is a thenable that resolves to itself. Always wrap it;
  // returning it directly from an async function would recursively assimilate it.
  if (candidate && typeof candidate.Mat === 'function') return { cv: candidate };
  const wrapped = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The measurement engine could not start. Please reload and try again.')), 60000);
    const ready = (value) => { clearTimeout(timer); resolve({ cv: value || self.cv }); };
    if (candidate && typeof candidate.then === 'function') candidate.then(ready, reject);
    else if (candidate) candidate.onRuntimeInitialized = () => ready(candidate);
    else reject(new Error('OpenCV.js was not loaded. Please reload and try again.'));
  });
  return wrapped;
}

runtime = initialize();
runtime.then(() => self.postMessage({ type: 'ready' })).catch((error) => self.postMessage({ type: 'error', message: error.message }));

self.onmessage = async (event) => {
  const { type, imageData, requestId } = event.data || {};
  if (type !== 'analyze') return;
  try {
    const { cv } = await runtime;
    self.postMessage({ type: 'progress', message: 'Finding the marker and checking the inner edge…', requestId });
    const result = RingMeasureEngine.analyze(cv, imageData);
    self.postMessage({ type: 'result', result, requestId });
  } catch (error) {
    self.postMessage({ type: 'error', message: 'Measurement could not finish. Try a smaller JPG or PNG, or reload the page.', detail: String(error && error.message || error), requestId });
  }
};
