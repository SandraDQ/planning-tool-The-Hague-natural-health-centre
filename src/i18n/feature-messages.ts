// Feature namespaces live in messages/<locale>/<namespace>.json so agents can work
// in parallel without editing the same file. Register each namespace here.
const namespaces = ["booking", "auth", "therapist", "admin", "demo"] as const;

export async function loadFeatureMessages(locale: string) {
  const entries = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`../../messages/${locale}/${ns}.json`);
        return [ns, mod.default] as const;
      } catch {
        return [ns, {}] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
