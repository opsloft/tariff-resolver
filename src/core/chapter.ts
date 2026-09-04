/**
 * The chapter filter (Stockyard cut #1). A Chapter 99 heading that names specific
 * subheadings/headings/chapters only applies to lines under them; a heading that names
 * nothing (IEEPA, Section 301 lists, "any country") applies to whatever matched it.
 * Derived from the heading text itself — no curated map.
 */
const SEG_RX = /\b(?:sub)?headings?\s+((?:\d{4}(?:\.\d{2}){0,3}|through|to|and|or|,|–|-|\s)+)/gi;
const CHAP_RX = /\bchapters?\s+((?:\d{1,2}\b|through|to|and|or|,|\s)+)/gi;

/** Digits-only HTS prefixes cited by the heading text. Never returns 99xx (self-references). */
export function citedPrefixes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(SEG_RX)) {
    const toks = m[1].match(/\d{4}(?:\.\d{2}){0,3}|through|to|–|-/g) ?? [];
    let prev: string | null = null;
    let range = false;
    for (const t of toks) {
      if (t === "through" || t === "to" || t === "–" || t === "-") { range = true; continue; }
      const d = t.replace(/\D/g, "");
      if (d.startsWith("99")) { prev = null; range = false; continue; }
      if (range && prev && prev.length === d.length) {
        // USITC ranges are ascending; expand any same-length pair, capped at 1000 intermediates
        const start = Number(prev);
        const end = Number(d);
        if (end > start) {
          let count = 0;
          for (let n = start + 1; n < end && count < 1000; n++, count++) {
            out.add(String(n).padStart(d.length, "0"));
          }
        }
      }
      out.add(d);
      prev = d;
      range = false;
    }
  }
  for (const m of text.matchAll(CHAP_RX)) {
    const toks = m[1].match(/\d{1,2}|through|to|–|-/g) ?? [];
    let prev: string | null = null;
    let range = false;
    for (const t of toks) {
      if (t === "through" || t === "to" || t === "–" || t === "-") { range = true; continue; }
      const c = t.padStart(2, "0");
      if (c.startsWith("99")) { prev = null; range = false; continue; }
      if (range && prev && prev.length === 2 && c.length === 2) {
        // Expand chapter ranges numerically, skipping 99
        const start = Number(prev);
        const end = Number(c);
        if (end > start) {
          for (let n = start + 1; n < end; n++) {
            const ch = String(n).padStart(2, "0");
            if (!ch.startsWith("99")) out.add(ch);
          }
        }
      }
      if (!c.startsWith("99")) out.add(c);
      prev = c;
      range = false;
    }
  }
  return [...out];
}

/** True when the heading cites prefixes and none of them covers the line's code. */
export function chapterMismatch(text: string, codeDigits: string): boolean {
  const cited = citedPrefixes(text);
  if (!cited.length) return false;
  return !cited.some((p) => codeDigits.startsWith(p));
}
