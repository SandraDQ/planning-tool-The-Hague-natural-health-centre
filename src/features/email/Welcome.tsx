import { Notice } from "@/design-system";

/** Short "how this works" message at the top of a page (onboarding, plain words). */
export function Welcome({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Notice title={title} className="mt-6">
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-base">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </Notice>
  );
}
