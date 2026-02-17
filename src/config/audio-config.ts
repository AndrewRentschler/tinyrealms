export interface SoundOption {
  label: string;
  url: string;
}

export const SOUND_FILES: SoundOption[] = [
  { label: "(none)", url: "" },
  { label: "Camp Fire", url: "/assets/audio/camp-fire.mp3" },
  { label: "Fire Crackling", url: "/assets/audio/fire-crackling-short.mp3" },
  { label: "Cat Purring", url: "/assets/audio/cat-purring.mp3" },
  { label: "Dog Snoring", url: "/assets/audio/dog-snoring.mp3" },
  { label: "Chicken", url: "/assets/audio/chicken.mp3" },
  { label: "Chicken2", url: "/assets/audio/chicken2.mp3" },
  { label: "Clock Tick", url: "/assets/audio/clock-tick.mp3" },
  { label: "Grandfather Clock", url: "/assets/audio/grandfather-clock.mp3" },
  { label: "Rain", url: "/assets/audio/rain.mp3" },
  { label: "Vinyl", url: "/assets/audio/vinyl.mp3" },
  { label: "Writing Desk", url: "/assets/audio/writing-desk.mp3" },
  { label: "Book", url: "/assets/audio/book.mp3" },
  { label: "Door Open", url: "/assets/audio/door-open.mp3" },
  { label: "Door Close", url: "/assets/audio/door-close.mp3" },
  { label: "Fire Start", url: "/assets/audio/lighting-a-fire.mp3" },
  { label: "1920s Jazz", url: "/assets/audio/1920jazz.mp3" },
  { label: "Soup Pot", url: "/assets/audio/souppot.mp3" },
  { label: "Puppy Bark", url: "/assets/audio/puppy-bark.mp3" },
  { label: "Sheep", url: "/assets/audio/sheep.mp3" },
  { label: "Pig", url: "/assets/audio/pig.mp3" },
];

export const ITEM_PICKUP_SOUND_OPTIONS: string[] = [
  "",
  "/assets/audio/take-item.mp3",
  "/assets/audio/book.mp3",
  "/assets/audio/door-open.mp3",
  "/assets/audio/lighting-a-fire.mp3",
];

export const DEFAULT_ITEM_PICKUP_SFX = "/assets/audio/take-item.mp3";
