/* Forma browser application. Images are decoded and measured on this device. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_PIXELS = 40 * 1000 * 1000;
  const MAX_SIDE = 1600;
  const fileInput = $('file-input');
  const dropzone = $('dropzone');
  const sourceCanvas = document.createElement('canvas');
  const photoCanvas = $('photo-canvas');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  let worker = null;
  let pending = null;
  let operation = 0;
  let lastReport = null;
  let selectedSize = null;
  let currentImage = null;
  let running = false;

  function announce(message) { $('status-announcement').textContent = message; }

  function showSection(name) {
    $('upload-section').hidden = name !== 'upload';
    $('processing-section').hidden = name !== 'processing';
    $('result-section').hidden = name !== 'result';
    $('upload-step').classList.toggle('active', name !== 'result');
    $('result-step').classList.toggle('active', name === 'result');
    document.querySelectorAll('.sample-button').forEach((button) => { button.disabled = name === 'processing'; });
    running = name === 'processing';
  }

  function resetWorker(reason) {
    if (worker) worker.terminate();
    worker = null;
    if (pending) {
      clearTimeout(pending.timer);
      const reject = pending.reject;
      pending = null;
      reject(new Error(reason || 'The measurement was cancelled.'));
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    const instance = new Worker(new URL('./measurement-worker.js', document.baseURI));
    worker = instance;
    instance.onmessage = function (event) {
      if (worker !== instance) return;
      const message = event.data || {};
      if (message.type === 'progress') {
        if (running && (!message.requestId || message.requestId === operation)) {
          $('processing-detail').textContent = message.message || 'Checking the scale and inner boundary…';
        }
        return;
      }
      if (message.type === 'ready') {
        if (running) $('processing-detail').textContent = 'Finding the 20 mm marker and the ring’s inner boundary…';
        return;
      }
      if (message.requestId !== undefined && message.requestId !== operation) return;
      if (!pending) return;
      if (message.type === 'result' || message.type === 'error') {
        clearTimeout(pending.timer);
        const job = pending;
        pending = null;
        if (message.type === 'result') job.resolve(message.result || message.data);
        else {
          worker.terminate();
          worker = null;
          job.reject(new Error(message.message || 'The local engine could not finish. Please try again.'));
        }
      }
    };
    instance.onerror = function () {
      if (worker !== instance) return;
      resetWorker('The local measurement engine could not start. Reload the page and try again.');
    };
    instance.onmessageerror = function () {
      if (worker !== instance) return;
      resetWorker('The photo could not be passed to the local engine. Try another JPG or PNG.');
    };
    return instance;
  }

  function analyze(imageData, requestId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (requestId !== operation) return;
        resetWorker('The local engine took too long to respond. Reload the page or try a smaller photo.');
      }, 75000);
      pending = { resolve, reject, timer };
      try {
        ensureWorker().postMessage({
          type: 'analyze',
          imageData: { width: imageData.width, height: imageData.height, data: imageData.data },
          requestId: requestId
        }, [imageData.data.buffer]);
      } catch (error) {
        resetWorker(error.message || 'Your browser could not start the measurement engine.');
      }
    });
  }

  function validateFile(file) {
    if (!file || !file.size) throw new Error('This file is empty. Please choose a JPG, PNG or WebP photograph.');
    if (file.size > MAX_BYTES) throw new Error('This file is larger than 20 MB. Export a smaller JPG, PNG or WebP and try again.');
    const allowed = /^(image\/jpeg|image\/png|image\/webp)$/i;
    const named = /\.(jpe?g|png|webp)$/i;
    if ((file.type && !allowed.test(file.type)) || (!file.type && !named.test(file.name || ''))) {
      throw new Error('Choose a JPG, PNG or WebP image. If your photo is HEIC, export it as JPG first.');
    }
  }

  async function decodeFile(file) {
    let image;
    let objectUrl;
    try {
      if (typeof createImageBitmap === 'function') {
        try { image = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch (_) { /* The Image fallback also honours EXIF orientation in modern browsers. */ }
      }
      if (!image) {
        objectUrl = URL.createObjectURL(file);
        image = await new Promise((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error('This image could not be opened. Please choose an undamaged JPG, PNG or WebP.'));
          element.src = objectUrl;
        });
      }
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('This image has no readable dimensions. Please choose another photograph.');
      if (width * height > MAX_PIXELS) throw new Error('This photo is above the 40-megapixel limit. Export a smaller image and upload it again.');
      if (Math.min(width, height) < 100) throw new Error('This image is too small. Upload the original photograph rather than a thumbnail.');
      const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
      const decodedCanvas = document.createElement('canvas');
      decodedCanvas.width = Math.round(width * scale);
      decodedCanvas.height = Math.round(height * scale);
      const decodedContext = decodedCanvas.getContext('2d');
      decodedContext.fillStyle = '#ffffff';
      decodedContext.fillRect(0, 0, decodedCanvas.width, decodedCanvas.height);
      decodedContext.drawImage(image, 0, 0, decodedCanvas.width, decodedCanvas.height);
      return { canvas: decodedCanvas, dimensions: { originalWidth: width, originalHeight: height, analysisWidth: decodedCanvas.width, analysisHeight: decodedCanvas.height } };
    } finally {
      if (image && typeof image.close === 'function') image.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  function uploadError(message) {
    $('upload-error').textContent = message;
    $('upload-error').hidden = false;
    announce(message);
  }

  async function startFile(file, sample) {
    const requestId = ++operation;
    if (pending) resetWorker('A new image was selected.');
    lastReport = null;
    $('upload-error').hidden = true;
    try { validateFile(file); }
    catch (error) { showSection('upload'); uploadError(error.message); return; }
    const started = performance.now();
    showSection('processing');
    $('processing-title').textContent = 'Reading your photograph…';
    $('processing-detail').textContent = 'Opening the photo. Everything happens on your device.';
    announce('Opening and measuring your photograph locally.');
    $('measure').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const decoded = await decodeFile(file);
      if (requestId !== operation) return;
      sourceCanvas.width = decoded.canvas.width;
      sourceCanvas.height = decoded.canvas.height;
      sourceContext.drawImage(decoded.canvas, 0, 0);
      currentImage = { name: sample ? sample.label : (file.name || 'Your photograph'), sample: !!sample, bytes: file.size, mimeType: file.type, ...decoded.dimensions };
      $('processing-detail').textContent = 'Preparing the local engine. The first image may take a little longer.';
      const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      const result = await analyze(pixels, requestId);
      if (requestId !== operation) return;
      if (!result || !['ok', 'retake'].includes(result.status)) throw new Error('The engine returned an unreadable result. Please reload and try again.');
      const elapsed = performance.now() - started;
      renderResult(result, elapsed);
    } catch (error) {
      if (requestId !== operation) return;
      showSection('upload');
      uploadError(error.message || 'This photograph could not be processed. Please choose another image.');
    }
  }

  function point(p) { return Array.isArray(p) ? { x: p[0], y: p[1] } : p; }

  function drawPolyline(context, points, closed) {
    if (!points || points.length < 2) return;
    context.beginPath();
    points.forEach((value, index) => {
      const p = point(value);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (index === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    if (closed) context.closePath();
    context.stroke();
  }

  function drawAnnotations(result) {
    photoCanvas.width = sourceCanvas.width;
    photoCanvas.height = sourceCanvas.height;
    const context = photoCanvas.getContext('2d');
    context.drawImage(sourceCanvas, 0, 0);
    const factor = Math.max(1, sourceCanvas.width / 650);
    context.lineWidth = 2.1 * factor;
    context.lineJoin = 'round';
    context.strokeStyle = '#3b8964';
    context.shadowColor = '#ffffff';
    context.shadowBlur = 2 * factor;
    if (result.marker && result.marker.corners) {
      drawPolyline(context, result.marker.corners, true);
      result.marker.corners.forEach((p) => {
        p = point(p);
        context.beginPath();
        context.arc(p.x, p.y, 2.5 * factor, 0, Math.PI * 2);
        context.fillStyle = '#3b8964';
        context.fill();
      });
    }
    if (result.ring && result.ring.points) {
      context.strokeStyle = '#bf9651';
      context.setLineDash(result.status === 'ok' ? [] : [5 * factor, 4 * factor]);
      drawPolyline(context, result.ring.points, true);
      context.setLineDash([]);
    }
    context.shadowBlur = 0;
    if (result.marker && Number.isFinite(result.marker.pixelsPerMm)) {
      const length = result.marker.pixelsPerMm * 10;
      const padding = 20 * factor;
      const x = padding;
      const y = photoCanvas.height - padding;
      const label = '10 mm reference';
      context.font = `${10 * factor}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      const boxWidth = Math.max(length + 18 * factor, context.measureText(label).width + 18 * factor);
      context.fillStyle = 'rgba(255,254,250,.92)';
      context.fillRect(x - 9 * factor, y - 25 * factor, boxWidth, 36 * factor);
      context.strokeStyle = '#326548';
      context.lineWidth = 1.3 * factor;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length, y);
      context.moveTo(x, y - 4 * factor);
      context.lineTo(x, y + 4 * factor);
      context.moveTo(x + length, y - 4 * factor);
      context.lineTo(x + length, y + 4 * factor);
      context.stroke();
      context.fillStyle = '#436b49';
      context.fillText(label, x, y - 10 * factor);
    }
  }

  function formatTime(milliseconds) {
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    return `${(milliseconds / 1000).toFixed(1)} s`;
  }

  function renderChecks(checks) {
    $('checks-list').replaceChildren();
    (checks || []).forEach((check) => {
      const item = document.createElement('span');
      item.className = `check-item${check.pass ? '' : ' failed'}`;
      item.title = check.detail || check.label;
      const icon = document.createElement('span');
      icon.className = 'check-icon';
      icon.textContent = check.pass ? '✓' : '!';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = check.label;
      const accessible = document.createElement('span');
      accessible.className = 'visually-hidden';
      accessible.textContent = check.pass ? ' passed' : ' failed';
      item.append(icon, label, accessible);
      $('checks-list').append(item);
    });
  }

  function renderResult(result, elapsed) {
    const okay = result.status === 'ok';
    showSection('result');
    $('result-section').classList.toggle('retake', !okay);
    $('measurement-card').hidden = !okay;
    $('retake-panel').hidden = okay;
    $('result-eyebrow').textContent = okay ? 'YOUR MEASUREMENT' : 'PHOTO CHECK';
    $('result-title').textContent = okay ? 'A closer look at your fit.' : 'A little more clarity, please.';
    $('photo-name').textContent = currentImage.name;
    $('sample-badge').hidden = !currentImage.sample;
    $('processing-time').textContent = formatTime(elapsed);
    const hasMarker = !!(result.marker && result.marker.corners && result.marker.corners.length > 1);
    const hasRing = !!(result.ring && result.ring.points && result.ring.points.length > 1);
    $('marker-legend').hidden = !hasMarker;
    $('ring-legend').hidden = !hasRing;
    $('scale-label').textContent = result.marker && Number.isFinite(result.marker.pixelsPerMm) ? `${result.marker.pixelsPerMm.toFixed(1)} px / mm` : 'Scale not established';
    photoCanvas.setAttribute('aria-label', `Your uploaded photograph${hasMarker ? ', with the detected calibration marker' : ''}${hasRing ? ', with the detected inner boundary' : ''}`);
    drawAnnotations(result);
    renderChecks(result.checks);
    selectedSize = null;
    if (okay) {
      $('diameter-value').textContent = result.diameterMm.toFixed(1);
      $('uncertainty-value').textContent = `± ${result.uncertaintyMm.toFixed(1)} mm provisional uncertainty`;
      selectedSize = window.RingSizing ? window.RingSizing.nearest(result.diameterMm) : null;
      $('size-value').textContent = selectedSize ? String(selectedSize.size) : 'Outside chart';
      $('size-note').textContent = selectedSize
        ? `Nearest published diameter: ${selectedSize.diameterMm.toFixed(1)} mm. Exact midpoint ties round up.`
        : 'The diameter is outside the published 14.1–22.2 mm chart. No size is extrapolated.';
      announce(`Estimated inside diameter ${result.diameterMm.toFixed(1)} millimetres, provisional uncertainty plus or minus ${result.uncertaintyMm.toFixed(1)} millimetres.${selectedSize ? ` Closest US size ${selectedSize.size}.` : ' The diameter is outside the size chart.'}`);
    } else {
      $('retake-title').textContent = 'This photo needs another try.';
      $('retake-reason').textContent = result.message || 'This photo does not support a reliable measurement.';
      $('retake-guidance').textContent = result.guidance || 'Use a sharp, near-overhead photograph of one ring beside the supplied printed marker.';
      announce(`${$('retake-reason').textContent} ${$('retake-guidance').textContent}`);
    }
    lastReport = {
      application: 'Forma ring measurement prototype',
      reportVersion: '1.0',
      generatedAt: new Date().toISOString(),
      input: {
        name: currentImage.name,
        syntheticExample: currentImage.sample,
        mimeType: currentImage.mimeType,
        originalWidth: currentImage.originalWidth,
        originalHeight: currentImage.originalHeight,
        analysisWidth: currentImage.analysisWidth,
        analysisHeight: currentImage.analysisHeight
      },
      measurement: result,
      size: selectedSize,
      sizingSource: window.RingSizing ? window.RingSizing.source : null,
      roundingRule: window.RingSizing ? window.RingSizing.roundingRule : null,
      timing: { timeToResultMs: Math.round(elapsed), includes: 'Image decoding, local engine startup and measurement; excludes file selection.' },
      variableCost: { paidApiCalls: 0, paidApiCostUsd: 0, hostingAndBandwidth: 'Separate; provider-dependent', deviceResources: 'Not metered by this application' },
      validationStatus: 'Physical accuracy and uncertainty remain unvalidated. Results assume a physically verified 20 mm marker and require comparison with independent measurements.'
    };
    populateSizing();
  }

  function populateSizing() {
    const sizing = window.RingSizing;
    if (!sizing) return;
    const sourceLink = document.createElement('a');
    sourceLink.href = sizing.source.url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = sizing.source.title;
    $('chart-source').replaceChildren(document.createTextNode('Source: '), sourceLink);
    $('sizing-table').replaceChildren();
    sizing.table.forEach((row) => {
      const tr = document.createElement('tr');
      if (selectedSize && row.size === selectedSize.size) tr.className = 'selected';
      const size = document.createElement('td');
      size.textContent = String(row.size);
      const diameter = document.createElement('td');
      diameter.textContent = `${row.diameterMm.toFixed(1)} mm`;
      tr.append(size, diameter);
      $('sizing-table').append(tr);
    });
  }

  async function loadSample(filename) {
    if (running) return;
    $('upload-error').hidden = true;
    const button = document.querySelector(`[data-sample="${filename}"]`);
    if (button) button.disabled = true;
    const requestId = operation;
    try {
      const response = await fetch(`samples/${encodeURIComponent(filename)}`, { cache: 'force-cache' });
      if (!response.ok) throw new Error('The example image is not available. Upload your own photo or try again later.');
      const blob = await response.blob();
      if (requestId !== operation || running) return;
      const file = new File([blob], filename, { type: 'image/png' });
      const labels = {
        'cutout-17.png': '17 mm synthetic cut-out',
        'cutout-20.png': '20 mm synthetic cut-out',
        'missing-marker.png': 'Synthetic photo without marker'
      };
      await startFile(file, { label: labels[filename] || 'Synthetic example' });
    } catch (error) {
      showSection('upload');
      uploadError(error.message || 'The example could not be opened. Please upload a photograph.');
    } finally { if (button) button.disabled = false; }
  }

  function returnToUpload() {
    operation += 1;
    if (pending) resetWorker('The measurement was cancelled.');
    currentImage = null;
    lastReport = null;
    fileInput.value = '';
    $('upload-error').hidden = true;
    showSection('upload');
    $('choose-photo').focus({ preventScroll: true });
    announce('Ready for another photograph.');
  }

  function openDialog(id) {
    const dialog = $(id);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) startFile(file);
  });
  $('choose-photo').addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.target !== dropzone) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', (event) => {
    if (running) return;
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;
    if (files.length > 1) { uploadError('Choose one photograph at a time. Please upload an image containing one ring and one marker.'); return; }
    startFile(files[0]);
  });
  // Avoid the browser navigating away when a file is dropped outside the upload target.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
  document.querySelectorAll('.sample-button').forEach((button) => button.addEventListener('click', () => loadSample(button.dataset.sample)));
  document.querySelectorAll('.guide-trigger').forEach((button) => button.addEventListener('click', () => openDialog('guide-dialog')));
  $('sizing-trigger').addEventListener('click', () => openDialog('sizing-dialog'));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  $('replace-photo').addEventListener('click', returnToUpload);
  $('retake-upload').addEventListener('click', () => { returnToUpload(); fileInput.click(); });
  $('cancel-processing').addEventListener('click', returnToUpload);
  $('download-result').addEventListener('click', () => {
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    const localNow = new Date();
    const localDate = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
    link.download = `forma-${lastReport.measurement.status === 'ok' ? 'measurement' : 'photo-check'}-${localDate}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });

  populateSizing();
  showSection('upload');
})();
