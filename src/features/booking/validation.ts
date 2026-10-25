// Details form validation, shared by the browser (instant feedback) and the
// server action (the source of truth). Error values are message keys under
// `booking.details.errors`.

export type DetailsValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  reason: string;
  /** "new" | "returning" | "" */
  clientKind: string;
  dateOfBirth: string;
  address: string;
  comments: string;
  acceptedPolicy: boolean;
  healthDataConsent: boolean;
};

export type DetailsField = keyof DetailsValues;
export type DetailsErrors = Partial<Record<DetailsField, string>>;

export const emptyDetails: DetailsValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  reason: "",
  clientKind: "",
  dateOfBirth: "",
  address: "",
  comments: "",
  acceptedPolicy: false,
  healthDataConsent: false,
};

export const LIMITS = { name: 80, email: 254, phone: 30, reason: 1000, address: 300, comments: 2000 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateDetails(v: DetailsValues, opts: { askClientKind: boolean; today: string }): DetailsErrors {
  const e: DetailsErrors = {};
  if (!v.firstName.trim()) e.firstName = "firstName";
  else if (v.firstName.length > LIMITS.name) e.firstName = "tooLong";
  if (!v.lastName.trim()) e.lastName = "lastName";
  else if (v.lastName.length > LIMITS.name) e.lastName = "tooLong";
  if (!v.email.trim()) e.email = "email";
  else if (!EMAIL.test(v.email.trim()) || v.email.length > LIMITS.email) e.email = "emailFormat";
  const digits = v.phone.replace(/\D/g, "");
  if (!v.phone.trim()) e.phone = "phone";
  else if (!/^[+0-9 ()-]+$/.test(v.phone.trim()) || digits.length < 8 || digits.length > 15) e.phone = "phoneFormat";
  if (!v.reason.trim()) e.reason = "reason";
  else if (v.reason.length > LIMITS.reason) e.reason = "tooLong";
  if (opts.askClientKind && v.clientKind !== "new" && v.clientKind !== "returning") e.clientKind = "clientKind";
  if (v.dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dateOfBirth) || Number.isNaN(Date.parse(v.dateOfBirth))) e.dateOfBirth = "dateOfBirth";
    else if (v.dateOfBirth >= opts.today || v.dateOfBirth < "1900-01-01") e.dateOfBirth = "dateOfBirth";
  }
  if (v.address.length > LIMITS.address) e.address = "tooLong";
  if (v.comments.length > LIMITS.comments) e.comments = "tooLong";
  if (!v.acceptedPolicy) e.acceptedPolicy = "acceptedPolicy";
  if (!v.healthDataConsent) e.healthDataConsent = "healthDataConsent";
  return e;
}

export function readDetails(form: FormData): DetailsValues {
  const s = (k: string) => {
    const x = form.get(k);
    return typeof x === "string" ? x : "";
  };
  return {
    firstName: s("firstName").trim(),
    lastName: s("lastName").trim(),
    email: s("email").trim(),
    phone: s("phone").trim(),
    reason: s("reason").trim(),
    clientKind: s("clientKind"),
    dateOfBirth: s("dateOfBirth"),
    address: s("address").trim(),
    comments: s("comments").trim(),
    acceptedPolicy: form.get("acceptedPolicy") === "on",
    healthDataConsent: form.get("healthDataConsent") === "on",
  };
}
