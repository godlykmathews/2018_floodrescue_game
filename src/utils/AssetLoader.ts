import { AnimationClip, Box3, Group, Mesh, Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export interface ModelOptions {
  path: string;
  size?: number;
  sizeAxis?: 'x' | 'y' | 'z' | 'max';
  scale?: number;
  rotationY?: number;
  position?: [number, number, number];
  fallback: () => Object3D;
  shadows?: boolean;
}
export interface LoadedModel { object: Group; animations: AnimationClip[]; fallback: boolean }

/** Cached source assets, independent clones, and one place for asset-space corrections. */
export class AssetLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF>>();
  readonly warnings: string[] = [];
  onProgress: (message: string, fraction: number) => void = () => {};
  onComplete: () => void = () => {};

  async loadModel(options: ModelOptions): Promise<LoadedModel> {
    const name = decodeURIComponent(options.path.split('/').pop() ?? 'model');
    let source: Object3D;
    let animations: AnimationClip[] = [];
    let fallback = false;
    try {
      let request = this.cache.get(options.path);
      if (!request) {
        request = this.loader.loadAsync(options.path, event => {
          this.onProgress(name, event.total ? event.loaded / event.total : 0.5);
        });
        this.cache.set(options.path, request);
      }
      const gltf = await request;
      source = clone(gltf.scene);
      // Cloned skinned meshes initially retain the source bind inverse. Refresh
      // it before measuring posed bounds, especially for centimetre-scale rigs.
      source.updateMatrixWorld(true);
      source.traverse(node => { if (node instanceof SkinnedMesh) node.computeBoundingBox(); });
      const sourceBounds = new Box3().setFromObject(source);
      if (sourceBounds.isEmpty() || ![...sourceBounds.min.toArray(), ...sourceBounds.max.toArray()].every(Number.isFinite)) {
        throw new Error('The model has no finite renderable geometry.');
      }
      animations = gltf.animations;
    } catch (error) {
      const warning = `Could not load ${name}; using playable fallback geometry.`;
      console.warn(`[Kerala Flood Rescue] ${warning}`, error);
      if (!this.warnings.includes(warning)) this.warnings.push(warning);
      source = options.fallback();
      fallback = true;
    }
    const content = new Group();
    content.add(source);
    content.rotation.y = options.rotationY ?? 0;
    content.updateMatrixWorld(true);
    let bounds = new Box3().setFromObject(content);
    const size = bounds.getSize(new Vector3());
    const axis = options.sizeAxis ?? 'max';
    const dimension = axis === 'max' ? Math.max(size.x, size.y, size.z) : size[axis];
    const factor = (options.size ? options.size / Math.max(dimension, 0.001) : 1) * (options.scale ?? 1);
    content.scale.setScalar(factor);
    content.updateMatrixWorld(true);
    bounds = new Box3().setFromObject(content);
    const center = bounds.getCenter(new Vector3());
    content.position.set(-center.x, bounds.isEmpty() ? 0 : -bounds.min.y, -center.z);
    content.traverse(node => {
      if (node instanceof Mesh) {
        node.castShadow = options.shadows !== false;
        node.receiveShadow = options.shadows !== false;
      }
    });
    const object = new Group();
    object.add(content);
    if (options.position) object.position.fromArray(options.position);
    this.onProgress(name, 1);
    this.onComplete();
    return { object, animations, fallback };
  }
}
