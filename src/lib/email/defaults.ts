// Starting texts, so nobody faces an empty box. Therapists and the admin can change them.

import type { Locale } from "@/lib/domain/types";
import { siteContact } from "@/design-system/site";

export const DEFAULT_PERSONAL_MESSAGE: Record<Locale, string> = {
  nl: "Dank je wel voor je boeking. Ik kijk ernaar uit je te zien.\n\nHeb je vooraf een vraag? Beantwoord dan gewoon deze e-mail.",
  en: "Thank you for your booking. I look forward to seeing you.\n\nIf you have a question before your appointment, simply reply to this e-mail.",
};

export const DEFAULT_CENTRE_INFO: Record<Locale, string> = {
  nl: `Adres: ${siteContact.address}\nKom je met de auto? Je kunt betaald parkeren in de straat.\nKom het liefst 5 minuten van tevoren, dan kun je rustig binnenkomen.`,
  en: `Address: ${siteContact.address}\nComing by car? There is paid parking in the street.\nPlease arrive about 5 minutes early so you can settle in calmly.`,
};

/** Longest text a therapist or admin can save per language. */
export const MAX_MESSAGE_LENGTH = 2000;
