import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIsbn10Check,
  validateIsbn10,
  computeEan13Check,
  validateEan13,
  computeUpcACheck,
  validateUpcA,
  computeIssnCheck,
  validateIssn,
  computeEan8Check,
  validateEan8,
  isbn10ToIsbn13,
  validate,
} from './checksum';

test('computeIsbn10Check produces a digit check character', () => {
  assert.equal(computeIsbn10Check('030640615'), '2');
});

test('computeIsbn10Check produces X when the remainder is 10', () => {
  // 080442957X is a real, commonly cited ISBN-10 with an X check character.
  assert.equal(computeIsbn10Check('080442957'), 'X');
});

test('computeIsbn10Check rejects bodies of the wrong length or shape', () => {
  assert.throws(() => computeIsbn10Check('12345678'));
  assert.throws(() => computeIsbn10Check('1234567890'));
  assert.throws(() => computeIsbn10Check('03064061X'));
});

test('validateIsbn10 accepts valid codes with hyphens and spaces', () => {
  assert.equal(validateIsbn10('0-306-40615-2'), true);
  assert.equal(validateIsbn10('0 306 40615 2'), true);
});

test('validateIsbn10 accepts a lowercase x check character', () => {
  assert.equal(validateIsbn10('080442957x'), true);
});

test('validateIsbn10 rejects a wrong check character and wrong lengths', () => {
  assert.equal(validateIsbn10('0-306-40615-3'), false);
  assert.equal(validateIsbn10('030640615'), false);
  assert.equal(validateIsbn10('03064061520'), false);
});

test('computeEan13Check produces the correct check digit', () => {
  // 4006381333931 is a real, commonly cited valid EAN-13.
  assert.equal(computeEan13Check('400638133393'), '1');
  assert.equal(computeEan13Check('978030640615'), '7');
});

test('validateEan13 validates full codes and rejects wrong check digits', () => {
  assert.equal(validateEan13('978-0-306-40615-7'), true);
  assert.equal(validateEan13('978-0-306-40615-8'), false);
  assert.equal(validateEan13('97803064061'), false);
});

test('computeUpcACheck produces the correct check digit', () => {
  // 036000291452 is a real, commonly cited valid UPC-A.
  assert.equal(computeUpcACheck('03600029145'), '2');
});

test('validateUpcA validates full codes and rejects wrong check digits', () => {
  assert.equal(validateUpcA('036000291452'), true);
  assert.equal(validateUpcA('036000291453'), false);
  assert.equal(validateUpcA('03600029145'), false);
});

test('computeIssnCheck produces the correct check character', () => {
  // 0378-5955 is a real, commonly cited valid ISSN.
  assert.equal(computeIssnCheck('0378595'), '5');
});

test('computeIssnCheck produces X when the remainder is 10', () => {
  assert.equal(computeIssnCheck('0000006'), 'X');
});

test('computeIssnCheck rejects bodies of the wrong length or shape', () => {
  assert.throws(() => computeIssnCheck('123456'));
  assert.throws(() => computeIssnCheck('12345678'));
  assert.throws(() => computeIssnCheck('037859X'));
});

test('validateIssn validates full codes, including an X check character', () => {
  assert.equal(validateIssn('0378-5955'), true);
  assert.equal(validateIssn('0378-5956'), false);
  assert.equal(validateIssn('0000006X'), true);
  assert.equal(validateIssn('0000006x'), true);
  assert.equal(validateIssn('037859'), false);
});

test('computeEan8Check produces the correct check digit', () => {
  // 40170725 is a real, commonly cited valid EAN-8.
  assert.equal(computeEan8Check('4017072'), '5');
});

test('validateEan8 validates full codes and rejects wrong check digits', () => {
  assert.equal(validateEan8('40170725'), true);
  assert.equal(validateEan8('40170726'), false);
  assert.equal(validateEan8('4017072'), false);
});

test('isbn10ToIsbn13 re-keys under the 978 prefix with a recomputed check digit', () => {
  assert.equal(isbn10ToIsbn13('0-306-40615-2'), '9780306406157');
});

test('isbn10ToIsbn13 rejects an invalid ISBN-10', () => {
  assert.throws(() => isbn10ToIsbn13('0-306-40615-3'));
});

test('validate guesses the format from length', () => {
  assert.deepEqual(validate('0-306-40615-2'), { valid: true, format: 'isbn10' });
  assert.deepEqual(validate('036000291452'), { valid: true, format: 'upca' });
  assert.deepEqual(validate('978-0-306-40615-7'), { valid: true, format: 'isbn13' });
  assert.deepEqual(validate('12345'), { valid: false, format: null });
});

test('validate on an 8-digit code prefers EAN-8, falling back to ISSN', () => {
  // Valid as EAN-8 only.
  assert.deepEqual(validate('40170725'), { valid: true, format: 'ean8' });
  // Valid as ISSN only - not a valid EAN-8 check digit, so it falls back.
  assert.deepEqual(validate('0378-5955'), { valid: true, format: 'issn' });
  // An X check character can only be ISSN; EAN-8 is digits only.
  assert.deepEqual(validate('0000006X'), { valid: true, format: 'issn' });
  // Neither format's check digit matches.
  assert.deepEqual(validate('12345678'), { valid: false, format: 'ean8' });
});
