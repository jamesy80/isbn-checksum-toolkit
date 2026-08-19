// Checksum math for the three book/retail barcode formats you actually run into:
// ISBN-10 (mod 11, 'X' as ten), ISBN-13 / EAN-13 (mod 10, alternating 1/3),
// and UPC-A (mod 10, alternating 3/1 - the mirror image of EAN-13's weights).

export type BarcodeFormat = 'isbn10' | 'isbn13' | 'upca';

export interface ValidationResult {
  valid: boolean;
  format: BarcodeFormat | null;
}

function normalize(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function isDigits(s: string): boolean {
  return s.length > 0 && /^\d+$/.test(s);
}

/** Compute the ISBN-10 check character (0-9 or X) for a 9-digit body. */
export function computeIsbn10Check(body: string): string {
  if (!isDigits(body) || body.length !== 9) {
    throw new Error('ISBN-10 body must be exactly 9 digits');
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

export function validateIsbn10(input: string): boolean {
  const code = normalize(input);
  if (code.length !== 10) return false;
  const body = code.slice(0, 9);
  const check = code.slice(9);
  if (!isDigits(body) || !/^[0-9X]$/.test(check)) return false;
  return computeIsbn10Check(body) === check;
}

/** Compute the EAN-13 / ISBN-13 check digit for a 12-digit body. */
export function computeEan13Check(body: string): string {
  if (!isDigits(body) || body.length !== 12) {
    throw new Error('EAN-13 body must be exactly 12 digits');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function validateEan13(input: string): boolean {
  const code = normalize(input);
  if (code.length !== 13 || !isDigits(code)) return false;
  return computeEan13Check(code.slice(0, 12)) === code.slice(12);
}

/** Compute the UPC-A check digit for an 11-digit body. */
export function computeUpcACheck(body: string): string {
  if (!isDigits(body) || body.length !== 11) {
    throw new Error('UPC-A body must be exactly 11 digits');
  }
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(body[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

export function validateUpcA(input: string): boolean {
  const code = normalize(input);
  if (code.length !== 12 || !isDigits(code)) return false;
  return computeUpcACheck(code.slice(0, 11)) === code.slice(11);
}

/**
 * Re-key a valid ISBN-10 as an ISBN-13 under the 978 prefix, recomputing
 * the check digit rather than reusing the old one (they use different math).
 */
export function isbn10ToIsbn13(input: string): string {
  const code = normalize(input);
  if (!validateIsbn10(code)) throw new Error('not a valid ISBN-10');
  const body = '978' + code.slice(0, 9);
  return body + computeEan13Check(body);
}

/** Guess the format from length and validate it accordingly. */
export function validate(input: string): ValidationResult {
  const code = normalize(input);
  if (code.length === 10) return { valid: validateIsbn10(code), format: 'isbn10' };
  if (code.length === 12) return { valid: validateUpcA(code), format: 'upca' };
  if (code.length === 13) return { valid: validateEan13(code), format: 'isbn13' };
  return { valid: false, format: null };
}
