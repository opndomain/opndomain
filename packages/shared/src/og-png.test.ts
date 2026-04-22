import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { renderTopicCardOgPng, renderContributionCardOgPng, type TopicCardOgData, type ContributionCardOgData } from "./og-png.js";

type DecodedPng = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function decodePng(png: Uint8Array): DecodedPng {
  const signature = Array.from(png.slice(0, 8));
  assert.deepEqual(signature, [137, 80, 78, 71, 13, 10, 26, 10]);

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];

  while (offset < png.length) {
    const length =
      (png[offset] << 24) |
      (png[offset + 1] << 16) |
      (png[offset + 2] << 8) |
      png[offset + 3];
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    const data = png.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
      height = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
    }
    if (type === "IDAT") {
      idatParts.push(data);
    }
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idatParts.map((part) => Buffer.from(part))));
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const srcOffset = row * (1 + width * 4);
    assert.equal(raw[srcOffset], 0);
    pixels.set(raw.subarray(srcOffset + 1, srcOffset + 1 + width * 4), row * width * 4);
  }

  return { width, height, pixels };
}

function readPixel(image: DecodedPng, x: number, y: number): number[] {
  const index = (y * image.width + x) * 4;
  return Array.from(image.pixels.slice(index, index + 4));
}

function regionHasColor(image: DecodedPng, bounds: { x: number; y: number; width: number; height: number }, color: number[]): boolean {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (color.every((value, channel) => image.pixels[(y * image.width + x) * 4 + channel] === value)) {
        return true;
      }
    }
  }
  return false;
}

function sampleCard(overrides: Partial<TopicCardOgData> = {}): TopicCardOgData {
  return {
    title: "Should battery storage be required for grid resilience?",
    prompt: "Discuss the case for mandating battery storage in outage-prone regions.",
    domainName: "energy",
    parentDomainName: null,
    memberCount: 12,
    status: "open",
    ...overrides,
  };
}

describe("renderTopicCardOgPng", () => {
  it("renders a valid 1200x630 PNG", () => {
    const png = renderTopicCardOgPng(sampleCard());
    const decoded = decodePng(png);
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);
  });

  it("is deterministic", () => {
    const data = sampleCard();
    const first = renderTopicCardOgPng(data);
    const second = renderTopicCardOgPng(data);
    assert.deepEqual(Array.from(first), Array.from(second));
  });

  it("uses amber accent for open topics", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({ status: "open" })));
    assert.ok(regionHasColor(decoded, { x: 54, y: 54, width: 1092, height: 10 }, [179, 136, 73, 255]));
    // State chip also uses amber
    assert.ok(regionHasColor(decoded, { x: 756, y: 468, width: 300, height: 80 }, [179, 136, 73, 255]));
  });

  it("uses green accent for closed topics", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({ status: "closed" })));
    assert.ok(regionHasColor(decoded, { x: 54, y: 54, width: 1092, height: 10 }, [84, 138, 110, 255]));
  });

  it("uses red-brown accent for stalled topics", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({ status: "stalled" })));
    assert.ok(regionHasColor(decoded, { x: 54, y: 54, width: 1092, height: 10 }, [158, 82, 61, 255]));
  });

  it("respects explicit stateLabel + accent overrides so verdict outcomes don't default to consensus", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({
      status: "closed",
      stateLabel: "CONTESTED",
      accent: [179, 108, 73, 255],
    })));
    // Contested accent (not the green closed accent) drives the top bar and state chip.
    assert.ok(regionHasColor(decoded, { x: 54, y: 54, width: 1092, height: 10 }, [179, 108, 73, 255]));
    assert.ok(regionHasColor(decoded, { x: 756, y: 468, width: 300, height: 80 }, [179, 108, 73, 255]));
    // The closed-green accent must NOT appear on the top accent bar when overridden.
    assert.ok(!regionHasColor(decoded, { x: 54, y: 54, width: 1092, height: 10 }, [84, 138, 110, 255]));
  });

  it("renders without a prompt", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({ prompt: null })));
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);
    // Card background visible in prompt area (no text drawn)
    assert.deepEqual(readPixel(decoded, 600, 280), [252, 248, 242, 255]);
  });

  it("includes parent domain in chip", () => {
    const decoded = decodePng(renderTopicCardOgPng(sampleCard({
      domainName: "storage",
      parentDomainName: "energy",
    })));
    // Domain chip area has ink color (text was drawn)
    assert.ok(regionHasColor(decoded, { x: 100, y: 508, width: 310, height: 20 }, [28, 41, 48, 255]));
  });
});

function sampleContribution(overrides: Partial<ContributionCardOgData> = {}): ContributionCardOgData {
  return {
    topicTitle: "Should battery storage be required for grid resilience?",
    bodyExcerpt: "Storage preserves critical loads during grid failures and reduces restoration time.",
    authorHandle: "grid-analyst",
    authorDisplayName: null,
    finalScore: 91,
    roundLabel: "Round 3 synthesize",
    topicStatus: "open",
    ...overrides,
  };
}

describe("renderContributionCardOgPng", () => {
  it("renders a valid 1200x630 PNG", () => {
    const decoded = decodePng(renderContributionCardOgPng(sampleContribution()));
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);
  });

  it("is deterministic", () => {
    const data = sampleContribution();
    const first = renderContributionCardOgPng(data);
    const second = renderContributionCardOgPng(data);
    assert.deepEqual(Array.from(first), Array.from(second));
  });

  it("renders topic title in muted color", () => {
    const decoded = decodePng(renderContributionCardOgPng(sampleContribution()));
    // Topic title area has muted ink
    assert.ok(regionHasColor(decoded, { x: 84, y: 120, width: 800, height: 24 }, [78, 92, 96, 255]));
  });

  it("renders body excerpt in ink color", () => {
    const decoded = decodePng(renderContributionCardOgPng(sampleContribution()));
    // Body area has ink color
    assert.ok(regionHasColor(decoded, { x: 84, y: 168, width: 800, height: 100 }, [28, 41, 48, 255]));
  });

  it("renders score chip with accent color", () => {
    const decoded = decodePng(renderContributionCardOgPng(sampleContribution({ topicStatus: "open" })));
    // Score chip uses amber accent for open topics
    assert.ok(regionHasColor(decoded, { x: 500, y: 468, width: 220, height: 80 }, [179, 136, 73, 255]));
  });

  it("renders with null score", () => {
    const decoded = decodePng(renderContributionCardOgPng(sampleContribution({ finalScore: null })));
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);
  });
});
