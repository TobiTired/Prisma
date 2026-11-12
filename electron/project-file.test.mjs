import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  isProjectPath,
  isLegacyProjectPath,
  prismaPathFor,
} = require("./project-file.cjs");

describe("Prisma project file migration", () => {
  it.each(["drawing.prisma", "drawing.tobiart", "DRAWING.PRISMA", "DRAWING.TOBIART"])(
    "recognizes %s",
    (file) => expect(isProjectPath(file)).toBe(true),
  );

  it("rejects unrelated files", () => {
    expect(isProjectPath("drawing.zip")).toBe(false);
  });

  it("identifies legacy projects", () => {
    expect(isLegacyProjectPath("drawing.tobiart")).toBe(true);
    expect(isLegacyProjectPath("drawing.prisma")).toBe(false);
  });

  it("creates a sibling Prisma migration path without touching the legacy file", () => {
    expect(prismaPathFor("thumbnail.tobiart")).toBe("thumbnail.prisma");
  });
});
