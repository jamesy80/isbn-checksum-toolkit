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

$ checksum to13 0-306-40615-2
9780306406157
```

`check` exits 0 for a valid code and 1 for an invalid or unrecognized one, so
it's usable as a shell test.

## Tests

```
$ npm test
```

Runs against Node's built-in test runner (`node:test`), no test framework
dependency needed. `checksum.test.ts` covers each algorithm's check-digit
math, the X check character, hyphen/space normalization, and the format
guessing in `validate`, including the EAN-8/ISSN ambiguity at length 8.

## Status

Core checksum math (ISBN-10, ISBN-13/EAN-13, UPC-A, ISSN, EAN-8), a working
CLI, and unit tests are in place. Not yet handled: batch validation from a
file, a `--format` flag to force a format instead of guessing by length, and
reading codes from a barcode image - see the roadmap in the issue tracker for
what's next.
