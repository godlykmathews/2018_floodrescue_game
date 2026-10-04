// Vite emits only the models we use, preserving the original models/ directory.
export const assets = {
  boat: new URL('../../models/wooden_rowing_boat_with_oars.glb', import.meta.url).href,
};
