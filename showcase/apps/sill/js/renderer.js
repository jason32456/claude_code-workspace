// One WebGL context renders the world for every view. Pass 1 splats particles
// as Gaussian point sprites into a density texture; pass 2 is a full-screen
// shader evaluated in *screen* coordinates (cave, rock, water, heat), so two
// views that overlap on the monitor draw identical pixels in the overlap. The
// result is blitted into each view's own 2D canvas.

const MAX_ROCKS = 32;
const MAX_HEAT = 4;
const MAX_SPRINGS = 4;
const DENS_SCALE = 0.5;
const SPLAT_R = 15; // screen px
const MAX_PIXELS = 1.5e6;

const SPLAT_VS = `
attribute vec2 a_pos;
attribute vec2 a_attr;
uniform vec2 u_origin;
uniform vec2 u_size;
uniform float u_point;
varying vec2 v_attr;
void main() {
  vec2 p = (a_pos - u_origin) / u_size;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  gl_PointSize = u_point;
  v_attr = a_attr;
}`;

const SPLAT_FS = `
precision mediump float;
varying vec2 v_attr;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 3.0) - 0.05;
  gl_FragColor = vec4(a * 0.27, a * v_attr.x * 0.5, a * v_attr.y * 0.4, 0.0);
}`;

const COMP_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const COMP_FS = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_origin;
uniform vec2 u_size;
uniform vec4 u_screen;
uniform sampler2D u_dens;
uniform vec2 u_densUV;
uniform vec2 u_texel;
uniform float u_time;
uniform vec4 u_rockA[${MAX_ROCKS}];
uniform float u_rockR[${MAX_ROCKS}];
uniform int u_nRocks;
uniform vec4 u_heat[${MAX_HEAT}];
uniform int u_nHeat;
uniform vec4 u_spring[${MAX_SPRINGS}];
uniform int u_nSpring;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

// Signed distance to the nearest rock capsule, and the outward normal there.
float rocks(vec2 p, out vec2 nrm) {
  float best = 1e5;
  nrm = vec2(0.0, -1.0);
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (i >= u_nRocks) break;
    vec4 c = u_rockA[i];
    vec2 a = c.xy, b = c.zw;
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    vec2 d = p - (a + ab * t);
    float L = length(d);
    // Lumpy silhouettes: the radius wanders a little along the rock.
    float r = u_rockR[i] * (0.92 + 0.16 * noise(p * 0.045 + float(i) * 7.0));
    float sd = L - r;
    if (sd < best) { best = sd; nrm = L > 1e-3 ? d / L : vec2(0.0, -1.0); }
  }
  return best;
}

vec3 cave(vec2 p) {
  float ty = clamp((p.y - u_screen.y) / u_screen.w, 0.0, 1.0);
  vec3 top = vec3(0.05, 0.08, 0.13);
  vec3 bot = vec3(0.02, 0.03, 0.055);
  vec3 col = mix(top, bot, ty);
  float n = fbm(p * 0.0028);
  float m = fbm(p * 0.009 + 3.0);
  col *= 0.55 + 0.95 * n;
  // Seams of pale mineral and patches of moss: fixed landmarks, so a moving
  // window visibly slides over a world that stays put.
  float seam = abs(fbm(p * 0.006 + 11.0) - 0.5);
  col += vec3(0.06, 0.07, 0.085) * smoothstep(0.035, 0.0, seam);
  col += vec3(0.02, 0.06, 0.05) * smoothstep(0.58, 0.82, m);
  float band = sin((p.y + 70.0 * n) * 0.04);
  col += vec3(0.014, 0.018, 0.026) * smoothstep(0.8, 1.0, band);
  // Spores: a sparse lattice of tiny glowing points that breathe.
  vec2 cell = floor(p / 40.0);
  float h = hash(cell);
  if (h > 0.84) {
    vec2 c = (cell + 0.25 + 0.5 * vec2(hash(cell + 3.1), hash(cell + 7.7))) * 40.0;
    float d = length(p - c);
    float tw = 0.55 + 0.45 * sin(u_time * (0.6 + h) + h * 40.0);
    vec3 tint = h > 0.95 ? vec3(0.9, 0.7, 0.35) : vec3(0.3, 0.85, 0.7);
    col += tint * tw * exp(-d * d / 3.5) * (h - 0.84) * 5.0;
    col += tint * 0.22 * tw * exp(-d * d / 180.0) * (h - 0.84) * 4.0;
  }
  return col;
}

// One-octave stand-in for cave(), for the refracted view through water.
vec3 caveLite(vec2 p) {
  float ty = clamp((p.y - u_screen.y) / u_screen.w, 0.0, 1.0);
  vec3 col = mix(vec3(0.05, 0.08, 0.13), vec3(0.02, 0.03, 0.055), ty);
  return col * (0.55 + 0.95 * noise(p * 0.0056));
}

void main() {
  vec2 p = u_origin + vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec3 col = cave(p);

  vec2 nrm;
  float sd = rocks(p, nrm);
  // Ambient occlusion: cave darkens near rock.
  col *= mix(0.45, 1.0, smoothstep(0.0, 34.0, sd));

  for (int i = 0; i < ${MAX_SPRINGS}; i++) {
    if (i >= u_nSpring) break;
    vec4 s = u_spring[i];
    float d = length(p - s.xy);
    float on = s.z;
    float pulse = 0.75 + 0.25 * sin(u_time * 3.0 + float(i));
    col += vec3(0.1, 0.45, 0.6) * exp(-d / 42.0) * (0.25 + 0.75 * on) * pulse;
  }

  if (sd < 1.0) {
    float g = fbm(p * 0.035);
    float strata = 0.5 + 0.5 * sin(p.y * 0.12 + g * 6.0);
    vec3 rock = mix(vec3(0.085, 0.09, 0.11), vec3(0.15, 0.15, 0.17), g);
    rock *= 0.85 + 0.2 * strata;
    rock += vec3(0.05, 0.06, 0.05) * smoothstep(0.62, 0.8, fbm(p * 0.09 + 5.0));
    float rim = smoothstep(-7.0, 0.0, sd) * max(0.0, -nrm.y);
    rock += vec3(0.17, 0.2, 0.24) * rim;
    rock *= mix(0.55, 1.0, smoothstep(-26.0, -2.0, sd));
    col = mix(col, rock, smoothstep(1.0, -0.5, sd));
  }

  vec2 duv = v_uv * u_densUV;
  vec4 D = texture2D(u_dens, duv);
  float dens = D.r;
  if (dens > 0.05) {
    float dx = texture2D(u_dens, duv + vec2(u_texel.x, 0.0)).r - texture2D(u_dens, duv - vec2(u_texel.x, 0.0)).r;
    float dy = texture2D(u_dens, duv + vec2(0.0, u_texel.y)).r - texture2D(u_dens, duv - vec2(0.0, u_texel.y)).r;
    vec2 grad = vec2(dx, -dy);
    float th = 0.2;
    float mask = smoothstep(th - 0.03, th + 0.03, dens);
    float depth = smoothstep(th, 0.9, dens);
    vec3 deep = vec3(0.02, 0.2, 0.33);
    vec3 shallow = vec3(0.12, 0.6, 0.78);
    vec3 water = mix(shallow, deep, depth);
    vec3 refr = caveLite(p + grad * 70.0);
    water += refr * 0.9;
    // Rim light where the density crosses the threshold: the meniscus.
    float rim = 1.0 - smoothstep(th, th + 0.22, dens);
    water += vec3(0.45, 0.85, 1.0) * rim * 0.75;
    // Light from above catches surfaces that face up.
    water += vec3(0.25, 0.45, 0.55) * clamp(-grad.y * 6.0, 0.0, 1.0) * 0.6;
    float foam = clamp(D.g / max(dens, 1e-3) * 1.6 - 0.35, 0.0, 1.0);
    water = mix(water, vec3(0.85, 0.96, 1.0), foam * 0.55);
    float falling = clamp(D.b / max(dens, 1e-3) * 2.5, 0.0, 1.0);
    float alpha = mask * mix(0.92, 0.7, falling);
    col = mix(col, water, alpha);
    // Thin water halo outside the surface, so drops read even when sparse.
    col += vec3(0.05, 0.2, 0.28) * smoothstep(0.06, th, dens) * (1.0 - mask);
  }

  for (int i = 0; i < ${MAX_HEAT}; i++) {
    if (i >= u_nHeat) break;
    vec4 h = u_heat[i];
    float d = length(p - h.xy) / h.z;
    if (d < 1.4) {
      float shimmer = noise(p * 0.03 + vec2(0.0, u_time * 1.5));
      float core = smoothstep(1.0, 0.0, d);
      col += vec3(0.5, 0.17, 0.03) * core * core * (0.55 + 0.35 * shimmer);
      col += vec3(0.3, 0.08, 0.02) * smoothstep(1.4, 0.8, d) * 0.35;
      float ring = smoothstep(0.03, 0.0, abs(d - 1.0));
      col += vec3(0.5, 0.2, 0.05) * ring * 0.4;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Renderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.splat = program(gl, SPLAT_VS, SPLAT_FS);
    this.comp = program(gl, COMP_VS, COMP_FS);
    this.aSplatPos = gl.getAttribLocation(this.splat.p, 'a_pos');
    this.aSplatAttr = gl.getAttribLocation(this.splat.p, 'a_attr');
    this.aCompPos = gl.getAttribLocation(this.comp.p, 'a_pos');

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.posBuf = gl.createBuffer();
    this.attrBuf = gl.createBuffer();
    this.posData = new Float32Array(0);
    this.attrData = new Float32Array(0);

    this.densTex = gl.createTexture();
    this.fbo = gl.createFramebuffer();
    this.densW = 0; this.densH = 0;
    this.maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;

    this.rockA = new Float32Array(MAX_ROCKS * 4);
    this.rockR = new Float32Array(MAX_ROCKS);
    this.heat = new Float32Array(MAX_HEAT * 4);
    this.spring = new Float32Array(MAX_SPRINGS * 4);
    this.nRocks = 0; this.nHeat = 0; this.nSpring = 0;
    this.screen = [0, 0, 1, 1];
    this.quality = 1;
    this.slow = 0;
  }

  // Called once per animation frame with the frame time; steps resolution
  // down after sustained slow frames and back up when there is headroom.
  pace(dt) {
    if (dt > 0.1) return;
    this.slow = this.slow * 0.95 + (dt > 1 / 40 ? 1 : 0) * 0.05;
    if (this.slow > 0.6 && this.quality > 0.5) { this.quality = Math.max(0.5, this.quality - 0.15); this.slow = 0.3; }
    else if (this.slow < 0.02 && this.quality < 1) { this.quality = Math.min(1, this.quality + 0.05); this.slow = 0.1; }
  }

  setLevel(lv) {
    this.nRocks = Math.min(MAX_ROCKS, lv.rocks.length);
    for (let i = 0; i < this.nRocks; i++) {
      const r = lv.rocks[i];
      this.rockA.set([r.ax, r.ay, r.bx, r.by], i * 4);
      this.rockR[i] = r.r;
    }
    this.nHeat = Math.min(MAX_HEAT, lv.heat.length);
    for (let i = 0; i < this.nHeat; i++) this.heat.set([lv.heat[i].x, lv.heat[i].y, lv.heat[i].r, 0], i * 4);
    this.nSpring = Math.min(MAX_SPRINGS, lv.springs.length);
    for (let i = 0; i < this.nSpring; i++) this.spring.set([lv.springs[i].x, lv.springs[i].y, 0, 0], i * 4);
    const S = lv.screen;
    this.screen = [S.x, S.y, S.w, S.h];
  }

  ensureDensity(w, h) {
    if (w <= this.densW && h <= this.densH) return;
    const gl = this.gl;
    this.densW = Math.max(w, this.densW);
    this.densH = Math.max(h, this.densH);
    gl.bindTexture(gl.TEXTURE_2D, this.densTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.densW, this.densH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.densTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Draws the world as seen through a view at screen rect (ox, oy, w, h) into
  // ctx, whose canvas is (cw × ch) device pixels. `shift(key)` returns the
  // render-time offset for particles homed in pane `key` (lag compensation).
  draw(ctx, cw, ch, ox, oy, w, h, snap, time, shift) {
    const gl = this.gl;
    // At most one GL pixel per CSS pixel, fewer when the view is huge or the
    // last frames were slow; the 2D blit scales it back up.
    const cap = Math.sqrt(MAX_PIXELS / Math.max(1, w * h));
    const q = Math.min(1, cw / w, cap) * this.quality;
    const rw = Math.max(1, Math.round(w * q));
    const rh = Math.max(1, Math.round(h * q));
    if (this.canvas.width < rw || this.canvas.height < rh) {
      this.canvas.width = Math.max(this.canvas.width, rw);
      this.canvas.height = Math.max(this.canvas.height, rh);
    }
    const dw = Math.max(1, Math.round(rw * DENS_SCALE));
    const dh = Math.max(1, Math.round(rh * DENS_SCALE));
    this.ensureDensity(dw, dh);

    // Pass 1: density.
    const n = snap ? snap.n : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, dw, dh);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (n > 0) {
      if (this.posData.length < n * 2) {
        this.posData = new Float32Array(snap.pos.length);
        this.attrData = new Float32Array(snap.pos.length);
      }
      const P = this.posData, A = this.attrData;
      let lastKey = -2, sx = 0, sy = 0;
      for (let i = 0; i < n; i++) {
        const key = snap.home[i];
        if (key !== lastKey) {
          lastKey = key;
          const s = shift ? shift(key) : null;
          sx = s ? s[0] : 0; sy = s ? s[1] : 0;
        }
        P[2 * i] = snap.pos[2 * i] + sx;
        P[2 * i + 1] = snap.pos[2 * i + 1] + sy;
        A[2 * i] = snap.speed[i] / 255;
        A[2 * i + 1] = key === -1 ? 1 : 0;
      }
      gl.useProgram(this.splat.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, P.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aSplatPos);
      gl.vertexAttribPointer(this.aSplatPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.attrBuf);
      gl.bufferData(gl.ARRAY_BUFFER, A.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aSplatAttr);
      gl.vertexAttribPointer(this.aSplatAttr, 2, gl.FLOAT, false, 0, 0);
      // The splat margin keeps particles just outside the view contributing
      // to density at its edge, so water does not thin out at window borders.
      const m = SPLAT_R;
      const sxScale = dw / w;
      gl.uniform2f(this.splat.u.u_origin, ox, oy);
      gl.uniform2f(this.splat.u.u_size, w, h);
      gl.uniform1f(this.splat.u.u_point, Math.min(this.maxPoint, 2 * m * sxScale));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(this.aSplatAttr);
    }

    // Pass 2: composite into the default framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rw, rh);
    gl.useProgram(this.comp.p);
    const u = this.comp.u;
    gl.uniform2f(u.u_origin, ox, oy);
    gl.uniform2f(u.u_size, w, h);
    gl.uniform4fv(u.u_screen, this.screen);
    gl.uniform2f(u.u_densUV, dw / this.densW, dh / this.densH);
    gl.uniform2f(u.u_texel, 1 / this.densW, 1 / this.densH);
    gl.uniform1f(u.u_time, time);
    gl.uniform4fv(u.u_rockA, this.rockA);
    gl.uniform1fv(u.u_rockR, this.rockR);
    gl.uniform1i(u.u_nRocks, this.nRocks);
    gl.uniform4fv(u.u_heat, this.heat);
    gl.uniform1i(u.u_nHeat, this.nHeat);
    if (snap && snap.springOn) for (let i = 0; i < this.nSpring; i++) this.spring[i * 4 + 2] = snap.springOn[i] ? 1 : 0;
    gl.uniform4fv(u.u_spring, this.spring);
    gl.uniform1i(u.u_nSpring, this.nSpring);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.densTex);
    gl.uniform1i(u.u_dens, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aCompPos);
    gl.vertexAttribPointer(this.aCompPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // WebGL's origin is bottom-left: the frame we drew sits at the bottom of
    // the (possibly larger) GL canvas.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.canvas, 0, this.canvas.height - rh, rw, rh, 0, 0, cw, ch);
  }
}
