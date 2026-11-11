import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeReleaseNotes, publicUpdateInfo, friendlyUpdateError } = require("./update-policy.cjs");

describe("update policy", () => {
  it("normalizes GitHub release notes", () => {
    expect(normalizeReleaseNotes([{ note: "First" }, { note: "Second" }])).toBe("First\n\nSecond");
  });
  it("exposes no download URL or token to the renderer", () => {
    const info = publicUpdateInfo({ version: "0.3.1", releaseNotes: "Fixes", files: [{ url: "secret" }] });
    expect(info).toEqual({ version: "0.3.1", releaseName: "", releaseNotes: "Fixes", releaseDate: "" });
  });
  it("turns offline failures into a nonfatal message", () => {
    expect(friendlyUpdateError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toMatch(/keep working/i);
  });
});
