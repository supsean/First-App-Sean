// WebGL2 back end: accumulates Canvas2D sub-frames in linear light (true shutter
// motion blur), then runs the lens pass (chromatic aberration, vignette, grain).
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const ACCUM_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uW;
in vec2 vUv;
out vec4 o;
void main() {
  o = vec4(texture(uTex, vUv).rgb * uW, 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
uniform vec2 uRes;
uniform float uFrame;
uniform float uCA;
uniform float uGrain;
uniform float uVig;
uniform float uFlash;
uniform vec3 uFlashCol;
in vec2 vUv;
out vec4 o;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  vec2 da = d * vec2(uRes.x / uRes.y, 1.0);
  float r2 = dot(da, da);
  vec2 off = d * uCA * (0.35 + 1.4 * r2);
  vec3 c;
  c.r = texture(uAcc, uv + off).r;
  c.g = texture(uAcc, uv).g;
  c.b = texture(uAcc, uv - off).b;
  c *= 1.0 - uVig * smoothstep(0.15, 1.05, r2);
  c = mix(c, uFlashCol, uFlash);
  vec3 s = toSRGB(c);
  float f = floor(uFrame);
  float n = hash(gl_FragCoord.xy + vec2(f * 17.13, f * 3.71)) + hash(gl_FragCoord.xy * 1.31 + vec2(f * 5.9, f * 11.3)) - 1.0;
  float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s += n * uGrain * (0.45 + 0.55 * (1.0 - abs(lum * 2.0 - 1.0)));
  o = vec4(s, 1.0);
}`;

export class Post {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    this.gl = gl;
    this.w = canvas.width;
    this.h = canvas.height;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.accumProg = this.program(ACCUM_FS);
    this.postProg = this.program(POST_FS);

    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.accTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.w, this.h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Accumulation FBO incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  program(fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Add one sub-frame (a canvas) with the given weight.
  add(source, weight) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.useProgram(this.accumProg.p);
    gl.uniform1i(this.accumProg.u.uTex, 0);
    gl.uniform1f(this.accumProg.u.uW, weight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  finish(frame, fx) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.postProg.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    const u = this.postProg.u;
    gl.uniform1i(u.uAcc, 0);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uFrame, frame);
    gl.uniform1f(u.uCA, fx.ca);
    gl.uniform1f(u.uGrain, fx.grain);
    gl.uniform1f(u.uVig, fx.vignette);
    gl.uniform1f(u.uFlash, fx.flash || 0);
    const fc = fx.flashColor || [1, 1, 1];
    gl.uniform3f(u.uFlashCol, fc[0], fc[1], fc[2]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Raw RGBA, bottom-up rows.
  read(into) {
    const gl = this.gl;
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, into);
    return into;
  }
}
