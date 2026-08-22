#!/usr/bin/env node
import {
  validate,
  computeIsbn10Check,
  computeEan13Check,
  computeUpcACheck,
  computeIssnCheck,
  computeEan8Check,
  isbn10ToIsbn13,
} from './checksum';

function usage(): void {
  console.error(`usage:
  checksum check <code>          detect format (8/10/12/13 digits) and validate
  checksum gen10 <9 digits>      compute the ISBN-10 check character
  checksum gen13 <12 digits>     compute the ISBN-13/EAN-13 check digit
  checksum genupc <11 digits>    compute the UPC-A check digit
  checksum genissn <7 digits>    compute the ISSN check character
  checksum genean8 <7 digits>    compute the EAN-8 check digit
  checksum to13 <isbn10>         convert an ISBN-10 to ISBN-13 (978 prefix)

  An 8-digit code is ambiguous between ISSN and EAN-8; "check" guesses
  EAN-8 first and falls back to ISSN. Use genissn/genean8 directly if you
  already know which one you have.`);
}

function main(argv: string[]): number {
  const [command, arg] = argv;

  try {
    switch (command) {
      case 'check': {
        if (!arg) return fail('missing <code>');
        const result = validate(arg);
        if (!result.format) return fail('code must be 10, 12, or 13 digits long');
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
