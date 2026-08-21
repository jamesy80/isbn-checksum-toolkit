import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIsbn10Check,
  validateIsbn10,
  computeEan13Check,
  validateEan13,
  computeUpcACheck,
  validateUpcA,
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
