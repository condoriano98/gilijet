type Country = { label: string; value: string; dialCode: string; flag: string };

export const COUNTRIES: Country[] = [
  { label: "Indonesia",    value: "Indonesia",    dialCode: "+62",  flag: "🇮🇩" },
  { label: "Australia",    value: "Australia",    dialCode: "+61",  flag: "🇦🇺" },
  { label: "USA",          value: "USA",          dialCode: "+1",   flag: "🇺🇸" },
  { label: "UK",           value: "UK",           dialCode: "+44",  flag: "🇬🇧" },
  { label: "Germany",      value: "Germany",      dialCode: "+49",  flag: "🇩🇪" },
  { label: "France",       value: "France",       dialCode: "+33",  flag: "🇫🇷" },
  { label: "Netherlands",  value: "Netherlands",  dialCode: "+31",  flag: "🇳🇱" },
  { label: "Singapore",    value: "Singapore",    dialCode: "+65",  flag: "🇸🇬" },
  { label: "Japan",        value: "Japan",        dialCode: "+81",  flag: "🇯🇵" },
  { label: "South Korea",  value: "South Korea",  dialCode: "+82",  flag: "🇰🇷" },
  { label: "China",        value: "China",        dialCode: "+86",  flag: "🇨🇳" },
  { label: "Malaysia",     value: "Malaysia",     dialCode: "+60",  flag: "🇲🇾" },
  { label: "Russia",       value: "Russia",       dialCode: "+7",   flag: "🇷🇺" },
  { label: "Italy",        value: "Italy",        dialCode: "+39",  flag: "🇮🇹" },
  { label: "Spain",        value: "Spain",        dialCode: "+34",  flag: "🇪🇸" },
  { label: "India",        value: "India",        dialCode: "+91",  flag: "🇮🇳" },
  { label: "Canada",       value: "Canada",       dialCode: "+1",   flag: "🇨🇦" },
  { label: "New Zealand",  value: "New Zealand",  dialCode: "+64",  flag: "🇳🇿" },
  { label: "Brazil",       value: "Brazil",       dialCode: "+55",  flag: "🇧🇷" },
  { label: "Thailand",     value: "Thailand",     dialCode: "+66",  flag: "🇹🇭" },
  { label: "Taiwan",       value: "Taiwan",       dialCode: "+886", flag: "🇹🇼" },
  { label: "Hong Kong",    value: "Hong Kong",    dialCode: "+852", flag: "🇭🇰" },
  { label: "Philippines",  value: "Philippines",  dialCode: "+63",  flag: "🇵🇭" },
  { label: "Vietnam",      value: "Vietnam",      dialCode: "+84",  flag: "🇻🇳" },
  { label: "Switzerland",  value: "Switzerland",  dialCode: "+41",  flag: "🇨🇭" },
  { label: "Sweden",       value: "Sweden",       dialCode: "+46",  flag: "🇸🇪" },
  { label: "Norway",       value: "Norway",       dialCode: "+47",  flag: "🇳🇴" },
  { label: "Denmark",      value: "Denmark",      dialCode: "+45",  flag: "🇩🇰" },
  { label: "Finland",      value: "Finland",      dialCode: "+358", flag: "🇫🇮" },
  { label: "Belgium",      value: "Belgium",      dialCode: "+32",  flag: "🇧🇪" },
  { label: "Austria",      value: "Austria",      dialCode: "+43",  flag: "🇦🇹" },
  { label: "Poland",       value: "Poland",       dialCode: "+48",  flag: "🇵🇱" },
  { label: "Israel",       value: "Israel",       dialCode: "+972", flag: "🇮🇱" },
  { label: "UAE",          value: "UAE",          dialCode: "+971", flag: "🇦🇪" },
  { label: "South Africa", value: "South Africa", dialCode: "+27",  flag: "🇿🇦" },
  { label: "Mexico",       value: "Mexico",       dialCode: "+52",  flag: "🇲🇽" },
  { label: "Argentina",    value: "Argentina",    dialCode: "+54",  flag: "🇦🇷" },
  { label: "Ireland",      value: "Ireland",      dialCode: "+353", flag: "🇮🇪" },
  { label: "Portugal",     value: "Portugal",     dialCode: "+351", flag: "🇵🇹" },
  { label: "Other",        value: "Other",        dialCode: "",     flag: "" },
];

// Unique dial codes for the phone prefix picker (+1 appears for both US and Canada; keep US entry)
export const DIAL_CODES: { label: string; value: string }[] = (() => {
  const seen = new Set<string>();
  const result: { label: string; value: string }[] = [];
  for (const c of COUNTRIES) {
    if (c.dialCode && !seen.has(c.dialCode)) {
      seen.add(c.dialCode);
      result.push({ label: `${c.flag} ${c.dialCode}`, value: c.dialCode });
    }
  }
  return result;
})();
