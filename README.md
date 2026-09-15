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

`runLengthsToModules` turns a scanline's pixel run lengths - the widths of
its alternating bar/space runs, starting from the first bar of the start
guard, no leading quiet zone - into a module string, without needing the
runs to be exact multiples of a pixel-perfect module width:

```ts
import { runLengthsToEan13Modules, decodeEan13Modules } from './src/barcode-scan';

// each number is a run's width in pixels, alternating bar/space/bar/...
const runs = [8, 3, 8, 3, 3, 3, 5, /* ...95 modules' worth... */];
decodeEan13Modules(runLengthsToEan13Modules(runs)); // the 13-digit code
```

It rounds each run's *cumulative* pixel position to the nearest module
boundary rather than rounding each run independently, so small per-run
measurement error doesn't compound into a drift that shifts the last few
digits by a module.

This is still the symbol-decoding half of "read a code from a barcode
image": it turns pixel measurements into a module string, but nothing yet
locates those bar/space runs in a scanline - that needs a scanline extracted
from actual pixels first, which is what `src/pnm.ts` now provides.

## Reading image pixels

`src/pnm.ts` reads pixel data out of PGM (`P5`) and PPM (`P6`) files, the
simplest image formats with a plain documented byte layout:

```ts
import { readFileSync } from 'node:fs';
import { parsePnmGrayscale, getRow } from './src/pnm';

const image = parsePnmGrayscale(readFileSync('barcode.ppm'));
const scanline = getRow(image, Math.floor(image.height / 2));
```

`parsePnmGrayscale` returns a single 8-bit grayscale sample per pixel; a PPM's
three channels are combined with the standard luma weights
(0.299R + 0.587G + 0.114B), since a barcode scanner only needs bar/space
contrast, not color. Only 8-bit-per-channel files are supported - that's what
any ordinary image tool writes; ASCII PNM (`P2`/`P3`) and 16-bit maxval
aren't handled. `getRow` slices out one row as a scanline.

`thresholdScanline` turns a grayscale scanline into those bar/space run
lengths, splitting pixels into black/white against a threshold - by default
the midpoint between the scanline's own darkest and lightest pixel, which is
enough for a barcode's high-contrast bars but can be overridden with an
explicit value if a caller has measured a better one:

```ts
import { parsePnmGrayscale, getRow, thresholdScanline } from './src/pnm';
import { runLengthsToEan13Modules, decodeEan13Modules } from './src/barcode-scan';

const image = parsePnmGrayscale(readFileSync('barcode.ppm'));
const scanline = getRow(image, Math.floor(image.height / 2));
const { runs } = thresholdScanline(scanline);
```

Its runs cover the whole scanline, quiet zone and all - what's still missing
is locating the start guard within them (`runLengthsToEan13Modules` expects
runs starting at that guard's first bar, no leading quiet zone), and a CLI
`scan` command to drive the whole pipeline from an image file to a validated
code.

## Tests

```
$ npm test
```

Runs against Node's built-in test runner (`node:test`), no test framework
dependency needed. `checksum.test.ts` covers each algorithm's check-digit
math, the X check character, hyphen/space normalization, and the format
guessing in `validate`, including the EAN-8/ISSN ambiguity at length 8.
`barcode-scan.test.ts` covers the module encode/decode round trip, the
guard/parity/digit-pattern error cases, and the run-length-to-module
conversion (exact and non-integer module widths, and its input validation).
`pnm.test.ts` covers PGM and PPM parsing (including comments and whitespace
variation in the header, and the luma conversion for PPM), row extraction,
the header/raster validation error cases, and scanline thresholding
(default and explicit threshold, which run starts first, and a uniform
scanline with no contrast at all).

## Status

Core checksum math (ISBN-10, ISBN-13/EAN-13, UPC-A, ISSN, EAN-8), a working
CLI with format-forcing via `--format` and file-based `batch` validation, and
package metadata for an npm release are in place. Reading codes from a
barcode image is in progress: the EAN-13/UPC-A module decoder can turn a
scanline's pixel run lengths into a module string, and `src/pnm.ts` can read
pixels out of a PGM/PPM file, hand back a scanline, and threshold that
scanline into bar/space run lengths. What's left is locating the start guard
within those runs, and a CLI `scan` command to wire the pieces together.
