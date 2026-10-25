/*
 * Image sizes and the image type, without any Node imports,
 * so client components (the photo slider) can use them too.
 */
import mediaJson from "./media.json";

export type ContentImage = { src: string; alt: string };

const media: Record<string, { width: number; height: number }> = mediaJson;

/** Intrinsic size of an image in public/media (undefined if it is not a known image). */
export function mediaSize(src: string) {
  return media[src];
}
