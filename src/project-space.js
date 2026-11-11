const TRANSIENT_PROJECT_KEYS = [
  "preview",
  "zoom",
  "viewport",
  "viewportTransform",
  "displayWidth",
  "displayHeight",
  "workspaceOffset",
];
const TRANSIENT_OBJECT_KEYS = [
  "scaleX",
  "scaleY",
  "viewportX",
  "viewportY",
  "displayX",
  "displayY",
];

const cleanNumber = (value) =>
  Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : value;

export function normalizeAngle(value) {
  const angle = Number(value) || 0;
  return ((angle % 360) + 360) % 360;
}

export function projectSnapshot(project) {
  const result = structuredClone(project);
  for (const key of TRANSIENT_PROJECT_KEYS) delete result[key];
  result.width = cleanNumber(result.width);
  result.height = cleanNumber(result.height);
  result.objects = (result.objects || []).map((object) => {
    const clean = { ...object };
    for (const key of TRANSIENT_OBJECT_KEYS) delete clean[key];
    for (const key of [
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "opacity",
      "fontSize",
      "strokeWidth",
      "letterSpacing",
      "lineHeight",
    ]) {
      if (typeof clean[key] === "number") clean[key] = cleanNumber(clean[key]);
    }
    clean.rotation = normalizeAngle(clean.rotation);
    return clean;
  });
  return result;
}

export function normalizeProject(project) {
  const result = projectSnapshot(project);
  result.version = Math.max(2, Number(result.version) || 1);
  result.background ||= "#ffffff";
  result.objects = result.objects.map((object) => {
    const normalized = {
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      ...object,
    };
    if (normalized.type === "image") normalized.blur ??= 0;
    if (normalized.type === "text") {
      normalized.styleRuns ??= [
        {
          start: 0,
          end: (normalized.text || "").length,
          fill: normalized.fill || "#ffffff",
        },
      ];
    }
    if (normalized.type === "shape") {
      normalized.fillEnabled ??= normalized.fill !== "transparent";
      normalized.strokeEnabled ??= (normalized.strokeWidth || 0) > 0;
    }
    if (normalized.type === "shape" && normalized.shape === "line") {
      normalized.stroke = normalized.stroke || normalized.fill || "#ffffff";
      normalized.strokeWidth =
        normalized.strokeWidth > 0 ? normalized.strokeWidth : 6;
      normalized.height = 0;
    }
    return normalized;
  });
  return result;
}

function objectHeight(object) {
  return object.type === "shape" && object.shape === "line"
    ? Math.max(1, object.strokeWidth || 6)
    : Math.max(1, object.height || 1);
}

export function objectCenter(object) {
  const width = Math.max(1, object.width || 1);
  const height = objectHeight(object);
  const radians = (normalizeAngle(object.rotation) * Math.PI) / 180;
  return {
    x:
      (object.x || 0) +
      (width / 2) * Math.cos(radians) -
      (height / 2) * Math.sin(radians),
    y:
      (object.y || 0) +
      (width / 2) * Math.sin(radians) +
      (height / 2) * Math.cos(radians),
  };
}

export function placementForRotation(object, rotation) {
  const center = objectCenter(object);
  const width = Math.max(1, object.width || 1);
  const height = objectHeight(object);
  const radians = (normalizeAngle(rotation) * Math.PI) / 180;
  return {
    x: cleanNumber(
      center.x -
        (width / 2) * Math.cos(radians) +
        (height / 2) * Math.sin(radians),
    ),
    y: cleanNumber(
      center.y -
        (width / 2) * Math.sin(radians) -
        (height / 2) * Math.cos(radians),
    ),
  };
}

function colorsForText(text, runs, fallback) {
  const colors = Array.from(
    { length: text.length },
    () => fallback || "#ffffff",
  );
  for (const run of runs || []) {
    const start = Math.max(0, Math.min(text.length, Number(run.start) || 0));
    const end = Math.max(start, Math.min(text.length, Number(run.end) || 0));
    for (let i = start; i < end; i++)
      colors[i] = run.fill || fallback || "#ffffff";
  }
  return colors;
}

function runsFromColors(colors) {
  if (!colors.length) return [];
  const runs = [];
  let start = 0;
  for (let i = 1; i <= colors.length; i++) {
    if (i === colors.length || colors[i] !== colors[start]) {
      runs.push({ start, end: i, fill: colors[start] });
      start = i;
    }
  }
  return runs;
}

export function textColorAt(text, runs, index, fallback) {
  if (!text?.length) return fallback || "#ffffff";
  const position = Math.max(0, Math.min(text.length - 1, Number(index) || 0));
  return colorsForText(text, runs, fallback)[position] || fallback || "#ffffff";
}

export function textRunsFromFabricStyles(text, styles, fallback) {
  const colors = [];
  let row = 0;
  let column = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\n") {
      colors.push(colors[index - 1] || fallback || "#ffffff");
      row++;
      column = 0;
      continue;
    }
    colors.push(styles?.[row]?.[column]?.fill || fallback || "#ffffff");
    column++;
  }
  return runsFromColors(colors);
}

export function applyTextRangeColor(text, runs, start, end, color, fallback) {
  const colors = colorsForText(text, runs, fallback);
  let from = Math.max(0, Math.min(text.length, Number(start) || 0));
  let to = Math.max(0, Math.min(text.length, Number(end) || 0));
  if (to < from) [from, to] = [to, from];
  if (from === to) {
    from = 0;
    to = text.length;
  }
  for (let i = from; i < to; i++) colors[i] = color;
  return runsFromColors(colors);
}

export function reconcileTextRuns(oldText, newText, runs, fallback) {
  if (oldText === newText) return structuredClone(runs || []);
  const oldColors = colorsForText(oldText, runs, fallback);
  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] ===
      newText[newText.length - 1 - suffix]
  )
    suffix++;
  const insertedLength = newText.length - prefix - suffix;
  const inherited =
    oldColors[prefix - 1] || oldColors[prefix] || fallback || "#ffffff";
  const nextColors = [
    ...oldColors.slice(0, prefix),
    ...Array.from({ length: Math.max(0, insertedLength) }, () => inherited),
    ...oldColors.slice(oldText.length - suffix),
  ];
  return runsFromColors(nextColors);
}

export function rotatedBounds(object, x = object.x, y = object.y) {
  const width = Math.max(1, object.width || 1);
  const height = objectHeight(object);
  const radians = (normalizeAngle(object.rotation) * Math.PI) / 180;
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  const points = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([px, py]) => ({
    x: x + px * cos - py * sin,
    y: y + px * sin + py * cos,
  }));
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

export function duplicatePlacement(
  object,
  canvasWidth,
  canvasHeight,
  offset = 24,
) {
  let x = (object.x || 0) + offset;
  let y = (object.y || 0) + offset;
  let bounds = rotatedBounds(object, x, y);
  if (bounds.maxX > canvasWidth) x -= bounds.maxX - canvasWidth;
  if (bounds.maxY > canvasHeight) y -= bounds.maxY - canvasHeight;
  bounds = rotatedBounds(object, x, y);
  if (bounds.minX < 0) x -= bounds.minX;
  if (bounds.minY < 0) y -= bounds.minY;
  return { x: cleanNumber(x), y: cleanNumber(y) };
}
