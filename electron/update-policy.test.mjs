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
    expect(friendlyUpdateError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toMatchObject({
      message: expect.stringMatching(/keep working/i),
      technical: expect.stringMatching(/ERR_INTERNET_DISCONNECTED/),
    });
  });
  it("does not expose a stack trace as the user-facing message", () => {
    const result = friendlyUpdateError(new Error("Cannot find latest.yml\n at updater.js:10"));
    expect(result.message).toBe("Unable to check for updates. Please try again later.");
    expect(result.technical).toMatch(/latest\.yml/);
  });
});
