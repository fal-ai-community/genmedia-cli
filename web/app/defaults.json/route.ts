// Default model endpoint per modality. Served at https://genmedia.sh/defaults.json
// and consumed by the CLI's smart-default routing (src/lib/defaults-manifest.ts).
//
// Keep these values in lockstep with `BAKED_IN` in the CLI source - the hosted
// manifest is the override, the baked-in copy is the offline fallback. When
// rolling new defaults: edit here AND in src/lib/defaults-manifest.ts so the
// CLI ships a sane fallback for users on stale releases.

export async function GET() {
  return Response.json(
    {
      version: 1,
      defaults: {
        "text-to-image": "fal-ai/flux/schnell",
        "text-to-video": "fal-ai/minimax/hailuo-02/standard/text-to-video",
        "text-to-audio-music": "fal-ai/cassetteai/cassette",
        "text-to-audio-tts": "fal-ai/elevenlabs/tts/multilingual-v2",
        "text-to-3d": "fal-ai/triposr",
      },
    },
    {
      headers: {
        "cache-control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
