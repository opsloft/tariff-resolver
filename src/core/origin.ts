/** Origin input -> the country name and the lower-case needles used to match Chapter 99 heading text. */

/**
 * ISO-3166-1 alpha-2, all 249 officially assigned codes, mapped to the English short name as it
 * commonly appears in the USITC schedule (e.g. KR "South Korea", MM "Burma", CI "Ivory Coast").
 * `UK` is added as the common non-ISO alias for GB. Codes that are not officially assigned
 * (user-assigned, reserved, or unofficial such as XK) are absent, so they resolve to null.
 */
const ISO2: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua and Barbuda", AI: "Anguilla",
  AL: "Albania", AM: "Armenia", AO: "Angola", AQ: "Antarctica", AR: "Argentina", AS: "American Samoa", AT: "Austria",
  AU: "Australia", AW: "Aruba", AX: "Aland Islands", AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BB: "Barbados",
  BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin",
  BL: "Saint Barthelemy", BM: "Bermuda", BN: "Brunei", BO: "Bolivia", BQ: "Bonaire", BR: "Brazil", BS: "Bahamas",
  BT: "Bhutan", BV: "Bouvet Island", BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada", CC: "Cocos Islands",
  CD: "Democratic Republic of the Congo", CF: "Central African Republic", CG: "Republic of the Congo",
  CH: "Switzerland", CI: "Ivory Coast", CK: "Cook Islands", CL: "Chile", CM: "Cameroon", CN: "China", CO: "Colombia",
  CR: "Costa Rica", CU: "Cuba", CV: "Cape Verde", CW: "Curacao", CX: "Christmas Island", CY: "Cyprus",
  CZ: "Czech Republic", DE: "Germany", DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic",
  DZ: "Algeria", EC: "Ecuador", EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea", ES: "Spain",
  ET: "Ethiopia", FI: "Finland", FJ: "Fiji", FK: "Falkland Islands", FM: "Micronesia", FO: "Faroe Islands",
  FR: "France", GA: "Gabon", GB: "United Kingdom", GD: "Grenada", GE: "Georgia", GF: "French Guiana", GG: "Guernsey",
  GH: "Ghana", GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe",
  GQ: "Equatorial Guinea", GR: "Greece", GS: "South Georgia and the South Sandwich Islands", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong", HM: "Heard Island and McDonald Islands",
  HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel",
  IM: "Isle of Man", IN: "India", IO: "British Indian Ocean Territory", IQ: "Iraq", IR: "Iran", IS: "Iceland",
  IT: "Italy", JE: "Jersey", JM: "Jamaica", JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts and Nevis", KP: "North Korea", KR: "South Korea", KW: "Kuwait",
  KY: "Cayman Islands", KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon", LC: "Saint Lucia", LI: "Liechtenstein",
  LK: "Sri Lanka", LR: "Liberia", LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "Saint Martin", MG: "Madagascar",
  MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali", MM: "Burma", MN: "Mongolia", MO: "Macau",
  MP: "Northern Mariana Islands", MQ: "Martinique", MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius",
  MV: "Maldives", MW: "Malawi", MX: "Mexico", MY: "Malaysia", MZ: "Mozambique", NA: "Namibia", NC: "New Caledonia",
  NE: "Niger", NF: "Norfolk Island", NG: "Nigeria", NI: "Nicaragua", NL: "Netherlands", NO: "Norway", NP: "Nepal",
  NR: "Nauru", NU: "Niue", NZ: "New Zealand", OM: "Oman", PA: "Panama", PE: "Peru", PF: "French Polynesia",
  PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan", PL: "Poland", PM: "Saint Pierre and Miquelon",
  PN: "Pitcairn Islands", PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau", PY: "Paraguay",
  QA: "Qatar", RE: "Reunion", RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia",
  SB: "Solomon Islands", SC: "Seychelles", SD: "Sudan", SE: "Sweden", SG: "Singapore", SH: "Saint Helena",
  SI: "Slovenia", SJ: "Svalbard and Jan Mayen", SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino", SN: "Senegal",
  SO: "Somalia", SR: "Suriname", SS: "South Sudan", ST: "Sao Tome and Principe", SV: "El Salvador",
  SX: "Sint Maarten", SY: "Syria", SZ: "Eswatini", TC: "Turks and Caicos Islands", TD: "Chad",
  TF: "French Southern Territories", TG: "Togo", TH: "Thailand", TJ: "Tajikistan", TK: "Tokelau", TL: "East Timor",
  TM: "Turkmenistan", TN: "Tunisia", TO: "Tonga", TR: "Turkey", TT: "Trinidad and Tobago", TV: "Tuvalu",
  TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine", UG: "Uganda", UM: "United States Minor Outlying Islands",
  US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VA: "Vatican City", VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela", VG: "British Virgin Islands", VI: "United States Virgin Islands", VN: "Vietnam", VU: "Vanuatu",
  WF: "Wallis and Futuna", WS: "Samoa", YE: "Yemen", YT: "Mayotte", ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
  UK: "United Kingdom", // common non-ISO alias for GB
};

// Map lowercase names to canonical names for case-insensitive lookup
const CANONICAL_NAMES: Record<string, string> = Object.values(ISO2).reduce((acc, name) => {
  acc[name.toLowerCase()] = name;
  return acc;
}, {} as Record<string, string>);

/**
 * Alternative spellings accepted as input: lowercase spelling -> the canonical name above.
 * Only spellings listed here (or a canonical name, or an ISO-2 code) are accepted; anything
 * else is rejected rather than passed through, because a pass-through silently resolves a
 * misspelled country against zero origin headings and understates the duty stack.
 */
const ALIASES: Record<string, string> = {
  "viet nam": "Vietnam",
  "usa": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  "great britain": "United Kingdom",
  "england": "United Kingdom",
  "scotland": "United Kingdom",
  "wales": "United Kingdom",
  "prc": "China",
  "people's republic of china": "China",
  "p.r. china": "China",
  "mainland china": "China",
  "korea": "South Korea",
  "republic of korea": "South Korea",
  "korea, republic of": "South Korea",
  "democratic people's republic of korea": "North Korea",
  "myanmar": "Burma",
  "czechia": "Czech Republic",
  "cote d'ivoire": "Ivory Coast",
  "c\u00f4te d'ivoire": "Ivory Coast",
  "russian federation": "Russia",
  "the netherlands": "Netherlands",
  "holland": "Netherlands",
  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  "t\u00fcrkiye": "Turkey",
  "turkiye": "Turkey",
  "hong kong sar": "Hong Kong",
  "macao": "Macau",
  "cape verde islands": "Cape Verde",
  "swaziland": "Eswatini",
  "timor-leste": "East Timor",
  "laos pdr": "Laos",
  "vatican": "Vatican City",
  "holy see": "Vatican City",
};

/**
 * Heading-text needles per canonical name, where the schedule's wording is broader or
 * different from the canonical name itself. Everything else searches for its own name.
 */
const NEEDLES: Record<string, string[]> = {
  china: ["china", "hong kong", "macau"],
  "united kingdom": ["united kingdom", "uk"],
  "south korea": ["korea"],
  vietnam: ["vietnam", "viet nam"],
  turkey: ["turkey", "t\u00fcrkiye"],
  // the schedule writes "the Russian Federation" and never the bare country name
  russia: ["russia", "russian federation"],
  // ... and "C\u00f4te d`Ivoire" / "C\u00f4te d\u2019Ivoire" (both apostrophes appear), never "Ivory Coast"
  "ivory coast": ["ivory coast", "c\u00f4te d'ivoire"],
};

/**
 * Needles that are themselves a whole word inside a *different* country's name, mapped to the
 * longer names they must not be read as. Word boundaries alone cannot separate these: "Guinea"
 * is a whole word inside "Papua New Guinea", and "Republic of the Congo" inside "Democratic
 * Republic of the Congo". Keyed by needle, values lower-case.
 */
const NEEDLE_EXCLUSIONS: Record<string, string[]> = {
  guinea: ["papua new guinea", "equatorial guinea", "guinea-bissau"],
  "republic of the congo": ["democratic republic of the congo"],
};

const escapeRx = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Lower-cases and folds the apostrophe-like characters the schedule mixes (it prints
 * "C\u00f4te d`Ivoire" in one heading and "C\u00f4te d\u2019Ivoire" in another) onto a plain \u0027, so one
 * needle spelling matches every variant. Applied to both the heading text and the needles.
 */
export const foldText = (s: string): string => s.toLowerCase().replace(/[\u2018\u2019\u0060\u00b4]/g, "'");

/**
 * One matcher per needle: true when the heading text names that country as a whole
 * word or phrase. A needle is matched with word boundaries on both sides, so "Oman" no longer
 * matches "Romania", "Niger" no longer matches "Nigeria", and "Dominica" no longer matches
 * "Dominican Republic". Any longer name from NEEDLE_EXCLUSIONS is listed as an earlier
 * alternative so the scan consumes it first and discards it; only a standalone mention of the
 * needle itself counts as a hit. The haystack must already be folded with foldText.
 */
export function needleMatcher(needle: string): (hay: string) => boolean {
  const want = foldText(needle);
  const longer = [...(NEEDLE_EXCLUSIONS[needle] ?? [])].map(foldText).sort((a, b) => b.length - a.length);
  const rx = new RegExp(`\\b(?:${[...longer, want].map(escapeRx).join("|")})\\b`, "g");
  return (hay: string): boolean => {
    for (const m of hay.matchAll(rx)) if (m[0] === want) return true;
    return false;
  };
}

export function normalizeOrigin(input: string): { name: string; needles: string[] } | null {
  const t = typeof input === "string" ? input.trim() : ""; // never throw on a non-string line field
  if (!t) return null;
  const folded = foldText(t);
  const name = t.length === 2
    ? ISO2[t.toUpperCase()] ?? null
    : CANONICAL_NAMES[folded] ?? ALIASES[folded] ?? null;
  if (!name) return null;
  const key = name.toLowerCase();
  return { name, needles: NEEDLES[key] ?? [key] };
}
