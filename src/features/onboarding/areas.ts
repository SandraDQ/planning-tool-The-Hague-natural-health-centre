export const WELCOME_AREAS = ["admin", "therapist", "client"] as const;
export type WelcomeArea = (typeof WELCOME_AREAS)[number];

/** Remembers "Got it" per area on this device; holds no personal data. */
export const welcomeCookie = (area: WelcomeArea) => `thnhc_welcome_${area}_hidden`;
