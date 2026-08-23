#!/usr/bin/env node
import {
  validate,
  validateByFormat,
  isBarcodeFormat,
  computeIsbn10Check,
  computeEan13Check,
  computeUpcACheck,
  computeIssnCheck,
  computeEan8Check,
  isbn10ToIsbn13,
} from './checksum';

function usage(): void {
  console.error(`usage:
  checksum check <code> [--format <format>]
                                  detect format (8/10/12/13 digits) and validate,
                                  or validate against a forced format instead of
                                  guessing by length
  checksum gen10 <9 digits>      compute the ISBN-10 check character
  checksum gen13 <12 digits>     compute the ISBN-13/EAN-13 check digit
  checksum genupc <11 digits>    compute the UPC-A check digit
  checksum genissn <7 digits>    compute the ISSN check character
  checksum genean8 <7 digits>    compute the EAN-8 check digit
  checksum to13 <isbn10>         convert an ISBN-10 to ISBN-13 (978 prefix)

  <format> is one of: isbn10, isbn13, upca, issn, ean8

  An 8-digit code is ambiguous between ISSN and EAN-8; "check" without
  --format guesses EAN-8 first and falls back to ISSN. Pass --format issn
  or --format ean8 (or call genissn/genean8 directly) if you already know
  which one you have.`);
}

/** Pull --format/--format=<value> out of the check command's args. */
function parseCheckArgs(args: string[]): { code?: string; format?: string; error?: string } {
  let code: string | undefined;
  let format: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format') {
      format = args[++i];
      if (format === undefined) return { error: '--format needs a value' };
    } else if (a.startsWith('--format=')) {
      format = a.slice('--format='.length);
    } else if (code === undefined) {
      code = a;
    }
  }
  return { code, format };
}

function main(argv: string[]): number {
  const [command, arg] = argv;

  try {
    switch (command) {
      case 'check': {
        const { code, format, error } = parseCheckArgs(argv.slice(1));
        if (error) return fail(error);
        if (!code) return fail('missing <code>');
        if (format !== undefined) {
          if (!isBarcodeFormat(format)) {
            return fail(`unknown format '${format}' - expected one of isbn10, isbn13, upca, issn, ean8`);
          }
          const valid = validateByFormat(code, format);
          console.log(`${format}: ${valid ? 'valid' : 'invalid'}`);
          return valid ? 0 : 1;
        }
        const result = validate(code);
        if (!result.format) return fail('code must be 8, 10, 12, or 13 digits long');
        console.log(`${result.format}: ${result.valid ? 'valid' : 'invalid'}`);
        return result.valid ? 0 : 1;
      }
      case 'gen10':
        if (!arg) return fail('missing <9 digits>');
        console.log(computeIsbn10Check(arg));
        return 0;
      case 'gen13':
        if (!arg) return fail('missing <12 digits>');
        console.log(computeEan13Check(arg));
        return 0;
      case 'genupc':
        if (!arg) return fail('missing <11 digits>');
        console.log(computeUpcACheck(arg));
        return 0;
      case 'genissn':
        if (!arg) return fail('missing <7 digits>');
        console.log(computeIssnCheck(arg));
        return 0;
      case 'genean8':
        if (!arg) return fail('missing <7 digits>');
        console.log(computeEan8Check(arg));
        return 0;
      case 'to13':
        if (!arg) return fail('missing <isbn10>');
        console.log(isbn10ToIsbn13(arg));
        return 0;
      default:
        usage();
        return command ? 1 : 0;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function fail(message: string): number {
  console.error(message);
  usage();
  return 1;
}

process.exitCode = main(process.argv.slice(2));
