import { BURST_VERTEX_STRIDE } from "./burst-geometry.js";
import { DEFAULT_BURST_TRANSITION } from "./burst-motion.js";

const vertexSource = `
precision highp float;
attribute vec4 a_from;
attribute vec4 a_to;
attribute vec4 a_fromColor;
attribute vec4 a_toColor;
attribute vec3 a_motion;
uniform vec2 u_resolution;
uniform float u_progress;
uniform vec4 u_style;
uniform vec4 u_variation;
varying mediump vec4 v_color;
varying mediump vec2 v_position;
void main() {
  float delay = a_motion.x;
  if (u_style.x > 2.5) {
    vec2 relative = a_to.zw - u_variation.zw;
    float sweep = mod(atan(relative.y, relative.x) + u_variation.x + 6.28318531, 6.28318531) / 6.28318531;
    delay = delay * 0.4 + sweep * 0.25;
  }
  delay = min(0.4, delay * u_style.w);
  float t = clamp((u_progress - delay) / (1.0 - delay), 0.0, 1.0);
  float eased = 1.0 - pow(1.0 - t, 3.0);
  float wave = sin(3.14159265 * t);
  float turnWave = wave;
  float scale = 1.0;
  if (u_style.x > 0.5 && u_style.x < 1.5) {
    float back = t - 1.0;
    eased = 1.0 + (u_variation.y + 1.0) * back * back * back + u_variation.y * back * back;
    turnWave = sin(6.28318531 * t) * (1.0 - t);
  } else if (u_style.x > 1.5 && u_style.x < 2.5) {
    float back = -2.0 * t + 2.0;
    eased = t < 0.5 ? 2.0 * t * t : 1.0 - back * back / 2.0;
    scale = 1.0 - wave * 0.65;
    turnWave *= 1.8;
  } else if (u_style.x > 2.5) {
    eased = 1.0 - pow(1.0 - t, 4.0);
    wave *= 2.0 * t - 1.0;
  }
  float angle = turnWave * a_motion.y * u_style.y;
  vec2 travel = a_to.zw - a_from.zw;
  vec2 perpendicular = vec2(-travel.y, travel.x) / max(length(travel), 0.001);
  vec2 center = mix(a_from.zw, a_to.zw, eased) + perpendicular * wave * a_motion.z * u_style.z;
  vec2 local = mix(a_from.xy - a_from.zw, a_to.xy - a_to.zw, eased);
  local = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * local * scale;
  v_position = center + local;
  v_color = mix(a_fromColor, a_toColor, clamp(eased, 0.0, 1.0));
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
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "low-power", depth: false, stencil: false });
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
  const uniforms = Object.fromEntries(["resolution", "progress", "eye", "eyeRadius", "style", "variation"].map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]));
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
    setGeometry(from, to, transition = DEFAULT_BURST_TRANSITION) {
      gl.uniform4f(uniforms.style, transition.mode, transition.turn, transition.bend, transition.stagger);
      gl.uniform4f(uniforms.variation, transition.phase, transition.overshoot, transition.origin.x, transition.origin.y);
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
