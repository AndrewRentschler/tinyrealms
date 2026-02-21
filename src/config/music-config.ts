/** Background music options for map metadata (MapEditorPanel, MapBrowser) */
export interface MusicOption {
  label: string;
  url: string;
}

export const MUSIC_OPTIONS: MusicOption[] = [
  { label: "(none)", url: "" },
  { label: "Cozy", url: "/assets/audio/cozy.m4a" },
  { label: "PS1 Palma", url: "/assets/audio/ps1-palma.mp3" },
  { label: "PS1 Town", url: "/assets/audio/ps1-town.mp3" },
  { label: "Mage City", url: "/assets/audio/magecity.mp3" },
];
