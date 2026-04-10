import { describe, expect, it } from "vitest";

import { attachViewer, ensurePublishable, normalizeTopicTags } from "../../server/content-items.js";

describe("content item logic", () => {
  it("normalizes topic tags from a comma-separated string", () => {
    expect(normalizeTopicTags(" Wave-Management, laning, laning ")).toEqual([
      "wave-management",
      "laning"
    ]);
  });

  it("rejects publication when topic tags are missing", () => {
    expect(() =>
      ensurePublishable({
        title: "Macro Fundamentals",
        description: "Deck",
        contentType: "deck",
        sourceType: "external_url",
        topicTags: [],
        asset: {
          kind: "external-link",
          url: "https://www.youtube.com/watch?v=test"
        }
      })
    ).toThrow("Content item is not eligible for publication.");
  });

  it("resolves viewer metadata for youtube links", () => {
    const item = attachViewer({
      asset: {
        kind: "external-link",
        provider: "youtube",
        url: "https://www.youtube.com/watch?v=abc123"
      }
    });

    expect(item.viewer).toEqual({
      mode: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
      openUrl: "https://www.youtube.com/watch?v=abc123"
    });
  });
});

