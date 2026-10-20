import type { PromptImage } from "./timeline";

export type PendingImage = PromptImage & {
  id: string; previewUrl: string; name?: string;
  /** Original attachment, retained for optional per-send re-encoding. */
  source?: Blob;
};

export type QueuedPrompt = {
  deliveryUncertain?: boolean;
  id: string;
  text: string;
  images: PendingImage[];
  imageQuality?: "compact" | "high";
  /** Timeline bubble; agent still gets `text` (e.g. `/plan …` vs remainder). */
  timelineText?: string;
  at: number;
};

export type ComposerSubmit = {
  text: string;
  images: PendingImage[];
  mode: "auto" | "queue" | "now" | "interject";
  imageQuality?: "compact" | "high";
  /** Timeline bubble; agent still gets `text`. */
  timelineText?: string;
};
