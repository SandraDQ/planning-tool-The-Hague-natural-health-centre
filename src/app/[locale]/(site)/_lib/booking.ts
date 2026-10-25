/*
 * Links from the public pages into the booking flow (/book).
 * A therapy goes to /book/therapy/<id> when the booking catalogue has that therapy
 * (ids from src/lib/server/demo/seed.ts, matched on the site's English therapy title);
 * otherwise, and for therapists (the demo has none of the centre's real therapists yet), plain /book.
 * Only therapies that someone in the catalogue can be booked for are listed: in the demo data,
 * High Power Laser, Shamanism and Orthomolecular therapy have no bookable service yet, so they go to /book.
 */
const BOOK_HREF = "/book";

const THERAPY_IDS: Record<string, string> = {
  Homeopathy: "therapy-homeopathy",
  Acupuncture: "therapy-acupuncture",
  "Jungian Psychology": "therapy-psychology",
  "Deep Tissue & Therapeutic Massage": "therapy-massage",
  "Chinese Herbalism": "therapy-chinese-herbs",
  Reiki: "therapy-reiki",
  Ayurveda: "therapy-ayurveda",
  Nutrition: "therapy-nutrition",
};

/** Booking link for a therapy, by its English title on the site. */
export function therapyBookHref(englishTitle: string) {
  const id = THERAPY_IDS[englishTitle.trim()];
  return id ? `/book/therapy/${id}` : BOOK_HREF;
}

/** Booking link for one of the centre's therapists: /book/therapist/<slug> once they are in the booking catalogue. */
const THERAPIST_SLUGS: Record<string, string> = {};

export function therapistBookHref(name: string) {
  const slug = THERAPIST_SLUGS[name.trim()];
  return slug ? `/book/therapist/${slug}` : BOOK_HREF;
}

/** The old /booking page's services (Wix service slugs) and the therapy each one books. */
const SERVICE_THERAPY: Record<string, string> = {
  "homeopathy-initial-consultation": "Homeopathy",
  "homeopathy-follow-up-consultation": "Homeopathy",
  "reiki-session": "Reiki",
};

export function serviceBookHref(serviceSlug: string) {
  const therapy = SERVICE_THERAPY[serviceSlug];
  return therapy ? therapyBookHref(therapy) : BOOK_HREF;
}
