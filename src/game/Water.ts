import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';

// Metres and seconds. The same waves drive the shader and floating visual props.
const SWELLS = [
  { x: 0.28, z: 0.16, speed: 0.92, phase: 0, height: 0.10 },
  { x: -0.15, z: 0.47, speed: -0.73, phase: 1.2, height: 0.055 },
  { x: 0.83, z: 0.61, speed: 1.21, phase: 2.1, height: 0.025 },
] as const;

/** Visual waterline only: rescue checks and arcade boat physics stay on flat X/Z. */
export function sampleFloodHeight(x: number, z: number, time: number): number {
  let height = 0;
  for (const wave of SWELLS) {
    height += Math.sin(x * wave.x + z * wave.z + time * wave.speed + wave.phase) * wave.height;
  }
  return height;
}

const float = (value: number) => Number.isInteger(value) ? `${value}.0` : String(value);
const phase = (wave: typeof SWELLS[number]) =>
  `(p.x * ${float(wave.x)} + p.y * ${float(wave.z)} + uFloodTime * ${float(wave.speed)} + ${float(wave.phase)})`;
const displacement = SWELLS.map(wave => `sin${phase(wave)} * ${float(wave.height)}`).join(' + ');
const slope = SWELLS.map(wave =>
  `vec2(${float(wave.x)}, ${float(wave.z)}) * cos${phase(wave)} * ${float(wave.height)}`).join(' + ');

/** Floodwater stays inexpensive: one surface, analytic normals and a sky sheen. */
export class Water {
  readonly mesh: Mesh;
  private readonly time = { value: 0 };

  constructor() {
    const material = new MeshStandardMaterial({ color: 0x62573c, roughness: 0.43, metalness: 0.04 });
    material.onBeforeCompile = shader => {
      shader.uniforms.uFloodTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uFloodTime;
          varying vec3 vFloodPosition;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 p = transformed.xz;
          transformed.y += ${displacement};
          vFloodPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uFloodTime;
          varying vec3 vFloodPosition;
          float floodHash(vec2 p) {
            vec3 q = fract(vec3(p.xyx) * 0.1031);
            q += dot(q, q.yzx + 33.33);
            return fract((q.x + q.y) * q.z);
          }
          // Smoothed value noise plus its analytic gradient. Irregular short
          // ripples avoid the corrugated-sheet look of repeated sine stripes.
          vec3 floodNoise(vec2 p) {
            vec2 cell = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            vec2 du = 6.0 * f * (1.0 - f);
            float a = floodHash(cell), b = floodHash(cell + vec2(1.0, 0.0));
            float c = floodHash(cell + vec2(0.0, 1.0)), d = floodHash(cell + vec2(1.0, 1.0));
            float crossTerm = a - b - c + d;
            return vec3(a + (b - a) * u.x + (c - a) * u.y + crossTerm * u.x * u.y,
              du * (vec2(b - a, c - a) + crossTerm * u.yx));
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 p = vFloodPosition.xz;
          vec3 eddyA = floodNoise(p * 0.17 + vec2(uFloodTime * 0.035, uFloodTime * 0.021));
          vec3 eddyB = floodNoise(p * 0.19 + vec2(8.0 - uFloodTime * 0.018, -5.0 - uFloodTime * 0.026));
          vec2 rippleDomain = p + vec2(eddyA.x, eddyB.x) * 2.6;
          vec3 rippleA = floodNoise(rippleDomain * vec2(1.3, 2.3) + vec2(uFloodTime * 0.08, uFloodTime * 0.19));
          mat2 rippleRotation = mat2(0.78, -0.63, 0.63, 0.78);
          vec3 rippleB = floodNoise(rippleRotation * rippleDomain * 4.0 - vec2(uFloodTime * 0.27, uFloodTime * 0.16));
          // Fade sub-pixel detail in the distance to avoid glitter and aliasing.
          float detailFade = 1.0 - smoothstep(28.0, 100.0, length(vViewPosition));
          vec2 slope = ${slope}
            + (rippleA.yz * vec2(1.3, 2.3) * 0.019
              + transpose(rippleRotation) * rippleB.yz * 0.028) * detailFade;
          normal = normalize(mat3(viewMatrix) * normalize(vec3(-slope.x, 1.0, -slope.y)));
          float currentBands = sin(p.x * 0.32 + p.y * 0.6 - uFloodTime * 0.23
            + sin(p.x * 0.19 + p.y * 0.17));
          diffuseColor.rgb *= 0.97 + currentBands * 0.025;
          // Sparse, broken foam follows broad crests; no continuous white stripes.
          float crest = sin${phase(SWELLS[0])} * 0.64 + sin${phase(SWELLS[1])} * 0.36;
          float foamPatch = smoothstep(0.42, 0.8, rippleA.x) * smoothstep(0.3, 0.72, eddyB.x);
          float foam = smoothstep(0.55, 0.94, crest) * foamPatch * detailFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.31, 0.29, 0.22), foam * 0.3);`)
        .replace('#include <opaque_fragment>', `
          // Analytic overcast-sky reflection. No reflection camera or render target.
          vec3 eyeDirection = normalize(vViewPosition);
          float fresnel = pow(1.0 - max(dot(normal, eyeDirection), 0.0), 3.0);
          float skyVariation = 0.96 + 0.04 * sin(p.x * 0.09 + p.y * 0.12 + uFloodTime * 0.08);
          vec3 cloudReflection = vec3(0.30, 0.37, 0.36) * skyVariation;
          outgoingLight = mix(outgoingLight, cloudReflection, 0.07 + fresnel * 0.46);
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'flood-water-v4';
    // Baking orientation makes the shader's wave and normal math use world X/Z.
    const geometry = new PlaneGeometry(300, 300, 180, 180);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
  }

  update(time: number) { this.time.value = time; }
}
