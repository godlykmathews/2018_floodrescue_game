import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';

/** Floodwater stays physically simple: waves, current and sky sheen are GPU-only. */
export class Water {
  readonly mesh: Mesh;
  private readonly time = { value: 0 };

  constructor() {
    const material = new MeshStandardMaterial({ color: 0x62573c, roughness: 0.4, metalness: 0.04 });
    material.onBeforeCompile = shader => {
      shader.uniforms.uFloodTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uFloodTime;
          varying vec3 vFloodPosition;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 p = transformed.xz;
          transformed.y += sin(p.x * 0.55 + p.y * 0.31 + uFloodTime * 1.2) * 0.024
            + sin(p.y * 0.91 - p.x * 0.18 - uFloodTime * 0.9) * 0.016
            + sin(p.x * 1.7 + p.y * 1.9 + uFloodTime * 1.7) * 0.009;
          vFloodPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uFloodTime;
          varying vec3 vFloodPosition;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 p = vFloodPosition.xz;
          float swellA = cos(p.x * 0.55 + p.y * 0.31 + uFloodTime * 1.2) * 0.024;
          float swellB = cos(p.y * 0.91 - p.x * 0.18 - uFloodTime * 0.9) * 0.016;
          float swellC = cos(p.x * 1.7 + p.y * 1.9 + uFloodTime * 1.7) * 0.009;
          // Two scales of domain warping break the long straight wave bands.
          vec2 rippleDomain = p + vec2(
            sin(p.y * 0.83 + p.x * 0.32 + uFloodTime * 0.2),
            sin(p.x * 0.71 - p.y * 0.24 - uFloodTime * 0.17)) * 0.65
            + vec2(sin(p.y * 1.91 - p.x * 0.76), cos(p.x * 1.37 + p.y * 0.48)) * 0.17;
          float rippleA = cos(rippleDomain.x * 4.8 + rippleDomain.y * 3.3 - uFloodTime * 2.3) * 0.0096;
          float rippleB = cos(rippleDomain.x * 8.3 - rippleDomain.y * 6.1 + uFloodTime * 4.1
            + sin(rippleDomain.x * 0.8 + rippleDomain.y * 0.9)) * 0.0042;
          float rippleC = sin(rippleDomain.x * 2.7 - rippleDomain.y * 9.2 - uFloodTime * 3.3) * 0.002;
          // Fade sub-pixel detail in the distance to avoid glitter and aliasing.
          float detailFade = 1.0 - smoothstep(28.0, 100.0, length(vViewPosition));
          vec2 slope = vec2(0.55, 0.31) * swellA + vec2(-0.18, 0.91) * swellB
            + vec2(1.7, 1.9) * swellC
            + (vec2(4.8, 3.3) * rippleA + vec2(8.3, -6.1) * rippleB + vec2(2.7, -9.2) * rippleC) * detailFade;
          normal = normalize(mat3(viewMatrix) * normalize(vec3(-slope.x, 1.0, -slope.y)));
          float currentBands = sin(p.x * 0.32 + p.y * 0.6 - uFloodTime * 0.23
            + sin(p.x * 0.19 + p.y * 0.17));
          diffuseColor.rgb *= 0.97 + currentBands * 0.025;`)
        .replace('#include <opaque_fragment>', `
          // Analytic overcast-sky reflection. No reflection camera or render target.
          vec3 eyeDirection = normalize(vViewPosition);
          float fresnel = pow(1.0 - max(dot(normal, eyeDirection), 0.0), 3.0);
          float skyVariation = 0.96 + 0.04 * sin(p.x * 0.09 + p.y * 0.12 + uFloodTime * 0.08);
          vec3 cloudReflection = vec3(0.30, 0.37, 0.36) * skyVariation;
          outgoingLight = mix(outgoingLight, cloudReflection, 0.07 + fresnel * 0.46);
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'flood-water-v2';
    // Baking orientation makes the shader's wave and normal math use world X/Z.
    const geometry = new PlaneGeometry(260, 260, 160, 160);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
  }

  update(time: number) { this.time.value = time; }
}
