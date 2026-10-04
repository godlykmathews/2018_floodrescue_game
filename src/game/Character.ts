import {
  AnimationMixer, Bone, BoxGeometry, BufferAttribute, Color, Float32BufferAttribute, Group, MathUtils,
  Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector3,
} from 'three';
import { AssetLoader } from '../utils/AssetLoader';

interface PoseMesh {
  mesh: Mesh;
  standing: Float32Array;
  seated: Float32Array;
  clinging: Float32Array;
  standingNormals: Float32Array;
  seatedNormals: Float32Array;
  clingingNormals: Float32Array;
}
export type CharacterModel = 'farmer' | 'woman' | 'sitting-man' | 'mother-child';
export interface CharacterOptions { variant?: number; seated?: boolean; model?: CharacterModel }

const characterAssets = {
  farmer: new URL('../../models/low_poly_farmer_man.glb', import.meta.url).href,
  woman: '/models/woman-rescue.glb',
  'sitting-man': '/models/boat-driver.glb',
  'mother-child': '/models/mother-child-camp.glb',
};

/** Cached assets, independent poses. Standing pivot is feet; seated pivot is hips. */
export class Character {
  readonly root = new Group();
  private readonly poses: PoseMesh[] = [];
  private mixer?: AnimationMixer;
  private seatedAmount = -1;
  private clingingAmount = 0;
  private modelScale = 1;
  private rig?: Group;
  private hips?: Object3D;
  private readonly hipPosition = new Vector3();

  async load(loader: AssetLoader, options: CharacterOptions = {}) {
    const variant = options.variant ?? 0;
    const model = options.model ?? 'farmer';
    const { object, animations, fallback } = await loader.loadModel({
      path: characterAssets[model], size: 1.7, sizeAxis: 'y', rotationY: Math.PI,
      fallback: () => this.fallback(),
    });
    object.updateMatrixWorld(true);
    this.modelScale = [1, 0.96, 1.025, 0.99][variant % 4];
    this.resetScale();

    // Keep the supplied sitting model's skeleton and authored idle intact. The
    // loader already uses SkeletonUtils.clone, so each rig owns its bone state.
    let skinned = false;
    object.traverse(node => {
      if ('isSkinnedMesh' in node && node.isSkinnedMesh) skinned = true;
      if (node instanceof Bone && /Hips/i.test(node.name)) this.hips = node;
    });
    if (skinned) {
      this.rig = object;
      this.root.add(object);
      const idle = animations.find(clip => /sit|idle/i.test(clip.name)) ?? animations[0];
      if (idle) {
        this.mixer = new AnimationMixer(object);
        this.mixer.clipAction(idle).play();
        this.mixer.update(0.01);
      }
      this.seatedAmount = options.seated ? 1 : 0;
      this.anchorRig();
      return;
    }

    // The scanned woman and farmer have no skeleton. Bake only these static
    // meshes; never flatten a rig or mutate the cached source geometry.
    const meshes: Mesh[] = [];
    object.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
    const inverse = new Matrix4().copy(object.matrixWorld).invert();
    const hip = model === 'woman' && !fallback ? 0.89 : 0.84;
    const knee = model === 'woman' && !fallback ? 0.45 : 0.42;
    for (const source of meshes) {
      const geometry = source.geometry.clone();
      // Scanned assets can store quantized integer attributes. Convert before
      // baking transforms, otherwise small metre-space coordinates get truncated.
      for (const name of ['position', 'normal']) {
        const attribute = geometry.getAttribute(name);
        if (!attribute) continue;
        const values = new Float32Array(attribute.count * 3);
        for (let i = 0; i < attribute.count; i++) {
          values[i * 3] = attribute.getX(i);
          values[i * 3 + 1] = attribute.getY(i);
          values[i * 3 + 2] = attribute.getZ(i);
        }
        geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
      }
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, source.matrixWorld));
      const materials = Array.isArray(source.material) ? source.material : [source.material];
      const ownMaterials = materials.map(material => {
        const copy = material.clone();
        if (copy instanceof MeshStandardMaterial && /Tshirt/i.test(source.name)) {
          copy.color.multiply(new Color([0xe5ae69, 0xddd4b7, 0x8eaea5, 0xd7a79a][variant % 4]));
        }
        return copy;
      });
      const mesh = new Mesh(geometry, Array.isArray(source.material) ? ownMaterials : ownMaterials[0]);
      mesh.name = source.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      const positions = geometry.getAttribute('position') as BufferAttribute;
      const standing = new Float32Array(positions.array);
      const seated = new Float32Array(standing);
      const clinging = new Float32Array(standing);
      const bend = 1.43;
      const farmerArms = /Skin/i.test(source.name) ? this.farmerArmVertices(mesh) : null;
      const legMesh = model === 'woman' || /BodySuit|Shoes|fallback-legs/i.test(source.name);
      const armMesh = model === 'woman' || /Skin|Tshirt/i.test(source.name);
      for (let i = 0; i < standing.length; i += 3) {
        const x = standing[i];
        const y = standing[i + 1];
        const z = standing[i + 2];
        // Spatial falloff follows the arms of the inspected static scans. It
        // fades at the shoulders and excludes trousers and the central torso.
        const arm = farmerArms ? farmerArms[i / 3] : armMesh
          ? MathUtils.smoothstep(Math.abs(x), 0.125, 0.19)
            * MathUtils.smoothstep(y, 0.6, 0.68) * (1 - MathUtils.smoothstep(y, 1.35, 1.47)) : 0;
        const shoulderY = 1.4;
        const reachY = shoulderY + (y - shoulderY) * Math.cos(1.3) - z * Math.sin(1.3);
        const reachZ = ((y - shoulderY) * Math.sin(1.3) + z * Math.cos(1.3)) * 0.72;
        clinging[i + 1] = MathUtils.lerp(y, reachY, arm);
        clinging[i + 2] = MathUtils.lerp(z, reachZ, arm);
        // A small forward lean makes the grip read against the floating log.
        const lean = MathUtils.smoothstep(y, 0.85, 1.5) * 0.07;
        clinging[i + 2] -= lean;
        seated[i + 1] = y - hip;
        if (legMesh && y < hip) {
          const angle = bend * MathUtils.smoothstep(hip - y, 0, 0.12);
          const thighY = (y - hip) * Math.cos(angle) - z * Math.sin(angle);
          const thighZ = (y - hip) * Math.sin(angle) + z * Math.cos(angle);
          const shinY = y - knee + (knee - hip) * Math.cos(bend);
          const shinZ = (knee - hip) * Math.sin(bend) + z;
          const thighBlend = MathUtils.smoothstep(y, knee - 0.045, knee + 0.045);
          seated[i + 1] = MathUtils.lerp(shinY, thighY, thighBlend);
          seated[i + 2] = MathUtils.lerp(shinZ, thighZ, thighBlend);
        }
        if (model === 'woman' && arm > 0) {
          // Hands rest on the thighs instead of being folded as trouser legs.
          seated[i + 1] = MathUtils.lerp(seated[i + 1], MathUtils.lerp(y, reachY, 0.52) - hip, arm);
          seated[i + 2] = MathUtils.lerp(seated[i + 2], MathUtils.lerp(z, reachZ, 0.52), arm);
        }
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const standingNormals = new Float32Array(geometry.getAttribute('normal').array);
      positions.array.set(seated);
      geometry.computeVertexNormals();
      const seatedNormals = new Float32Array(geometry.getAttribute('normal').array);
      positions.array.set(clinging);
      geometry.computeVertexNormals();
      const clingingNormals = new Float32Array(geometry.getAttribute('normal').array);
      positions.array.set(standing);
      geometry.getAttribute('normal').array.set(standingNormals);
      this.poses.push({ mesh, standing, seated, clinging, standingNormals, seatedNormals, clingingNormals });
    }
    this.setSeated(options.seated ? 1 : 0);
  }

  /** Blend 0..1 during boarding; at 1 root is the hip/bench contact point. */
  setSeated(amount: number) {
    amount = MathUtils.clamp(amount, 0, 1);
    if (Math.abs(amount - this.seatedAmount) < 0.001) return;
    this.seatedAmount = amount;
    this.applyPose();
    this.anchorRig();
  }

  /** A raised forward grip for survivors holding a log, released during boarding. */
  setClinging(amount: number) {
    amount = MathUtils.clamp(amount, 0, 1);
    if (Math.abs(amount - this.clingingAmount) < 0.001) return;
    this.clingingAmount = amount;
    this.applyPose();
  }

  private applyPose() {
    const seated = Math.max(0, this.seatedAmount);
    for (const pose of this.poses) {
      const positions = pose.mesh.geometry.getAttribute('position') as BufferAttribute;
      const normals = pose.mesh.geometry.getAttribute('normal') as BufferAttribute;
      for (let i = 0; i < pose.standing.length; i++) {
        positions.array[i] = MathUtils.lerp(MathUtils.lerp(pose.standing[i], pose.clinging[i], this.clingingAmount), pose.seated[i], seated);
        normals.array[i] = MathUtils.lerp(MathUtils.lerp(pose.standingNormals[i], pose.clingingNormals[i], this.clingingAmount), pose.seatedNormals[i], seated);
      }
      positions.needsUpdate = true;
      normals.needsUpdate = true;
      pose.mesh.geometry.computeBoundingSphere();
      pose.mesh.geometry.computeBoundingBox();
    }
  }

  /** The farmer has separate arm islands and an exposed belly in one skin mesh. */
  private farmerArmVertices(mesh: Mesh) {
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index;
    const parent = Uint32Array.from({ length: positions.count }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const join = (a: number, b: number) => { parent[find(a)] = find(b); };
    const welded = new Map<string, number>();
    for (let i = 0; i < positions.count; i++) {
      const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => Math.round(v * 1e5)).join(',');
      const same = welded.get(key);
      if (same !== undefined) join(i, same); else welded.set(key, i);
    }
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const a = indices ? indices.getX(i) : i;
      join(a, indices ? indices.getX(i + 1) : i + 1);
      join(a, indices ? indices.getX(i + 2) : i + 2);
    }
    const components = new Map<number, { minX: number; maxX: number; maxY: number }>();
    for (let i = 0; i < positions.count; i++) {
      const key = find(i);
      const group = components.get(key) ?? { minX: Infinity, maxX: -Infinity, maxY: -Infinity };
      group.minX = Math.min(group.minX, positions.getX(i));
      group.maxX = Math.max(group.maxX, positions.getX(i));
      group.maxY = Math.max(group.maxY, positions.getY(i));
      components.set(key, group);
    }
    return Float32Array.from({ length: positions.count }, (_, i) => {
      const component = components.get(find(i))!;
      return component.maxY < 1.32 && (component.minX > 0.13 || component.maxX < -0.13) ? 1 : 0;
    });
  }

  private anchorRig() {
    if (!this.rig || !this.hips) return;
    // Remove animation root motion at the hips, preserving breathing and limbs.
    // A roughly 4 cm offset puts the trouser seat on the wooden bench.
    this.rig.position.set(0, 0, 0);
    this.root.updateWorldMatrix(true, true);
    this.hips.getWorldPosition(this.hipPosition);
    this.root.worldToLocal(this.hipPosition);
    this.rig.position.copy(this.hipPosition).multiplyScalar(-1);
    this.rig.position.y += 0.04;
  }

  resetScale() { this.root.scale.setScalar(this.modelScale); }
  update(dt: number) { this.mixer?.update(dt); this.anchorRig(); }

  private fallback() {
    const person = new Group();
    const clothing = new MeshStandardMaterial({ color: 0xa8774c, roughness: 0.9 });
    const torso = new Mesh(new BoxGeometry(0.43, 0.65, 0.25), clothing);
    torso.position.y = 1.14;
    const head = new Mesh(new SphereGeometry(0.18, 10, 8), new MeshStandardMaterial({ color: 0x946642 }));
    head.position.y = 1.61;
    person.add(torso, head);
    for (const x of [-0.115, 0.115]) {
      const leg = new Mesh(new BoxGeometry(0.17, 0.84, 0.19, 1, 10, 1), clothing);
      leg.name = 'fallback-legs';
      leg.position.set(x, 0.42, 0);
      person.add(leg);
    }
    return person;
  }
}
