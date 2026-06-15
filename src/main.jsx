import React, { Suspense, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Environment, useTexture } from "@react-three/drei";
import { gsap } from "gsap";
import * as THREE from "three";
import "./styles.css";

const WORLD_RADIUS = 26;
const CAMERA_HOME = new THREE.Vector3(0, 1.62, 0);
const SECRET = new THREE.Vector3(4.6, 1.35, -7.4);
const PITCH_DOWN_LIMIT = -0.04;
const PITCH_UP_LIMIT = 0.16;
const FOREST_TEXTURE = "/assets/mushroom-forest-cinematic.png";
const INTRO_VIDEO_SRC = "/assets/tree-hole-intro-flight.mp4";

function cloneTexture(source, { offset = 0, repeat = 1, wrapS = THREE.ClampToEdgeWrapping } = {}) {
  const texture = source.clone();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = wrapS;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.offset.x = offset;
  texture.repeat.x = repeat;
  texture.needsUpdate = true;
  return texture;
}

function CameraRig({ discovered, setDiscovered, entering, setEntering }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const yawTarget = useRef(0);
  const pitchTarget = useRef(0);
  const yawVelocity = useRef(0);
  const pitchVelocity = useRef(0);
  const position = useRef(CAMERA_HOME.clone());
  const velocity = useRef(new THREE.Vector3());
  const keys = useRef(new Set());
  const drag = useRef(false);
  const clock = useRef(0);
  const enter = useRef({ value: 0 });
  const intro = useRef({ value: 0 });
  const step = useRef(0);
  const motionSignal = useRef(0);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debugPitch = Number(params.get("debugPitch"));
    const debugYaw = Number(params.get("debugYaw"));
    if (Number.isFinite(debugPitch)) {
      pitch.current = THREE.MathUtils.clamp(debugPitch, PITCH_DOWN_LIMIT, PITCH_UP_LIMIT);
      pitchTarget.current = pitch.current;
    }
    if (Number.isFinite(debugYaw)) {
      yaw.current = debugYaw;
      yawTarget.current = debugYaw;
    }

    const tween = gsap.to(intro.current, {
      value: 1,
      duration: 14.5,
      delay: 0.45,
      ease: "power2.inOut",
    });
    return () => tween.kill();
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.04);
    clock.current += dt;

    const move = new THREE.Vector3();
    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) move.z -= 1;
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) move.z += 1;
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) move.x -= 1;
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) move.x += 1;

    if (move.lengthSq() > 0) {
      move.normalize();
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      velocity.current.x += (move.x * cos - move.z * sin) * dt * 2.25;
      velocity.current.z += (move.x * sin + move.z * cos) * dt * 2.25;
    }
    velocity.current.multiplyScalar(0.91);
    position.current.add(velocity.current);
    position.current.x = THREE.MathUtils.clamp(position.current.x, -9.8, 9.8);
    position.current.z = THREE.MathUtils.clamp(position.current.z, -10.4, 8.2);

    if (Math.abs(yawTarget.current) > Math.PI * 2 || Math.abs(yaw.current) > Math.PI * 2) {
      const turns = Math.round(yaw.current / (Math.PI * 2));
      const offset = turns * Math.PI * 2;
      yaw.current -= offset;
      yawTarget.current -= offset;
    }

    const stiffness = 8.5;
    const damping = 0.88;
    yawVelocity.current = (yawVelocity.current + (yawTarget.current - yaw.current) * stiffness * dt) * damping;
    pitchVelocity.current = (pitchVelocity.current + (pitchTarget.current - pitch.current) * stiffness * dt) * damping;
    yaw.current += yawVelocity.current * dt;
    pitch.current = THREE.MathUtils.clamp(pitch.current + pitchVelocity.current * dt, PITCH_DOWN_LIMIT, PITCH_UP_LIMIT);

    const moveSpeed = velocity.current.length();
    const turnEnergy = Math.min(1, Math.abs(yawVelocity.current) * 0.9 + Math.abs(pitchVelocity.current) * 1.2);
    step.current += dt * (0.82 + moveSpeed * 8.5 + turnEnergy * 0.55);
    motionSignal.current = THREE.MathUtils.damp(motionSignal.current, Math.min(1, moveSpeed * 9 + turnEnergy * 0.42), 3.6, dt);
    window.__forestMotion = Math.max(motionSignal.current, enter.current.value);

    const walk = motionSignal.current;
    const breathX = Math.sin(clock.current * 0.48) * 0.032 + Math.sin(step.current * 0.72) * 0.014 * walk;
    const breathY = Math.sin(clock.current * 0.73) * 0.026 + Math.abs(Math.sin(step.current)) * 0.045 * walk;
    const breathZ = Math.cos(clock.current * 0.38) * 0.028 + Math.cos(step.current * 0.58) * 0.018 * walk;
    const headLagYaw = THREE.MathUtils.clamp(yawVelocity.current * 0.018, -0.035, 0.035);
    const headLagPitch = THREE.MathUtils.clamp(pitchVelocity.current * 0.014, -0.018, 0.018);
    const bodyRoll = THREE.MathUtils.clamp(-yawVelocity.current * 0.018, -0.035, 0.035) + Math.sin(step.current * 0.55) * 0.006 * walk;
    const introProgress = intro.current.value;
    const introEase = introProgress * introProgress * (3 - 2 * introProgress);
    const introOffset = new THREE.Vector3(
      THREE.MathUtils.lerp(-1.25, 0, introEase),
      THREE.MathUtils.lerp(-0.08, 0, introEase),
      THREE.MathUtils.lerp(2.85, 0, introEase)
    );
    const introYaw = (1 - introEase) * (-0.26 + Math.sin(clock.current * 0.22) * 0.085);
    const introPitch = (1 - introEase) * (0.055 + Math.sin(clock.current * 0.18) * 0.025);

    const forward = new THREE.Vector3(Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const push = forward.multiplyScalar(enter.current.value * 6.5);
    camera.position.set(
      position.current.x + breathX + push.x + introOffset.x,
      CAMERA_HOME.y + breathY + enter.current.value * 0.25 + introOffset.y,
      position.current.z + breathZ + push.z + introOffset.z
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current + introYaw + headLagYaw;
    camera.rotation.x = pitch.current + introPitch + headLagPitch;
    camera.rotation.z = Math.sin(clock.current * 0.31) * 0.004 + bodyRoll;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const seen = direction.dot(SECRET.clone().sub(camera.position).normalize()) > 0.966;
    if (seen !== discovered) setDiscovered(seen);
  });

  React.useEffect(() => {
    if (!entering) return undefined;
    const tween = gsap.to(enter.current, { value: 1, duration: 2.6, ease: "power3.inOut" });
    return () => tween.kill();
  }, [entering]);

  React.useEffect(() => {
    function onPointerMove(event) {
      if (drag.current) {
        yawTarget.current -= event.movementX * 0.0027;
        pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current + event.movementY * 0.002, PITCH_DOWN_LIMIT, PITCH_UP_LIMIT);
        return;
      }

      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      yawTarget.current += x * -0.00125;
      pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current + y * -0.00085, PITCH_DOWN_LIMIT, PITCH_UP_LIMIT);
    }

    function onPointerDown(event) {
      drag.current = true;
      event.target?.setPointerCapture?.(event.pointerId);
      if (document.pointerLockElement) document.exitPointerLock?.();
      if (discovered && !entering) setEntering(true);
    }

    function onPointerUp() {
      drag.current = false;
    }

    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && ["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"].includes(event.code)) {
        event.preventDefault();
        return;
      }
      keys.current.add(event.code);
    }

    function onKeyUp(event) {
      keys.current.delete(event.code);
    }

    function preventZoom(event) {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    }

    function preventGesture(event) {
      event.preventDefault();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("wheel", preventZoom, { passive: false });
    window.addEventListener("gesturestart", preventGesture, { passive: false });
    window.addEventListener("gesturechange", preventGesture, { passive: false });
    window.addEventListener("gestureend", preventGesture, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("wheel", preventZoom);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
    };
  }, [discovered, entering, gl.domElement, setEntering]);

  return null;
}

function ForestPanorama() {
  const source = useTexture(FOREST_TEXTURE);
  const textures = useMemo(
    () => [
      cloneTexture(source, { offset: 0 }),
      cloneTexture(source, { offset: 0.06 }),
      cloneTexture(source, { offset: -0.05 }),
      cloneTexture(source, { offset: 0.12 }),
    ],
    [source]
  );
  const uniforms = useMemo(
    () =>
      textures.map((texture, index) => ({
        uMap: { value: texture },
        uTime: { value: 0 },
        uMotion: { value: 0 },
        uOpacity: { value: index === 0 ? 1 : index === 3 ? 0.28 : 0.42 },
        uMist: { value: index === 0 ? 0.0 : 0.004 },
      })),
    [textures]
  );
  const geometries = useMemo(() => {
    const radius = WORLD_RADIUS;
    const height = 50;
    const arc = THREE.MathUtils.degToRad(96);
    const segments = 44;
    return [0, Math.PI * 0.5, -Math.PI * 0.5, Math.PI].map((center) => {
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const theta = center - arc / 2 + arc * u;
        const x = Math.sin(theta) * radius;
        const z = -Math.cos(theta) * radius;
        positions.push(x, -height / 2, z, x, height / 2, z);
        uvs.push(u, 0, u, 1);
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    });
  }, []);

  useFrame((_, delta) => {
    uniforms.forEach((uniform) => {
      uniform.uTime.value += delta;
      uniform.uMotion.value = THREE.MathUtils.damp(uniform.uMotion.value, window.__forestMotion || 0, 2.2, delta);
    });
  });
  return (
    <group>
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} position={[0, 4.2, 0]}>
          <shaderMaterial
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            uniforms={uniforms[index]}
            vertexShader={`
              varying vec2 vUv;
              uniform float uTime;
              uniform float uMotion;
              void main() {
                vUv = uv;
                vec3 p = position;
                float heightInfluence = smoothstep(0.12, 0.86, uv.y);
                float wind = sin(uTime * 0.32 + position.x * 0.1 + position.y * 0.035) * 0.045;
                p.x += wind * heightInfluence * (1.0 + uMotion * 1.7);
                p.y += sin(uTime * 0.22 + position.x * 0.07) * 0.018 * heightInfluence;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              uniform sampler2D uMap;
              uniform float uTime;
              uniform float uMotion;
              uniform float uOpacity;
              uniform float uMist;
              float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
              }
              float mushroomMask(vec2 uv) {
                vec3 c = texture2D(uMap, uv).rgb;
                float redCap = smoothstep(0.08, 0.42, c.r - max(c.g, c.b) * 0.72);
                float warmCap = smoothstep(0.36, 0.82, c.r + c.g * 0.5 - c.b * 0.34);
                return redCap * warmCap;
              }
              void main() {
                float baseMask = mushroomMask(vUv);
                float phase = hash(floor(vUv * vec2(42.0, 26.0)));
                float rate = 0.46 + phase * 0.28;
                float breath = 0.76 + sin(uTime * rate + phase * 6.2831) * 0.24;
                float lift = baseMask * sin(uTime * (0.32 + phase * 0.22) + phase * 5.1) * 0.0022;
                float sway = baseMask * sin(uTime * (0.5 + phase * 0.18) + vUv.y * 19.0 + phase * 4.0) * (0.0032 + uMotion * 0.0028);
                vec2 breathingUv = vUv + vec2(sway, lift + uMotion * baseMask * 0.0016);
                vec4 tex = texture2D(uMap, breathingUv);
                float edgeFade = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
                float vertical = smoothstep(0.0, 0.025, vUv.y) * smoothstep(1.0, 0.985, vUv.y);
                float drift = uMist + sin(vUv.x * 10.0 + uTime * 0.05) * 0.0012;
                vec3 forestAir = vec3(0.16, 0.24, 0.13);
                vec3 color = mix(tex.rgb, forestAir, max(drift, 0.0));
                float luma = dot(color, vec3(0.299, 0.587, 0.114));
                color = mix(vec3(luma), color, 1.2);
                color *= vec3(1.18, 1.1, 0.92);
                color += vec3(0.085, 0.058, 0.018);
                float lanternRed = mushroomMask(breathingUv);
                float haloMask = lanternRed;
                haloMask = max(haloMask, mushroomMask(breathingUv + vec2(0.006, 0.0)) * 0.72);
                haloMask = max(haloMask, mushroomMask(breathingUv - vec2(0.006, 0.0)) * 0.72);
                haloMask = max(haloMask, mushroomMask(breathingUv + vec2(0.0, 0.006)) * 0.62);
                haloMask = max(haloMask, mushroomMask(breathingUv - vec2(0.0, 0.006)) * 0.62);
                float glow = haloMask * (0.64 + breath * 0.52);
                color += vec3(0.36, 0.18, 0.045) * glow;
                color += vec3(0.34, 0.18, 0.055) * lanternRed * (0.72 + breath * 0.48);
                color = mix(color, color * vec3(1.26, 1.13, 0.92), lanternRed * (0.45 + breath * 0.28));
                color = (color - 0.5) * 1.04 + 0.5;
                color = max(color, vec3(0.0));
                color = pow(color, vec3(0.82));
                gl_FragColor = vec4(color, edgeFade * vertical * uOpacity);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

function ForestTopExtension() {
  const source = useTexture(FOREST_TEXTURE);
  const texture = useMemo(() => {
    const topTexture = cloneTexture(source, { offset: 0.03, repeat: 1.02, wrapS: THREE.MirroredRepeatWrapping });
    topTexture.offset.y = 0.46;
    topTexture.repeat.y = 0.38;
    topTexture.needsUpdate = true;
    return topTexture;
  }, [source]);
  const geometry = useMemo(() => {
    const width = 62;
    const depth = 52;
    const segmentsX = 64;
    const segmentsZ = 52;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let zIndex = 0; zIndex <= segmentsZ; zIndex++) {
      const v = zIndex / segmentsZ;
      const z = THREE.MathUtils.lerp(12, -34, v);
      for (let xIndex = 0; xIndex <= segmentsX; xIndex++) {
        const u = xIndex / segmentsX;
        const x = (u - 0.5) * width;
        const edge = Math.abs(u - 0.5) * 2;
        const arch = Math.sin(v * Math.PI) * 2.8 - edge * edge * 2.6;
        const y = 19.5 + arch;
        positions.push(x, y, z);
        uvs.push(u, 1 - v);
      }
    }

    for (let zIndex = 0; zIndex < segmentsZ; zIndex++) {
      for (let xIndex = 0; xIndex < segmentsX; xIndex++) {
        const a = zIndex * (segmentsX + 1) + xIndex;
        indices.push(a, a + 1, a + segmentsX + 1, a + 1, a + segmentsX + 2, a + segmentsX + 1);
      }
    }

    const top = new THREE.BufferGeometry();
    top.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    top.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    top.setIndex(indices);
    top.computeVertexNormals();
    return top;
  }, []);

  return (
    <mesh geometry={geometry} rotation-y={-0.04}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={{ uMap: { value: texture } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform sampler2D uMap;
          void main() {
            vec2 canopyUv = vec2(vUv.x, mix(0.64, 0.98, vUv.y));
            vec3 color = texture2D(uMap, canopyUv).rgb;
            float sideFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            float depthFade = smoothstep(0.0, 0.24, vUv.y) * smoothstep(1.0, 0.54, vUv.y);
            gl_FragColor = vec4(color, sideFade * depthFade * 0.62);
          }
        `}
      />
    </mesh>
  );
}

function ForestSkyBackfill() {
  const source = useTexture(FOREST_TEXTURE);
  const texture = useMemo(() => cloneTexture(source, { offset: 0, repeat: 1, wrapS: THREE.MirroredRepeatWrapping }), [source]);

  return (
    <mesh position={[0, 3.5, 0]} rotation-y={0.18}>
      <sphereGeometry args={[82, 96, 48]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={{ uMap: { value: texture } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform sampler2D uMap;
          void main() {
            vec2 canopyUv = vec2(fract(vUv.x + 0.08), mix(0.62, 0.98, smoothstep(0.0, 1.0, vUv.y)));
            vec3 color = texture2D(uMap, canopyUv).rgb;
            color *= 0.82;
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function DepthVeils() {
  const source = useTexture(FOREST_TEXTURE);
  const texture = useMemo(() => cloneTexture(source), [source]);
  const layers = [
    [0, 3.05, -13.5, 0, 24, 14.6, 0.032],
    [-11.5, 3.05, -8.2, 0.75, 18, 12, 0.02],
    [11.5, 3.05, -8.5, -0.75, 18, 12, 0.02],
  ];

  return (
    <group>
      {layers.map(([x, y, z, ry, w, h, opacity], index) => (
        <mesh key={index} position={[x, y, z]} rotation-y={ry}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} color="#ffffff" transparent opacity={opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function VolumetricMist() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMotion: { value: 0 } }), []);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uMotion.value = THREE.MathUtils.damp(uniforms.uMotion.value, window.__forestMotion || 0, 1.8, delta);
  });

  return (
    <group>
      {[-13, -8, -3].map((z, index) => (
        <mesh key={z} position={[0, 3.2 + index * 0.35, z]}>
          <planeGeometry args={[28, 12]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            uniforms={uniforms}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              uniform float uTime;
              uniform float uMotion;
              float mist(vec2 p) {
                p.x += sin(uTime * 0.16 + p.y * 4.0) * (0.035 + uMotion * 0.055);
                return sin(p.x * 9.0 + uTime * (0.09 + uMotion * 0.08)) * sin(p.y * 5.0 - uTime * 0.07) * 0.5 + 0.5;
              }
              void main() {
                float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
                float vertical = smoothstep(0.02, 0.45, vUv.y) * smoothstep(1.0, 0.36, vUv.y);
                vec3 color = vec3(0.48, 0.66, 0.48);
                gl_FragColor = vec4(color, mist(vUv) * edge * vertical * 0.013);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

function SporeField({ discovered }) {
  const points = useRef();
  const data = useMemo(() => {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const warmth = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(2, 16);
      positions[i * 3] = Math.sin(angle) * radius;
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(0.25, 8.8);
      positions[i * 3 + 2] = Math.cos(angle) * radius;
      size[i] = THREE.MathUtils.randFloat(0.22, 0.9);
      warmth[i] = Math.random();
      phase[i] = Math.random() * Math.PI * 2;
    }
    return { positions, size, warmth, phase };
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uReveal: { value: 0 }, uMotion: { value: 0 } }), []);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uReveal.value = THREE.MathUtils.damp(uniforms.uReveal.value, discovered ? 1 : 0, 3.2, delta);
    uniforms.uMotion.value = THREE.MathUtils.damp(uniforms.uMotion.value, window.__forestMotion || 0, 2.8, delta);
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[data.size, 1]} />
        <bufferAttribute attach="attributes-aWarmth" args={[data.warmth, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[data.phase, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          attribute float aSize;
          attribute float aWarmth;
          attribute float aPhase;
          varying float vWarmth;
          varying float vAlpha;
          uniform float uTime;
          uniform float uReveal;
          uniform float uMotion;
          void main() {
            vWarmth = aWarmth;
            vec3 p = position;
            float breath = 0.78 + sin(uTime * (0.45 + aWarmth * 0.18) + aPhase) * 0.22;
            float orbit = sin(uTime * 0.18 + aPhase) * (0.08 + aWarmth * 0.12 + uMotion * 0.1);
            mat2 rot = mat2(cos(orbit), -sin(orbit), sin(orbit), cos(orbit));
            p.xz = rot * p.xz;
            p.xz *= 1.0 + (breath - 0.78) * (0.022 + aWarmth * 0.02 + uMotion * 0.015);
            p.x += sin(uTime * (0.24 + uMotion * 0.16) + position.y * 1.3 + aPhase) * (0.24 + uMotion * 0.18);
            p.y += sin(uTime * 0.42 + position.x * 0.2 + aPhase) * (0.08 + aWarmth * 0.06 + uMotion * 0.05);
            p.y += uReveal * aWarmth * sin(uTime * 0.9 + aPhase) * 0.08;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = aSize * (62.0 / -mv.z) * (0.9 + breath * 0.22 + uReveal * aWarmth * 0.12);
            vAlpha = 0.045 + aWarmth * 0.075 + breath * 0.018;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying float vWarmth;
          varying float vAlpha;
          uniform float uReveal;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
            vec3 cool = vec3(0.64, 0.94, 0.86);
            vec3 warm = vec3(1.0, 0.53, 0.12);
            vec3 color = mix(cool, warm, vWarmth);
            color += warm * uReveal * vWarmth * 0.22;
            gl_FragColor = vec4(color, alpha * 0.22);
          }
        `}
      />
    </points>
  );
}

function BlueEntranceParticles({ discovered, entering }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uActivity: { value: 0 } }), []);
  const data = useMemo(() => {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(0.5, 2.15);
      const height = THREE.MathUtils.randFloat(1.0, 2.25);
      positions[i * 3] = Math.sin(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.cos(angle) * radius * 0.72;
      phase[i] = Math.random() * Math.PI * 2;
      size[i] = THREE.MathUtils.randFloat(0.8, 2.8);
    }

    return { positions, phase, size };
  }, []);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uActivity.value = THREE.MathUtils.damp(uniforms.uActivity.value, entering ? 2.35 : discovered ? 1 : 0.18, 2.8, delta);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[data.phase, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[data.size, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          attribute float aPhase;
          attribute float aSize;
          varying float vPhase;
          varying float vAlpha;
          uniform float uTime;
          uniform float uActivity;
          void main() {
            vPhase = aPhase;
            vec3 p = position;
            float portal = smoothstep(1.0, 2.35, uActivity);
            float slow = sin(uTime * 0.85 + aPhase);
            float driftRing = 0.055 + uActivity * 0.12;
            float spin = uTime * (0.35 + portal * 2.15) + aPhase * (0.35 + portal * 1.6);
            mat2 vortex = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
            p.xz = mix(p.xz, vortex * p.xz, portal);
            p.xz *= mix(1.0 + slow * driftRing, 0.28 + sin(uTime * 2.1 + aPhase) * 0.05, portal * 0.78);
            p.x += sin(uTime * 0.65 + aPhase * 1.7) * 0.12;
            p.z += cos(uTime * 0.5 + aPhase * 1.2) * 0.12;
            p.y += slow * 0.1 + uActivity * 0.05 + portal * sin(uTime * 2.4 + aPhase) * 0.34;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = aSize * (88.0 / -mv.z) * (1.0 + uActivity * 0.36 + portal * 0.64);
            vAlpha = 0.34 + uActivity * 0.42 + portal * 0.36;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying float vPhase;
          varying float vAlpha;
          uniform float uTime;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            q.y *= 1.85;
            float d = length(q);
            float core = smoothstep(0.5, 0.0, d);
            float sparkle = 0.8 + sin(uTime * 4.3 + vPhase) * 0.2;
            vec3 deepBlue = vec3(0.08, 0.27, 0.72);
            vec3 paleViolet = vec3(0.64, 0.86, 1.0);
            vec3 color = mix(deepBlue, paleViolet, core);
            gl_FragColor = vec4(color, core * vAlpha * sparkle);
          }
        `}
      />
    </points>
  );
}

function BlueEntranceMushroom({ discovered, entering, onEnter }) {
  const { camera, gl } = useThree();
  const group = useRef();
  const billboard = useRef();
  const halo = useRef();
  const outerHalo = useRef();
  const capGlow = useRef();
  const coreLight = useRef();
  const rimLight = useRef();
  const activity = useRef(0);
  const billboardUniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0.2 } }), []);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    activity.current = THREE.MathUtils.damp(activity.current, entering ? 2.35 : discovered ? 1 : 0, 2.5, delta);
    const t = clock.elapsedTime;
    const breath = 0.68 + Math.sin(t * 1.18) * 0.22 + Math.sin(t * 3.9) * 0.035;
    const flicker = 0.94 + Math.sin(t * 7.1) * 0.035 + Math.sin(t * 11.4) * 0.018;
    const reveal = activity.current;
    const portal = Math.max(0, reveal - 1);
    group.current.scale.setScalar(0.66 * (1 + reveal * 0.08 + portal * 0.16 + breath * 0.04));
    billboardUniforms.uTime.value = t;
    billboardUniforms.uOpacity.value = (0.028 + breath * 0.018 + reveal * 0.034 + portal * 0.09) * flicker;

    if (coreLight.current) {
      coreLight.current.intensity = (3.2 + reveal * 5.3 + portal * 9 + breath * 1.6) * flicker;
      coreLight.current.distance = 7.2 + reveal * 4.2 + portal * 7 + breath * 1.5;
    }
    if (rimLight.current) {
      rimLight.current.intensity = (1.25 + reveal * 2.2 + portal * 4.5) * flicker;
    }
    if (halo.current) {
      halo.current.scale.setScalar(0.9 + breath * 0.28 + reveal * 0.24 + portal * 0.52);
      halo.current.material.opacity = 0.05 + breath * 0.034 + reveal * 0.045 + portal * 0.08;
      halo.current.material.color.setHSL(0.58 + breath * 0.035, 1, 0.56 + reveal * 0.08);
    }
    if (outerHalo.current) {
      outerHalo.current.scale.setScalar(1.05 + breath * 0.36 + reveal * 0.36 + portal * 0.86);
      outerHalo.current.material.opacity = 0.012 + breath * 0.014 + reveal * 0.02 + portal * 0.052;
    }
    if (capGlow.current) {
      capGlow.current.material.emissiveIntensity = 0.7 + breath * 0.42 + reveal * 0.55 + portal * 1.25;
    }
    if (billboard.current) {
      billboard.current.quaternion.copy(camera.quaternion);
    }
  });

  const handleEnter = React.useCallback(
    (event) => {
      event.stopPropagation();
      if (!entering) onEnter();
    },
    [entering, onEnter]
  );
  const handlePointerOver = React.useCallback(
    (event) => {
      event.stopPropagation();
      if (!entering) gl.domElement.style.cursor = "pointer";
    },
    [entering, gl.domElement]
  );
  const handlePointerOut = React.useCallback(() => {
    gl.domElement.style.cursor = "";
  }, [gl.domElement]);

  return (
    <group
      ref={group}
      position={[SECRET.x, 0.05, SECRET.z]}
      rotation-y={-0.38}
      onClick={handleEnter}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh position={[0, 1.18, 0]} scale={[2.25, 1.95, 2.25]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={coreLight} position={[0, 1.6, 0]} color="#79d4ff" intensity={4} distance={9} decay={1.55} />
      <pointLight ref={rimLight} position={[-1.2, 0.82, 0.75]} color="#6b6dff" intensity={1.6} distance={5.8} decay={1.8} />
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.2, 0.31, 1.24, 24]} />
        <meshPhysicalMaterial
          color="#d7cab4"
          roughness={0.42}
          clearcoat={0.35}
          transmission={0.06}
          thickness={0.4}
          emissive="#2365a6"
          emissiveIntensity={0.28}
        />
      </mesh>
      <mesh ref={capGlow} position={[0, 1.33, 0]} scale={[1.34, 0.42, 1.14]}>
        <sphereGeometry args={[0.84, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshPhysicalMaterial
          color="#b82d24"
          roughness={0.18}
          clearcoat={0.9}
          clearcoatRoughness={0.14}
          emissive="#3eb7ff"
          emissiveIntensity={0.9}
        />
      </mesh>
      <mesh position={[0, 1.24, 0]} scale={[1.08, 0.12, 0.86]}>
        <sphereGeometry args={[0.68, 36, 12]} />
        <meshBasicMaterial color="#d7f5ff" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={halo} position={[0, 1.48, 0]} scale={[1.18, 0.28, 1.02]}>
        <sphereGeometry args={[1.18, 48, 18]} />
        <meshBasicMaterial color="#72cfff" transparent opacity={0.075} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={outerHalo} position={[0, 1.55, 0]} scale={[1.55, 0.46, 1.3]}>
        <sphereGeometry args={[1.2, 48, 18]} />
        <meshBasicMaterial color="#9c8cff" transparent opacity={0.024} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={billboard} position={[0, 1.55, 0]}>
        <planeGeometry args={[2.05, 2.05]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          uniforms={billboardUniforms}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec2 vUv;
            uniform float uTime;
            uniform float uOpacity;
            void main() {
              vec2 q = vUv - 0.5;
              float d = length(q);
              float ring = smoothstep(0.5, 0.04, d);
              float core = smoothstep(0.16, 0.0, d);
              float particleBreak = 0.72 + sin(atan(q.y, q.x) * 18.0 + uTime * 1.3) * 0.16 + sin(d * 36.0 - uTime * 2.2) * 0.12;
              float shimmer = 0.84 + sin(uTime * 3.4 + d * 16.0) * 0.1;
              vec3 deep = vec3(0.04, 0.18, 0.66);
              vec3 pale = vec3(0.68, 0.9, 1.0);
              vec3 violet = vec3(0.55, 0.42, 1.0);
              vec3 color = mix(deep, pale, core);
              color = mix(color, violet, smoothstep(0.18, 0.46, d) * 0.28);
              float alpha = (ring * 0.38 + core * 0.34) * uOpacity * shimmer * particleBreak;
              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </mesh>
      <BlueEntranceParticles discovered={discovered} entering={entering} />
    </group>
  );
}

function Mushroom({ position, scale = 1, rotation = 0, glow = 0.35 }) {
  const group = useRef();
  useFrame(({ clock }) => {
    if (!group.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.4 + position[0]) * 0.025;
    group.current.scale.setScalar(scale * pulse);
  });

  const spotPositions = [
    [-0.22, 0.18, 0.11],
    [0.16, 0.2, -0.08],
    [0.34, 0.11, 0.08],
    [-0.38, 0.08, -0.12],
    [0.02, 0.25, 0.2],
  ];

  return (
    <group ref={group} position={position} rotation-y={rotation}>
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.14, 0.21, 0.92, 18]} />
        <meshStandardMaterial color="#d7b88f" roughness={0.55} metalness={0} emissive="#6b2e10" emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[0, 1.02, 0]} scale={[1.15, 0.36, 1.15]}>
        <sphereGeometry args={[0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshPhysicalMaterial
          color="#b72a1f"
          roughness={0.3}
          clearcoat={0.75}
          clearcoatRoughness={0.2}
          emissive="#ff3d18"
          emissiveIntensity={glow * 0.55}
        />
      </mesh>
      <mesh position={[0, 0.91, 0]} scale={[0.95, 0.04, 0.95]}>
        <cylinderGeometry args={[0.5, 0.18, 0.08, 32]} />
        <meshStandardMaterial color="#ffb75f" roughness={0.48} emissive="#ff7a20" emissiveIntensity={0.42} />
      </mesh>
      {spotPositions.map((spot, index) => (
        <mesh key={index} position={[spot[0], 1.17 + spot[1] * 0.12, spot[2]]} scale={[1, 0.35, 1]}>
          <sphereGeometry args={[0.055 + index * 0.004, 10, 6]} />
          <meshBasicMaterial color="#ffe0b5" transparent opacity={0.58} />
        </mesh>
      ))}
      <pointLight color="#ff8c32" intensity={0.7 * glow} distance={2.6} position={[0, 0.78, 0]} />
    </group>
  );
}

function MushroomTrail() {
  const mushrooms = [
    [-3.6, 0.03, -1.4, 0.42, 0.4, 0.25],
    [3.8, 0.03, -2.2, 0.38, -0.35, 0.28],
    [-2.85, 0.02, -3.4, 0.36, 0.2, 0.22],
    [3.15, 0.04, -4.6, 0.48, -0.6, 0.3],
    [-5.5, 0.03, -5.8, 0.58, 0.1, 0.35],
    [5.85, 0.03, -6.9, 0.66, -0.8, 0.42],
    [-2.1, 0.02, -8.4, 0.3, 0.3, 0.24],
    [1.9, 0.03, -9.2, 0.34, -0.25, 0.28],
    [4.2, 0.02, -11.2, 0.52, -0.45, 0.4],
    [7.4, 0.02, -12.9, 0.78, -0.35, 0.65],
  ];

  return (
    <group>
      {mushrooms.map(([x, y, z, scale, rotation, glow], index) => (
        <Mushroom key={index} position={[x, y, z]} scale={scale} rotation={rotation} glow={glow} />
      ))}
    </group>
  );
}

function ForestGround() {
  const source = useTexture(FOREST_TEXTURE);
  const texture = useMemo(() => cloneTexture(source, { offset: 0.1 }), [source]);

  return (
    <mesh position={[0, -0.08, -4.1]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[34, 32]} />
      <meshBasicMaterial map={texture} transparent opacity={0.36} depthWrite={false} toneMapped={false} color="#c8ffe2" />
    </mesh>
  );
}

function PathGlow({ discovered }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: 0 },
    }),
    []
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uReveal.value = THREE.MathUtils.damp(uniforms.uReveal.value, discovered ? 1 : 0, 2.4, delta);
  });

  return (
    <mesh position={[0.8, 0.055, -5.2]} rotation-x={-Math.PI / 2} rotation-z={-0.08}>
      <planeGeometry args={[6.4, 23]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          uniform float uReveal;
          void main() {
            float center = 1.0 - smoothstep(0.04, 0.42, abs(vUv.x - 0.5));
            float longFade = smoothstep(0.02, 0.28, vUv.y) * smoothstep(1.0, 0.54, vUv.y);
            float shimmer = 0.78 + sin(vUv.y * 42.0 - uTime * 1.4) * 0.09;
            vec3 cool = vec3(0.28, 0.76, 0.66);
            vec3 warm = vec3(1.0, 0.46, 0.11);
            vec3 color = mix(cool, warm, smoothstep(0.35, 1.0, vUv.y));
            float alpha = center * longFade * shimmer * (0.08 + uReveal * 0.13);
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

function LightShafts() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMotion: { value: 0 } }), []);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uMotion.value = THREE.MathUtils.damp(uniforms.uMotion.value, window.__forestMotion || 0, 2.4, delta);
  });

  const beams = [
    [-4.8, 3.2, -12.5, -0.2, 4.8, 11.5, 0.052],
    [-1.4, 3.4, -14.2, 0.08, 3.2, 12.5, 0.058],
    [2.8, 3.0, -11.4, 0.16, 3.8, 10.6, 0.038],
    [6.4, 3.5, -15.6, -0.1, 4.2, 13.4, 0.032],
  ];

  return (
    <group>
      {beams.map(([x, y, z, ry, w, h, opacity], index) => (
        <mesh key={index} position={[x, y, z]} rotation-y={ry}>
          <planeGeometry args={[w, h]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={{ ...uniforms, uOpacity: { value: opacity } }}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              uniform float uTime;
              uniform float uOpacity;
              void main() {
                float core = 1.0 - smoothstep(0.08, 0.5, abs(vUv.x - 0.5));
                float height = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.28, vUv.y);
                float drift = 0.88 + sin(uTime * 0.28 + vUv.y * 8.0) * 0.08;
                vec3 color = vec3(0.95, 0.92, 0.68);
                gl_FragColor = vec4(color, core * height * drift * uOpacity);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

function MossGround() {
  const source = useTexture(FOREST_TEXTURE);
  const texture = useMemo(() => cloneTexture(source, { offset: 0.02, repeat: 1.08, wrapS: THREE.MirroredRepeatWrapping }), [source]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMap: { value: texture } }), [texture]);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <mesh position={[0, -1.55, 1.2]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[24, 24, 70, 70]} />
      <shaderMaterial
        uniforms={uniforms}
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          void main() {
            vUv = uv;
            vec3 p = position;
            float n = sin(p.x * 0.9 + uTime * 0.08) * sin(p.y * 0.7 - uTime * 0.06);
            p.z += n * 0.035;
            vHeight = n;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform sampler2D uMap;
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          void main() {
            vec2 p = vUv * 18.0;
            vec3 forest = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb;
            float fine = hash(floor(p * 3.0));
            float moss = sin(p.x * 1.4) * sin(p.y * 1.1) * 0.5 + 0.5;
            vec3 deep = vec3(0.01, 0.045, 0.028);
            vec3 mossGreen = vec3(0.065, 0.18, 0.055);
            vec3 wet = vec3(0.025, 0.085, 0.075);
            float streamMask = 1.0 - smoothstep(0.055, 0.16, abs(vUv.x - (0.48 + sin(vUv.y * 8.0) * 0.035)));
            vec3 color = mix(deep, mossGreen, moss * 0.85 + fine * 0.18);
            color = mix(color, forest, 0.42);
            color = mix(color, wet, 0.28 + streamMask * 0.35);
            float edgeDark = smoothstep(0.72, 0.98, length(vUv - 0.5));
            color *= 1.0 - edgeDark * 0.34;
            float softEdge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
            gl_FragColor = vec4(color, softEdge * 0.64);
          }
        `}
      />
    </mesh>
  );
}

function WaterStream() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const geometry = useMemo(() => {
    const segments = 90;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const v = i / segments;
      const z = THREE.MathUtils.lerp(9.5, -8.8, v);
      const x = -1.25 + Math.sin(v * Math.PI * 3.2) * 0.9 + v * 2.25;
      const width = THREE.MathUtils.lerp(1.25, 0.38, v) + Math.sin(v * Math.PI * 4.0) * 0.06;
      const nextV = Math.min(1, v + 1 / segments);
      const nextZ = THREE.MathUtils.lerp(9.5, -8.8, nextV);
      const nextX = -1.25 + Math.sin(nextV * Math.PI * 3.2) * 0.9 + nextV * 2.25;
      const tangent = new THREE.Vector2(nextX - x, nextZ - z).normalize();
      const normal = new THREE.Vector2(-tangent.y, tangent.x);
      positions.push(x + normal.x * width, -1.46, z + normal.y * width);
      positions.push(x - normal.x * width, -1.46, z - normal.y * width);
      uvs.push(0, v, 1, v);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const river = new THREE.BufferGeometry();
    river.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    river.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    river.setIndex(indices);
    river.computeVertexNormals();
    return river;
  }, []);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
        vertexShader={`
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.y += sin(vUv.y * 44.0 - uTime * 2.2) * 0.012;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          void main() {
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float ripples = sin(vUv.y * 72.0 - uTime * 3.4 + sin(vUv.x * 8.0) * 0.8) * 0.5 + 0.5;
            float small = sin((vUv.x + vUv.y) * 42.0 - uTime * 2.1) * 0.5 + 0.5;
            vec3 darkWater = vec3(0.018, 0.07, 0.075);
            vec3 sky = vec3(0.58, 0.82, 0.82);
            vec3 silver = vec3(0.9, 0.96, 0.9);
            vec3 color = mix(darkWater, sky, 0.42 + ripples * 0.28);
            color += silver * pow(small, 8.0) * 0.55;
            color += vec3(0.95, 0.48, 0.16) * smoothstep(0.92, 1.0, ripples) * 0.08;
            gl_FragColor = vec4(color, edge * 0.88);
          }
        `}
      />
    </mesh>
  );
}

function GroundMushroomGlow() {
  const points = useRef();
  const data = useMemo(() => {
    const count = 160;
    const positions = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = THREE.MathUtils.randFloat(-8.6, 8.5);
      const streamX = -1.25 + Math.sin(((9.5 - z) / 30) * Math.PI * 3.2) * 0.9 + ((9.5 - z) / 30) * 2.25;
      positions[i * 3] = streamX + side * THREE.MathUtils.randFloat(1.3, 5.8);
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(-1.36, -1.08);
      positions[i * 3 + 2] = z + THREE.MathUtils.randFloat(-0.6, 0.6);
      size[i] = THREE.MathUtils.randFloat(0.7, 2.2);
    }
    return { positions, size };
  }, []);

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[data.size, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float aSize;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (70.0 / -mv.z);
            vAlpha = 0.32;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float cap = smoothstep(0.5, 0.0, d);
            vec3 color = mix(vec3(1.0, 0.16, 0.05), vec3(1.0, 0.68, 0.14), gl_PointCoord.y);
            gl_FragColor = vec4(color, cap * vAlpha);
          }
        `}
      />
    </points>
  );
}

function AncientTrunks() {
  const group = useRef();
  const trunks = useMemo(
    () => [
      [-8.5, -4.6, 0.74, 9.8, 0.22],
      [8.9, -5.2, 0.64, 10.8, -0.18],
      [-12.5, -9.8, 1.05, 12.4, 0.12],
      [12.3, -10.7, 0.92, 12.8, -0.16],
      [-16.2, -2.2, 0.72, 10.6, -0.1],
      [15.4, 2.8, 0.78, 11.2, 0.08],
      [-6.2, 8.7, 0.7, 9.8, 0.14],
      [7.2, 8.2, 0.62, 9.2, -0.12],
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.006;
  });

  return (
    <group ref={group}>
      {trunks.map(([x, z, radius, height, tilt], index) => (
        <group key={index} position={[x, height / 2 - 0.18, z]} rotation-z={tilt}>
          <mesh>
            <cylinderGeometry args={[radius * 0.68, radius, height, 18]} />
            <meshStandardMaterial color="#0b1712" roughness={0.92} metalness={0} emissive="#06100c" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[radius * 0.45, -height * 0.41, radius * 0.2]} rotation-z={1.05}>
            <cylinderGeometry args={[radius * 0.12, radius * 0.18, radius * 2.8, 10]} />
            <meshStandardMaterial color="#102118" roughness={0.95} />
          </mesh>
          <mesh position={[-radius * 0.42, -height * 0.43, -radius * 0.14]} rotation-z={-1.02}>
            <cylinderGeometry args={[radius * 0.1, radius * 0.16, radius * 2.4, 10]} />
            <meshStandardMaterial color="#102118" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function GrassSilhouettes() {
  const blades = useMemo(() => {
    return Array.from({ length: 82 }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(4.5, 13.8);
      return {
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius - 1.5,
        height: THREE.MathUtils.randFloat(0.22, 0.78),
        lean: THREE.MathUtils.randFloat(-0.28, 0.28),
        opacity: THREE.MathUtils.randFloat(0.045, 0.12),
        key: index,
      };
    });
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <group>
      {blades.map((blade) => (
        <mesh key={blade.key} position={[blade.x, blade.height / 2 - 0.05, blade.z]} rotation-z={blade.lean}>
          <planeGeometry args={[0.045, blade.height]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            uniforms={{ ...uniforms, uOpacity: { value: blade.opacity } }}
            vertexShader={`
              varying vec2 vUv;
              uniform float uTime;
              uniform float uMotion;
              void main() {
                vUv = uv;
                vec3 p = position;
                float breeze = sin(uTime * 0.82 + position.y * 3.0 + position.x * 0.5) * 0.014;
                float wake = sin(uTime * 1.2 + position.y * 5.0) * 0.026 * uMotion;
                p.x += (breeze + wake) * uv.y;
                p.z += cos(uTime * 0.7 + position.y * 2.2) * 0.014 * uMotion * uv.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              uniform float uOpacity;
              void main() {
                float taper = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
                float fade = smoothstep(0.0, 0.18, vUv.y);
                vec3 color = vec3(0.025, 0.08, 0.045);
                gl_FragColor = vec4(color, taper * fade * uOpacity);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

function CanopyShadow() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <mesh position={[0, 9.4, -2]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[42, 42]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          float leaf(vec2 p) {
            return sin(p.x * 28.0 + uTime * 0.08) * sin(p.y * 21.0 - uTime * 0.06) * 0.5 + 0.5;
          }
          void main() {
            float r = length(vUv - 0.5);
            float canopy = smoothstep(0.18, 0.58, r);
            float broken = smoothstep(0.34, 0.82, leaf(vUv));
            vec3 color = vec3(0.02, 0.07, 0.055);
            gl_FragColor = vec4(color, canopy * broken * 0.32);
          }
        `}
      />
    </mesh>
  );
}

function ForegroundPlates() {
  const source = useTexture(FOREST_TEXTURE);
  const plates = useMemo(
    () => [
      { texture: cloneTexture(source, { offset: -0.05 }), position: [-7.1, 3.0, -3.3], rotation: [0.02, 0.58, 0.04], size: [7.8, 8.4], opacity: 0.15 },
      { texture: cloneTexture(source, { offset: 0.07 }), position: [7.2, 3.0, -3.7], rotation: [-0.02, -0.54, -0.03], size: [7.4, 8.1], opacity: 0.135 },
      { texture: cloneTexture(source, { offset: 0.14 }), position: [0.2, 6.6, -4.4], rotation: [0, 0.08, 0], size: [16, 6.2], opacity: 0.08 },
    ],
    [source]
  );

  return (
    <group>
      {plates.map((plate, index) => (
        <mesh key={index} position={plate.position} rotation={plate.rotation}>
          <planeGeometry args={plate.size} />
          <meshBasicMaterial
            map={plate.texture}
            transparent
            opacity={plate.opacity}
            depthWrite={false}
            toneMapped={false}
            color="#fff5de"
          />
        </mesh>
      ))}
    </group>
  );
}

function HangingVines() {
  const vines = useMemo(() => {
    return Array.from({ length: 18 }, (_, index) => {
      const x = THREE.MathUtils.mapLinear(index % 6, 0, 5, -7.5, 7.5) + Math.sin(index * 2.1) * 0.55;
      const z = -5 - Math.floor(index / 6) * 4.2 - Math.cos(index) * 0.6;
      const y = 5.7 + Math.sin(index) * 0.7;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, y + 2.1, z),
        new THREE.Vector3(x + Math.sin(index) * 0.35, y + 1.1, z + 0.18),
        new THREE.Vector3(x + Math.cos(index * 1.7) * 0.28, y - 0.4, z + 0.08),
      ]);
      return { curve, key: index };
    });
  }, []);

  return (
    <group>
      {vines.map(({ curve, key }) => (
        <mesh key={key}>
          <tubeGeometry args={[curve, 12, 0.018, 6, false]} />
          <meshStandardMaterial color="#14251a" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function ForestScene({ discovered, setDiscovered, entering, setEntering }) {
  return (
    <>
      <color attach="background" args={["#152312"]} />
      <fog attach="fog" args={["#24351a", 135, 255]} />
      <ambientLight intensity={0.24} color="#ffe6b0" />
      <directionalLight position={[-4, 8, 2]} intensity={0.62} color="#ffd98a" />
      <CameraRig discovered={discovered} setDiscovered={setDiscovered} entering={entering} setEntering={setEntering} />
      <ForestPanorama />
      <DepthVeils />
      <PathGlow discovered={discovered} />
      <LightShafts />
      <SporeField discovered={discovered} />
      <GrassSilhouettes />
      <BlueEntranceMushroom discovered={discovered} entering={entering} onEnter={() => setEntering(true)} />
      <Environment preset="forest" environmentIntensity={0.27} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.68} intensity={0.12} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.04} />
      </EffectComposer>
    </>
  );
}

function WorksPortal({ active }) {
  const [openingWork, setOpeningWork] = useState(null);
  const openingTimer = useRef(null);
  const works = [
    {
      number: "01",
      title: ["SMS Verification", "System"],
      subtitle: "短信验证码系统",
      className: "node-blue",
      style: { "--x": "-28.8%", "--y": "50%" },
      href: "/prototypes/verification_code_login/index.html",
    },
    {
      number: "02",
      title: ["AI Short Drama", "Platform"],
      subtitle: "AI短剧创作平台",
      className: "node-gold",
      style: { "--x": "0%", "--y": "39%" },
      href: "https://interactiveshortdrama.vercel.app",
    },
    {
      number: "03",
      title: ["Cosmos Particle", "Exploration"],
      subtitle: "奇点AI 助手",
      className: "node-violet",
      style: { "--x": "28.8%", "--y": "50%" },
      href: "https://singularity-engine-three.vercel.app",
    },
  ];
  const leaves = useMemo(() => Array.from({ length: 132 }, (_, index) => {
    const angle = index * 2.399963 + (index % 7) * 0.08;
    const radius = 7 + (index % 16) * 2.05;
    return {
      cx: 50 + Math.cos(angle) * radius * 1.18,
      cy: 29 + Math.sin(angle) * radius * 0.68,
      r: 0.82 + (index % 5) * 0.22,
      delay: `${-(index % 17) * 0.18}s`,
    };
  }), []);

  React.useEffect(() => () => window.clearTimeout(openingTimer.current), []);

  function openWork(event, work) {
    if (!work.href) return;
    if (!["01", "02", "03"].includes(work.number)) return;
    event.preventDefault();
    if (openingWork) return;
    setOpeningWork(work.number);
    openingTimer.current = window.setTimeout(() => {
      window.location.href = work.href;
    }, 1700);
  }

  return (
    <section className={`works-portal ${active ? "is-active" : ""} ${openingWork === "01" ? "is-opening-blue" : ""} ${openingWork === "02" ? "is-opening-gold" : ""} ${openingWork === "03" ? "is-opening-violet" : ""}`} aria-hidden={!active}>
      <div className="works-card">
        <a
          className="works-back"
          href="/index.html"
          aria-label="返回森林蘑菇界面"
          onClick={(event) => {
            event.preventDefault();
            window.location.href = "/index.html";
          }}
        >
          返回森林
        </a>
        <div className="works-bg" />
        <div className="works-rays" />
        <div className="works-fireflies" aria-hidden="true" />
        {openingWork === "01" && (
          <div className="fruit-world-release" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
        {openingWork === "02" && (
          <div className="life-world-release" aria-hidden="true">
            <span />
            <span />
            <span />
            <b>SCENE</b>
            <b>DIALOGUE</b>
            <b>角色</b>
            <b>分镜</b>
            <i />
            <i />
          </div>
        )}
        {openingWork === "03" && (
          <div className="cosmos-world-release" aria-hidden="true">
            <span />
            <span />
            <span />
            <b />
            <b />
            <b />
            <i />
            <i />
            <i />
          </div>
        )}
        <div className="works-tree" aria-hidden="true">
          <svg className="works-tree-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="worksTrunk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b4a456" />
                <stop offset="48%" stopColor="#33401f" />
                <stop offset="100%" stopColor="#0d1612" />
              </linearGradient>
              <filter id="treeSoftGlow">
                <feGaussianBlur stdDeviation="1.35" />
              </filter>
            </defs>
            <path className="tree-glow" d="M50 7 C34 7 21 16 17 31 C11 48 23 62 37 64 C43 73 58 74 65 64 C80 63 92 50 87 33 C83 17 67 7 50 7 Z" />
            <path className="tree-trunk-main" d="M48 94 C47 77 48 61 50 47 C51 35 49 26 45 16 C51 26 55 35 54 48 C58 62 56 78 53 94 Z" />
            <path className="tree-branch branch-left" d="M50 49 C38 43 29 36 16 35" />
            <path className="tree-branch branch-right" d="M51 47 C63 39 73 33 87 31" />
            <path className="tree-branch branch-up-left" d="M50 42 C43 32 36 24 25 18" />
            <path className="tree-branch branch-up-right" d="M52 42 C61 30 68 21 79 15" />
            <path className="tree-branch branch-low-left" d="M50 57 C39 56 30 58 20 63" />
            <path className="tree-branch branch-low-right" d="M52 57 C64 55 74 57 84 62" />
            <g className="tree-leaves">
              {leaves.map((leaf, index) => (
                <circle key={index} cx={leaf.cx} cy={leaf.cy} r={leaf.r} style={{ animationDelay: leaf.delay }} />
              ))}
            </g>
            <circle className="tree-core-light" cx="50" cy="49" r="3.8" filter="url(#treeSoftGlow)" />
          </svg>
        </div>
        <div className="works-ground" />
        {works.map((work) => (
          <article key={work.number} className={`work-node ${work.className} ${openingWork === work.number ? "is-opening" : ""}`} style={work.style}>
            <div className="work-copy">
              <strong>{work.number}</strong>
              {work.title.map((line) => (
                <span key={line}>{line}</span>
              ))}
              <small>{work.subtitle}</small>
            </div>
            <div className="hanging-thread" />
            {work.href ? (
              <a className="work-orb" href={work.href} aria-label={`${work.number} ${work.title.join(" ")}`} onClick={(event) => openWork(event, work)}>
                <i />
                <span className="fruit-crack" aria-hidden="true" />
                <span className="fruit-beam" aria-hidden="true" />
                <span className="fruit-vortex" aria-hidden="true" />
              </a>
            ) : (
              <button className="work-orb" type="button" aria-label={`${work.number} ${work.title.join(" ")}`}>
                <i />
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function CinematicTransition({ active }) {
  const motes = React.useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        style: {
          "--x": `${12 + ((index * 19) % 78)}%`,
          "--y": `${14 + ((index * 31) % 72)}%`,
          "--size": `${4 + (index % 5) * 1.2}px`,
          "--scale": `${0.75 + (index % 5) * 0.16}`,
          "--d": `${-(index % 9) * 0.19}s`,
          "--a": `${index * 23}deg`,
        },
      })),
    []
  );
  const shards = React.useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        style: {
          "--x": `${8 + ((index * 37) % 84)}%`,
          "--y": `${20 + ((index * 17) % 62)}%`,
          "--r": `${index * 29}deg`,
          "--d": `${index * 0.045}s`,
        },
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="cinematic-transition" aria-hidden="true">
      <div className="transition-stage transition-wake">
        <div className="wake-bloom" />
        <div className="wake-pulse" />
      </div>
      <div className="transition-stage transition-vortex">
        <span />
        <span />
        <span />
      </div>
      <div className="transition-stage transition-dissolve">
        {shards.map((shard, index) => (
          <i key={index} style={shard.style} />
        ))}
      </div>
      <div className="transition-stage transition-between">
        <div className="void-bands" />
        <div className="guide-spore" />
        <div className="spore-halo" />
      </div>
      <div className="transition-stage transition-rebuild">
        <div className="tree-silhouette" />
        <div className="rebuild-light" />
      </div>
      <div className="transition-motes">
        {motes.map((mote, index) => (
          <i key={index} style={mote.style} />
        ))}
      </div>
    </div>
  );
}

function IntroFlight() {
  const [visible, setVisible] = React.useState(true);
  const dust = React.useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => {
        const dx = (index % 2 ? -1 : 1) * (18 + (index % 6) * 8);
        const dy = -16 + (index % 7) * 6;
        return {
          style: {
            "--x": `${8 + ((index * 23) % 84)}%`,
            "--y": `${10 + ((index * 37) % 78)}%`,
            "--s": `${2 + (index % 4)}px`,
            "--mx": `${dx * 0.42}vw`,
            "--my": `${dy * 0.42}vh`,
            "--dx": `${dx}vw`,
            "--dy": `${dy}vh`,
            "--d": `${-(index % 8) * 0.28}s`,
            "--dur": `${1.9 + (index % 6) * 0.18}s`,
          },
        };
      }),
    []
  );
  const wind = React.useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        style: {
          "--x": `${-22 + (index % 5) * 28}%`,
          "--y": `${12 + ((index * 19) % 76)}%`,
          "--r": `${-14 + (index % 7) * 5}deg`,
          "--d": `${0.25 + index * 0.18}s`,
          "--dur": `${1.6 + (index % 4) * 0.18}s`,
        },
      })),
    []
  );
  const rings = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => ({
        style: {
          "--d": `${index * 0.55}s`,
          "--scale": `${0.42 + index * 0.12}`,
          "--tilt": `${-3 + index * 0.85}deg`,
        },
      })),
    []
  );
  const foreground = React.useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => {
        const leftSide = index % 2 === 0;
        const tx = leftSide ? -28 - (index % 4) * 7 : 28 + (index % 4) * 7;
        const ty = 22 + (index % 5) * 9;
        return {
          style: {
            "--x": leftSide ? `${-10 + (index % 4) * 4}%` : `${86 + (index % 4) * 3}%`,
            "--y": `${12 + ((index * 13) % 78)}%`,
            "--w": `${72 + (index % 5) * 18}px`,
            "--h": `${140 + (index % 6) * 34}px`,
            "--mx": `${tx * 0.38}vw`,
            "--my": `${ty * 0.38}vh`,
            "--tx": `${tx}vw`,
            "--ty": `${ty}vh`,
            "--r": `${leftSide ? -8 - (index % 5) * 3 : 8 + (index % 5) * 3}deg`,
            "--d": `${-(index % 6) * 0.42}s`,
            "--dur": `${2.15 + (index % 5) * 0.18}s`,
          },
        };
      }),
    []
  );
  const leaves = React.useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        style: {
          "--x": `${14 + ((index * 17) % 74)}%`,
          "--y": `${18 + ((index * 29) % 62)}%`,
          "--r": `${-38 + index * 13}deg`,
          "--d": `${3.95 + index * 0.09}s`,
        },
      })),
    []
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 5600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="entry-flight" aria-hidden="true">
      <div className="entry-flight-scene" />
      <div className="entry-flight-horizon" />
      <div className="entry-flight-tunnel" />
      <div className="entry-flight-rings">
        {rings.map((ring, index) => (
          <span key={index} style={ring.style} />
        ))}
      </div>
      <div className="entry-flight-foreground">
        {foreground.map((item, index) => (
          <span key={index} style={item.style} />
        ))}
      </div>
      <div className="entry-flight-dust">
        {dust.map((mote, index) => (
          <i key={index} style={mote.style} />
        ))}
      </div>
      <div className="entry-flight-wind">
        {wind.map((line, index) => (
          <i key={index} style={line.style} />
        ))}
      </div>
      <div className="entry-flight-leaves">
        {leaves.map((leaf, index) => (
          <i key={index} style={leaf.style} />
        ))}
      </div>
    </div>
  );
}

function CinematicForestExplorer({ disabled, entering, introStage, onEnter }) {
  const explorerRef = useRef(null);
  const targetLook = useRef(0);
  const currentLook = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const leftDiscoveredRef = useRef(false);
  const [leftDiscovered, setLeftDiscovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const motes = useMemo(
    () =>
      Array.from({ length: 32 }, (_, index) => ({
        style: {
          "--x": `${4 + ((index * 19) % 92)}%`,
          "--y": `${8 + ((index * 31) % 84)}%`,
          "--s": `${1.5 + (index % 4) * 0.6}px`,
          "--d": `${-(index % 11) * 0.65}s`,
          "--dur": `${7 + (index % 7) * 1.25}s`,
        },
      })),
    []
  );
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        style: {
          "--x": `${8 + ((index * 23) % 88)}%`,
          "--y": `${12 + ((index * 17) % 66)}%`,
          "--r": `${-28 + index * 11}deg`,
          "--d": `${-(index % 6) * 1.1}s`,
          "--dur": `${12 + (index % 5) * 1.7}s`,
        },
      })),
    []
  );

  React.useEffect(() => {
    let frameId = 0;
    const tick = (time) => {
      const node = explorerRef.current;
      if (node) {
        const follow = dragging.current ? 0.14 : 0.09;
        currentLook.current += (targetLook.current - currentLook.current) * follow;
        const breath = Math.sin(time * 0.00072);
        const sway = Math.sin(time * 0.00043);
        const look = currentLook.current;
        node.style.setProperty("--look", look.toFixed(4));
        node.style.setProperty("--scene-x", `${(look * 8.8 + sway * 0.18).toFixed(3)}vw`);
        node.style.setProperty("--near-x", `${(look * 17.4 + sway * 0.38).toFixed(3)}vw`);
        node.style.setProperty("--far-x", `${(look * 4.8 + sway * 0.1).toFixed(3)}vw`);
        node.style.setProperty("--head-tilt", `${(-look * 0.62 + breath * 0.055).toFixed(3)}deg`);
        node.style.setProperty("--breath-y", `${(breath * 0.26).toFixed(3)}vh`);
        node.style.setProperty("--breath-scale", (1.018 + breath * 0.002).toFixed(4));
        if (look > 0.48 && !leftDiscoveredRef.current) {
          leftDiscoveredRef.current = true;
          setLeftDiscovered(true);
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function clampLook(value) {
    return Math.min(1.18, Math.max(-0.56, value));
  }

  function handlePointerDown(event) {
    if (disabled) return;
    dragging.current = true;
    lastX.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (disabled) return;
    if (!dragging.current) {
      const width = Math.max(1, window.innerWidth);
      const softLook = ((event.clientX / width) - 0.5) * 0.12;
      targetLook.current += (softLook - targetLook.current) * 0.018;
      return;
    }
    const deltaX = event.clientX - lastX.current;
    lastX.current = event.clientX;
    targetLook.current = clampLook(targetLook.current + deltaX / Math.max(360, window.innerWidth) * 1.08);
  }

  function handlePointerUp(event) {
    dragging.current = false;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div
      ref={explorerRef}
      className={`cinematic-forest-explorer is-intro-${introStage} ${leftDiscovered ? "is-left-discovered" : ""} ${isDragging ? "is-dragging" : ""} ${entering ? "is-entering" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="forest-depth-layer forest-depth-back" aria-hidden="true" />
      <div className="forest-depth-layer forest-depth-main" aria-hidden="true" />
      <div className="forest-depth-layer forest-depth-left" aria-hidden="true" />
      <div className="forest-depth-layer forest-depth-right" aria-hidden="true" />
      <div className="forest-wind-lines" aria-hidden="true" />
      <div className="forest-motes" aria-hidden="true">
        {motes.map((mote, index) => (
          <i key={index} style={mote.style} />
        ))}
      </div>
      <div className="forest-drift-leaves" aria-hidden="true">
        {leaves.map((leaf, index) => (
          <i key={index} style={leaf.style} />
        ))}
      </div>
      <div className="forest-discovery-hint" aria-hidden="true">
        <span className="forest-hint-glow" />
        <span className="forest-hint-current" />
        <p>风里好像有什么在发光</p>
      </div>
      <button
        className="blue-mushroom-gate"
        type="button"
        aria-label="进入作品集"
        disabled={disabled || !leftDiscovered}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onEnter();
        }}
      >
        <span className="blue-mushroom-aura" />
        <span className="blue-mushroom-cap" />
        <span className="blue-mushroom-stem" />
        <span className="blue-mushroom-core" />
        <span className="blue-mushroom-particles" />
      </button>
    </div>
  );
}

function IntroVideo({ active, ending, onDone }) {
  if (!active) return null;

  return (
    <div className={`intro-video-layer ${ending ? "is-ending" : ""}`} aria-hidden="true">
      <video
        className="intro-video"
        src={INTRO_VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={onDone}
        onError={onDone}
      />
    </div>
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const captureMode = params.has("capture");
  const debugWorks = params.has("debugWorks");
  const debugTransition = params.has("debugTransition");
  const shouldPlayIntro = !captureMode && !debugWorks && !debugTransition;
  const [discovered, setDiscovered] = useState(false);
  const [entering, setEntering] = useState(debugWorks || debugTransition);
  const [showWorks, setShowWorks] = useState(debugWorks);
  const [transitionDone, setTransitionDone] = useState(debugWorks);
  const [introVisible, setIntroVisible] = useState(shouldPlayIntro);
  const [introEnding, setIntroEnding] = useState(false);
  const [introStage, setIntroStage] = useState(shouldPlayIntro ? "dim" : "ready");
  const introDoneRef = useRef(!shouldPlayIntro);
  const introTimersRef = useRef([]);

  React.useEffect(() => {
    if (!entering || showWorks) return undefined;
    const timer = window.setTimeout(() => setShowWorks(true), 1600);
    return () => window.clearTimeout(timer);
  }, [entering, showWorks]);

  React.useEffect(() => {
    if (!entering || debugWorks || showWorks) return undefined;
    setTransitionDone(false);
    const timer = window.setTimeout(() => setTransitionDone(true), 2400);
    return () => window.clearTimeout(timer);
  }, [debugWorks, entering, showWorks]);

  React.useEffect(
    () => () => {
      introTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  React.useEffect(() => {
    const image = new Image();
    image.src = "/assets/works-tree-forest.png";
    image.decode?.().catch(() => {});
  }, []);

  const showIntroFlight = false;

  const finishIntro = React.useCallback(() => {
    if (introDoneRef.current) return;
    introDoneRef.current = true;
    setIntroEnding(true);
    setIntroStage("revealing");
    const readyTimer = window.setTimeout(() => setIntroStage("ready"), 1750);
    const hideTimer = window.setTimeout(() => setIntroVisible(false), 1500);
    introTimersRef.current.push(readyTimer, hideTimer);
  }, []);

  return (
    <main className={`app-shell is-cinematic-forest ${showWorks ? "has-works" : ""} ${showIntroFlight ? "has-intro" : ""}`}>
      {!debugWorks && (
        <>
          <CinematicForestExplorer
            disabled={entering || showWorks || introStage !== "ready"}
            entering={entering}
            introStage={introStage}
            onEnter={() => {
              setDiscovered(true);
              setEntering(true);
            }}
          />
          <Canvas
            camera={{ fov: 54, near: 0.1, far: 130, position: [0, 1.62, 0] }}
            dpr={[1.25, 2.25]}
            frameloop={showWorks ? "never" : "always"}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <Suspense fallback={null}>
              <ForestScene discovered={discovered} setDiscovered={setDiscovered} entering={entering} setEntering={setEntering} />
            </Suspense>
          </Canvas>
          <div className={`quiet-overlay ${discovered ? "is-discovered" : ""} ${entering ? "is-entered" : ""}`}>
            <div className="brand-pill"><span />Dream Grove</div>
            <p className="ambient-line">{discovered ? "Something glows deeper in the forest" : "Digital forest space"}</p>
          </div>
        </>
      )}
      <WorksPortal active={showWorks} />
      <CinematicTransition active={entering && !showWorks && !transitionDone && !debugWorks} />
      <IntroVideo active={introVisible} ending={introEnding} onDone={finishIntro} />
      {showIntroFlight && <IntroFlight />}
    </main>
  );
}

const rootNode = document.getElementById("root");
const root = rootNode.__dreamGroveRoot || createRoot(rootNode);
rootNode.__dreamGroveRoot = root;
root.render(<App />);
