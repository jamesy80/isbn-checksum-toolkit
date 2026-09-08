// Translates between a 13-digit EAN-13 code and the 95-module black/white
// pattern a scanner sees for it ('1' = black module, '0' = white module).
// This is the symbol-decoding core of "read a barcode from an image" - it
// doesn't touch pixels or image files. runLengthsToModules turns a
// scanline's measured bar/space widths into a module string; what's still
// missing is locating that scanline (the guard patterns and the bar/space
// runs that make it up) in actual image pixels.
//
// UPC-A barcodes decode here too: a UPC-A symbol is physically identical to
// the EAN-13 symbol for "0" followed by the UPC-A's 11 digits and check
// digit, so decodeEan13Modules on one just comes back with a leading 0.

const START_GUARD = '101';
const MIDDLE_GUARD = '01010';
const END_GUARD = '101';

const MODULE_COUNT = START_GUARD.length + 6 * 7 + MIDDLE_GUARD.length + 6 * 7 + END_GUARD.length;

function isDigits(s: string): boolean {
  return s.length > 0 && /^\d+$/.test(s);
}

function complement(pattern: string): string {
  return pattern.replace(/[01]/g, (bit) => (bit === '0' ? '1' : '0'));
}

function reverse(pattern: string): string {
  return pattern.split('').reverse().join('');
}

// Left-hand "odd parity" digit patterns (also the only patterns UPC-A uses
// on its left half). G-code and R-code are both derived from this table
// rather than listed separately, so a transcription mistake here can't make
// the three tables quietly disagree with each other.
const L_CODE: readonly string[] = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

// Right-hand digit patterns: the bitwise complement of L-code.
const R_CODE: readonly string[] = L_CODE.map(complement);

// Left-hand "even parity" digit patterns: the complement of L-code reversed.
const G_CODE: readonly string[] = L_CODE.map((pattern) => complement(reverse(pattern)));

// Which of L/G each of the 6 left-hand digits uses, keyed by the leading
// digit that pattern implies. EAN-13 doesn't encode its first digit as its
// own 7-module group - a reader recovers it from this parity pattern
// instead, which is what makes a 13-digit code fit in 12 digits' worth of
// digit groups.
const FIRST_DIGIT_PARITY: readonly string[] = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/** Encode a 13-digit EAN-13/ISBN-13 code as its 95-module bar/space pattern. */
export function encodeEan13Modules(digits: string): string {
  if (!isDigits(digits) || digits.length !== 13) {
    throw new Error('EAN-13 code must be exactly 13 digits');
  }
  const parity = FIRST_DIGIT_PARITY[Number(digits[0])];
  let left = '';
  for (let i = 0; i < 6; i++) {
    const d = Number(digits[i + 1]);
    left += parity[i] === 'L' ? L_CODE[d] : G_CODE[d];
  }
  let right = '';
  for (let i = 0; i < 6; i++) right += R_CODE[Number(digits[i + 7])];
  return START_GUARD + left + MIDDLE_GUARD + right + END_GUARD;
}

/**
 * Decode a 95-module EAN-13 pattern back into its 13 digits. Throws if the
 * guard patterns are missing or a digit group doesn't match any known
 * pattern - both symptoms of a bad module string, whether that's corrupted
 * test input or (eventually) a mis-measured scan.
 */
export function decodeEan13Modules(modules: string): string {
  if (!/^[01]+$/.test(modules) || modules.length !== MODULE_COUNT) {
    throw new Error(`EAN-13 pattern must be exactly ${MODULE_COUNT} modules of 0s and 1s`);
  }
  if (modules.slice(0, 3) !== START_GUARD) {
    throw new Error('missing start guard pattern');
  }
  const middleStart = 3 + 6 * 7;
  if (modules.slice(middleStart, middleStart + 5) !== MIDDLE_GUARD) {
    throw new Error('missing middle guard pattern');
  }
  if (modules.slice(MODULE_COUNT - 3) !== END_GUARD) {
    throw new Error('missing end guard pattern');
  }

  const left = modules.slice(3, middleStart);
  const right = modules.slice(middleStart + 5, MODULE_COUNT - 3);

  let parity = '';
  let leftDigits = '';
  for (let i = 0; i < 6; i++) {
    const group = left.slice(i * 7, i * 7 + 7);
    const lIndex = L_CODE.indexOf(group);
    if (lIndex !== -1) {
      parity += 'L';
      leftDigits += lIndex;
      continue;
    }
    const gIndex = G_CODE.indexOf(group);
    if (gIndex === -1) {
      throw new Error(`unrecognized left-hand digit pattern at position ${i + 1}`);
    }
    parity += 'G';
    leftDigits += gIndex;
  }

  const firstDigit = FIRST_DIGIT_PARITY.indexOf(parity);
  if (firstDigit === -1) {
    throw new Error(`left-hand parity pattern '${parity}' doesn't match any digit`);
  }

  let rightDigits = '';
  for (let i = 0; i < 6; i++) {
    const group = right.slice(i * 7, i * 7 + 7);
    const rIndex = R_CODE.indexOf(group);
    if (rIndex === -1) {
      throw new Error(`unrecognized right-hand digit pattern at position ${i + 1}`);
    }
    rightDigits += rIndex;
  }

  return String(firstDigit) + leftDigits + rightDigits;
}

/**
 * Turn a scanline's run lengths (alternating pixel widths of bar and space,
 * starting from the first bar of the start guard - no leading quiet zone)
 * into a module string of '1'/'0' characters, `moduleCount` long.
 *
 * A scanned bar is rarely an exact multiple of the module width in pixels,
 * so rounding each run independently would drift: small per-run errors
 * accumulate over the length of the symbol and the last few digits come out
 * shifted by a module. Instead this rounds the *cumulative* pixel position
 * of each run boundary to the nearest module boundary, which is
 * self-correcting - a run that measured a little wide steals a fraction of
 * a module back from the next one instead of carrying the error forward.
 */
export function runLengthsToModules(
  runs: readonly number[],
  moduleCount: number,
  firstRunIsBar: boolean,
): string {
  if (runs.length === 0) {
    throw new Error('need at least one run');
  }
  if (!Number.isInteger(moduleCount) || moduleCount <= 0) {
    throw new Error('moduleCount must be a positive integer');
  }
  for (const run of runs) {
    if (!Number.isFinite(run) || run <= 0) {
      throw new Error('each run length must be a positive number');
    }
  }

  const total = runs.reduce((sum, run) => sum + run, 0);
  const moduleWidth = total / moduleCount;

  let modules = '';
  let modulesSoFar = 0;
  let pixelsSoFar = 0;
  let bit = firstRunIsBar;
  for (const run of runs) {
    pixelsSoFar += run;
    const targetModules = Math.round(pixelsSoFar / moduleWidth);
    const count = Math.max(1, targetModules - modulesSoFar);
    modules += (bit ? '1' : '0').repeat(count);
    modulesSoFar += count;
    bit = !bit;
  }

  if (modules.length !== moduleCount) {
    throw new Error(
      `scanline decoded to ${modules.length} modules, expected ${moduleCount} - runs don't match a symbol of this size`,
    );
  }
  return modules;
}

/**
 * Convenience wrapper of runLengthsToModules for EAN-13/UPC-A's fixed
 * 95-module width. The start guard '101' always begins with a bar, so
 * `runs` must start at that bar (no leading quiet zone run).
 */
export function runLengthsToEan13Modules(runs: readonly number[]): string {
  return runLengthsToModules(runs, MODULE_COUNT, true);
}
