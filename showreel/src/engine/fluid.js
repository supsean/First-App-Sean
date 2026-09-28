// Liquid-glass metaballs. A 2D canvas (the "world" behind the glass) is uploaded
// as a texture; blobs refract it with chromatic dispersion, a fresnel rim, a hard
// specular, a soft contact shadow, and can fill with solid colour.
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
#define MAXB 10
uniform sampler2D uBg;
uniform vec2 uRes;
uniform vec3 uBalls[MAXB];
uniform int uCount;
uniform float uFill;
uniform vec3 uFillCol;
uniform float uRefract;
uniform float uFlat;
uniform float uShadow;
in vec2 vUv;
out vec4 o;

float field(vec2 p, out vec2 grad) {
  float f = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < MAXB; i++) {
    if (i >= uCount) break;
    vec2 d = p - uBalls[i].xy;
    float r2 = uBalls[i].z * uBalls[i].z;
    float q = dot(d, d) + 1.0;
    f += r2 / q;
    grad += -2.0 * r2 * d / (q * q);
  }
  return f;
}

vec3 bg(vec2 p) {
  return texture(uBg, clamp(p / uRes, vec2(0.0), vec2(1.0))).rgb;
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 g;
  float f = field(p, g);
  float gl = length(g) + 1e-6;
  float s = (f - 1.0) / gl;
  vec2 outward = -g / gl;
  float inside = smoothstep(-0.9, 0.9, s);

  // Soft contact shadow, offset down-right from a top-left key light.
  vec2 gs;
  float fs = field(p - vec2(16.0, 26.0), gs);
  float sh = smoothstep(0.35, 1.25, fs) * 0.34 * uShadow;
  vec3 back = bg(p) * (1.0 - sh);

  vec3 col = back;
  if (s > -2.0) {
    float B = 78.0;
    float e = clamp(s / B, 0.0, 1.0);
    float tilt = pow(1.0 - e, 2.2) * 0.96;
    vec3 n = normalize(vec3(outward * tilt, sqrt(max(1.0 - tilt * tilt, 0.0))));
    // Refraction: magnify toward the rim with slight dispersion.
    vec2 off = -n.xy * uRefract;
    vec3 refr;
    refr.r = bg(p + off * 0.96).r;
    refr.g = bg(p + off * 1.08).g;
    refr.b = bg(p + off * 1.22).b;
    vec3 L = normalize(vec3(-0.5, -0.62, 0.62));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 120.0);
    float spec2 = pow(max(dot(n, normalize(vec3(0.55, 0.5, 0.7))), 0.0), 26.0) * 0.18;
    float fres = pow(1.0 - n.z, 2.4);
    vec3 glass = refr * vec3(0.94, 0.97, 1.02);
    glass *= mix(0.78, 1.0, smoothstep(0.0, 0.45, e));
    glass += fres * vec3(0.55, 0.6, 0.7) + spec * 1.3 + spec2;
    vec3 liquid = uFillCol * (0.72 + 0.28 * n.z) + spec * 0.95 + fres * uFillCol * 0.35 + spec2;
    vec3 inCol = mix(mix(glass, liquid, uFill), uFillCol, uFlat);
    col = mix(back, inCol, inside);
  }
  o = vec4(col, 1.0);
}`;

export class Fluid {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    this.gl = gl;
    this.w = w;
    this.h = h;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {};
    for (const name of ['uBg', 'uRes', 'uBalls', 'uCount', 'uFill', 'uFillCol', 'uRefract', 'uFlat', 'uShadow']) this.u[name] = gl.getUniformLocation(prog, name);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.balls = new Float32Array(30);
  }

  // balls: [{x, y, r}] in px (top-left origin). fillCol: [r, g, b] 0..1 (sRGB).
  render(bgCanvas, balls, { fill = 0, fillCol = [1, 0.31, 0.12], refract = 95, flat = 0, shadow = 1 } = {}) {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
    const n = Math.min(balls.length, 10);
    this.balls.fill(0);
    for (let i = 0; i < n; i++) {
      this.balls[i * 3] = balls[i].x;
      this.balls[i * 3 + 1] = balls[i].y;
      this.balls[i * 3 + 2] = balls[i].r;
    }
    gl.uniform1i(this.u.uBg, 0);
    gl.uniform2f(this.u.uRes, this.w, this.h);
    gl.uniform3fv(this.u.uBalls, this.balls);
    gl.uniform1i(this.u.uCount, n);
    gl.uniform1f(this.u.uFill, fill);
    gl.uniform3f(this.u.uFillCol, fillCol[0], fillCol[1], fillCol[2]);
    gl.uniform1f(this.u.uRefract, refract);
    gl.uniform1f(this.u.uFlat, flat);
    gl.uniform1f(this.u.uShadow, shadow);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
