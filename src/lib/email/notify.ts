import "server-only";

// Booking e-mails. Called after a payment is confirmed (demo payment now, the Mollie
// webhook later). An e-mail problem never undoes or blocks a booking: it is logged
// (without addresses or content) and the booking stands.

import { freeCancelDeadline } from "@/features/booking/policy";
import { siteContact } from "@/design-system/site";
import type { CentreEmailSettings, Locale } from "@/lib/domain/types";
import { logSafeError } from "@/lib/server/errors";
import type { AppStore, BookingEmailFacts } from "@/lib/server/extensions";
import { renderBookingConfirmation, sampleConfirmation, type ConfirmationData } from "./booking-confirmation";
import { DEFAULT_PERSONAL_MESSAGE } from "./defaults";
import { manageUrl, siteUrl } from "./manage-link";
import { renderTherapistNewBooking } from "./therapist-new-booking";
import { claimOnce, releaseClaim } from "./outbox";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

export const CENTRE = {
  name: siteContact.name,
  address: siteContact.address,
  phone: siteContact.phone,
  email: siteContact.email,
  website: "https://www.thehague-naturalhealthcentre.com",
  mapUrl: siteContact.mapUrl,
};

const pick = (r: Record<Locale, string> | undefined, locale: Locale) => r?.[locale]?.trim() || "";

export function confirmationData(f: BookingEmailFacts): ConfirmationData {
  const locale = f.client.locale;
  const a = f.appointment;
  const deadline = f.policy ? freeCancelDeadline(a.session.start, f.policy) : null;
  return {
    locale,
    clientFirstName: f.client.firstName,
    therapistName: f.therapist.displayName,
    therapistEmail: f.therapist.publicEmail,
    serviceName: a.snapshot.serviceName[locale],
    sessionTypeName: a.snapshot.sessionTypeName[locale],
    start: a.session.start,
    durationMin: a.snapshot.durationMin,
    roomName: f.roomNumber == null ? null : `${locale === "nl" ? "Kamer" : "Room"} ${f.roomNumber}`,
    priceCents: a.snapshot.priceCents,
    depositPaidCents: f.depositPaidCents,
    freeCancelUntil: deadline == null ? null : new Date(deadline).toISOString(),
    policyText: pick(f.policy?.text, locale) || null,
    personalMessage: pick(f.template?.body, locale) || DEFAULT_PERSONAL_MESSAGE[locale],
    centreInfo: pick(f.centre.info, locale),
    reference: a.id.slice(0, 8).toUpperCase(),
    manageUrl: manageUrl(a.id, locale),
    centre: CENTRE,
  };
}

/**
 * Sends the booking confirmation to the client, once per appointment.
 * Returns null when there was nothing to send (no e-mail address, already sent, error).
 */
export async function sendBookingConfirmation(store: AppStore, appointmentId: string): Promise<EmailResult | null> {
  const key = `booking_confirmation:${appointmentId}`;
  try {
    const facts = await store.email.bookingEmailFacts(appointmentId);
    if (!facts || facts.appointment.status !== "confirmed" || !facts.client.email) return null;
    if (!claimOnce(key)) return null;
    const mail = renderBookingConfirmation(confirmationData(facts));
    try {
      return await sendEmail({
        to: facts.client.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: facts.therapist.publicEmail ?? undefined,
        kind: "booking_confirmation",
        locale: facts.client.locale,
      });
    } catch (e) {
      releaseClaim(key); // a later retry (webhook) may try again
      throw e;
    }
  } catch (e) {
    logSafeError("[email] booking confirmation failed", e);
    return null;
  }
}

/**
 * Tells the therapist about a new online booking (no health information in it).
 * Once per appointment; never throws.
 */
export async function sendTherapistNewBooking(store: AppStore, appointmentId: string): Promise<EmailResult | null> {
  const key = `therapist_new_booking:${appointmentId}`;
  try {
    const facts = await store.email.bookingEmailFacts(appointmentId);
    const to = facts?.therapist.loginEmail;
    if (!facts || facts.appointment.status !== "confirmed" || !to) return null;
    if (!claimOnce(key)) return null;
    const a = facts.appointment;
    const mail = renderTherapistNewBooking({
      therapistName: facts.therapist.displayName,
      clientFirstName: facts.client.firstName,
      serviceName: a.snapshot.serviceName,
      start: a.session.start,
      durationMin: a.snapshot.durationMin,
      calendarUrl: `${siteUrl()}/nl/therapist`,
    });
    try {
      return await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, kind: "therapist_new_booking", locale: "nl" });
    } catch (e) {
      releaseClaim(key);
      throw e;
    }
  } catch (e) {
    logSafeError("[email] therapist new booking failed", e);
    return null;
  }
}

/** An example confirmation with made-up booking details, to check how it looks. */
export async function sendExampleConfirmation(input: {
  to: string;
  locale: Locale;
  therapistName: string;
  personalMessage?: string;
  centre: CentreEmailSettings;
}): Promise<EmailResult> {
  const mail = renderBookingConfirmation(
    sampleConfirmation(input.locale, {
      therapistName: input.therapistName,
      personalMessage: input.personalMessage?.trim() || DEFAULT_PERSONAL_MESSAGE[input.locale],
      centreInfo: pick(input.centre.info, input.locale),
      centre: CENTRE,
    }),
  );
  const prefix = input.locale === "nl" ? "Voorbeeld: " : "Example: ";
  return sendEmail({ to: input.to, subject: prefix + mail.subject, html: mail.html, text: mail.text, kind: "example_confirmation", locale: input.locale });
}
