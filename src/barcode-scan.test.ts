import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeEan13Modules, decodeEan13Modules } from './barcode-scan';

test('decodeEan13Modules round-trips a code encoded by encodeEan13Modules', () => {
  // 4006381333931 is the same real, commonly cited EAN-13 used to test
  // computeEan13Check.
  const modules = encodeEan13Modules('4006381333931');
  assert.equal(decodeEan13Modules(modules), '4006381333931');
});

test('decodeEan13Modules round-trips an ISBN-13', () => {
  const modules = encodeEan13Modules('9780306406157');
  assert.equal(decodeEan13Modules(modules), '9780306406157');
});

test('decodeEan13Modules reads a UPC-A symbol as EAN-13 with an implied leading 0', () => {
  // 036000291452 is the same real, commonly cited UPC-A used to test
  // computeUpcACheck; as a bar pattern it's indistinguishable from the
  // EAN-13 symbol for "0036000291452".
  const modules = encodeEan13Modules('0036000291452');
  assert.equal(decodeEan13Modules(modules), '0036000291452');
});

test('encodeEan13Modules produces exactly 95 modules of 0s and 1s', () => {
  const modules = encodeEan13Modules('4006381333931');
  assert.equal(modules.length, 95);
  assert.match(modules, /^[01]+$/);
});

test('encodeEan13Modules rejects codes of the wrong length or shape', () => {
  assert.throws(() => encodeEan13Modules('400638133393'));
  assert.throws(() => encodeEan13Modules('40063813339312'));
  assert.throws(() => encodeEan13Modules('400638133393X'));
});

test('decodeEan13Modules rejects a pattern of the wrong length', () => {
  const modules = encodeEan13Modules('4006381333931');
  assert.throws(() => decodeEan13Modules(modules.slice(0, 94)));
  assert.throws(() => decodeEan13Modules(modules + '0'));
});

test('decodeEan13Modules rejects a pattern with a broken start guard', () => {
  const modules = encodeEan13Modules('4006381333931');
  const broken = '111' + modules.slice(3);
  assert.throws(() => decodeEan13Modules(broken), /start guard/);
});

test('decodeEan13Modules rejects a pattern with a broken middle guard', () => {
  const modules = encodeEan13Modules('4006381333931');
  const broken = modules.slice(0, 45) + '11111' + modules.slice(50);
  assert.throws(() => decodeEan13Modules(broken), /middle guard/);
});

test('decodeEan13Modules rejects a pattern with a broken end guard', () => {
  const modules = encodeEan13Modules('4006381333931');
  const broken = modules.slice(0, 92) + '111';
  assert.throws(() => decodeEan13Modules(broken), /end guard/);
});

test('decodeEan13Modules rejects a digit group matching neither L nor G code', () => {
  const modules = encodeEan13Modules('4006381333931');
  // Flip the first left-hand digit group to all-black, which is not a valid
  // pattern in either table.
  const broken = modules.slice(0, 3) + '1111111' + modules.slice(10);
  assert.throws(() => decodeEan13Modules(broken), /unrecognized left-hand digit pattern/);
});

test('decodeEan13Modules rejects a left-hand parity pattern with no matching first digit', () => {
  // No FIRST_DIGIT_PARITY entry is all-G; forcing every left-hand digit to
  // its G-code pattern can't correspond to any leading digit.
  const modules = encodeEan13Modules('4006381333931');
  const gCodeForZero = modules.slice(10, 17); // digit position 2 used G-code for a 0 in this code
  const forcedAllG = modules.slice(0, 3) + gCodeForZero.repeat(6) + modules.slice(45);
  assert.throws(() => decodeEan13Modules(forcedAllG), /left-hand parity pattern/);
});

test('decodeEan13Modules rejects a digit group matching neither R code', () => {
  const modules = encodeEan13Modules('4006381333931');
  const broken = modules.slice(0, 50) + '1111111' + modules.slice(57);
  assert.throws(() => decodeEan13Modules(broken), /unrecognized right-hand digit pattern/);
});
