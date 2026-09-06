# isbn-checksum-toolkit

Every book barcode and most retail barcodes carry a check digit so a scanner
(or a human typing a code into a form) can catch a mistyped or misread digit
without a network round trip. The catch is that the formats you'll run into -
ISBN-10, ISBN-13/EAN-13, UPC-A, ISSN, and EAN-8 - each compute that digit with
a different algorithm, and it's easy to get the weighting backwards when you
port one by hand. This is a small TypeScript library plus a CLI that does
those algorithms correctly, with no dependencies.

## Formats

- **ISBN-10** - mod 11 over positions weighted 10 down to 1; the check
  character can be `X` (standing in for 10).
- **ISBN-13 / EAN-13** - mod 10 over 12 digits with alternating weights
  1, 3, 1, 3, ...
- **UPC-A** - mod 10 over 11 digits with alternating weights 3, 1, 3, 1, ...
  (the mirror of EAN-13's pattern).
- **ISSN** - mod 11 over 7 digits weighted 8 down to 2; the check character
  can be `X`, same idea as ISBN-10.
- **EAN-8** - mod 10 over 7 digits with the same alternating 3, 1, 3, 1, ...
  weights as UPC-A.

ISSN and EAN-8 are both 8 characters, so `validate()` can't tell them apart
from length alone. It prefers EAN-8 and falls back to ISSN, except when the
check character is `X`, which only ISSN allows. If you already know which one
you have, call `validateIssn`/`validateEan8` directly instead of `validate`.

## Library usage

```ts
import { validate, computeIsbn10Check, isbn10ToIsbn13 } from './src/checksum';

validate('0-306-40615-2');       // { valid: true, format: 'isbn10' }
validate('978-0-306-40615-7');   // { valid: true, format: 'isbn13' }
computeIsbn10Check('030640615'); // '2'
isbn10ToIsbn13('0-306-40615-2'); // '9780306406157'
```

All functions accept codes with or without hyphens/spaces; hyphens are
stripped before validation, they aren't checked for placement.

## CLI usage

Build once with `npm run build`, then:

```
$ checksum check 0-306-40615-2
isbn10: valid

$ checksum check 978-0-306-40615-8
isbn13: invalid

$ checksum gen13 978030640615
7

$ checksum genissn 0378595
5

$ checksum check 40170725
ean8: valid

$ checksum check 03785955 --format issn
issn: valid

$ checksum to13 0-306-40615-2
9780306406157

$ checksum batch codes.txt
1: 0-306-40615-2 isbn10: valid
2: 978-0-306-40615-8 isbn13: invalid
3: not-a-code unrecognized: not 8, 10, 12, or 13 digits
3 codes checked, 1 valid, 1 invalid, 1 unrecognized
```

`check` exits 0 for a valid code and 1 for an invalid or unrecognized one, so
it's usable as a shell test. By default it guesses the format from the code's
length; pass `--format <isbn10|isbn13|upca|issn|ean8>` to validate against a
specific format instead, which is the only way to resolve the ISSN/EAN-8
ambiguity at length 8 without calling the library functions directly.

`batch <file>` runs `check` over a file with one code per line - blank lines
and lines starting with `#` are skipped - and prints a per-line result plus a
summary count. It takes the same `--format` flag as `check`, applied to every
line. It exits 0 only if every code in the file validates.

## Barcode module decoding

`src/barcode-scan.ts` translates between a 13-digit EAN-13/ISBN-13 code and
the 95-module black/white pattern a scanner would see for it:

```ts
import { encodeEan13Modules, decodeEan13Modules } from './src/barcode-scan';

const modules = encodeEan13Modules('9780306406157');
decodeEan13Modules(modules); // '9780306406157'
```

A UPC-A symbol is physically the same pattern as the EAN-13 symbol for "0"
followed by the UPC-A's own 11 digits and check digit, so
`decodeEan13Modules` reads UPC-A barcodes too - it just comes back with a
leading 0 to strip off.

This is the symbol-decoding half of "read a code from a barcode image";
turning actual image pixels into a module string - finding the guard
patterns and working out how many pixels make up one module - isn't wired
up yet.

## Tests

```
$ npm test
```

Runs against Node's built-in test runner (`node:test`), no test framework
dependency needed. `checksum.test.ts` covers each algorithm's check-digit
math, the X check character, hyphen/space normalization, and the format
guessing in `validate`, including the EAN-8/ISSN ambiguity at length 8.
`barcode-scan.test.ts` covers the module encode/decode round trip and the
guard/parity/digit-pattern error cases.

## Status

Core checksum math (ISBN-10, ISBN-13/EAN-13, UPC-A, ISSN, EAN-8), a working
CLI with format-forcing via `--format` and file-based `batch` validation, and
package metadata for an npm release are in place. Reading codes from a
barcode image is in progress: the EAN-13/UPC-A module decoder is done, but
nothing yet turns image pixels into the module string it expects.
