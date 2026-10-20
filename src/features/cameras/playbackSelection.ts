type Recording = { token: string; source: string };
/** Live and archive source IDs are separate namespaces. Use only a verified server match. */
export function playbackSelection<T extends Recording>(inventory: { recordings: T[]; protocol?: string; verifiedSelectionToken?: string | null }, liveSource: string) {
  if (inventory.protocol === "taoshi-direct" && inventory.recordings.length === 1 && inventory.verifiedSelectionToken === inventory.recordings[0].token) return inventory.recordings[0];
  return liveSource ? inventory.recordings.find(item => item.source === liveSource) : inventory.recordings[0];
}
