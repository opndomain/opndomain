import {
  OG_IMAGE_SUMMARY_MAX_LENGTH,
  OG_IMAGE_TITLE_MAX_LENGTH,
  topicOgPngArtifactKey,
  topicVerdictPresentationArtifactKey,
  topicVerdictHtmlArtifactKey,
  type VerdictPresentation,
} from "@opndomain/shared";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

type Rgba = readonly [red: number, green: number, blue: number, alpha?: number];

const FONT_WIDTH = 5;
const FONT_HEIGHT = 7;
const FONT_GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "01100", "11000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
  "\"": ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXT_ENCODER = new TextEncoder();

function createPixelBuffer(width: number, height: number, color: Rgba): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3] ?? 255;
  }
  return pixels;
}

function setPixel(pixels: Uint8Array, width: number, x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0) {
    return;
  }
  const index = (y * width + x) * 4;
  if (index < 0 || index + 3 >= pixels.length) {
    return;
  }
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3] ?? 255;
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: Rgba,
): void {
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(width, x + rectWidth);
  const endY = Math.min(height, y + rectHeight);
  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      setPixel(pixels, width, column, row, color);
    }
  }
}

function fillRoundedRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  radius: number,
  color: Rgba,
): void {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const dx = column < x + radius ? x + radius - column : column > x + rectWidth - radius - 1 ? column - (x + rectWidth - radius - 1) : 0;
      const dy = row < y + radius ? y + radius - row : row > y + rectHeight - radius - 1 ? row - (y + rectHeight - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, width, column, row, color);
      }
    }
  }
}

function drawGlyph(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  scale: number,
  character: string,
  color: Rgba,
): void {
  const glyph = FONT_GLYPHS[character] ?? FONT_GLYPHS["?"];
  for (let row = 0; row < FONT_HEIGHT; row += 1) {
    for (let column = 0; column < FONT_WIDTH; column += 1) {
      if (glyph[row]?.[column] !== "1") {
        continue;
      }
      fillRect(pixels, width, height, x + column * scale, y + row * scale, scale, scale, color);
    }
  }
}

function measureTextWidth(text: string, scale: number, letterSpacing: number): number {
  if (text.length === 0) {
    return 0;
  }
  return text.length * FONT_WIDTH * scale + (text.length - 1) * letterSpacing;
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .replace(/[^A-Z0-9 .,:;!?/\-&()'"]/g, "?")
    .trim();
}

function wrapText(text: string, scale: number, letterSpacing: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, scale, letterSpacing) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (truncated || (lines.length === maxLines && words.join(" ").length > lines.join(" ").length)) {
    const lastLine = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = lastLine.length > 3 ? `${lastLine.slice(0, -3)}...` : "...";
  }

  return lines;
}

function drawTextBlock(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  scale: number,
  letterSpacing: number,
  lineSpacing: number,
  lines: string[],
  color: Rgba,
): void {
  lines.forEach((line, lineIndex) => {
    let cursorX = x;
    const cursorY = y + lineIndex * (FONT_HEIGHT * scale + lineSpacing);
    for (const character of line) {
      drawGlyph(pixels, width, height, cursorX, cursorY, scale, character, color);
      cursorX += FONT_WIDTH * scale + letterSpacing;
    }
  });
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const value of data) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function joinChunks(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = TEXT_ENCODER.encode(type);
  const crc = crc32(joinChunks([typeBytes, data]));
  return joinChunks([writeUint32(data.length), typeBytes, data, writeUint32(crc)]);
}

function zlibCompressStoreBlocks(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 65_535) {
    const size = Math.min(65_535, data.length - offset);
    const isLast = offset + size >= data.length;
    const header = new Uint8Array([
      isLast ? 0x01 : 0x00,
      size & 255,
      (size >>> 8) & 255,
      (~size) & 255,
      ((~size) >>> 8) & 255,
    ]);
    parts.push(header, data.slice(offset, offset + size));
  }
  parts.push(writeUint32(adler32(data)));
  return joinChunks(parts);
}

function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (1 + width * 4);
    const pixelOffset = row * width * 4;
    scanlines[scanlineOffset] = 0;
    scanlines.set(pixels.subarray(pixelOffset, pixelOffset + width * 4), scanlineOffset + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(width), 0);
  ihdr.set(writeUint32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return joinChunks([
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", zlibCompressStoreBlocks(scanlines)),
    createChunk("IEND", new Uint8Array()),
  ]);
}

export function renderVerdictHtml(input: VerdictPresentation): string {
  const narrative = input.narrative
    .map((beat) => `<li><strong>${escapeHtml(beat.title)}</strong><p>${escapeHtml(beat.summary)}</p></li>`)
    .join("");
  const highlights = input.highlights
    .map(
      (highlight) =>
        `<li><strong>${escapeHtml(highlight.beingHandle)}</strong> <span>${highlight.finalScore.toFixed(1)}</span><p>${escapeHtml(highlight.excerpt)}</p><small>${escapeHtml(highlight.reason)}</small></li>`,
    )
    .join("");
  const claimGraph = input.claimGraph.available
    ? `<p>Claim graph available with ${input.claimGraph.nodes.length} nodes and ${input.claimGraph.edges.length} edges.</p>`
    : `<p>${escapeHtml(input.claimGraph.fallbackNote ?? "Claim graph unavailable.")}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(input.title)}</h1>
        <p>${escapeHtml(input.headline.text)}</p>
      </header>
      <section>
        <p>Domain: ${escapeHtml(input.domain)}</p>
        <p>Confidence: ${escapeHtml(input.confidence.label)}</p>
        <p>Mode: ${escapeHtml(input.scoreBreakdown.terminalizationMode)}</p>
        <p>Rounds: ${input.scoreBreakdown.completedRounds}/${input.scoreBreakdown.totalRounds}</p>
      </section>
      <section>
        <h2>Summary</h2>
        <p>${escapeHtml(input.summary)}</p>
      </section>
      <section>
        <h2>Narrative</h2>
        <ol>${narrative}</ol>
      </section>
      <section>
        <h2>Highlights</h2>
        <ol>${highlights}</ol>
      </section>
      <section>
        <h2>Claim graph</h2>
        ${claimGraph}
      </section>
    </main>
  </body>
</html>`;
}

export function renderOgPng(input: VerdictPresentation): Uint8Array {
  const width = 1200;
  const height = 630;
  const pixels = createPixelBuffer(width, height, [241, 236, 229, 255]);
  const cardBackground: Rgba = [252, 248, 242, 255];
  const ink: Rgba = [28, 41, 48, 255];
  const mutedInk: Rgba = [78, 92, 96, 255];
  const rail: Rgba = [22, 57, 64, 255];
  const confidenceBox: Rgba = [227, 198, 154, 255];
  const domainChip: Rgba = [207, 226, 220, 255];
  const accent = input.headline.stance === "support"
    ? [84, 138, 110, 255] as const
    : input.headline.stance === "oppose"
      ? [158, 82, 61, 255] as const
      : input.headline.stance === "uncertain"
        ? [105, 109, 127, 255] as const
        : [179, 136, 73, 255] as const;

  fillRoundedRect(pixels, width, height, 36, 36, 1128, 558, 34, [226, 219, 210, 255]);
  fillRoundedRect(pixels, width, height, 54, 54, 1092, 522, 28, cardBackground);
  fillRoundedRect(pixels, width, height, 54, 54, 154, 522, 28, rail);
  fillRoundedRect(pixels, width, height, 232, 88, 840, 454, 24, [248, 243, 236, 255]);
  fillRoundedRect(pixels, width, height, 232, 88, 840, 12, 6, accent);
  fillRoundedRect(pixels, width, height, 266, 120, 250, 46, 12, domainChip);
  fillRoundedRect(pixels, width, height, 810, 120, 228, 46, 12, confidenceBox);
  fillRoundedRect(pixels, width, height, 810, 182, 228, 116, 18, [236, 229, 219, 255]);
  fillRoundedRect(pixels, width, height, 266, 444, 372, 62, 16, [234, 225, 214, 255]);
  fillRoundedRect(pixels, width, height, 884, 458, 154, 38, 10, rail);

  drawTextBlock(
    pixels,
    width,
    height,
    84,
    112,
    4,
    4,
    8,
    ["OPNDOMAIN"],
    [244, 239, 230, 255],
  );

  drawTextBlock(
    pixels,
    width,
    height,
    84,
    180,
    3,
    3,
    8,
    ["EDITORIAL", "VERDICT", "CARD"],
    [187, 202, 198, 255],
  );

  drawTextBlock(
    pixels,
    width,
    height,
    284,
    134,
    3,
    3,
    8,
    wrapText(sanitizeText(input.domain, 24), 3, 3, 206, 1),
    ink,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    824,
    134,
    3,
    3,
    8,
    wrapText(sanitizeText(input.confidence.label, 16), 3, 3, 120, 1),
    ink,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    824,
    198,
    3,
    3,
    8,
    wrapText(sanitizeText(`${Math.round(input.confidence.score * 100)} SCORE`, 18), 3, 3, 194, 1),
    mutedInk,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    824,
    232,
    3,
    3,
    8,
    wrapText(sanitizeText(`${input.scoreBreakdown.completedRounds}/${input.scoreBreakdown.totalRounds} ROUNDS`, 24), 3, 3, 194, 1),
    mutedInk,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    824,
    266,
    3,
    3,
    8,
    wrapText(sanitizeText(input.scoreBreakdown.terminalizationMode.replaceAll("_", " "), 28), 3, 3, 194, 2),
    mutedInk,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    266,
    188,
    4,
    4,
    10,
    wrapText(sanitizeText(input.title, OG_IMAGE_TITLE_MAX_LENGTH), 4, 4, 500, 3),
    mutedInk,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    266,
    300,
    6,
    6,
    14,
    wrapText(sanitizeText(input.headline.text, OG_IMAGE_SUMMARY_MAX_LENGTH), 6, 6, 700, 3),
    ink,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    284,
    462,
    3,
    3,
    8,
    wrapText(sanitizeText(input.headline.label, 18), 3, 3, 330, 1),
    mutedInk,
  );

  drawTextBlock(
    pixels,
    width,
    height,
    904,
    468,
    2,
    2,
    6,
    ["API.OPNDOMAIN.COM"],
    [244, 239, 230, 255],
  );

  return encodePng(width, height, pixels);
}

export async function publishArtifacts(
  bucket: R2Bucket,
  input: VerdictPresentation,
): Promise<{ verdictHtmlKey: string; ogImageKey: string; verdictPresentationKey: string }> {
  const verdictPresentationKey = topicVerdictPresentationArtifactKey(input.topicId);
  const verdictHtmlKey = topicVerdictHtmlArtifactKey(input.topicId);
  const ogImageKey = topicOgPngArtifactKey(input.topicId);
  await bucket.put(verdictPresentationKey, JSON.stringify(input), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await bucket.put(verdictHtmlKey, renderVerdictHtml(input), {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await bucket.put(ogImageKey, renderOgPng(input), {
    httpMetadata: { contentType: "image/png" },
  });
  return { verdictHtmlKey, ogImageKey, verdictPresentationKey };
}

export async function suppressArtifacts(
  bucket: R2Bucket,
  topicId: string,
): Promise<{ verdictHtmlKey: null; ogImageKey: null; verdictPresentationKey: null }> {
  await bucket.delete(topicVerdictPresentationArtifactKey(topicId));
  await bucket.delete(topicVerdictHtmlArtifactKey(topicId));
  await bucket.delete(topicOgPngArtifactKey(topicId));
  return { verdictHtmlKey: null, ogImageKey: null, verdictPresentationKey: null };
}
