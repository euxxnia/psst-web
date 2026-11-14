// Ribbon3D: a paper strip folded along any number of creases, drawn with WebGL.
// Paper space: u runs along the strip (0..L), v across it (-h/2..h/2, +v = screen down when flat).
// Each fold wraps the paper past its crease around a cylinder of radius r by th degrees
// (+ toward the viewer / over the front, - away / behind). 180° lays it flat again on the other side,
// 360° makes a full loop. side 'start' folds the paper before the crease instead of after it.
// Text is printed on the paper, so it bends and folds with it.
(() => {
'use strict';
const D = Math.PI / 180;

function prepFolds(rb) {
  const end = [], start = [];
  for (const f of rb.folds || []) {
    const side = f.side === 'start' ? -1 : 1;
    const a = (f.a || 0) * D, th = Math.abs(f.th) * D, sg = Math.sign(f.th) || 1, R = Math.max(f.r || 0, 1e-3);
    const n = [side * Math.cos(a), side * Math.sin(a)];
    const t = [-Math.sin(a), Math.cos(a)];
    const ct = Math.cos(th), st = Math.sin(th);
    const n2 = [n[0] * ct, n[1] * ct, sg * st];
    const z2 = [-sg * st * n[0], -sg * st * n[1], ct];
    const delta = [n[0] * R * st - th * R * n2[0], n[1] * R * st - th * R * n2[1], sg * R * (1 - ct) - th * R * n2[2]];
    (side > 0 ? end : start).push({ u: f.u, n, t, th, sg, R, n2, z2, delta });
  }
  end.sort((p, q) => p.u - q.u);
  start.sort((p, q) => q.u - p.u);
  return [end, start];
}

function applyM(f, p) {
  const qx = p[0] - f.u, qy = p[1], qz = p[2];
  const dn = qx * f.n[0] + qy * f.n[1], dt = qx * f.t[0] + qy * f.t[1];
  return [
    f.u + dn * f.n2[0] + dt * f.t[0] + qz * f.z2[0] + f.delta[0],
    dn * f.n2[1] + dt * f.t[1] + qz * f.z2[1] + f.delta[1],
    dn * f.n2[2] + qz * f.z2[2] + f.delta[2],
  ];
}

function chainEval(chain, u, v) {
  let k = 0;
  for (; k < chain.length; k++) {
    const f = chain[k];
    if ((u - f.u) * f.n[0] + v * f.n[1] <= 0) break;
  }
  if (k === 0) return null;
  const f = chain[k - 1];
  const qx = u - f.u, d = qx * f.n[0] + v * f.n[1];
  let p, m;
  if (d < f.th * f.R) {
    const al = qx * f.t[0] + v * f.t[1], ph = d / f.R;
    p = [f.u + f.t[0] * al + f.n[0] * f.R * Math.sin(ph), f.t[1] * al + f.n[1] * f.R * Math.sin(ph), f.sg * f.R * (1 - Math.cos(ph))];
    m = k - 2;
  } else { p = [u, v, 0]; m = k - 1; }
  for (let i = m; i >= 0; i--) p = applyM(chain[i], p);
  return p;
}

function makeFold(rb) {
  const [end, start] = prepFolds(rb);
  return (u, v) => chainEval(end, u, v) || chainEval(start, u, v) || [u, v, 0];
}

function placement(rb) {
  const rz = (rb.rot || 0) * D, px = (rb.pitch || 0) * D, py = (rb.yaw || 0) * D;
  const Rz = [[Math.cos(rz), -Math.sin(rz), 0], [Math.sin(rz), Math.cos(rz), 0], [0, 0, 1]];
  const Rx = [[1, 0, 0], [0, Math.cos(px), -Math.sin(px)], [0, Math.sin(px), Math.cos(px)]];
  const Ry = [[Math.cos(py), 0, Math.sin(py)], [0, 1, 0], [-Math.sin(py), 0, Math.cos(py)]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mul(Ry, mul(Rx, Rz));
}
const mv = (M, p) => [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]];

function cutEnds(rb) { return [Math.tan((rb.cut?.[0] || 0) * D), Math.tan((rb.cut?.[1] || 0) * D)]; }

function buildMesh(rb) {
  const L = rb.L, h = rb.h, F = makeFold(rb), M = placement(rb);
  const [t0, t1] = cutEnds(rb);
  const cols = Math.min(2400, Math.max(80, Math.ceil(L / (rb.res || 2.5)))), rows = rb.rows || 40;
  const A = F(rb.anchor || 0, 0), P = [rb.x || 0, rb.y || 0, rb.z || 0];
  const nv = (cols + 1) * (rows + 1);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), pap = new Float32Array(nv * 2);
  const e = .5;
  let o = 0;
  for (let r = 0; r <= rows; r++) {
    const v = -h / 2 + h * r / rows, u0 = v * t0, u1 = L + v * t1;
    for (let c = 0; c <= cols; c++, o++) {
      const u = u0 + (u1 - u0) * c / cols;
      const p = F(u, v);
      const du = F(u + e, v), du2 = F(u - e, v), dv = F(u, v + e), dv2 = F(u, v - e);
      const a = [du[0] - du2[0], du[1] - du2[1], du[2] - du2[2]], b = [dv[0] - dv2[0], dv[1] - dv2[1], dv[2] - dv2[2]];
      let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const w = mv(M, [p[0] - A[0], p[1] - A[1], p[2] - A[2]]);
      n = mv(M, n);
      const nl = Math.hypot(...n) || 1;
      pos.set([P[0] + w[0], P[1] + w[1], P[2] + w[2]], o * 3);
      nrm.set([n[0] / nl, n[1] / nl, n[2] / nl], o * 3);
      pap.set([u, v], o * 2);
    }
  }
  const idx = new Uint32Array(cols * rows * 6);
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * (cols + 1) + c, j = i + cols + 1;
    idx.set([i, i + 1, j, i + 1, j + 1, j], k); k += 6;
  }
  return { pos, nrm, pap, idx };
}

// world positions of a few paper points, e.g. to place labels next to a fold
function locate(rb, pts) {
  const F = makeFold(rb), M = placement(rb), A = F(rb.anchor || 0, 0), P = [rb.x || 0, rb.y || 0, rb.z || 0];
  return pts.map(([u, v]) => { const p = F(u, v), w = mv(M, [p[0] - A[0], p[1] - A[1], p[2] - A[2]]); return [P[0] + w[0], P[1] + w[1], P[2] + w[2]]; });
}

const VS = `#version 300 es
in vec3 aPos; in vec3 aN; in vec2 aP;
uniform vec2 uRes, uOrigin, uCam; uniform float uScale, uF;
out vec3 vN; out vec2 vP; out vec3 vW;
void main(){
  vN = aN; vP = aP; vW = aPos;
  float w = (uF - aPos.z) / uF;
  vec2 proj = uCam + (aPos.xy - uCam) / w;
  vec2 cv = (proj - uOrigin) * uScale;
  vec2 ndc = vec2(cv.x / uRes.x * 2. - 1., 1. - cv.y / uRes.y * 2.);
  gl_Position = vec4(ndc * w, -aPos.z / 6000. * w, w);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec2 vP; in vec3 vW;
uniform vec3 uFront, uBack, uLine, uLineB, uLight, uRest;
uniform vec2 uCam; uniform float uF, uL, uHalf, uLineW, uLoF, uLoB, uHasF, uHasB, uOpacityB;
uniform vec4 uCut;
uniform sampler2D uTexF, uTexB;
uniform float uGraphic, uGapW; uniform vec3 uFill, uGap;
out vec4 o;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(vec3(uCam, uF) - vW);
  float nv = dot(N, V);
  bool front = nv > 0.;
  vec3 Nf = front ? N : -N;
  // light and facing are measured against the ribbon's own resting plane, so a tilted strip stays white
  // where it lies flat and only darkens where it rolls
  float s = clamp(dot(Nf, uLight) / max(dot(uRest, uLight), .2), 0., 1.);
  float k = mix(clamp(dot(Nf, uRest), 0., 1.), s, .55);
  float lo = front ? uLoF : uLoB;
  vec3 c = (front ? uFront : uBack) * mix(lo, 1., smoothstep(0., 1., k));
  vec2 tuv = vec2(vP.x / uL, (vP.y + uHalf) / (2. * uHalf));
  if (front && uHasF > 0.) { vec4 t = texture(uTexF, tuv); c = mix(c, t.rgb, t.a); }
  if (!front && uHasB > 0.) { vec4 t = texture(uTexB, tuv); c = mix(c, t.rgb, t.a); }
  float dv = uHalf - abs(vP.y);
  float d0 = (vP.x - vP.y * uCut.x) * uCut.z;
  float d1 = (uL + vP.y * uCut.y - vP.x) * uCut.w;
  float e = min(min(dv / max(fwidth(dv), 1e-4), d0 / max(fwidth(d0), 1e-4)), d1 / max(fwidth(d1), 1e-4));
  float ln = 1. - smoothstep(uLineW - .7, uLineW + .7, e);
  c = mix(c, front ? uLine : uLineB, ln);
  if (uGraphic > .5) {
    // graphic mark: one flat fill; paper edges and the fold's turning line are cut out as gaps,
    // so overlapping layers read as separate bands (like the drawn logo)
    float eg = 1. - smoothstep(uGapW - .7, uGapW + .7, e);
    float es = abs(nv) / max(fwidth(nv), 1e-5);
    float sg = 1. - smoothstep(uGapW * .5 - .7, uGapW * .5 + .7, es);
    c = mix(uFill, uGap, max(eg, sg));
  }
  o = vec4(c, 1.);
}`;

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

class Renderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    const p = this.prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aN'); gl.bindAttribLocation(p, 2, 'aP');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.U = {};
    for (const n of ['uRes', 'uOrigin', 'uCam', 'uScale', 'uF', 'uFront', 'uBack', 'uLine', 'uLineB', 'uLight', 'uRest', 'uL', 'uHalf', 'uLineW', 'uLoF', 'uLoB', 'uHasF', 'uHasB', 'uCut', 'uTexF', 'uTexB', 'uGraphic', 'uGapW', 'uFill', 'uGap'])
      this.U[n] = gl.getUniformLocation(p, n);
    this.meshes = new Map(); this.texes = new Map();
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.blank = this.texFromCanvas(Object.assign(document.createElement('canvas'), { width: 2, height: 2 }));
  }
  texFromCanvas(cv) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }
  mesh(rb) {
    const key = JSON.stringify([rb.L, rb.h, rb.folds, rb.cut, rb.x, rb.y, rb.z, rb.rot, rb.pitch, rb.yaw, rb.anchor, rb.res, rb.rows]);
    let m = this.meshes.get(key);
    if (m) return m;
    const gl = this.gl, g = buildMesh(rb);
    m = { vao: gl.createVertexArray(), n: g.idx.length };
    gl.bindVertexArray(m.vao);
    [[g.pos, 3], [g.nrm, 3], [g.pap, 2]].forEach(([arr, size], i) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, size, gl.FLOAT, false, 0, 0);
    });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    if (this.meshes.size > 120) { const [k0, m0] = this.meshes.entries().next().value; this.meshes.delete(k0); gl.deleteVertexArray(m0.vao); }
    this.meshes.set(key, m);
    return m;
  }
  text(rb, face) {
    const items = (rb.text || []).filter(t => (t.face || 'front') === face);
    if (!items.length) return null;
    const key = JSON.stringify([rb.L, rb.h, items]);
    let t = this.texes.get(key);
    if (t) return t;
    const k = Math.min(3, 12000 / rb.L, 1200 / rb.h);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(rb.L * k); cv.height = Math.ceil(rb.h * k);
    const ctx = cv.getContext('2d');
    if (face === 'back') { ctx.translate(0, cv.height); ctx.scale(1, -1); }
    for (const it of items) {
      ctx.font = `${it.weight || 600} ${it.size * k}px ${it.font || 'Pretendard, "Apple SD Gothic Neo", sans-serif'}`;
      ctx.letterSpacing = `${(it.ls || 0) * k}px`;
      ctx.fillStyle = it.color || '#222';
      ctx.textAlign = it.align === 'center' ? 'center' : it.align === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      const m = ctx.measureText('가Hg');
      const cy = (rb.h / 2 + (it.dv || 0)) * k + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 * .92;
      ctx.fillText(it.str, it.u * k, cy);
    }
    t = this.texFromCanvas(cv);
    if (this.texes.size > 80) { const [k0, t0] = this.texes.entries().next().value; this.texes.delete(k0); this.gl.deleteTexture(t0); }
    this.texes.set(key, t);
    return t;
  }
  // scene: { width, height (canvas px), origin [x,y] world at canvas top-left, scale (canvas px per world px), cam [x,y], f, ribbons }
  render(scene) {
    const gl = this.gl, cv = this.canvas, U = this.U;
    if (cv.width !== scene.width || cv.height !== scene.height) { cv.width = scene.width; cv.height = scene.height; }
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.useProgram(this.prog);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform2f(U.uOrigin, ...(scene.origin || [0, 0]));
    gl.uniform2f(U.uCam, ...(scene.cam || [0, 0]));
    gl.uniform1f(U.uScale, scene.scale || 1);
    gl.uniform1f(U.uF, scene.f || 3200);
    const Ld = scene.light || [-.32, -.5, .8], ll = Math.hypot(...Ld), L0 = Ld.map(v => v / ll);
    gl.uniform1i(U.uTexF, 0); gl.uniform1i(U.uTexB, 1);
    for (const rb of scene.ribbons) {
      const m = this.mesh(rb), tf = this.text(rb, 'front'), tb = this.text(rb, 'back');
      const [t0, t1] = cutEnds(rb);
      gl.uniform3fv(U.uFront, hex(rb.front || '#ffffff'));
      gl.uniform3fv(U.uBack, hex(rb.back || '#dfe7f6'));
      gl.uniform3fv(U.uLine, hex(rb.line || '#6f8fd8'));
      gl.uniform3fv(U.uLineB, hex(rb.lineB || rb.line || '#6f8fd8'));
      const Mp = placement(rb);
      gl.uniform3fv(U.uLight, mv(Mp, L0)); gl.uniform3fv(U.uRest, mv(Mp, [0, 0, 1]));
      gl.uniform1f(U.uL, rb.L); gl.uniform1f(U.uHalf, rb.h / 2);
      gl.uniform1f(U.uLineW, (rb.lineW ?? 2.5) * (scene.scale || 1));
      gl.uniform1f(U.uLoF, rb.loF ?? .74); gl.uniform1f(U.uLoB, rb.loB ?? .8);
      gl.uniform4f(U.uCut, t0, t1, 1 / Math.hypot(1, t0), 1 / Math.hypot(1, t1));
      gl.uniform1f(U.uHasF, tf ? 1 : 0); gl.uniform1f(U.uHasB, tb ? 1 : 0);
      gl.uniform1f(U.uGraphic, rb.graphic ? 1 : 0);
      if (rb.graphic) { gl.uniform3fv(U.uFill, hex(rb.fill || '#b4c7e7')); gl.uniform3fv(U.uGap, hex(rb.gap || '#ffffff')); gl.uniform1f(U.uGapW, (rb.gapW ?? 3) * (scene.scale || 1)); }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tf || this.blank);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb || this.blank);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    return cv;
  }
}

window.Ribbon3D = { Renderer, buildMesh, locate, makeFold };
})();
