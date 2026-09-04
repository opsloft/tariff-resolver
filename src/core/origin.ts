/** Origin input → the country name and the lower-case needles used to match Chapter 99 heading text. */
const ISO2: Record<string, string> = {
  CN: "China", HK: "Hong Kong", MO: "Macau", VN: "Vietnam", MX: "Mexico", CA: "Canada", IN: "India",
  JP: "Japan", KR: "South Korea", TW: "Taiwan", TH: "Thailand", ID: "Indonesia", MY: "Malaysia",
  BD: "Bangladesh", PK: "Pakistan", KH: "Cambodia", PH: "Philippines", TR: "Turkey", BR: "Brazil",
  GB: "United Kingdom", DE: "Germany", IT: "Italy", FR: "France", ES: "Spain", NL: "Netherlands",
  CH: "Switzerland", AU: "Australia", NZ: "New Zealand", IL: "Israel", ZA: "South Africa", RU: "Russia",
};

// Map lowercase names to canonical names for case-insensitive lookup
const CANONICAL_NAMES: Record<string, string> = Object.values(ISO2).reduce((acc, name) => {
  acc[name.toLowerCase()] = name;
  return acc;
}, {} as Record<string, string>);

const ALIASES: Record<string, string[]> = {
  china: ["china", "hong kong", "macau"],
  "united kingdom": ["united kingdom", "uk"],
  "south korea": ["korea"],
  vietnam: ["vietnam", "viet nam"],
  turkey: ["turkey", "türkiye"],
};

export function normalizeOrigin(input: string): { name: string; needles: string[] } | null {
  const t = (input ?? "").trim();
  if (!t) return null;
  let name: string | null = t;
  if (t.length === 2) name = ISO2[t.toUpperCase()] ?? null;
  else name = CANONICAL_NAMES[t.toLowerCase()] ?? t;
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, needles: ALIASES[key] ?? [key] };
}
