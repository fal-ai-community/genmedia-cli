import { describe, expect, test } from "bun:test";
import { classifyModality, modalityToCategory } from "./modality";

describe("classifyModality", () => {
  test("defaults to text-to-image for plain prompts", () => {
    expect(classifyModality("a cat")).toBe("text-to-image");
    expect(classifyModality("a cat on the moon, photorealistic")).toBe(
      "text-to-image",
    );
    expect(classifyModality("diagram of a load balancer")).toBe(
      "text-to-image",
    );
  });

  test("routes video keywords to text-to-video", () => {
    expect(classifyModality("a video of a robot dancing")).toBe(
      "text-to-video",
    );
    expect(classifyModality("a 5-second clip of waves")).toBe("text-to-video");
    expect(classifyModality("animation of a butterfly")).toBe("text-to-video");
    expect(classifyModality("scene of a busy market at dusk")).toBe(
      "text-to-video",
    );
  });

  test("routes voice/narration keywords to TTS", () => {
    expect(classifyModality("narrate this paragraph in a calm voice")).toBe(
      "text-to-audio-tts",
    );
    expect(classifyModality("read aloud the introduction")).toBe(
      "text-to-audio-tts",
    );
    expect(classifyModality("tts of the manifesto")).toBe("text-to-audio-tts");
  });

  test("routes music keywords to music", () => {
    expect(classifyModality("a song about summer")).toBe("text-to-audio-music");
    expect(classifyModality("upbeat instrumental track")).toBe(
      "text-to-audio-music",
    );
    expect(classifyModality("a beat with heavy drums")).toBe(
      "text-to-audio-music",
    );
  });

  test("TTS takes precedence over music when both keywords appear", () => {
    expect(classifyModality("say this song lyric out loud")).toBe(
      "text-to-audio-tts",
    );
    expect(classifyModality("narrate the lyrics of this song")).toBe(
      "text-to-audio-tts",
    );
  });

  test("routes 3d keywords to text-to-3d", () => {
    expect(classifyModality("a 3d model of a chair")).toBe("text-to-3d");
    expect(classifyModality("export as gltf")).toBe("text-to-3d");
    expect(classifyModality("low-poly mesh of a tree")).toBe("text-to-3d");
  });

  test("known false positives — documented behavior", () => {
    // "a song bird" matches "song" → music. Override with explicit endpoint.
    expect(classifyModality("a song bird painting")).toBe(
      "text-to-audio-music",
    );
    // "language model" doesn't match 3d (correctly — only "3d model" pattern triggers).
    expect(classifyModality("a diagram of a language model")).toBe(
      "text-to-image",
    );
  });

  test("is case-insensitive", () => {
    expect(classifyModality("A VIDEO of a robot")).toBe("text-to-video");
    expect(classifyModality("Narrate THIS")).toBe("text-to-audio-tts");
  });
});

describe("modalityToCategory", () => {
  test("maps to fal.ai catalog category strings", () => {
    expect(modalityToCategory("text-to-image")).toBe("text-to-image");
    expect(modalityToCategory("text-to-video")).toBe("text-to-video");
    expect(modalityToCategory("text-to-audio-music")).toBe("text-to-audio");
    expect(modalityToCategory("text-to-audio-tts")).toBe("text-to-speech");
    expect(modalityToCategory("text-to-3d")).toBe("text-to-3d");
  });
});
