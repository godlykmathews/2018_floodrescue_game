import {
  AnimationMixer, BoxGeometry, BufferAttribute, Color, Group, MathUtils,
  Matrix4, Mesh, MeshStandardMaterial, SphereGeometry,
} from 'three';
import { AssetLoader } from '../utils/AssetLoader';

interface PoseMesh {
  mesh: Mesh;
  standing: Float32Array;
  seated: Float32Array;
  standingNormals: Float32Array;
  seatedNormals: Float32Array;
}

export interface CharacterOptions { variant?: number; seated?: boolean }

/** One cached GLB, independent character instances. Forward is local -Z. */
export class Character {
  readonly root = new Group();
  private readonly poses: PoseMesh[] = [];
  private mixer?: AnimationMixer;
  private seatedAmount = -1;
  private modelScale = 1;

  async load(loader: AssetLoader, options: CharacterOptions = {}) {
    const variant = options.variant ?? 0;
    const { object, animations } = await loader.loadModel({
      path: new URL('../../models/low_poly_farmer_man.glb', import.meta.url).href,
      size: 1.7, sizeAxis: 'y', rotationY: Math.PI,
      fallback: () => this.fallback(),
    });
    object.updateMatrixWorld(true);

    // The supplied farmer is unrigged. Bake its transforms into independent
    // geometry so bending a passenger cannot change another cached instance.
    // Standing uses a feet pivot; seated uses the hip/bench contact as its pivot.
    const meshes: Mesh[] = [];
    object.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
    const inverse = new Matrix4().copy(object.matrixWorld).invert();
    for (const source of meshes) {
      const geometry = source.geometry.clone();
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
      const hip = 0.84;
      const knee = 0.42;
      const bend = 1.43;
      const legMesh = /BodySuit|Shoes|fallback-legs/i.test(source.name);
      for (let i = 0; i < standing.length; i += 3) {
        const y = standing[i + 1];
        const z = standing[i + 2];
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
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const standingNormals = new Float32Array(geometry.getAttribute('normal').array);
      positions.array.set(seated);
      geometry.computeVertexNormals();
      const seatedNormals = new Float32Array(geometry.getAttribute('normal').array);
      positions.array.set(standing);
      geometry.getAttribute('normal').array.set(standingNormals);
      this.poses.push({ mesh, standing, seated, standingNormals, seatedNormals });
    }
    // Current farmer has no clips; retain the animation hook for a future rig.
    const idle = animations.find(clip => /idle|stand/i.test(clip.name));
    if (idle) { this.mixer = new AnimationMixer(this.root); this.mixer.clipAction(idle).play(); }
    this.modelScale = [1, 0.96, 1.025, 0.99][variant % 4];
    this.resetScale();
    this.setSeated(options.seated ? 1 : 0);
  }

  /** Blend 0..1 during boarding. At 1, root is the hip/seat contact point. */
  setSeated(amount: number) {
    amount = MathUtils.clamp(amount, 0, 1);
    if (Math.abs(amount - this.seatedAmount) < 0.001) return;
    this.seatedAmount = amount;
    for (const pose of this.poses) {
      const positions = pose.mesh.geometry.getAttribute('position') as BufferAttribute;
      const normals = pose.mesh.geometry.getAttribute('normal') as BufferAttribute;
      for (let i = 0; i < pose.standing.length; i++) {
        positions.array[i] = MathUtils.lerp(pose.standing[i], pose.seated[i], amount);
        normals.array[i] = MathUtils.lerp(pose.standingNormals[i], pose.seatedNormals[i], amount);
      }
      positions.needsUpdate = true;
      normals.needsUpdate = true;
      pose.mesh.geometry.computeBoundingSphere();
    }
  }

  resetScale() { this.root.scale.setScalar(this.modelScale); }

  update(dt: number) { this.mixer?.update(dt); }

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
