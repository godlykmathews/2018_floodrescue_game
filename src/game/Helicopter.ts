import { BoxGeometry, CapsuleGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import { HelicopterController } from './HelicopterController';

interface Rotor { object: Object3D; base: Quaternion; axis: Vector3; ratio: number }

export class Helicopter {
  readonly root = new Group();
  readonly visual = new Group();
  readonly controller = new HelicopterController();
  private rotors: Rotor[] = [];
  private rotorSpeed = 0;
  private rotorAngle = 0;
  private rotation = new Quaternion();

  constructor() {
    this.root.name = 'RESCUE_HELICOPTER';
    this.root.add(this.visual);
  }

  async load(loader: AssetLoader) {
    const { object } = await loader.loadModel({
      path: new URL('../../models/odz-20a_universal_helicopter_20a.glb', import.meta.url).href,
      size: 8.5, sizeAxis: 'z', rotationY: Math.PI,
      fallback: () => this.fallback(),
    });
    this.visual.add(object);
    this.rotors = [];
    object.traverse(node => {
      // The supplied GLB has unnamed Cyrillic groups with stable numeric suffixes.
      // 278 is the main rotor shaft (local Z), 279 the tail rotor (local X).
      if (/278$/.test(node.name) || node.name === 'MAIN_ROTOR') {
        this.rotors.push({ object: node, base: node.quaternion.clone(), axis: new Vector3(0, 0, 1), ratio: 1 });
      } else if (/279$/.test(node.name) || node.name === 'TAIL_ROTOR') {
        this.rotors.push({ object: node, base: node.quaternion.clone(), axis: new Vector3(1, 0, 0), ratio: 1.6 });
      }
    });
    this.update(0, 0, false);
  }

  update(time: number, dt: number, active: boolean) {
    this.root.position.copy(this.controller.position);
    this.root.rotation.y = this.controller.yaw;
    const flying = !this.controller.landed;
    this.visual.position.y = flying ? Math.sin(time * 2.5) * 0.025 : 0;
    this.visual.rotation.x = MathUtils.damp(this.visual.rotation.x, flying ? -this.controller.signedSpeed * 0.009 : 0, 4, dt);
    this.visual.rotation.z = MathUtils.damp(this.visual.rotation.z, flying ? -this.controller.turnVelocity * this.controller.speed * 0.012 : 0, 4, dt);
    this.rotorSpeed = MathUtils.damp(this.rotorSpeed, active ? 34 : 0, active ? 2 : 1, dt);
    this.rotorAngle = (this.rotorAngle + this.rotorSpeed * dt) % (Math.PI * 2 * 5);
    for (const rotor of this.rotors) {
      this.rotation.setFromAxisAngle(rotor.axis, this.rotorAngle * rotor.ratio);
      rotor.object.quaternion.copy(rotor.base).multiply(this.rotation);
    }
  }

  private fallback() {
    const result = new Group();
    const paint = new MeshStandardMaterial({ color: 0xa3ad9d, roughness: 0.65 });
    const dark = new MeshStandardMaterial({ color: 0x24322f, roughness: 0.6 });
    const cabin = new Mesh(new CapsuleGeometry(0.85, 2.1, 4, 10), paint);
    cabin.rotation.x = Math.PI / 2;
    cabin.position.set(0, 1.2, 0.5);
    const glass = new Mesh(new BoxGeometry(1.25, 0.72, 0.2), dark);
    glass.position.set(0, 1.5, 2.3);
    const tail = new Mesh(new BoxGeometry(0.3, 0.35, 3.4), paint);
    tail.position.set(0, 1.35, -2.5);
    const main = new Group();
    main.name = 'MAIN_ROTOR';
    main.position.set(0, 2.3, 0.4);
    main.rotation.x = -Math.PI / 2;
    for (let index = 0; index < 2; index++) {
      const blade = new Mesh(new BoxGeometry(7.4, 0.18, 0.05), dark);
      blade.rotation.z = index * Math.PI / 2;
      main.add(blade);
    }
    const rear = new Group();
    rear.name = 'TAIL_ROTOR';
    rear.position.set(-0.3, 1.7, -4.1);
    for (let index = 0; index < 2; index++) {
      const blade = new Mesh(new BoxGeometry(0.05, 1.3, 0.14), dark);
      blade.rotation.x = index * Math.PI / 2;
      rear.add(blade);
    }
    for (const x of [-0.8, 0.8]) {
      const skid = new Mesh(new BoxGeometry(0.1, 0.1, 3.3), dark);
      skid.position.set(x, 0.05, 0.3);
      result.add(skid);
    }
    result.add(cabin, glass, tail, main, rear);
    return result;
  }
}
