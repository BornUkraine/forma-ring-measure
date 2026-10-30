/* A small, local WebGL studio for the decorative Forma wedding band. */
(function () {
  'use strict';

  const canvas = document.getElementById('hero-ring-canvas');
  const stage = canvas && canvas.closest('.ring-stage, .hero-ring-stage');
  if (!canvas || !stage) return;

  const toggle = document.getElementById('hero-ring-toggle');
  const toggleLabel = document.getElementById('hero-ring-toggle-label');
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  canvas.setAttribute('aria-hidden', 'true');

  let gl = null;
  let resources = null;
  let active = false;
  let hasDrawn = false;
  let contextLost = false;
  let inView = true;
  let userPaused = false;
  let animationFrame = 0;
  let previousTimestamp = 0;
  let lastDrawTimestamp = 0;
  let studioTime = 0;

  const meshVertexShader = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uProjection;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vLocal;
    varying vec3 vLocalNormal;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vPosition = world.xyz;
      vNormal = mat3(uModel) * aNormal;
      vLocal = aPosition;
      vLocalNormal = aNormal;
      gl_Position = uProjection * vec4(world.xyz - vec3(0.0, 0.0, 5.0), 1.0);
    }
  `;

  const meshFragmentShader = `
    precision highp float;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vLocal;
    varying vec3 vLocalNormal;
    uniform float uTime;
    const float PI = 3.14159265359;

    vec3 fresnel(float cosine, vec3 f0) {
      return f0 + (1.0 - f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
    }

    // Analytical studio softboxes: no texture downloads or environment assets.
    vec3 environment(vec3 direction) {
      float ceiling = smoothstep(-0.48, 0.65, direction.y);
      vec3 room = mix(vec3(0.18, 0.091, 0.030), vec3(0.92, 0.80, 0.61), ceiling);
      vec3 leftBox = normalize(vec3(-0.82, 0.72, 0.85));
      vec3 topBox = normalize(vec3(0.32, 1.0, -0.28));
      float left = pow(max(dot(direction, leftBox), 0.0), 16.0);
      float top = pow(max(dot(direction, topBox), 0.0), 11.0);
      float rightStrip = exp(-pow((direction.x - 0.74) * 12.0, 2.0))
        * smoothstep(-0.6, 0.65, direction.z) * (0.7 + 0.3 * ceiling);
      float darkFlag = exp(-pow((direction.x + 0.12) * 8.0, 2.0))
        * smoothstep(-0.3, 0.5, direction.z);
      room += vec3(3.6, 3.10, 2.35) * left;
      room += vec3(1.55, 1.35, 1.00) * top;
      room += vec3(4.5, 3.80, 2.70) * rightStrip;
      room *= 1.0 - 0.42 * darkFlag;
      return room;
    }

    vec3 specularLight(vec3 n, vec3 v, vec3 l, vec3 radiance, vec3 f0, float roughness) {
      vec3 h = normalize(v + l);
      float nv = max(dot(n, v), 0.001);
      float nl = max(dot(n, l), 0.0);
      float nh = max(dot(n, h), 0.0);
      float vh = max(dot(v, h), 0.0);
      float a = roughness * roughness;
      float a2 = a * a;
      float denominator = nh * nh * (a2 - 1.0) + 1.0;
      float distribution = a2 / max(PI * denominator * denominator, 0.00001);
      float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
      float visibility = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
      return radiance * fresnel(vh, f0) * distribution * visibility / max(4.0 * nv, 0.001);
    }

    vec3 toneMap(vec3 color) {
      return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vec3(0.0, 0.0, 5.0) - vPosition);
      vec3 reflected = reflect(-v, n);
      // Pale 18k champagne gold, with restrained circumferential polishing grain.
      float grain = sin(vLocal.y * 280.0 + sin(atan(vLocal.z, vLocal.x) * 25.0) * 0.25) * 0.004;
      vec3 gold = vec3(0.98, 0.68, 0.29) + grain;
      float innerWall = 1.0 - smoothstep(1.105, 1.19, length(vLocal.xz));
      float occlusion = 1.0 - innerWall * (0.15 + 0.10 * (1.0 - abs(vLocalNormal.y)));
      vec3 color = environment(reflected) * fresnel(max(dot(n, v), 0.0), gold) * occlusion;
      color *= 0.78;
      vec3 key = normalize(vec3(-1.6 + 0.12 * sin(uTime * 0.19), 2.4, 3.0));
      vec3 rim = normalize(vec3(2.7, 1.0, 1.3 + 0.2 * sin(uTime * 0.16)));
      color += specularLight(n, v, key, vec3(4.0, 3.35, 2.45), gold, 0.23) * occlusion;
      color += specularLight(n, v, rim, vec3(2.8, 2.50, 1.90), gold, 0.19) * occlusion;
      // Warm bounce gives the inner wall depth without closing the opening.
      color += gold * vec3(0.035, 0.027, 0.014) * (0.5 + 0.5 * n.y);
      color += gold * vec3(0.075, 0.040, 0.012) * innerWall;
      color = pow(toneMap(color * 1.08), vec3(1.0 / 2.2));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const shadowVertexShader = `
    attribute vec2 aPosition;
    varying vec2 vPosition;
    void main() { vPosition = aPosition; gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const shadowFragmentShader = `
    precision mediump float;
    varying vec2 vPosition;
    uniform float uAspect;
    uniform float uLift;
    void main() {
      vec2 p = vec2(vPosition.x * uAspect, vPosition.y + 0.79);
      float width = 0.77 + uLift * 0.16;
      float r = pow(p.x / width, 2.0) + pow(p.y / 0.069, 2.0);
      float a = (0.12 * exp(-r * 2.1) + 0.036 * exp(-r * 0.55)) * (1.0 - uLift * 0.25);
      gl_FragColor = vec4(vec3(0.26, 0.29, 0.21) * a, a);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader allocation failed.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Studio shader compilation failed.');
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const shaders = [];
    let program;
    try {
      shaders.push(compileShader(gl.VERTEX_SHADER, vertexSource));
      shaders.push(compileShader(gl.FRAGMENT_SHADER, fragmentSource));
      program = gl.createProgram();
      if (!program) throw new Error('Program allocation failed.');
      shaders.forEach((shader) => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Studio program linking failed.');
      return program;
    } catch (error) {
      if (program) gl.deleteProgram(program);
      throw error;
    } finally { shaders.forEach((shader) => gl.deleteShader(shader)); }
  }

  function createBuffer(target, values) {
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Geometry allocation failed.');
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, values, gl.STATIC_DRAW);
    return buffer;
  }

  // Revolve a rounded rectangular section. Broad flat faces and small bevels
  // distinguish a real wedding band from a circular-section torus.
  function makeBand() {
    const radialSegments = 192;
    const bevelSegments = 10;
    const inner = 1.10, outer = 1.34, halfWidth = 0.30, bevel = 0.059;
    const profile = [];
    const corners = [
      [outer - bevel, halfWidth - bevel, 0],
      [inner + bevel, halfWidth - bevel, Math.PI / 2],
      [inner + bevel, -halfWidth + bevel, Math.PI],
      [outer - bevel, -halfWidth + bevel, Math.PI * 1.5],
    ];
    corners.forEach(([r, y, start]) => {
      for (let j = 0; j <= bevelSegments; j++) {
        const a = start + j / bevelSegments * Math.PI / 2;
        profile.push({ r: r + Math.cos(a) * bevel, y: y + Math.sin(a) * bevel, nr: Math.cos(a), ny: Math.sin(a) });
      }
    });
    const positions = [], normals = [], indices = [];
    const count = profile.length;
    for (let i = 0; i <= radialSegments; i++) {
      const angle = i / radialSegments * Math.PI * 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      profile.forEach((p) => {
        positions.push(p.r * c, p.y, p.r * s);
        normals.push(p.nr * c, p.ny, p.nr * s);
      });
    }
    for (let i = 0; i < radialSegments; i++) {
      for (let j = 0; j < count; j++) {
        const a = i * count + j, b = (i + 1) * count + j;
        const c = (i + 1) * count + (j + 1) % count, d = i * count + (j + 1) % count;
        indices.push(a, d, b, b, d, c);
      }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
  }

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
      out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
    return out;
  }

  function modelMatrix(time) {
    const x = 0.99 + Math.sin(time * 0.23) * 0.105;
    const y = Math.sin(time * 0.17) * 0.20;
    const z = -0.37 + Math.sin(time * 0.19) * 0.09;
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    const rx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
    const ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
    const rz = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const result = multiply(rz, multiply(ry, rx));
    result[13] = 0.055 + Math.sin(time * 0.52) * 0.039;
    return result;
  }

  function projectionMatrix(aspect) {
    const f = 1 / Math.tan(0.64 / 2), near = 0.1, far = 20;
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
  }

  function bindAttribute(buffer, location, components) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, components, gl.FLOAT, false, 0, 0);
  }

  function canAnimate() { return active && !contextLost && !userPaused && !reducedMotion.matches && inView && !document.hidden; }

  function updateControls() {
    stage.dataset.motion = canAnimate() ? 'playing' : 'paused';
    if (!toggle) return;
    toggle.hidden = !hasDrawn || reducedMotion.matches;
    toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
    toggle.setAttribute('aria-label', userPaused ? 'Play ring animation' : 'Pause ring animation');
    if (toggleLabel) toggleLabel.textContent = userPaused ? 'Play animation' : 'Pause animation';
  }

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousTimestamp = 0;
    lastDrawTimestamp = 0;
  }

  function fallback() {
    active = false;
    hasDrawn = false;
    stopAnimation();
    stage.dataset.renderer = 'fallback';
    stage.dataset.motion = 'paused';
    canvas.hidden = true;
    if (toggle) toggle.hidden = true;
  }

  function render(time) {
    if (!active || contextLost || !resources) return false;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return false;
    // Browser zoom can report DPR below one even on a phone-sized viewport.
    // A small supersampling floor keeps the polished bevels crisp there.
    const dpr = 1.5;
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const aspect = width / height;
    const r = resources;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(r.shadowProgram);
    bindAttribute(r.quad, r.shadowPosition, 2);
    gl.uniform1f(r.shadowAspect, aspect);
    gl.uniform1f(r.shadowLift, 0.5 + 0.5 * Math.sin(time * 0.52));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(r.shadowPosition);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.useProgram(r.meshProgram);
    bindAttribute(r.positions, r.meshPosition, 3);
    bindAttribute(r.normals, r.meshNormal, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.indices);
    gl.uniformMatrix4fv(r.model, false, modelMatrix(time));
    gl.uniformMatrix4fv(r.projection, false, projectionMatrix(aspect));
    gl.uniform1f(r.time, time);
    gl.drawElements(gl.TRIANGLES, r.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(r.meshPosition);
    gl.disableVertexAttribArray(r.meshNormal);
    if (!hasDrawn) {
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Studio first frame failed.');
      hasDrawn = true;
      canvas.hidden = false;
      stage.dataset.renderer = 'webgl';
      updateControls();
    }
    return true;
  }

  function frame(timestamp) {
    animationFrame = 0;
    if (!canAnimate()) return;
    if (previousTimestamp) studioTime += Math.min((timestamp - previousTimestamp) / 1000, 0.1);
    previousTimestamp = timestamp;
    const elapsed = timestamp - lastDrawTimestamp;
    if (!lastDrawTimestamp || elapsed >= 1000 / 30) {
      try { render(studioTime); }
      catch (_) { fallback(); return; }
      lastDrawTimestamp = timestamp - elapsed % (1000 / 30);
    }
    animationFrame = requestAnimationFrame(frame);
  }

  function refresh() {
    updateControls();
    if (canAnimate()) {
      if (!animationFrame) animationFrame = requestAnimationFrame(frame);
    } else {
      stopAnimation();
      if (active && !document.hidden && inView) {
        try { render(studioTime); } catch (_) { fallback(); }
      }
    }
  }

  function releaseResources() {
    if (!gl || !resources || contextLost) { resources = null; return; }
    ['positions', 'normals', 'indices', 'quad'].forEach((key) => gl.deleteBuffer(resources[key]));
    gl.deleteProgram(resources.meshProgram);
    gl.deleteProgram(resources.shadowProgram);
    resources = null;
  }

  function initialize() {
    try {
      releaseResources();
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl) { fallback(); return; }
      const meshProgram = createProgram(meshVertexShader, meshFragmentShader);
      const shadowProgram = createProgram(shadowVertexShader, shadowFragmentShader);
      const geometry = makeBand();
      resources = {
        meshProgram, shadowProgram,
        positions: createBuffer(gl.ARRAY_BUFFER, geometry.positions),
        normals: createBuffer(gl.ARRAY_BUFFER, geometry.normals),
        indices: createBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indices),
        quad: createBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])),
        indexCount: geometry.indices.length,
        meshPosition: gl.getAttribLocation(meshProgram, 'aPosition'),
        meshNormal: gl.getAttribLocation(meshProgram, 'aNormal'),
        shadowPosition: gl.getAttribLocation(shadowProgram, 'aPosition'),
        model: gl.getUniformLocation(meshProgram, 'uModel'),
        projection: gl.getUniformLocation(meshProgram, 'uProjection'),
        time: gl.getUniformLocation(meshProgram, 'uTime'),
        shadowAspect: gl.getUniformLocation(shadowProgram, 'uAspect'),
        shadowLift: gl.getUniformLocation(shadowProgram, 'uLift'),
      };
      if ([resources.meshPosition, resources.meshNormal, resources.shadowPosition].some((location) => location < 0)) throw new Error('Studio attributes unavailable.');
      active = true;
      contextLost = false;
      hasDrawn = false;
      render(studioTime);
      refresh();
    } catch (_) { fallback(); }
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    resources = null;
    fallback();
  });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; initialize(); });
  if (toggle) toggle.addEventListener('click', () => { if (!reducedMotion.matches) { userPaused = !userPaused; refresh(); } });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', stopAnimation);
  window.addEventListener('pageshow', refresh);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', refresh);
  else if (reducedMotion.addListener) reducedMotion.addListener(refresh);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      refresh();
    }, { threshold: 0.01, rootMargin: '40px' });
    observer.observe(stage);
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      if (active && !document.hidden && inView) { try { render(studioTime); } catch (_) { fallback(); } }
    });
    observer.observe(stage);
  } else window.addEventListener('resize', () => { if (active && !document.hidden && inView) { try { render(studioTime); } catch (_) { fallback(); } } });

  initialize();
})();
