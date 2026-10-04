import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import { assets } from './assets';
import { BoatController } from './BoatController';

export class Boat {
  readonly root = new Group();
  readonly visual = new Group();
  readonly seat = new Group();
  readonly controller = new BoatController();
  constructor() {
    this.root.add(this.visual);
    this.visual.add(this.seat);
    this.seat.position.set(0, 0.45, 0.2);
  }
  async load(loader: AssetLoader) {
    const { object } = await loader.loadModel({
      path: assets.boat, size: 5.2, sizeAxis: 'z', rotationY: Math.PI,
      fallback: () => {
        const hull = new Mesh(new BoxGeometry(1.6, 0.6, 4.8), new MeshStandardMaterial({ color: 0x77583c }));
        return hull;
      },
    });
    object.position.y = -0.24;
    this.visual.add(object);
  }
  update(time: number) {
    this.root.position.copy(this.controller.position);
    this.root.rotation.y = this.controller.yaw;
    this.visual.position.y = 0.035 * Math.sin(time * 1.8) + 0.02 * Math.sin(time * 3.2);
    this.visual.rotation.z = -this.controller.turnVelocity * this.controller.speed * 0.012;
    this.visual.rotation.x = Math.sin(time * 2.1) * 0.012 - this.controller.signedSpeed * 0.004;
  }
}
