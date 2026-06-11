// Browser-renderable image formats accepted for profile photos.
//
// HEIC (the iPhone/macOS default) uploads, stores, and serves correctly, but
// Chrome and Firefox can't decode it in an <img>, so it shows as a broken
// image. We reject it at file selection instead of accepting image/* blindly.
// Shared by the signup finalize step (FinalizeProfile) and the in-dashboard
// profile editor (ProfileSection) so the two can't drift apart again.
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** `accept` attribute value for an <input type="file"> profile-photo picker. */
export const ACCEPTED_IMAGE_INPUT = ACCEPTED_IMAGE_TYPES.join(",");

/** Clear rejection message — HEIC is the common culprit. */
export const UNSUPPORTED_IMAGE_MESSAGE =
  "Please upload a JPG, PNG, or WebP image — iPhone photos are often HEIC, so export as JPG first.";

/** True when the file is a browser-renderable image we accept. */
export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}
