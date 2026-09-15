// Reads pixel data out of PGM ("P5") and PPM ("P6") image files - the
// simplest image formats with a documented byte layout and no compression,
// so a barcode scanner can get at pixels without an image-decoding
// dependency - and turns a grayscale scanline into the bar/space run
// lengths src/barcode-scan.ts's runLengthsToModules expects. Between the
// two, this file is the pixel-handling half of "read a barcode from an
// image"; barcode-scan.ts is the other half, turning those runs into a
// module string and then a code, once you have them.

export interface GrayscaleImage {
  width: number;
  height: number;
  /** One grayscale sample per pixel, row-major, 0-255. */
  pixels: Uint8Array;
}

function isPnmWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

// PNM headers allow '#' comments (to end of line) between any two header
// tokens, so a token reader has to skip both whitespace and comments before
// it can tell where the next token starts.
function skipWhitespaceAndComments(data: Uint8Array, pos: number): number {
  while (pos < data.length) {
    const byte = data[pos];
    if (byte === 0x23 /* '#' */) {
      while (pos < data.length && data[pos] !== 0x0a) pos++;
    } else if (isPnmWhitespace(byte)) {
      pos++;
    } else {
      break;
    }
  }
  return pos;
}

function readToken(data: Uint8Array, pos: number): { token: string; next: number } {
  pos = skipWhitespaceAndComments(data, pos);
  const start = pos;
  while (pos < data.length && !isPnmWhitespace(data[pos]) && data[pos] !== 0x23) pos++;
  if (pos === start) {
    throw new Error('unexpected end of PNM header');
  }
  let token = '';
  for (let i = start; i < pos; i++) token += String.fromCharCode(data[i]);
  return { token, next: pos };
}

function readIntToken(data: Uint8Array, pos: number, what: string): { value: number; next: number } {
  const { token, next } = readToken(data, pos);
  const value = Number(token);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid ${what} in PNM header: '${token}'`);
  }
  return { value, next };
}

/**
 * Parse a binary PGM (P5) or PPM (P6) image into 8-bit grayscale samples.
 * PPM's three channels are combined with the standard luma weights
 * (0.299R + 0.587G + 0.114B) - fine for finding bar/space contrast, which is
 * all a barcode scanner needs from the image. Only 8-bit-per-channel files
 * (maxval <= 255) are supported; that covers what any ordinary image tool
 * writes; ASCII PNM (P2/P3) and 16-bit maxval aren't handled.
 */
export function parsePnmGrayscale(data: Uint8Array): GrayscaleImage {
  if (data.length < 2 || data[0] !== 0x50 /* 'P' */) {
    throw new Error('not a PNM file: missing P5/P6 magic number');
  }
  const magic = String.fromCharCode(data[0], data[1]);
  if (magic !== 'P5' && magic !== 'P6') {
    throw new Error(`unsupported PNM type '${magic}': only P5 (PGM) and P6 (PPM) are supported`);
  }
  const channels = magic === 'P5' ? 1 : 3;

  let pos = 2;
  const width = readIntToken(data, pos, 'width');
  pos = width.next;
  const height = readIntToken(data, pos, 'height');
  pos = height.next;
  const maxval = readIntToken(data, pos, 'maxval');
  pos = maxval.next;
  if (maxval.value > 255) {
    throw new Error(`maxval ${maxval.value} > 255 (16-bit PNM) is not supported`);
  }
  // Exactly one whitespace byte separates the maxval token from the raster.
  if (pos >= data.length || !isPnmWhitespace(data[pos])) {
    throw new Error('missing whitespace between PNM header and raster data');
  }
  pos += 1;

  const pixelCount = width.value * height.value;
  const rasterBytes = pixelCount * channels;
  if (data.length - pos < rasterBytes) {
    throw new Error(
      `truncated PNM raster: expected ${rasterBytes} bytes of pixel data, got ${data.length - pos}`,
    );
  }

  const pixels = new Uint8Array(pixelCount);
  if (channels === 1) {
    pixels.set(data.subarray(pos, pos + pixelCount));
  } else {
    for (let i = 0; i < pixelCount; i++) {
      const base = pos + i * 3;
      pixels[i] = Math.round(0.299 * data[base] + 0.587 * data[base + 1] + 0.114 * data[base + 2]);
    }
  }

  return { width: width.value, height: height.value, pixels };
}

/** Read one row of a grayscale image as a scanline of pixel values. */
export function getRow(image: GrayscaleImage, y: number): Uint8Array {
  if (!Number.isInteger(y) || y < 0 || y >= image.height) {
    throw new Error(`row ${y} out of range for image of height ${image.height}`);
  }
  return image.pixels.subarray(y * image.width, (y + 1) * image.width);
}

export interface ScanlineRuns {
  /** Pixel widths of alternating bar/space runs, covering the whole scanline. */
  runs: number[];
  /** Whether the first run (runs[0]) is a bar (dark) or a space (light). */
  firstRunIsBar: boolean;
}

/**
 * Split a threshold in half between the darkest and lightest pixel in the
 * scanline. That's a good enough black/white cutoff for a barcode, which is
 * high-contrast by design (printed bars on a light background) and doesn't
 * need Otsu's method or any other histogram-shape-sensitive threshold.
 */
function midpointThreshold(scanline: Uint8Array): number {
  let min = 255;
  let max = 0;
  for (const pixel of scanline) {
    if (pixel < min) min = pixel;
    if (pixel > max) max = pixel;
  }
  return (min + max) / 2;
}

/**
 * Threshold a grayscale scanline into alternating bar (dark)/space (light)
 * run lengths, covering the full scanline - including the quiet zone and
 * anything outside the barcode, which a caller still has to locate the start
 * guard within. A pixel darker than `threshold` counts as part of a bar;
 * `threshold` defaults to the midpoint between the scanline's darkest and
 * lightest pixel, which only works if the scanline actually crosses a
 * barcode's black/white contrast - pass an explicit threshold if you've
 * measured a better one (e.g. from the whole image rather than one row).
 */
export function thresholdScanline(scanline: Uint8Array, threshold?: number): ScanlineRuns {
  if (scanline.length === 0) {
    throw new Error('scanline must have at least one pixel');
  }
  const t = threshold ?? midpointThreshold(scanline);

  const firstRunIsBar = scanline[0] < t;
  const runs: number[] = [];
  let bit = firstRunIsBar;
  let runLength = 0;
  for (const pixel of scanline) {
    const isBar = pixel < t;
    if (isBar === bit) {
      runLength++;
    } else {
      runs.push(runLength);
      bit = isBar;
      runLength = 1;
    }
  }
  runs.push(runLength);

  return { runs, firstRunIsBar };
}
