import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeEan13Modules,
  decodeEan13Modules,
  runLengthsToModules,
  runLengthsToEan13Modules,
  findEan13StartGuardIndex,
} from './barcode-scan';

/** Turn a module string into pixel run lengths, each module `pixelsPerModule` pixels wide. */
function modulesToRuns(modules: string, pixelsPerModule: number): number[] {
  const runs: number[] = [];
  let i = 0;
  while (i < modules.length) {
    let j = i;
    while (j < modules.length && modules[j] === modules[i]) j++;
    runs.push((j - i) * pixelsPerModule);
    i = j;
  }
  return runs;
}

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

test('runLengthsToModules round-trips an exact-pixel-multiple scanline', () => {
  const modules = encodeEan13Modules('4006381333931');
  const runs = modulesToRuns(modules, 3);
  assert.equal(runLengthsToModules(runs, 95, true), modules);
});

test('runLengthsToModules round-trips a scanline with a non-integer module width', () => {
  const modules = encodeEan13Modules('4006381333931');
  // 2.6 pixels/module, then quantized to whole pixels the way a real image
  // sensor would measure a run. Rounding each run independently accumulates
  // that quantization error over 95 modules and drifts off by the end;
  // cumulative-position rounding self-corrects it.
  const moduleCounts = modulesToRuns(modules, 1);
  const runs = moduleCounts.map((count) => Math.round(count * 2.6));
  assert.equal(runLengthsToModules(runs, 95, true), modules);
});

test('runLengthsToModules rejects an empty run list', () => {
  assert.throws(() => runLengthsToModules([], 95, true), /at least one run/);
});

test('runLengthsToModules rejects a non-positive moduleCount', () => {
  assert.throws(() => runLengthsToModules([3, 3, 3], 0, true), /moduleCount/);
});

test('runLengthsToModules rejects a zero or negative run length', () => {
  assert.throws(() => runLengthsToModules([3, 0, 3], 95, true), /run length/);
  assert.throws(() => runLengthsToModules([3, -1, 3], 95, true), /run length/);
});

test('runLengthsToModules rejects runs finer-grained than moduleCount can represent', () => {
  // 200 single-pixel runs for a 95-module symbol: each run is forced to at
  // least 1 module regardless of what its share of the total width would
  // naturally round to, so the result overshoots moduleCount.
  const runs = new Array(200).fill(1);
  assert.throws(() => runLengthsToModules(runs, 95, true), /expected 95/);
});

test('runLengthsToEan13Modules feeds straight into decodeEan13Modules', () => {
  const code = '9780306406157';
  const runs = modulesToRuns(encodeEan13Modules(code), 4);
  assert.equal(decodeEan13Modules(runLengthsToEan13Modules(runs)), code);
});

test('findEan13StartGuardIndex locates the guard after a quiet zone', () => {
  const runs = [30, ...modulesToRuns(encodeEan13Modules('4006381333931'), 3)];
  assert.equal(findEan13StartGuardIndex(runs, false), 1);
});

test('findEan13StartGuardIndex accepts the guard as the very first run', () => {
  const runs = modulesToRuns(encodeEan13Modules('4006381333931'), 3);
  assert.equal(findEan13StartGuardIndex(runs, true), 0);
});

test('findEan13StartGuardIndex works with a non-integer module width', () => {
  const moduleCounts = modulesToRuns(encodeEan13Modules('4006381333931'), 1);
  const symbolRuns = moduleCounts.map((count) => Math.round(count * 2.6));
  const runs = [50, ...symbolRuns];
  assert.equal(findEan13StartGuardIndex(runs, false), 1);
});

test('findEan13StartGuardIndex result feeds into runLengthsToEan13Modules and decodeEan13Modules', () => {
  const code = '9780306406157';
  const runs = [40, ...modulesToRuns(encodeEan13Modules(code), 4)];
  const startIndex = findEan13StartGuardIndex(runs, false);
  const symbolRuns = runs.slice(startIndex);
  assert.equal(decodeEan13Modules(runLengthsToEan13Modules(symbolRuns)), code);
});

test('findEan13StartGuardIndex throws with fewer than 3 runs', () => {
  assert.throws(() => findEan13StartGuardIndex([4, 4], true), /at least 3 runs/);
});

test('findEan13StartGuardIndex throws when no start guard is present', () => {
  assert.throws(() => findEan13StartGuardIndex([50, 4, 4], false), /no EAN-13 start guard/);
});

test('findEan13StartGuardIndex is not fooled by an even-width triple with no quiet zone before it', () => {
  // [5, 5, 5] looks like a guard in isolation, but it's preceded by another
  // run of the same width rather than a quiet zone, so it should be
  // rejected - and here there's nothing else to find, so it throws.
  assert.throws(() => findEan13StartGuardIndex([5, 5, 5, 5, 5], false), /no EAN-13 start guard/);
});
