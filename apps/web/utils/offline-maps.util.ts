export const useOfflineMaps = (mapStyleUrl: string) => {
  // Return a mock implementation for web since offline maps are not supported on web
  return {
    packs: [],
    downloadingPack: null,
    downloadingProgress: 0,
    downloadRegion: () => {},
    deletePack: () => {},
  };
};