import { BURST_VERTEX_STRIDE } from "./burst-geometry.js";

const vertexSource = `
precision highp float;
attribute vec4 a_from;
attribute vec4 a_to;
attribute vec4 a_fromColor;
attribute vec4 a_toColor;
attribute vec3 a_motion;
uniform vec2 u_resolution;
uniform float u_progress;
varying mediump vec4 v_color;
varying mediump vec2 v_position;
void main() {
  float delay = min(0.06, a_motion.x * 0.3);
  float t = clamp((u_progress - delay) / (1.0 - delay), 0.0, 1.0);
  float eased = t * t * (3.0 - 2.0 * t);
  v_position = mix(a_from.xy, a_to.xy, eased);
  v_color = mix(a_fromColor, a_toColor, eased);
  vec2 clip = v_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const fragmentSource = `
precision mediump float;
uniform vec2 u_eye;
uniform vec2 u_eyeRadius;
varying mediump vec4 v_color;
varying mediump vec2 v_position;
void main() {
  if (length((v_position - u_eye) / u_eyeRadius) < 1.0) discard;
  gl_FragColor = v_color;
}`;

function fallbackRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  let width, height, paper, shapes;
  return {
    animated: false,
    resize(w, h, ratio, background) {
      width = w; height = h; paper = background;
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    },
    setGeometry(from, to) { shapes = to.shapes; },
    draw(progress, eye, radius) {
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.fillStyle = paper;
      context.fillRect(0, 0, width, height);
      for (const { points, fill, stroke, lineWidth, closed } of shapes) {
        context.beginPath();
        points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
        if (closed) context.closePath();
        if (fill) { context.fillStyle = fill; context.fill(); }
        if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
      }
      context.beginPath();
      context.ellipse(eye.x, eye.y, radius.x, radius.y, 0, 0, Math.PI * 2);
      context.fillStyle = paper;
      context.fill();
    },
    dispose() {},
  };
}

export function createBurstRenderer(canvas) {
  // Retain settled frames when browsers repaint the otherwise idle canvas.
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "low-power", depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) return fallbackRenderer(canvas);
  const shaders = [];
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    shaders.push(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const buffers = [gl.createBuffer(), gl.createBuffer()];
  const attributes = Object.fromEntries(["from", "to", "fromColor", "toColor", "motion"].map((name) => [name, gl.getAttribLocation(program, `a_${name}`)]));
  const uniforms = Object.fromEntries(["resolution", "progress", "eye", "eyeRadius"].map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]));
  let count = 0;
  const attribute = (name, size, offset) => {
    gl.enableVertexAttribArray(attributes[name]);
    gl.vertexAttribPointer(attributes[name], size, gl.FLOAT, false, BURST_VERTEX_STRIDE * 4, offset * 4);
  };
  return {
    animated: true,
    resize(width, height, ratio, paper) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.clearColor(...[1, 3, 5].map((offset) => parseInt(paper.slice(offset, offset + 2), 16) / 255), 1);
    },
    setGeometry(from, to) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]);
      gl.bufferData(gl.ARRAY_BUFFER, from.vertices, gl.DYNAMIC_DRAW);
      attribute("from", 4, 0); attribute("fromColor", 4, 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]);
      gl.bufferData(gl.ARRAY_BUFFER, to.vertices, gl.DYNAMIC_DRAW);
      attribute("to", 4, 0); attribute("toColor", 4, 4); attribute("motion", 3, 8);
      count = to.vertices.length / BURST_VERTEX_STRIDE;
    },
    draw(progress, eye, radius) {
      gl.uniform1f(uniforms.progress, progress);
      gl.uniform2f(uniforms.eye, eye.x, eye.y);
      gl.uniform2f(uniforms.eyeRadius, radius.x, radius.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    },
    dispose() {
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
    },
  };
}
