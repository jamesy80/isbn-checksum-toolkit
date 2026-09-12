// Reads pixel data out of PGM ("P5") and PPM ("P6") image files - the
// simplest image formats with a documented byte layout and no compression,
// so a barcode scanner can get at pixels without an image-decoding
// dependency. This is the pixel-reading half of "read a barcode from an
// image"; src/barcode-scan.ts is the other half, turning a scanline's
// bar/space runs into a module string once you have one.

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
