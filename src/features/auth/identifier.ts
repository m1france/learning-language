import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'

export type PhoneCountry = { code: CountryCode; name: string; dialCode: string; flag: string }

const frenchNames = new Intl.DisplayNames(['fr'], { type: 'region' })

export const phoneCountries: PhoneCountry[] = getCountries()
  .map((code) => ({
    code,
    name: frenchNames.of(code) || code,
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join(''),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

export function isPhoneInput(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && /^[+\d(][\d\s().+-]*$/.test(trimmed)
}

export function countryFromInternationalNumber(value: string): CountryCode | undefined {
  if (!value.trim().startsWith('+')) return undefined
  return parsePhoneNumberFromString(value)?.country
}

export function normalizeIdentifier(value: string, country: CountryCode): { identifier: string; channel: 'email' | 'phone' } {
  const trimmed = value.trim()
  if (isPhoneInput(trimmed)) {
    const parsed = parsePhoneNumberFromString(trimmed, country)
    if (!parsed?.isValid()) throw new Error('Vérifiez votre numéro et l’indicatif du pays.')
    return { identifier: parsed.number, channel: 'phone' }
  }
  if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Saisissez une adresse e-mail ou un numéro de téléphone valide.')
  }
  return { identifier: trimmed.toLowerCase(), channel: 'email' }
}
