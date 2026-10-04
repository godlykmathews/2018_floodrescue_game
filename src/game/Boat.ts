import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import { assets } from './assets';
import { BoatController } from './BoatController';
import { Character } from './Character';

export class Boat {
  readonly root = new Group();
  readonly visual = new Group();
  readonly seats = [new Group(), new Group(), new Group()] as const;
  readonly seat = this.seats[0];
  readonly boardingEdge = new Group();
  readonly driver = new Character();
  readonly controller = new BoatController();
  constructor() {
    this.root.add(this.visual);
    this.seats.forEach((seat, index) => {
      seat.name = `PASSENGER_SEAT_${index + 1}`;
      seat.position.set(0, 0.50, 0.45 - index * 0.88);
      this.visual.add(seat);
    });
    this.boardingEdge.name = 'BOARDING_EDGE';
    this.boardingEdge.position.set(-0.57, 0.58, 0.8);
    this.driver.root.name = 'BOAT_DRIVER';
    this.driver.root.position.set(0, 0.5, 1.43);
    this.visual.add(this.boardingEdge, this.driver.root);
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
    await this.driver.load(loader, { seated: true, variant: 0, model: 'sitting-man' });
  }
  update(time: number, surfaceHeight = 0) {
    this.root.position.copy(this.controller.position);
    this.root.rotation.y = this.controller.yaw;
    this.visual.position.y = surfaceHeight + 0.035 * Math.sin(time * 1.8) + 0.02 * Math.sin(time * 3.2);
    this.visual.rotation.z = -this.controller.turnVelocity * this.controller.speed * 0.012;
    this.visual.rotation.x = Math.sin(time * 2.1) * 0.012 - this.controller.signedSpeed * 0.004;
  }
}
