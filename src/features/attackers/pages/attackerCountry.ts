export function countryInfo(country: { countryCode: string; countryName: string } | null, locale: string) {
  const code = country?.countryCode?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const name = new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? country?.countryName ?? code;
  const flag = [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
  return { code, name, flag };
}
