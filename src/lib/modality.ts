export type Modality =
  | "text-to-image"
  | "text-to-video"
  | "text-to-audio-music"
  | "text-to-audio-tts"
  | "text-to-3d";

export const MODALITIES = [
  "text-to-image",
  "text-to-video",
  "text-to-audio-music",
  "text-to-audio-tts",
  "text-to-3d",
] as const satisfies readonly Modality[];

interface Rule {
  modality: Modality;
  patterns: RegExp[];
}

// Order matters — first match wins. TTS before music so "say this song lyric" → tts.
const RULES: Rule[] = [
  {
    modality: "text-to-3d",
    patterns: [
      /\b3d (?:model|mesh|asset|object|scene)\b/i,
      /\b(?:mesh|gltf|glb|voxel)\b/i,
    ],
  },
  {
    modality: "text-to-video",
    patterns: [
      /\b(?:video|clip|animation|footage|reel|cinematic|cinemagraph)\b/i,
      /\b(?:scene|shot|sequence) of\b/i,
      /\bmotion (?:graphic|video)\b/i,
    ],
  },
  {
    modality: "text-to-audio-tts",
    patterns: [
      /\b(?:voice|voiceover|narrate|narration|narrator|tts)\b/i,
      /\b(?:speak|say|read aloud|recite|announce)\b/i,
    ],
  },
  {
    modality: "text-to-audio-music",
    patterns: [
      /\b(?:song|music|track|melody|beat|instrumental|jingle|tune)\b/i,
      /\blyric/i,
    ],
  },
];

export function classifyModality(prompt: string): Modality {
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(prompt))) {
      return rule.modality;
    }
  }
  return "text-to-image";
}

export function modalityToCategory(modality: Modality): string {
  switch (modality) {
    case "text-to-image":
      return "text-to-image";
    case "text-to-video":
      return "text-to-video";
    case "text-to-audio-music":
      return "text-to-audio";
    case "text-to-audio-tts":
      return "text-to-speech";
    case "text-to-3d":
      return "text-to-3d";
  }
}
