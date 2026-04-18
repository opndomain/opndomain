import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { describe, it } from "node:test";
import type { VerdictPresentation } from "@opndomain/shared";
import { renderOgPng } from "./artifacts.js";

type DecodedPng = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function samplePresentation(overrides: Partial<VerdictPresentation> = {}): VerdictPresentation {
  return {
    topicId: "top_123",
    title: "Should battery storage be required for grid resilience projects in outage-prone regions?",
    domain: "energy",
    publishedAt: "2026-03-28T12:00:00Z",
    status: "published",
    headline: {
      label: "Verdict",
      text: "Battery storage should be required where critical loads face repeated outage exposure.",
      stance: "support",
    },
    summary: "The topic closed with consistent support for targeted storage mandates.",
    confidence: {
      label: "strong",
      score: 0.86,
      explanation: "Multiple rounds converged and the strongest critiques were addressed.",
    },
    scoreBreakdown: {
      completedRounds: 5,
      totalRounds: 5,
      participantCount: 12,
      contributionCount: 37,
      terminalizationMode: "full_template",
    },
    narrative: [
      {
        roundIndex: 0,
        roundKind: "propose",
        title: "Initial proposals focused on resilience baselines.",
        summary: "Early contributions argued for minimum storage thresholds in exposed grids.",
      },
    ],
    highlights: [
      {
        contributionId: "con_1",
        beingId: "bng_1",
        beingHandle: "grid-analyst",
        roundKind: "synthesize",
        excerpt: "Storage preserves critical loads during failures.",
        finalScore: 91.2,
        reason: "Highest-scoring synthesis with implementation detail.",
      },
    ],
    claimGraph: {
      available: false,
      nodes: [],
      edges: [],
      fallbackNote: "Claim graph unavailable because epistemic scoring is disabled.",
    },
    ...overrides,
  };
}

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

describe("artifacts OG renderer", () => {
  it("renders a deterministic topic-card OG image from the presentation payload", () => {
    const input = samplePresentation();

    const first = renderOgPng(input);
    const second = renderOgPng(input);

    assert.deepEqual(Array.from(first), Array.from(second));
    const decoded = decodePng(first);
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);

    // Shell visible at top edge (between outer edge and card)
    assert.ok(regionHasColor(decoded, { x: 500, y: 36, width: 200, height: 18 }, [226, 219, 210, 255]));
    // Card background visible in empty area
    assert.ok(regionHasColor(decoded, { x: 400, y: 380, width: 200, height: 60 }, [252, 248, 242, 255]));
    // Accent stripe (closed = green) at top of card
    assert.ok(regionHasColor(decoded, { x: 200, y: 54, width: 800, height: 10 }, [84, 138, 110, 255]));
    // Brand text region has brand color
    assert.ok(regionHasColor(decoded, { x: 84, y: 86, width: 200, height: 30 }, [22, 57, 64, 255]));
    // Title region has ink color
    assert.ok(regionHasColor(decoded, { x: 84, y: 130, width: 800, height: 100 }, [28, 41, 48, 255]));
    // Prompt region has muted ink
    assert.ok(regionHasColor(decoded, { x: 84, y: 270, width: 800, height: 60 }, [78, 92, 96, 255]));
    // Stat chips at bottom have chip background color
    assert.ok(regionHasColor(decoded, { x: 84, y: 468, width: 340, height: 80 }, [234, 225, 214, 255]));
    // State chip has accent color (green for closed)
    assert.ok(regionHasColor(decoded, { x: 756, y: 468, width: 300, height: 80 }, [84, 138, 110, 255]));
  });

  it("maps synthesisOutcome to the matching verdict state chip", () => {
    // Regression guard: a contested verdict must NOT render with the closed/consensus accent.
    // Previous bug: renderOgPng always passed status:"closed" which the shared renderer
    // translated to "CONSENSUS" + green regardless of actual outcome.
    const contested = decodePng(renderOgPng(samplePresentation({ synthesisOutcome: "contested_synthesis" })));
    const contestedAccent = [179, 108, 73, 255];
    const consensusAccent = [84, 138, 110, 255];
    assert.ok(
      regionHasColor(contested, { x: 54, y: 54, width: 1092, height: 10 }, contestedAccent),
      "contested_synthesis must render the contested accent on the top stripe",
    );
    assert.ok(
      regionHasColor(contested, { x: 756, y: 468, width: 300, height: 80 }, contestedAccent),
      "contested_synthesis must render the contested accent in the state chip",
    );
    assert.ok(
      !regionHasColor(contested, { x: 54, y: 54, width: 1092, height: 10 }, consensusAccent),
      "contested_synthesis must not fall back to the consensus/closed green accent",
    );

    // Also verify clear_synthesis still uses the consensus accent.
    const clear = decodePng(renderOgPng(samplePresentation({ synthesisOutcome: "clear_synthesis" })));
    assert.ok(
      regionHasColor(clear, { x: 54, y: 54, width: 1092, height: 10 }, consensusAccent),
      "clear_synthesis must render the consensus accent",
    );
  });

  it("keeps long titles and prompt text inside the card layout", () => {
    const decoded = decodePng(renderOgPng(samplePresentation({
      title:
        "Should public utilities require distributed battery storage for hospitals, shelters, water systems, and communications hubs across outage-prone regions with repeated wildfire, storm, and heat risks?",
      headline: {
        label: "Verdict",
        text:
          "Distributed battery storage should be required for resilience projects serving critical infrastructure when repeated outage exposure, evacuation risk, and restoration delays create predictable public safety harm.",
        stance: "mixed",
      },
      editorialBody:
        "Distributed battery storage should be required for critical facilities when outage exposure is repeated, restoration delays are predictable, and failure would put public safety at risk. The record still leaves room for local carveouts where facility-level redundancy already closes the same resilience gap without equivalent cost.",
    })));

    // Card background still visible at far right (text doesn't bleed off)
    assert.ok(regionHasColor(decoded, { x: 1080, y: 180, width: 50, height: 40 }, [252, 248, 242, 255]));
    // Title area has ink
    assert.ok(regionHasColor(decoded, { x: 84, y: 130, width: 800, height: 100 }, [28, 41, 48, 255]));
    // Prompt area has muted ink
    assert.ok(regionHasColor(decoded, { x: 84, y: 270, width: 800, height: 60 }, [78, 92, 96, 255]));
  });
});
