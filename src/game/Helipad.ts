import { BoxGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';

export const HELIPAD_DOCK_POSITION = [-29, 0, 39] as const;
// The source roof is flat at Y12.82615. Its circular end is at source Z0,
// offset from the building's bounding-box centre by the long rear wing.
export const HELIPAD_LANDING_POSITION = [-43, 10.05, 34.280678] as const;
export const HELIPAD_LANDING_RADIUS = 4.1;
export const HELIPAD_DOCK_RADIUS = 3;
export const HELIPAD_BUILDING_POSITION = [-43, -1.1, 39] as const;
export const HELIPAD_BUILDING_LENGTH = 20;

/** An existing building roof, connected to a boat landing by external stairs. */
export class Helipad {
  readonly root = new Group();
  readonly dockPosition = new Vector3(...HELIPAD_DOCK_POSITION);
  readonly landingPosition = new Vector3(...HELIPAD_LANDING_POSITION);
  readonly landingRadius = HELIPAD_LANDING_RADIUS;
  readonly dockRadius = HELIPAD_DOCK_RADIUS;
  readonly buildingCollision: Collider = { minX: -48.3, maxX: -37.7, minZ: 29, maxZ: 49 };
  readonly colliders: Collider[] = [
    this.buildingCollision,
    { minX: -35.1, maxX: -31.1, minZ: 36.5, maxZ: 41.5 },
    { minX: -37.7, maxX: -34.7, minZ: 35.5, maxZ: 39.5 },
  ];
  private readonly dockRing: Mesh<RingGeometry, MeshBasicMaterial>;

  constructor() {
    this.root.name = 'ROOFTOP_HELIPAD';
    const concrete = new MeshStandardMaterial({ color: 0x9a9d96, roughness: 0.93 });
    const steel = new MeshStandardMaterial({ color: 0x4b5a55, roughness: 0.7, metalness: 0.25 });
    const wood = new MeshStandardMaterial({ color: 0x75654c, roughness: 0.92 });
    const white = new MeshStandardMaterial({ color: 0xe3e6c8, roughness: 0.9, emissive: 0x191b10 });
    const [padX, padY, padZ] = HELIPAD_LANDING_POSITION;
    const pad = new Mesh(new CylinderGeometry(4.65, 4.65, 0.035, 64), new MeshStandardMaterial({ color: 0x536e63, roughness: 0.94 }));
    pad.name = 'HELIPAD_ROOF_SURFACE';
    pad.position.set(padX, padY - 0.022, padZ);
    pad.receiveShadow = true;
    this.root.add(pad);
    const ring = new Mesh(new RingGeometry(4.02, 4.13, 64), white);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(padX, padY + 0.002, padZ);
    this.root.add(ring);
    const marking = mergeGeometries([
      new BoxGeometry(0.5, 0.012, 3).translate(-0.95, 0, 0),
      new BoxGeometry(0.5, 0.012, 3).translate(0.95, 0, 0),
      new BoxGeometry(1.9, 0.012, 0.48),
    ]);
    const letter = new Mesh(marking, white);
    letter.name = 'HELIPAD_H';
    letter.position.set(padX, padY + 0.01, padZ);
    this.root.add(letter);
    const lights = new InstancedMesh(new CylinderGeometry(0.09, 0.13, 0.15, 6), new MeshBasicMaterial({ color: 0xb9dfb2 }), 8);
    const matrix = new Matrix4();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      lights.setMatrixAt(i, matrix.makeTranslation(padX + Math.cos(angle) * 4.47, padY + 0.06, padZ + Math.sin(angle) * 4.47));
    }
    this.root.add(lights);

    const dock = new Mesh(new BoxGeometry(4, 0.35, 5), wood);
    dock.name = 'HELIPAD_BOAT_DOCK';
    dock.position.set(-33.1, 0.68, 39);
    dock.castShadow = true; dock.receiveShadow = true;
    this.root.add(dock);
    const walkway = new Mesh(new BoxGeometry(3.2, 0.24, 1.2), steel);
    walkway.position.set(-36.25, 0.68, 39);
    this.root.add(walkway);
    const bollards = new InstancedMesh(new CylinderGeometry(0.1, 0.13, 1, 6), steel, 4);
    for (let i = 0; i < 4; i++) {
      bollards.setMatrixAt(i, matrix.makeTranslation(i < 2 ? -31.4 : -34.8, 1.12, i % 2 ? 41.1 : 36.9));
    }
    this.root.add(bollards);

    // Forty-eight shared stair treads form four short switchback flights.
    // Access is a vehicle transfer, so no additional walking controller is needed.
    const stairs = new InstancedMesh(new BoxGeometry(1.05, 0.15, 0.29), steel, 48);
    const rise = (padY - 0.86) / 48;
    for (let i = 0; i < 48; i++) {
      const flight = Math.floor(i / 12), step = i % 12;
      const x = flight % 2 ? -36.7 : -35.55;
      const z = flight % 2 ? 36.1 + step * 0.25 : 38.85 - step * 0.25;
      stairs.setMatrixAt(i, matrix.makeTranslation(x, 0.86 + rise * (i + 1) - 0.075, z));
    }
    stairs.castShadow = true; stairs.receiveShadow = true;
    this.root.add(stairs);
    const landings = new InstancedMesh(new BoxGeometry(2.25, 0.15, 0.8), steel, 4);
    for (let i = 0; i < 4; i++) {
      landings.setMatrixAt(i, matrix.makeTranslation(-36.12, 0.86 + rise * (i + 1) * 12 - 0.075, i % 2 ? 39.3 : 35.65));
    }
    this.root.add(landings);
    const roofAccess = new Mesh(new BoxGeometry(4.8, 0.16, 1), concrete);
    roofAccess.position.set(-38.05, padY - 0.08, 39.25);
    this.root.add(roofAccess);
    const supports = new InstancedMesh(new BoxGeometry(0.14, padY + 1, 0.14), steel, 4);
    for (let i = 0; i < 4; i++) supports.setMatrixAt(i, matrix.makeTranslation(i < 2 ? -34.96 : -37.28, (padY - 1) / 2, i % 2 ? 39.6 : 35.25));
    this.root.add(supports);

    this.dockRing = new Mesh(new RingGeometry(1.65, 1.76, 48), new MeshBasicMaterial({ color: 0xc3d8b3, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }));
    this.dockRing.rotation.x = -Math.PI / 2;
    this.dockRing.position.set(this.dockPosition.x, 0.3, this.dockPosition.z);
    this.root.add(this.dockRing);
  }

  async load(loader: AssetLoader) {
    const building = await loader.loadModel({
      path: '/models/flood-brutalist-building.glb',
      size: HELIPAD_BUILDING_LENGTH, sizeAxis: 'z',
      position: [...HELIPAD_BUILDING_POSITION],
      fallback: () => this.fallbackBuilding(),
    });
    building.object.name = 'BRUTALIST_BUILDING';
    this.root.add(building.object);
  }

  update(time: number, boatActive = true) {
    this.dockRing.material.opacity = boatActive ? 0.45 + Math.sin(time * 1.5) * 0.12 : 0.2;
  }

  private fallbackBuilding() {
    // Match the normalized building's bounds and roof so the helipad remains usable.
    const group = new Group();
    const material = new MeshStandardMaterial({ color: 0x969c97, roughness: 0.95 });
    const body = new Mesh(new BoxGeometry(10.56, 11.1, 20), material);
    body.position.y = 5.55;
    group.add(body);
    return group;
  }
}
