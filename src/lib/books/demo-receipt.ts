// A small one-page PDF that looks like a till receipt, for the demo's pretend costs.
// Written by hand (no async pdf-lib) so the seed stays synchronous. ASCII text only.

export function demoReceiptPdf(lines: string[]): Uint8Array {
  const safe = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
  const height = 120 + lines.length * 18;
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 14 : 11} Tf 24 ${height - 40 - i * 18} Td (${safe(l)}) Tj ET`).join("\n");
  const content = `${text}\nBT /F1 9 Tf 24 24 Td (DEMO - not a real receipt) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 260 ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
