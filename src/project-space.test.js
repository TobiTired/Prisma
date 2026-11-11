import { describe, expect, it } from "vitest";
import {
  duplicatePlacement,
  applyTextRangeColor,
  normalizeProject,
  objectCenter,
  placementForRotation,
  projectSnapshot,
  reconcileTextRuns,
  textColorAt,
  textRunsFromFabricStyles,
} from "./project-space.js";

describe("V0.2 project compatibility", () => {
  it("migrates V0.1 objects without changing project-space geometry", () => {
    const legacy = {
      version: 1,
      width: 1920,
      height: 1080,
      zoom: 25,
      objects: [
        {
          id: "i",
          type: "image",
          x: 123,
          y: 234,
          width: 800,
          height: 450,
          rotation: 17,
          src: "data:image/png;base64,AA==",
        },
        {
          id: "t",
          type: "text",
          text: "Hello",
          fill: "#abcdef",
          x: 400,
          y: 300,
          width: 600,
          height: 120,
          rotation: 0,
        },
        {
          id: "s",
          type: "shape",
          shape: "rectangle",
          fill: "#123456",
          stroke: "#ffffff",
          strokeWidth: 0,
          x: 40,
          y: 50,
          width: 200,
          height: 100,
        },
      ],
    };
    const migrated = normalizeProject(legacy);
    expect(
      migrated.objects.map(({ x, y, width, height, rotation }) => ({
        x,
        y,
        width,
        height,
        rotation,
      })),
    ).toEqual(
      legacy.objects.map(({ x, y, width, height, rotation = 0 }) => ({
        x,
        y,
        width,
        height,
        rotation,
      })),
    );
    expect(migrated.objects[0].blur).toBe(0);
    expect(migrated.objects[1].styleRuns).toEqual([
      { start: 0, end: 5, fill: "#abcdef" },
    ]);
    expect(migrated.objects[2].fillEnabled).toBe(true);
  });

  it("never serializes viewport state", () => {
    const base = {
      version: 2,
      width: 1920,
      height: 1080,
      zoom: 75,
      viewportTransform: [0.75, 0, 0, 0.75, 10, 20],
      objects: [
        {
          id: "a",
          type: "image",
          x: 100,
          y: 200,
          width: 500,
          height: 300,
          rotation: 15,
          displayX: 75,
        },
      ],
    };
    expect(projectSnapshot(base)).toEqual({
      version: 2,
      width: 1920,
      height: 1080,
      objects: [
        {
          id: "a",
          type: "image",
          x: 100,
          y: 200,
          width: 500,
          height: 300,
          rotation: 15,
        },
      ],
    });
  });

  it("keeps duplicates inside project bounds", () => {
    const object = { x: 1800, y: 1000, width: 300, height: 200, rotation: 0 };
    expect(duplicatePlacement(object, 1920, 1080)).toEqual({ x: 1620, y: 880 });
  });

  it("preserves V0.2 properties while normalizing", () => {
    const project = {
      version: 2,
      width: 1920,
      height: 1080,
      background: "#fff",
      objects: [
        {
          id: "image",
          type: "image",
          x: -120,
          y: 80,
          width: 900,
          height: 700,
          rotation: 15,
          blur: 32,
        },
        {
          id: "text",
          type: "text",
          text: "Two colors",
          x: 200,
          y: 300,
          width: 700,
          height: 180,
          rotation: 30,
          fill: "#fff",
          styleRuns: [{ start: 0, end: 3, fill: "#ff0000" }],
        },
        {
          id: "shape",
          type: "shape",
          shape: "rectangle",
          x: 50,
          y: 60,
          width: 300,
          height: 200,
          fill: "#00ff00",
          fillEnabled: false,
          stroke: "#fff",
          strokeWidth: 8,
          strokeEnabled: true,
        },
      ],
    };
    expect(normalizeProject(project).objects).toMatchObject(project.objects);
  });

  it.each([
    { type: "image", x: 300, y: 200, width: 800, height: 450, rotation: 0 },
    { type: "text", x: -100, y: 80, width: 700, height: 180, rotation: 0 },
    {
      type: "shape",
      shape: "rectangle",
      x: 1750,
      y: 900,
      width: 300,
      height: 220,
      rotation: 0,
    },
    {
      type: "shape",
      shape: "line",
      x: 100,
      y: 100,
      width: 500,
      height: 0,
      strokeWidth: 12,
      rotation: 0,
    },
  ])("keeps $type center fixed through a full rotation sequence", (object) => {
    const expected = objectCenter(object);
    for (const rotation of [15, 45, 90, 180, 270, 360, 0]) {
      Object.assign(object, placementForRotation(object, rotation), {
        rotation,
      });
      const actual = objectCenter(object);
      expect(actual.x).toBeCloseTo(expected.x, 5);
      expect(actual.y).toBeCloseTo(expected.y, 5);
    }
  });

  it("colors only the selected characters in one text object", () => {
    const text = "everything is cool";
    const runs = [{ start: 0, end: text.length, fill: "#ffffff" }];
    expect(
      applyTextRangeColor(text, runs, 14, 18, "#0000ff", "#ffffff"),
    ).toEqual([
      { start: 0, end: 14, fill: "#ffffff" },
      { start: 14, end: 18, fill: "#0000ff" },
    ]);
  });

  it("keeps multiple colors and inherits nearby formatting while editing", () => {
    const before = "everything is cool";
    const runs = applyTextRangeColor(
      before,
      [{ start: 0, end: before.length, fill: "#ffffff" }],
      14,
      18,
      "#0000ff",
      "#ffffff",
    );
    const after = "everything is very cool";
    expect(reconcileTextRuns(before, after, runs, "#ffffff")).toEqual([
      { start: 0, end: 19, fill: "#ffffff" },
      { start: 19, end: 23, fill: "#0000ff" },
    ]);
  });

  it("round-trips Fabric character styles into serializable rich-text runs", () => {
    const text = "RED WHITE BLUE";
    const styles = {
      0: {
        0: { fill: "#ff0000" },
        1: { fill: "#ff0000" },
        2: { fill: "#ff0000" },
        10: { fill: "#0000ff" },
        11: { fill: "#0000ff" },
        12: { fill: "#0000ff" },
        13: { fill: "#0000ff" },
      },
    };
    const runs = textRunsFromFabricStyles(text, styles, "#ffffff");
    expect(runs).toEqual([
      { start: 0, end: 3, fill: "#ff0000" },
      { start: 3, end: 10, fill: "#ffffff" },
      { start: 10, end: 14, fill: "#0000ff" },
    ]);
    expect(textColorAt(text, runs, 1, "#ffffff")).toBe("#ff0000");
    expect(textColorAt(text, runs, 6, "#ffffff")).toBe("#ffffff");
    expect(textColorAt(text, runs, 12, "#ffffff")).toBe("#0000ff");
  });

  it("preserves independently styled ranges after Fabric inserts text", () => {
    const text = "You very Seriously Thought Work?";
    const styles = { 0: {} };
    for (let index = 9; index < 18; index++)
      styles[0][index] = { fill: "#800080" };
    for (let index = 27; index < 31; index++)
      styles[0][index] = { fill: "#00aaff" };
    expect(textRunsFromFabricStyles(text, styles, "#ffffff")).toEqual([
      { start: 0, end: 9, fill: "#ffffff" },
      { start: 9, end: 18, fill: "#800080" },
      { start: 18, end: 27, fill: "#ffffff" },
      { start: 27, end: 31, fill: "#00aaff" },
      { start: 31, end: 32, fill: "#ffffff" },
    ]);
  });
});
