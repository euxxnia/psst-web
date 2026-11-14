// Background engine (from pageturn/bg-system.html): colour fields fitted to the four brand backgrounds,
// recoloured by a mix ratio, with reeded-glass and grain textures. Needs bg-system-data.js first.
(() => {
'use strict';
const DATA = window.BG_DATA;
const W = 1179, H = 2556, MAXP = 20;

// bar order follows the reference sheets: blue, green, yellow, coral (top to bottom)
const FAM = [
  { key: 'blue', name: 'Dejavu Blue', ko: '데자뷰, 시간과 기억', hex: '#AEC7E8' },
  { key: 'green', name: 'Quirk Green', ko: '일상, 사소, 엉뚱', hex: '#E3ECBF' },
  { key: 'yellow', name: 'Warm Yellow', ko: '감성', hex: '#F9E3B8' },
  { key: 'coral', name: 'Nudge Coral', ko: '경고', hex: '#EEC0AF' },
];
const COMPS = [['blue', '01'], ['warm', '02'], ['coral', '03'], ['green', '04']];

const PRESETS = [
  { name: 'Dejavu Blue', ko: '데자뷰, 시간과 기억', comp: 'blue', ratio: [202, 45, 45, 45], air: 1, soft: .5, glass: null, grain: null },
  { name: 'Warm Yellow', ko: '감성', comp: 'warm', ratio: [60, 55, 188, 33], air: 1, soft: .5, glass: null, grain: { amount: .012, size: 1.2, chroma: .2 } },
  { name: 'Nudge Coral', ko: '경고', comp: 'coral', ratio: [42, 48, 87, 160], air: 1, soft: .5, glass: DATA.coralGlass, grain: null },
  { name: 'Quirk Green', ko: '일상, 사소, 엉뚱', comp: 'green', ratio: [65, 157, 78, 37], air: 1, soft: .5, glass: null, grain: DATA.greenGrain },
];
const DEFAULT_GLASS = { ribs: 18.26, phase: .68, bend: .6, edge: .5, disp: 0 };
const DEFAULT_GRAIN = { amount: .03, size: 1.2, chroma: .15 };

// ---------- colour ----------
const lin = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
function hexLab(h) {
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s];
}
// each fitted point belongs to the brand colour nearest in hue; pale, colourless points are light/air
const FAM_HUE = FAM.map(f => { const L = hexLab(f.hex); return Math.atan2(L[2], L[1]); });
function family(lab) {
  const C = Math.hypot(lab[1], lab[2]);
  if (C < .022 && lab[0] > .9) return 4;
  const hue = Math.atan2(lab[2], lab[1]);
  let best = 0, bd = 9;
  FAM_HUE.forEach((h, i) => { const d = Math.abs(Math.atan2(Math.sin(hue - h), Math.cos(hue - h))); if (d < bd) { bd = d; best = i; } });
  return best;
}
for (const c of Object.values(DATA.comps)) for (const p of c.points) p.fam = family(p.lab);

// ---------- WebGL ----------
const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uAsp, uPow;
uniform vec4 uPt[${MAXP}]; uniform float uAng[${MAXP}]; uniform vec3 uLab[${MAXP}]; uniform int uN;
uniform float uGlass, uRibs, uPhase, uBend, uEdge, uDisp;
uniform float uGrain, uGrainSize, uGrainChroma, uSeed, uPxScale;
out vec4 o;
vec3 fromLab(vec3 L){
  float l = L.x + .3963377774 * L.y + .2158037573 * L.z;
  float m = L.x - .1055613458 * L.y - .0638541728 * L.z;
  float s = L.x - .0894841775 * L.y - 1.2914855480 * L.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 c = vec3(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s);
  c = max(c, 0.);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
}
// elliptical inverse-distance field in Oklab — the same model the references were fitted with
vec3 field(vec2 uv){
  vec2 X = vec2(uv.x * uAsp, uv.y);
  vec3 acc = vec3(0.); float ws = 0.;
  float lmax = -1e9;
  float lw[${MAXP}];
  for (int i = 0; i < ${MAXP}; i++) {
    if (i >= uN) break;
    vec4 P = uPt[i];
    vec2 d = X - vec2(P.x * uAsp, P.y);
    float c = cos(uAng[i]), s = sin(uAng[i]);
    vec2 q = vec2((d.x * c + d.y * s) / P.w, -d.x * s + d.y * c);
    lw[i] = uPow * (log(P.z) - log(length(q) + 1e-3));
    lmax = max(lmax, lw[i]);
  }
  for (int i = 0; i < ${MAXP}; i++) {
    if (i >= uN) break;
    float w = exp(lw[i] - lmax);
    acc += uLab[i] * w; ws += w;
  }
  return acc / ws;
}
uniform float uSoftEdge;
vec3 rib(float ri, float t, float k, float y){
  float ctr = (ri + .5 + uPhase) / uRibs;
  if (uDisp <= 0.) return fromLab(field(vec2(ctr - t * k, y)));
  return vec3(fromLab(field(vec2(ctr - t * k * (1. + .12 * uDisp), y))).r,
              fromLab(field(vec2(ctr - t * k, y))).g,
              fromLab(field(vec2(ctr - t * k * (1. - .12 * uDisp), y))).b);
}
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423) + uSeed); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 pix = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = pix / uRes;
  vec3 lab;
  float shade = 1.;
  vec3 glassC = vec3(0.);
  if (uGlass > .5) {
    // reeded glass: every rib shows a stretched, mirrored slice of the field behind it
    float x = uv.x * uRibs - uPhase;
    float t = fract(x) - .5, ri = floor(x);
    float k = uBend / uRibs;
    glassC = rib(ri, t, k, uv.y);
    // the seam between ribs is a soft ~3px roll, not a hard cut (as on the coral sheet)
    float sw = uSoftEdge * uRibs / uRes.x * 1.7;
    if (t > .5 - sw) glassC = mix(glassC, rib(ri + 1., -.5, k, uv.y), smoothstep(.5 - sw, .5 + sw, t) );
    if (t < -.5 + sw) glassC = mix(rib(ri - 1., .5, k, uv.y), glassC, smoothstep(-.5 - sw, -.5 + sw, t));
    // a thin catch-light just before the seam and a shallow dip just after it
    shade = 1. + uEdge * (.012 * exp(-pow((t - .44) / .04, 2.)) - .02 * exp(-pow((t + .4) / .06, 2.)));
  } else lab = field(uv);
  vec3 c = uGlass > .5 ? glassC : fromLab(lab);
  c *= shade;
  if (uGrain > 0.) {
    vec2 g = floor(pix / (uGrainSize * uPxScale));
    float n = (hash(g) + hash(g + 17.3) - 1.);
    vec3 nc = vec3(hash(g + 3.1), hash(g + 7.7), hash(g + 11.9)) - .5;
    c += uGrain * mix(vec3(n), nc * 1.6, uGrainChroma);
  }
  o = vec4(c, 1.);
}`;

const glc = document.createElement('canvas');
const gl = glc.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
const prog = gl.createProgram();
for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
  const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  gl.attachShader(prog, s);
}
gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog); gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const U = {};
for (const n of ['uRes', 'uAsp', 'uPow', 'uPt', 'uAng', 'uLab', 'uN', 'uGlass', 'uRibs', 'uPhase', 'uBend', 'uEdge', 'uDisp', 'uGrain', 'uGrainSize', 'uGrainChroma', 'uSeed', 'uPxScale', 'uSoftEdge'])
  U[n] = gl.getUniformLocation(prog, n);

// Ratio never resizes the points (that breaks the soft shapes into spots). Instead the recipe moves colour:
// a colour that should cover more takes over the nearest points of colours that should cover less, keeping each
// point's own tone (lighter/deeper, more/less saturated). The original recipe changes nothing, so it reproduces.
const toLCh = L => [L[0], Math.hypot(L[1], L[2]), Math.atan2(L[2], L[1])];
const fromLCh = ([l, c, h]) => [l, c * Math.cos(h), c * Math.sin(h)];
const FAM_LCH = FAM.map(f => toLCh(hexLab(f.hex)));
function retone(lab, from, to) {
  if (from === to) return lab;
  const c = toLCh(lab), A = FAM_LCH[from], B = FAM_LCH[to];
  return fromLCh([B[0] + (c[0] - A[0]), B[1] * c[1] / Math.max(A[1], 1e-3), B[2] + Math.atan2(Math.sin(c[2] - A[2]), Math.cos(c[2] - A[2]))]);
}
function pointColours(comp, ratio, base) {
  const pts = comp.points, n = pts.length, asp = comp.aspect;
  const area = pts.map(p => p.fam === 4 ? 0 : p.r * p.r * p.stretch);
  const A = area.reduce((x, y) => x + y, 0) || 1;
  const O = [0, 0, 0, 0]; pts.forEach((p, i) => { if (p.fam < 4) O[p.fam] += area[i] / A; });
  const sum = v => v.reduce((x, y) => x + y, 0);
  const T = ratio.map(v => v / (sum(ratio) || 1)), D = base.map(v => v / sum(base));
  let C = O.map((o, f) => Math.max(0, o + T[f] - D[f])); const cs = sum(C) || 1; C = C.map(v => v / cs);
  const mix = pts.map(p => { const m = [0, 0, 0, 0]; if (p.fam < 4) m[p.fam] = 1; return m; });
  const have = O.slice();
  for (let guard = 0; guard < 200; guard++) {
    // the colour furthest below its target takes from the colour furthest above
    let r = -1, rd = 1e-4, d = -1, dd = 1e-4;
    for (let f = 0; f < 4; f++) { if (C[f] - have[f] > rd) { rd = C[f] - have[f]; r = f; } if (have[f] - C[f] > dd) { dd = have[f] - C[f]; d = f; } }
    if (r < 0 || d < 0) break;
    // donor point nearest to where the receiving colour already is (or the smallest one, if it is nowhere yet)
    const rPts = pts.filter((p, i) => mix[i][r] > .5);
    let best = -1, bs = 1e9;
    pts.forEach((p, i) => {
      if (mix[i][d] <= 1e-6 || !area[i]) return;
      const score = rPts.length ? Math.min(...rPts.map(q => Math.hypot((p.x - q.x) * asp, p.y - q.y))) : area[i];
      if (score < bs) { bs = score; best = i; }
    });
    if (best < 0) break;
    const ai = area[best] / A, g = Math.min(mix[best][d], rd / ai, dd / ai);
    mix[best][d] -= g; mix[best][r] += g; have[d] -= g * ai; have[r] += g * ai;
  }
  return pts.map((p, i) => {
    if (p.fam === 4) return p.lab;
    const out = [0, 0, 0];
    mix[i].forEach((m, f) => { if (m > 1e-6) { const c = retone(p.lab, p.fam, f); out[0] += c[0] * m; out[1] += c[1] * m; out[2] += c[2] * m; } });
    return out;
  });
}
function render(st, w, h) {
  if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
  gl.viewport(0, 0, w, h);
  const comp = DATA.comps[st.comp], base = PRESETS.find(p => p.comp === st.comp).ratio;
  const cols = pointColours(comp, st.ratio, base);
  const pw = comp.power * (1.6 - 1.2 * st.soft) / (1.6 - 1.2 * .5);
  const pts = comp.points.slice(0, MAXP);
  const P = new Float32Array(MAXP * 4), A = new Float32Array(MAXP), L = new Float32Array(MAXP * 3);
  pts.forEach((p, i) => {
    const k = p.fam === 4 ? Math.pow(Math.max(st.air, .01), .5) : 1;
    P.set([p.x, p.y, p.r * k, p.stretch], i * 4); A[i] = p.angle; L.set(cols[i], i * 3);
  });
  gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uAsp, comp.aspect); gl.uniform1f(U.uPow, pw);
  gl.uniform4fv(U.uPt, P); gl.uniform1fv(U.uAng, A); gl.uniform3fv(U.uLab, L); gl.uniform1i(U.uN, pts.length);
  const g = st.glass;
  gl.uniform1f(U.uGlass, g ? 1 : 0);
  if (g) { gl.uniform1f(U.uRibs, g.ribs); gl.uniform1f(U.uPhase, g.phase); gl.uniform1f(U.uBend, g.bend); gl.uniform1f(U.uEdge, g.edge); gl.uniform1f(U.uDisp, g.disp); gl.uniform1f(U.uSoftEdge, Math.max(1, w / 650)); }
  const n = st.grain;
  gl.uniform1f(U.uGrain, n ? n.amount : 0);
  if (n) { gl.uniform1f(U.uGrainSize, n.size); gl.uniform1f(U.uGrainChroma, n.chroma); }
  gl.uniform1f(U.uSeed, .37); gl.uniform1f(U.uPxScale, Math.max(1, w / 650)); // grain sizes are in reference-sheet pixels
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return glc;
}
const clone = o => JSON.parse(JSON.stringify(o));
function stateFrom(p) { return { name: p.name, comp: p.comp, ratio: [...p.ratio], air: p.air, soft: p.soft, glass: p.glass ? clone(p.glass) : null, grain: p.grain ? clone(p.grain) : null }; }
window.BgEngine = { render, PRESETS, FAM, COMPS, DEFAULT_GLASS, DEFAULT_GRAIN, stateFrom, W, H };
})();
