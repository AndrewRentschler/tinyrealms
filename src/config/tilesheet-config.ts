export interface TilesheetConfig {
  name: string;
  url: string;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export const TILESHEET_CONFIGS: TilesheetConfig[] = [
  {
    name: "Fantasy Interior",
    url: "/assets/tilesets/fantasy-interior.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 768,
    imageHeight: 7056,
  },
  {
    name: "Alchemy Shop",
    url: "/assets/tilesets/Sorcery Alchemy tilesheet/tilesets/Fantasy_Inside_Shops3.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 768,
    imageHeight: 768,
  },
  {
    name: "Fantasy Exterior",
    url: "/assets/tilesets/fantasy-exterior.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 768,
    imageHeight: 7056,
  },
  {
    name: "Fantasy Roofs",
    url: "/assets/tilesets/Winlu\ Fantasy\ Exterior/characters/\!Roof_Windows.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 768,
    imageHeight: 7056,
  },
  {
    name: "FE Signs",
    url: "/assets/tilesets/signs.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 768,
    imageHeight: 7056,
  },
  {
    name: "Gentle",
    url: "/assets/tilesets/gentle.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 384,
    imageHeight: 2040,
  },
  {
    name: "Gentle Objects",
    url: "/assets/tilesets/gentle-obj.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 384,
    imageHeight: 2040,
  },
  {
    name: "Forest",
    url: "/assets/tilesets/forest.png",
    tileWidth: 8,
    tileHeight: 8,
    imageWidth: 384,
    imageHeight: 384,
  },
  {
    name: "Mage City (24px)",
    url: "/assets/tilesets/magecity.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 384,
    imageHeight: 384,
  },
  {
    name: "Mage Objects",
    url: "/assets/tilesets/mage-obj.png",
    tileWidth: 24,
    tileHeight: 24,
    imageWidth: 384,
    imageHeight: 1536,
  },
  {
    name: "Overworld Palma",
    url: "/assets/tilesets/overworld_palma.png",
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: 512,
    imageHeight: 512,
  },
  {
    name: "PS1 Camineet",
    url: "/assets/tilesets/ps1-camineet.png",
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: 832,
    imageHeight: 640,
  },
  {
    name: "Mage City (32px)",
    url: "/assets/tilesets/mage-city.png",
    tileWidth: 32,
    tileHeight: 32,
    imageWidth: 256,
    imageHeight: 1408,
  },
];

export const MAP_BROWSER_TILESET_OPTIONS = TILESHEET_CONFIGS.map((ts) => ({
  label: ts.name,
  url: ts.url,
  pw: ts.imageWidth,
  ph: ts.imageHeight,
  tw: ts.tileWidth,
  th: ts.tileHeight,
}));
