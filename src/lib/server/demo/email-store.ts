// Demo implementation of the e-mail texts (EmailStore). Same rules as the
// email_templates / centre_email_settings tables: a therapist only touches their own
// messages, the admin owns the centre info, and the facts for a confirmation are read
// with server rights only.

import { DomainError } from "@/lib/domain/store";
import type { EmailTemplate, Id, Locale, Session, Therapist } from "@/lib/domain/types";
import { DEFAULT_CENTRE_INFO, MAX_MESSAGE_LENGTH } from "@/lib/email/defaults";
import type { EmailStore } from "../extensions";
import type { DemoState } from "./state";

const clone = <T>(x: T): T => structuredClone(x);

function checkTexts(r: unknown): asserts r is Record<Locale, string> {
  const ok =
    typeof r === "object" &&
    r !== null &&
    (["nl", "en"] as const).every((l) => typeof (r as Record<string, unknown>)[l] === "string" && ((r as Record<string, string>)[l]).length <= MAX_MESSAGE_LENGTH);
  if (!ok) throw new DomainError("invalid", `Text must be at most ${MAX_MESSAGE_LENGTH} characters`);
}

const tidy = (r: Record<Locale, string>): Record<Locale, string> => ({ nl: r.nl.replace(/\r\n/g, "\n").trim(), en: r.en.replace(/\r\n/g, "\n").trim() });

export function createDemoEmailStore(
  state: DemoState,
  auth: { asTherapist: (s: Session) => Therapist; asAdmin: (s: Session) => void },
): EmailStore {
  const templates = () => (state.emailTemplates ??= []);
  const centre = () => (state.centreEmail ??= { info: clone(DEFAULT_CENTRE_INFO) });

  return {
    async listMyTemplates(session) {
      const me = auth.asTherapist(session);
      return clone(templates().filter((t) => t.therapistId === me.id));
    },

    async setMyTemplate(session, input) {
      const me = auth.asTherapist(session);
      const serviceId = input?.serviceId ?? null;
      if (serviceId !== null) {
        const service = state.services.find((s) => s.id === serviceId);
        if (!service) throw new DomainError("not_found");
        if (service.therapistId !== me.id) throw new DomainError("forbidden");
      }
      checkTexts(input?.body);
      const row: EmailTemplate = { therapistId: me.id, serviceId, kind: "confirmation", body: tidy(input.body) };
      state.emailTemplates = [...templates().filter((t) => !(t.therapistId === me.id && t.serviceId === serviceId)), row];
      return clone(row);
    },

    async deleteMyTemplate(session, serviceId) {
      const me = auth.asTherapist(session);
      if (typeof serviceId !== "string") throw new DomainError("invalid");
      state.emailTemplates = templates().filter((t) => !(t.therapistId === me.id && t.serviceId === serviceId));
    },

    async getCentreSettings(session) {
      if (session?.role === "admin") auth.asAdmin(session);
      else auth.asTherapist(session);
      return clone(centre());
    },

    async setCentreSettings(session, settings) {
      auth.asAdmin(session);
      checkTexts(settings?.info);
      state.centreEmail = { info: tidy(settings.info) };
      return clone(state.centreEmail);
    },

    async bookingEmailFacts(appointmentId: Id) {
      const a = state.appointments.find((x) => x.id === appointmentId);
      if (!a) return null;
      const client = state.clients.find((c) => c.id === a.clientId);
      const therapist = state.therapists.find((t) => t.id === a.therapistId);
      if (!client || !therapist) return null;
      const service = state.services.find((s) => s.id === state.sessionTypes.find((st) => st.id === a.sessionTypeId)?.serviceId);
      const mine = templates().filter((t) => t.therapistId === therapist.id);
      const template = (service && mine.find((t) => t.serviceId === service.id)) || mine.find((t) => t.serviceId === null) || null;
      const room = state.rooms.find((r) => r.id === a.roomId);
      return clone({
        appointment: a,
        client: { firstName: client.firstName, email: client.email, locale: client.locale },
        therapist: { displayName: therapist.displayName, publicEmail: therapist.publicEmail, loginEmail: state.therapistLoginEmails[therapist.id] ?? null },
        roomNumber: room?.number ?? null,
        template,
        centre: centre(),
        policy: state.appointmentPolicy[a.id] ?? null,
        depositPaidCents: state.appointmentPayment[a.id] ? a.snapshot.depositCents : 0,
      });
    },
  };
}
