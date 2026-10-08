import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
const names = new Intl.DisplayNames(['es'], { type: 'region' });
export const phoneCountries = getCountries().map(code => ({ code, name: names.of(code) || code, dial: getCountryCallingCode(code) })).sort((a,b) => a.name.localeCompare(b.name, 'es'));
export function internationalPhone(value: string, country: string): string | null {
  if (!getCountries().includes(country as CountryCode)) return null;
  const parsed = parsePhoneNumberFromString(value.trim(), country as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}
