/**
 * The chapter filter — the origin-name false-match filter.
 * A Chapter 99 heading that names specific subheadings/headings/chapters only applies to
 * lines under them; a heading that names nothing (IEEPA, Section 301 lists, "any country")
 * applies to whatever matched it.
 * Derived from the heading text itself — no curated map.
 */
const SEG_RX = /\b(?:sub)?headings?\s+((?:\d{4}(?:\.\d{2}){0,3}|through|to|and|or|,|–|-|\s)+)/gi;
const CHAP_RX = /\bchapters?\s+((?:\d{1,2}\b|through|to|and|or|,|\s)+)/gi;

/** Longest common leading prefix of two same-length digit strings. */
function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/** Ranges wider than this are covered by their shared prefix instead of being enumerated. */
const RANGE_CAP = 1000;

/**
 * Shared range-walk helper: processes a token sequence (numbers + range keywords),
 * adds non-99xx numbers to the output set, and expands same-length ascending ranges
 * zero-padded to the endpoint length. A range with more than RANGE_CAP intermediates is
 * not enumerated: the endpoints' longest common leading prefix is added instead, so the
 * range still covers every member rather than truncating to the first RANGE_CAP and
 * silently under-covering the tail. When the endpoints share no leading digit at all
 * ("headings 0101.00.00 through 9503.00.00") that prefix is the ALL sentinel, which
 * covers every code — the heading really does cite the whole span.
 */
function walkRange(tokens: string[], out: Set<string>): void {
  let prev: string | null = null;
  let range = false;
  for (const t of tokens) {
    if (t === "through" || t === "to" || t === "–" || t === "-") { range = true; continue; }
    if (t.startsWith("99")) { prev = null; range = false; continue; }
    if (range && prev && prev.length === t.length) {
      // USITC ranges are ascending; expand any same-length pair
      const start = Number(prev);
      const end = Number(t);
      if (end > start) {
        if (end - start - 1 > RANGE_CAP) {
          out.add(commonPrefix(prev, t)); // "" (the ALL sentinel) when the endpoints share no digit
        } else {
          for (let n = start + 1; n < end; n++) out.add(String(n).padStart(t.length, "0"));
        }
      }
    }
    out.add(t);
    prev = t;
    range = false;
  }
}

/**
 * The empty prefix, which every code starts with: "this heading cites everything". Only a
 * range too wide to enumerate whose endpoints share no leading digit produces it. It stays
 * inside this module — citedPrefixes filters it out so callers only ever see real prefixes,
 * while chapterMismatch reads the raw set and therefore excludes nothing.
 */
const ALL = "";

/** Digits-only HTS prefixes cited by the heading text, ALL sentinel included. */
function citedPrefixSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(SEG_RX)) {
    const toks = (m[1].match(/\d{4}(?:\.\d{2}){0,3}|through|to|–|-/g) ?? []).map((t) => /^\d/.test(t) ? t.replace(/\D/g, "") : t);
    walkRange(toks, out);
  }
  for (const m of text.matchAll(CHAP_RX)) {
    const toks = (m[1].match(/\d{1,2}|through|to|–|-/g) ?? []).map((t) => /^\d/.test(t) ? t.padStart(2, "0") : t);
    walkRange(toks, out);
  }
  return out;
}

/** Digits-only HTS prefixes cited by the heading text. Never returns 99xx (self-references). */
export function citedPrefixes(text: string): string[] {
  return [...citedPrefixSet(text)].filter((p) => p !== ALL);
}

/** True when the heading cites prefixes and none of them covers the line's code. */
export function chapterMismatch(text: string, codeDigits: string): boolean {
  const cited = citedPrefixSet(text);
  if (!cited.size) return false;
  return ![...cited].some((p) => codeDigits.startsWith(p));
}
