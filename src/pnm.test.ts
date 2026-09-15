import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePnmGrayscale, getRow, thresholdScanline } from './pnm';

/** Build the raw bytes of a binary PGM/PPM file from a header string and raster bytes. */
function pnmBytes(header: string, raster: number[]): Uint8Array {
  const headerBytes = Array.from(header, (ch) => ch.charCodeAt(0));
  return Uint8Array.from([...headerBytes, ...raster]);
}

test('parsePnmGrayscale reads a PGM (P5) image as-is', () => {
  const raster = [0, 64, 128, 192, 255, 32, 96, 160, 224, 16, 48, 200];
  const bytes = pnmBytes('P5\n4 3\n255\n', raster);
  const image = parsePnmGrayscale(bytes);
  assert.equal(image.width, 4);
  assert.equal(image.height, 3);
  assert.deepEqual(Array.from(image.pixels), raster);
});

test('parsePnmGrayscale converts a PPM (P6) image to luma', () => {
  // Pure red, pure green, pure blue, white.
  const raster = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
  const bytes = pnmBytes('P6\n4 1\n255\n', raster);
  const image = parsePnmGrayscale(bytes);
  assert.equal(image.width, 4);
  assert.equal(image.height, 1);
  assert.deepEqual(
    Array.from(image.pixels),
    [Math.round(0.299 * 255), Math.round(0.587 * 255), Math.round(0.114 * 255), 255],
  );
});

test('parsePnmGrayscale skips comments and tolerates varied whitespace between header tokens', () => {
  const raster = [10, 20, 30, 40];
  const bytes = pnmBytes('P5 # a comment about this image\n2\t2\n255\n', raster);
  const image = parsePnmGrayscale(bytes);
  assert.deepEqual(Array.from(image.pixels), raster);
});

test('parsePnmGrayscale rejects a file with no PNM magic number', () => {
  assert.throws(() => parsePnmGrayscale(Uint8Array.from([0, 1, 2])), /magic number/);
});

test('parsePnmGrayscale rejects an unsupported PNM type', () => {
  const bytes = pnmBytes('P3\n1 1\n255\n', [0]);
  assert.throws(() => parsePnmGrayscale(bytes), /unsupported PNM type/);
});

test('parsePnmGrayscale rejects a maxval above 255', () => {
  const bytes = pnmBytes('P5\n1 1\n65535\n', [0, 0]);
  assert.throws(() => parsePnmGrayscale(bytes), /16-bit/);
});

test('parsePnmGrayscale rejects a truncated raster', () => {
  const bytes = pnmBytes('P5\n2 2\n255\n', [1, 2, 3]);
  assert.throws(() => parsePnmGrayscale(bytes), /truncated PNM raster/);
});

test('parsePnmGrayscale rejects a header with a non-numeric dimension', () => {
  const bytes = pnmBytes('P5\nfour 2\n255\n', [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => parsePnmGrayscale(bytes), /invalid width/);
});

test('getRow returns the correct slice of pixels for a given row', () => {
  const raster = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const bytes = pnmBytes('P5\n4 3\n255\n', raster);
  const image = parsePnmGrayscale(bytes);
  assert.deepEqual(Array.from(getRow(image, 0)), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(getRow(image, 1)), [4, 5, 6, 7]);
  assert.deepEqual(Array.from(getRow(image, 2)), [8, 9, 10, 11]);
});

test('getRow rejects an out-of-range row', () => {
  const bytes = pnmBytes('P5\n2 2\n255\n', [1, 2, 3, 4]);
  const image = parsePnmGrayscale(bytes);
  assert.throws(() => getRow(image, 2), /out of range/);
  assert.throws(() => getRow(image, -1), /out of range/);
});

test('thresholdScanline splits a clean black/white scanline into runs', () => {
  const scanline = Uint8Array.from([0, 0, 0, 255, 255, 0, 0, 255]);
  const { runs, firstRunIsBar } = thresholdScanline(scanline);
  assert.equal(firstRunIsBar, true);
  assert.deepEqual(runs, [3, 2, 2, 1]);
});

test('thresholdScanline starts with a space run when the scanline starts light', () => {
  const scanline = Uint8Array.from([255, 255, 0, 0, 0, 255]);
  const { runs, firstRunIsBar } = thresholdScanline(scanline);
  assert.equal(firstRunIsBar, false);
  assert.deepEqual(runs, [2, 3, 1]);
});

test('thresholdScanline defaults to the midpoint of the scanline\'s own contrast', () => {
  // Darkest pixel is 50, lightest is 150; midpoint 100 puts 90 on the dark
  // side and 110 on the light side, even though neither is near 0 or 255.
  const scanline = Uint8Array.from([50, 90, 110, 150]);
  const { runs, firstRunIsBar } = thresholdScanline(scanline);
  assert.equal(firstRunIsBar, true);
  assert.deepEqual(runs, [2, 2]);
});

test('thresholdScanline accepts an explicit threshold instead of the auto midpoint', () => {
  const scanline = Uint8Array.from([50, 90, 110, 150]);
  // With a threshold of 200 every pixel counts as dark.
  const { runs, firstRunIsBar } = thresholdScanline(scanline, 200);
  assert.equal(firstRunIsBar, true);
  assert.deepEqual(runs, [4]);
});

test('thresholdScanline treats a uniform scanline as one run', () => {
  const scanline = Uint8Array.from([128, 128, 128, 128]);
  const { runs, firstRunIsBar } = thresholdScanline(scanline);
  assert.equal(firstRunIsBar, false);
  assert.deepEqual(runs, [4]);
});

test('thresholdScanline rejects an empty scanline', () => {
  assert.throws(() => thresholdScanline(Uint8Array.from([])), /at least one pixel/);
});
