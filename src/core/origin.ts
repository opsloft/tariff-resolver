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

const ALIASES: Record<string, string[]> = {
  china: ["china", "hong kong", "macau"],
  "united kingdom": ["united kingdom", "uk"],
  "south korea": ["korea"],
  vietnam: ["vietnam", "viet nam"],
  turkey: ["turkey", "türkiye"],
  "türkiye": ["turkey", "türkiye"],
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
