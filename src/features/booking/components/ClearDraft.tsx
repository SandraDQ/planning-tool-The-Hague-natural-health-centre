"use client";

import { useEffect } from "react";

/** Forgets the details draft once the booking is confirmed (it may hold health information). */
export function ClearDraft() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem("thnhc.booking.details");
    } catch {
      /* storage unavailable */
    }
  }, []);
  return null;
}
