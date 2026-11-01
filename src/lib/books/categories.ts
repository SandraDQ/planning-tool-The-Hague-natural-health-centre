// Cost categories (D41): one short fixed list in everyday words, each with the BTW
// rate that is most common for it, so the form can fill in a sensible default.

import type { BtwTreatment, CostCategory } from "@/lib/domain/types";

export const COST_CATEGORIES: CostCategory[] = [
  "supplies",
  "equipment",
  "rent",
  "energy",
  "phone_internet",
  "software",
  "office",
  "marketing",
  "training",
  "travel",
  "insurance",
  "cleaning",
  "advice",
  "bank_fees",
  "other",
];

/** Most common BTW on a receipt of this kind. Only a starting point: the receipt decides. */
export const CATEGORY_DEFAULT_BTW: Record<CostCategory, BtwTreatment> = {
  supplies: "21",
  equipment: "21",
  rent: "exempt",
  energy: "21",
  phone_internet: "21",
  software: "21",
  office: "21",
  marketing: "21",
  training: "21",
  travel: "9",
  insurance: "exempt",
  cleaning: "21",
  advice: "21",
  bank_fees: "exempt",
  other: "21",
};

const KEYWORDS: Array<[RegExp, CostCategory]> = [
  [/eneco|vattenfall|essent|greenchoice|budget energie|energie/i, "energy"],
  [/kpn|ziggo|odido|t-mobile|vodafone|simyo|internet/i, "phone_internet"],
  [/\bns\b|ns reizen|\bhtm\b|\bret\b|ov-chip|q-park|parkeren|parking/i, "travel"],
  [/interpolis|centraal beheer|nationale nederlanden|achmea|\bverzeker/i, "insurance"],
  [/bol\.com|\baction\b|\bhema\b|kruidvat|blokker|ikea|makro|etos/i, "supplies"],
  [/google|microsoft|adobe|dropbox|canva|zoom\.us|apple\.com/i, "software"],
  [/kosten betaalpakket|bankkosten|ing bank|rabobank|abn amro|\bbunq\b/i, "bank_fees"],
  [/schoonmaak|cleaning/i, "cleaning"],
  [/boekhoud|accountant|administratiekantoor/i, "advice"],
  [/vistaprint|drukwerk|flyer|facebook ads|meta platforms/i, "marketing"],
  [/cursus|opleiding|congres|nascholing/i, "training"],
  [/\bhuur\b|verhuur/i, "rent"],
];

/** Guesses a category from the supplier name / bank description, or null when unsure. */
export function guessCategory(text: string): CostCategory | null {
  for (const [re, category] of KEYWORDS) if (re.test(text)) return category;
  return null;
}
