import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  Canvas,
  FabricImage,
  Textbox,
  Rect,
  Circle,
  Triangle,
  filters,
} from "fabric";
import {
  MousePointer2,
  Type,
  Image,
  Shapes,
  Undo2,
  Redo2,
  Download,
  Plus,
  FolderOpen,
  Save,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Pipette,
  Scissors,
} from "lucide-react";
import "./styles.css";
import "./color.css";
import { colorPopoverPosition } from "./color-position.js";
import {
  projectSnapshot,
  normalizeProject,
  duplicatePlacement,
  normalizeAngle,
  rotatedBounds,
  placementForRotation,
  applyTextRangeColor,
  reconcileTextRuns,
  textColorAt,
  textRunsFromFabricStyles,
} from "./project-space.js";

const uid = () => crypto.randomUUID();
const EDITOR_MARGIN = 320;
function marginForProject(project, zoom) {
  if (!project) return EDITOR_MARGIN;
  let overflow = 0;
  for (const object of project.objects || []) {
    const bounds = rotatedBounds(object);
    overflow = Math.max(
      overflow,
      -bounds.minX,
      -bounds.minY,
      bounds.maxX - project.width,
      bounds.maxY - project.height,
    );
  }
  return Math.max(
    EDITOR_MARGIN,
    Math.ceil((Math.max(0, overflow) * zoom) / 100 + 72),
  );
}
const blank = (w = 1920, h = 1080, name = "Untitled Thumbnail") => ({
  version: 2,
  name,
  width: w,
  height: h,
  background: "#ffffff",
  objects: [],
});
const api = window.tobi || {};
const clone = (x) => JSON.parse(JSON.stringify(x));
const objName = (type, n) => `${type[0].toUpperCase() + type.slice(1)} ${n}`;
function textStyles(text = "", runs = []) {
  const styles = {};
  let absolute = 0;
  text.split("\n").forEach((line, row) => {
    for (let column = 0; column < line.length; column++, absolute++) {
      const run = [...runs]
        .reverse()
        .find((item) => absolute >= item.start && absolute < item.end);
      if (run) (styles[row] ||= {})[column] = { fill: run.fill };
    }
    absolute++;
  });
  return styles;
}

function App() {
  const [screen, setScreen] = useState("welcome");
  const [project, setProjectRaw] = useState(null);
  const [path, setPath] = useState(null);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(45);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [saved, setSaved] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState(null);
  const [imageLibrary, setImageLibrary] = useState(null);
  const [eyedropper, setEyedropper] = useState(null);
  const [updateState, setUpdateState] = useState(null);
  const canvasEl = useRef();
  const workspaceEl = useRef();
  const projectBackground = useRef();
  const marginRef = useRef(EDITOR_MARGIN);
  const fabric = useRef();
  const fabricObjects = useRef(new Map());
  const projectRef = useRef(project);
  const zoomRef = useRef(zoom);
  const selectedRef = useRef(selected);
  const reconciling = useRef(false);
  const reconcilePending = useRef(false);
  const dragBefore = useRef(null);
  const gestureBefore = useRef(null);
  const eyedropperRef = useRef(null);
  const objectClipboardRef = useRef(null);
  const pointerRef = useRef(null);
  const textSelectionRef = useRef(new Map());
  projectRef.current = project;
  zoomRef.current = zoom;
  selectedRef.current = selected;
  useEffect(() => api.onUpdateState?.(setUpdateState), []);
  const setProject = (next, record = true) => {
    const before = projectRef.current;
    const value = typeof next === "function" ? next(before) : next;
    if (record && before) {
      setHistory((h) => [...h.slice(-79), clone(before)]);
      setFuture([]);
      setSaved(false);
    }
    projectRef.current = value;
    setProjectRaw(value);
  };
  const commit = (fn) =>
    setProject((p) => {
      const n = clone(p);
      fn(n);
      return n;
    });
  const active = project?.objects.find((o) => o.id === selected);
  const editorMargin = marginForProject(project, zoom);
  marginRef.current = editorMargin;

  useEffect(() => {
    api.getImageFolder?.().then((value) => value && setImageLibrary(value));
    return api.onOpenProject?.((filePath) => open(filePath));
  }, []);

  useEffect(() => {
    if (screen !== "editor" || !canvasEl.current) return;
    const c = new Canvas(canvasEl.current, {
      preserveObjectStacking: true,
      selection: true,
      renderOnAddRemove: false,
      backgroundColor: "#25262d",
      controlsAboveOverlay: true,
    });
    fabric.current = c;
    fabricObjects.current = new Map();
    c.on("selection:created", (e) =>
      setSelected(e.selected?.[0]?.data?.id || null),
    );
    c.on("selection:updated", (e) =>
      setSelected(e.selected?.[0]?.data?.id || null),
    );
    c.on("selection:cleared", () => setSelected(null));
    c.on("text:selection:changed", (e) => {
      const target = e.target;
      const id = target?.data?.id;
      if (id)
        textSelectionRef.current.set(id, {
          start: target.selectionStart || 0,
          end: target.selectionEnd || 0,
        });
    });
    c.on("mouse:down", (e) => {
      if (eyedropperRef.current) {
        if (e.e?.button === 2) {
          cancelEyedrop();
          return;
        }
        const target = eyedropperRef.current;
        const native = e.e;
        const rect = c.lowerCanvasEl.getBoundingClientRect();
        const sx = c.lowerCanvasEl.width / rect.width;
        const sy = c.lowerCanvasEl.height / rect.height;
        const pixel = c.contextContainer.getImageData(
          Math.max(
            0,
            Math.min(
              c.lowerCanvasEl.width - 1,
              Math.floor((native.clientX - rect.left) * sx),
            ),
          ),
          Math.max(
            0,
            Math.min(
              c.lowerCanvasEl.height - 1,
              Math.floor((native.clientY - rect.top) * sy),
            ),
          ),
          1,
          1,
        ).data;
        const color = `#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        commit((n) => {
          const object = n.objects.find((item) => item.id === target.id);
          if (object) {
            object[target.prop] = color;
            if (
              object.type === "text" &&
              target.prop === "fill" &&
              object.styleRuns
            )
              object.styleRuns = object.styleRuns.map((run) => ({
                ...run,
                fill: color,
              }));
          }
        });
        eyedropperRef.current = null;
        setEyedropper(null);
        return;
      }
      if (e.target?.data?.id) {
        dragBefore.current = clone(projectRef.current);
        e.target.__tobiRotationCenter = e.target.getCenterPoint();
      }
    });
    c.on("object:rotating", (e) => {
      const step = e.e?.shiftKey ? 15 : 15;
      const angle = normalizeAngle(e.target.angle || 0);
      const snapped = Math.round(angle / step) * step;
      if (
        e.e?.shiftKey ||
        Math.abs(angle - snapped) <= 3 ||
        Math.abs(angle % 90) <= 6
      )
        e.target.set(
          "angle",
          normalizeAngle(
            Math.abs(angle % 90) <= 6 ? Math.round(angle / 90) * 90 : snapped,
          ),
        );
      if (e.target.__tobiRotationCenter)
        e.target.setPositionByOrigin(
          e.target.__tobiRotationCenter,
          "center",
          "center",
        );
      e.target.setCoords();
    });
    c.on("object:modified", (e) => {
      const fo = e.target,
        id = fo.data?.id;
      if (!id) return;
      const before = dragBefore.current;
      setProjectRaw((p) => {
        const n = clone(p),
          o = n.objects.find((x) => x.id === id);
        if (o) {
          const sx = Math.abs(fo.scaleX || 1),
            sy = Math.abs(fo.scaleY || 1),
            corner = e.transform?.corner || fo.__corner;
          o.x = fo.left;
          o.y = fo.top;
          o.rotation = normalizeAngle(fo.angle || 0);
          if (o.type === "text" && !["ml", "mr", "mt", "mb"].includes(corner)) {
            const scale = (sx + sy) / 2;
            o.fontSize = Math.max(1, (o.fontSize || 40) * scale);
            o.strokeWidth = (o.strokeWidth || 0) * scale;
          }
          o.width = Math.max(1, fo.width * sx);
          if (o.type === "shape" && o.shape === "line") {
            o.height = 0;
            o.strokeWidth = Math.max(1, fo.height * sy);
          } else o.height = Math.max(1, fo.height * sy);
        }
        projectRef.current = n;
        return n;
      });
      if (before) {
        setHistory((h) => [...h.slice(-79), before]);
        setFuture([]);
        setSaved(false);
      }
      dragBefore.current = null;
      delete fo.__tobiRotationCenter;
    });
    c.on("text:editing:exited", (e) => {
      const id = e.target.data?.id;
      if (id) {
        textSelectionRef.current.set(id, {
          start: e.target.selectionStart || 0,
          end: e.target.selectionEnd || 0,
        });
        commit((n) => {
          const object = n.objects.find((x) => x.id === id);
          object.styleRuns = textRunsFromFabricStyles(
            e.target.text || "",
            e.target.styles,
            object.fill,
          );
          object.text = e.target.text;
        });
      }
    });
    const prioritizeActive = (event) => {
      const chosen = fabricObjects.current.get(selectedRef.current);
      if (!chosen || chosen.lockMovementX) return;
      const point = c.getScenePoint(event);
      const bounds = chosen.getBoundingRect();
      const pad = 24 / Math.max(0.1, c.getZoom());
      if (
        point.x >= bounds.left - pad &&
        point.x <= bounds.left + bounds.width + pad &&
        point.y >= bounds.top - pad &&
        point.y <= bounds.top + bounds.height + pad
      ) {
        for (const object of fabricObjects.current.values())
          object.evented = object === chosen;
      }
    };
    const restoreHitTesting = () => {
      const objects = projectRef.current?.objects || [];
      for (const object of objects) {
        const rendered = fabricObjects.current.get(object.id);
        if (rendered) rendered.evented = !object.locked;
      }
    };
    c.upperCanvasEl.addEventListener("pointerdown", prioritizeActive, true);
    addEventListener("pointerup", restoreHitTesting, true);
    return () => {
      c.upperCanvasEl.removeEventListener(
        "pointerdown",
        prioritizeActive,
        true,
      );
      removeEventListener("pointerup", restoreHitTesting, true);
      fabricObjects.current.clear();
      c.dispose();
      fabric.current = null;
      projectBackground.current = null;
    };
  }, [screen]);
  useEffect(() => {
    if (fabric.current && project) renderCanvas();
  }, [project, zoom, screen, selected]);

  async function renderCanvas() {
    const c = fabric.current;
    if (!c) return;
    if (reconciling.current) {
      reconcilePending.current = true;
      return;
    }
    reconciling.current = true;
    try {
      do {
        reconcilePending.current = false;
        const snapshot = projectRef.current;
        if (!snapshot) break;
        c.backgroundColor = "#25262d";
        const margin = marginForProject(snapshot, zoom);
        marginRef.current = margin;
        const targetW = (snapshot.width * zoom) / 100 + margin * 2,
          targetH = (snapshot.height * zoom) / 100 + margin * 2;
        if (c.getWidth() !== targetW || c.getHeight() !== targetH)
          c.setDimensions({ width: targetW, height: targetH });
        c.setViewportTransform([zoom / 100, 0, 0, zoom / 100, margin, margin]);
        if (!projectBackground.current) {
          projectBackground.current = new Rect({
            left: 0,
            top: 0,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            originX: "left",
            originY: "top",
          });
          c.add(projectBackground.current);
        }
        projectBackground.current.set({
          width: snapshot.width,
          height: snapshot.height,
          fill: snapshot.background,
        });
        c.moveObjectTo(projectBackground.current, 0);
        const ids = new Set(snapshot.objects.map((o) => o.id));
        for (const [id, f] of fabricObjects.current)
          if (!ids.has(id)) {
            c.remove(f);
            fabricObjects.current.delete(id);
          }
        for (let i = 0; i < snapshot.objects.length; i++) {
          const o = snapshot.objects[i];
          let f = fabricObjects.current.get(o.id);
          if (!f) {
            f = await createFabricObject(o);
            if (!f) continue;
            fabricObjects.current.set(o.id, f);
            c.add(f);
          }
          syncFabricObject(f, o);
          c.moveObjectTo(f, i + 1);
        }
        const chosen = fabricObjects.current.get(selectedRef.current);
        if (chosen && c.getActiveObject() !== chosen) c.setActiveObject(chosen);
        c.requestRenderAll();
        if (snapshot !== projectRef.current) reconcilePending.current = true;
      } while (reconcilePending.current);
    } finally {
      reconciling.current = false;
    }
  }
  async function createFabricObject(o) {
    const common = {
      data: { id: o.id },
      strokeUniform: true,
      originX: "left",
      originY: "top",
    };
    if (o.type === "image") {
      try {
        return await FabricImage.fromURL(o.src, { crossOrigin: "anonymous" });
      } catch {
        return null;
      }
    }
    if (o.type === "text") return new Textbox(o.text, common);
    if (o.shape === "ellipse")
      return new Circle({ ...common, radius: o.width / 2 });
    if (o.shape === "triangle") return new Triangle(common);
    if (o.shape === "line")
      return new Rect({
        ...common,
        width: o.width,
        height: Math.max(1, o.strokeWidth || 6),
      });
    return new Rect(common);
  }
  function syncFabricObject(f, o) {
    const common = {
      left: o.x,
      top: o.y,
      angle: normalizeAngle(o.rotation || 0),
      originX: "left",
      originY: "top",
      opacity: o.opacity ?? 1,
      visible: o.visible !== false,
      selectable: !o.locked,
      evented: !o.locked,
      data: { id: o.id },
      strokeUniform: true,
      snapAngle: 15,
      snapThreshold: 3,
      centeredRotation: false,
      clipPath:
        f.clipPath ||
        new Rect({
          left: 0,
          top: 0,
          width: projectRef.current.width,
          height: projectRef.current.height,
          absolutePositioned: true,
          originX: "left",
          originY: "top",
        }),
    };
    common.clipPath.set({
      width: projectRef.current.width,
      height: projectRef.current.height,
    });
    if (o.type === "image") {
      f.set({
        ...common,
        scaleX: o.width / f.width,
        scaleY: o.height / f.height,
        flipX: !!o.flipX,
        flipY: !!o.flipY,
      });
      const blur = Math.max(0, Math.min(100, o.blur || 0)) / 100;
      if (f.__tobiBlur !== blur) {
        f.filters = blur ? [new filters.Blur({ blur })] : [];
        f.applyFilters();
        f.__tobiBlur = blur;
      }
    } else if (o.type === "text") {
      f.set({
        ...common,
        text: o.text,
        width: o.width,
        height: o.height,
        scaleX: 1,
        scaleY: 1,
        fontFamily: o.fontFamily,
        fontSize: o.fontSize,
        fontWeight: o.bold ? "bold" : "normal",
        fontStyle: o.italic ? "italic" : "normal",
        fill: o.fill,
        textAlign: o.align,
        charSpacing: (o.letterSpacing || 0) * 10,
        lineHeight: o.lineHeight || 1.16,
        stroke: o.strokeWidth ? o.stroke : "transparent",
        strokeWidth: o.strokeWidth || 0,
        paintFirst: "stroke",
        styles: textStyles(o.text, o.styleRuns),
      });
      f.setControlsVisibility({ ml: true, mr: true });
    } else if (o.shape === "line")
      f.set({
        ...common,
        width: o.width,
        height: Math.max(1, o.strokeWidth || 6),
        scaleX: 1,
        scaleY: 1,
        fill:
          o.strokeEnabled === false
            ? "transparent"
            : o.stroke || o.fill || "#ffffff",
        stroke: null,
        strokeWidth: 0,
      });
    else {
      f.set({
        ...common,
        width: o.width,
        height: o.height,
        scaleX: 1,
        scaleY: 1,
        fill: o.fillEnabled === false ? "transparent" : o.fill,
        stroke: o.strokeEnabled === false ? null : o.stroke,
        strokeWidth: o.strokeEnabled === false ? 0 : o.strokeWidth || 0,
        rx: o.shape === "rounded" ? Math.min(o.width, o.height) * 0.12 : 0,
        ry: o.shape === "rounded" ? Math.min(o.width, o.height) * 0.12 : 0,
      });
      if (o.shape === "ellipse") {
        f.set({ radius: o.width / 2, scaleY: o.height / o.width });
      }
    }
    f.setCoords();
  }
  function start(w, h, name) {
    const next = blank(w, h, name);
    projectRef.current = next;
    setProjectRaw(next);
    setHistory([]);
    setFuture([]);
    setPath(null);
    setSelected(null);
    setSaved(true);
    setScreen("editor");
  }
  async function open(suppliedPath) {
    const requestedPath =
      typeof suppliedPath === "string" ? suppliedPath : undefined;
    try {
      const r = await api.openProject?.(requestedPath);
      if (!r) return;
      if (r.error) {
        alert(`Could not open project:\n\n${r.error}`);
        return;
      }
      const loaded = normalizeProject(r.project);
      projectRef.current = loaded;
      setProjectRaw(loaded);
      setPath(r.path);
      setScreen("editor");
      setHistory([]);
      setFuture([]);
      setSaved(true);
    } catch (error) {
      alert(`Could not open project:\n\n${error.message || error}`);
    }
  }
  async function save(saveAs = false) {
    const source = projectRef.current,
      snapshot = projectSnapshot(source);
    const preview = fabric.current?.toDataURL({
      format: "png",
      multiplier: Math.min(1, 640 / snapshot.width) / (zoom / 100),
      left: marginRef.current,
      top: marginRef.current,
      width: (snapshot.width * zoom) / 100,
      height: (snapshot.height * zoom) / 100,
    });
    const p = await api.saveProject?.({
      project: { ...snapshot, preview },
      currentPath: path,
      saveAs,
    });
    if (p) {
      setPath(p);
      setSaved(true);
      return true;
    }
    return false;
  }
  async function installDownloadedUpdate() {
    if (!saved) {
      const shouldSave = confirm(
        "This project has unsaved changes. Save it before installing the update?",
      );
      if (!shouldSave) return;
      if (!(await save(false))) return;
    }
    await api.installUpdate?.();
  }
  function undo() {
    if (!history.length) return;
    const next = history.at(-1);
    setFuture((f) => [clone(project), ...f]);
    projectRef.current = next;
    setProjectRaw(next);
    setHistory((h) => h.slice(0, -1));
    setSaved(false);
  }
  function redo() {
    if (!future.length) return;
    const next = future[0];
    setHistory((h) => [...h, clone(project)]);
    projectRef.current = next;
    setProjectRaw(next);
    setFuture((f) => f.slice(1));
    setSaved(false);
  }
  function addObject(o) {
    const id = uid();
    commit((n) =>
      n.objects.push({
        ...o,
        id,
        name: objName(o.type, n.objects.length + 1),
        x: n.width * 0.25,
        y: n.height * 0.25,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      }),
    );
    selectedRef.current = id;
    setSelected(id);
    return id;
  }
  async function importImages(files) {
    for (const item of files || []) {
      const src = item.data || item;
      const im = new window.Image();
      await new Promise((r) => {
        im.onload = r;
        im.src = src;
      });
      const max = project.width * 0.65,
        s = Math.min(1, max / im.width, (project.height * 0.65) / im.height);
      addObject({
        type: "image",
        src,
        width: im.width * s,
        height: im.height * s,
        blur: 0,
      });
    }
  }
  async function pick() {
    importImages(await api.pickImages?.());
  }
  async function chooseImageFolder() {
    const value = await api.chooseImageFolder?.();
    if (value) setImageLibrary(value);
  }
  async function addLibraryImage(filePath) {
    const image = await api.readLibraryImage?.(filePath);
    if (image) importImages([image]);
  }
  function update(prop, value) {
    if (!active) return;
    commit((n) => {
      const object = n.objects.find((o) => o.id === active.id);
      if (prop && typeof prop === "object") {
        Object.assign(object, prop);
        return;
      }
      if (prop === "rotation") {
        const rotation = normalizeAngle(value);
        Object.assign(object, placementForRotation(object, rotation));
        object.rotation = rotation;
      } else object[prop] = value;
      if (object.type === "text" && prop === "fill" && object.styleRuns)
        object.styleRuns = object.styleRuns.map((run) => ({
          ...run,
          fill: value,
        }));
    });
  }
  function beginGesture() {
    if (!gestureBefore.current)
      gestureBefore.current = clone(projectRef.current);
  }
  function updateLive(prop, value, id = selected) {
    if (!id) return;
    setProjectRaw((p) => {
      const n = clone(p);
      const o = n.objects.find((x) => x.id === id);
      if (o) {
        if (prop === "rotation") {
          const rotation = normalizeAngle(value);
          Object.assign(o, placementForRotation(o, rotation));
          o.rotation = rotation;
        } else o[prop] = value;
        if (o.type === "text" && prop === "fill" && o.styleRuns)
          o.styleRuns = o.styleRuns.map((run) => ({ ...run, fill: value }));
      }
      return n;
    });
  }
  function setEyedrop(prop) {
    if (!active) return;
    eyedropperRef.current = { id: active.id, prop };
    setEyedropper(prop);
  }
  function cancelEyedrop() {
    eyedropperRef.current = null;
    setEyedropper(null);
  }
  function endGesture() {
    const before = gestureBefore.current;
    if (!before) return;
    gestureBefore.current = null;
    if (JSON.stringify(before) !== JSON.stringify(projectRef.current)) {
      setHistory((h) => [...h.slice(-79), before]);
      setFuture([]);
      setSaved(false);
    }
  }
  function rememberTextSelection(id) {
    const rendered = fabricObjects.current.get(id);
    if (rendered?.type === "textbox")
      textSelectionRef.current.set(id, {
        start: rendered.selectionStart || 0,
        end: rendered.selectionEnd || 0,
      });
    return textSelectionRef.current.get(id) || { start: 0, end: 0 };
  }
  function beginCanvasGesture() {
    if (!gestureBefore.current)
      gestureBefore.current = clone(projectRef.current);
  }
  function updateCanvasLive(value) {
    setProjectRaw((p) => ({ ...p, background: value }));
  }
  function remove(id = selected) {
    if (!id) return;
    commit((n) => (n.objects = n.objects.filter((o) => o.id !== id)));
    setSelected(null);
  }
  function duplicate() {
    if (!active) return;
    const id = uid();
    commit((n) => {
      const x = clone(n.objects.find((o) => o.id === active.id));
      x.id = id;
      x.name += " copy";
      Object.assign(x, duplicatePlacement(x, n.width, n.height));
      n.objects.push(x);
    });
    selectedRef.current = id;
    setSelected(id);
  }
  function moveLayer(dir) {
    if (!active) return;
    commit((n) => {
      const i = n.objects.findIndex((o) => o.id === active.id);
      const j =
        dir === "front"
          ? n.objects.length - 1
          : dir === "back"
            ? 0
            : Math.max(
                0,
                Math.min(n.objects.length - 1, i + (dir === "up" ? 1 : -1)),
              );
      const [x] = n.objects.splice(i, 1);
      n.objects.splice(j, 0, x);
    });
  }
  function fit() {
    const area = document.querySelector(".workspace");
    if (!area) return;
    setZoom(
      Math.max(
        10,
        Math.min(
          100,
          Math.floor(
            Math.min(
              (area.clientWidth - 100) / project.width,
              (area.clientHeight - 100) / project.height,
            ) * 100,
          ),
        ),
      ),
    );
  }
  async function exportFile(format = "png", quality = 0.92) {
    fabric.current.discardActiveObject();
    fabric.current.requestRenderAll();
    const dataUrl = fabric.current.toDataURL({
      format,
      quality,
      multiplier: 100 / zoom,
      left: marginRef.current,
      top: marginRef.current,
      width: (project.width * zoom) / 100,
      height: (project.height * zoom) / 100,
    });
    await api.exportImage?.({ dataUrl, format, quality, name: project.name });
    setExportOpen(false);
  }

  useEffect(() => {
    if (screen !== "editor") return;
    let lastDomWheel = 0;
    const zoomAt = (direction, clientX, clientY) => {
      const area = workspaceEl.current;
      const shell = canvasEl.current?.closest(".canvas-shell");
      if (!area || !shell) return;
      const areaRect = area.getBoundingClientRect();
      const cursorX = Number.isFinite(clientX)
        ? clientX
        : (pointerRef.current?.x ?? areaRect.left + areaRect.width / 2);
      const cursorY = Number.isFinite(clientY)
        ? clientY
        : (pointerRef.current?.y ?? areaRect.top + areaRect.height / 2);
      const oldZoom = zoomRef.current;
      const nextZoom = Math.max(
        10,
        Math.min(400, oldZoom + (direction === "in" ? 5 : -5)),
      );
      if (nextZoom === oldZoom) return;
      const shellLeft = shell.offsetLeft;
      const shellTop = shell.offsetTop;
      const oldMargin = marginRef.current;
      const projectX =
        (cursorX - areaRect.left + area.scrollLeft - shellLeft - oldMargin) /
        (oldZoom / 100);
      const projectY =
        (cursorY - areaRect.top + area.scrollTop - shellTop - oldMargin) /
        (oldZoom / 100);
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        area.scrollLeft =
          shell.offsetLeft +
          marginRef.current +
          projectX * (nextZoom / 100) -
          (cursorX - areaRect.left);
        area.scrollTop =
          shell.offsetTop +
          marginRef.current +
          projectY * (nextZoom / 100) -
          (cursorY - areaRect.top);
      });
    };
    const wheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lastDomWheel = performance.now();
      zoomAt(event.deltaY < 0 ? "in" : "out", event.clientX, event.clientY);
    };
    const stopIpc = api.onZoomWheel?.((direction) => {
      if (performance.now() - lastDomWheel < 80) return;
      zoomAt(direction === "in" ? "in" : "out");
    });
    addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => {
      removeEventListener("wheel", wheel, true);
      stopIpc?.();
    };
  }, [screen]);

  useEffect(() => {
    const key = async (e) => {
      if (screen !== "editor") return;
      if (eyedropperRef.current && e.key === "Escape") {
        e.preventDefault();
        cancelEyedrop();
        return;
      }
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      const editingCanvasText = !!fabric.current?.getActiveObject()?.isEditing;
      if (
        editingCanvasText &&
        ctrl &&
        ["c", "v", "x"].includes(e.key.toLowerCase())
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save(e.shiftKey);
      } else if (ctrl && e.key.toLowerCase() === "o") {
        e.preventDefault();
        open();
      } else if (ctrl && e.key.toLowerCase() === "c" && active) {
        e.preventDefault();
        objectClipboardRef.current = clone(active);
      } else if (ctrl && e.key.toLowerCase() === "x" && active) {
        e.preventDefault();
        objectClipboardRef.current = clone(active);
        remove();
      } else if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const copied = objectClipboardRef.current;
        if (copied) {
          const x = clone(copied);
          try {
            x.id = uid();
            x.name = `${x.name || "Object"} copy`;
            Object.assign(
              x,
              duplicatePlacement(x, project.width, project.height),
            );
            commit((n) => n.objects.push(x));
            selectedRef.current = x.id;
            setSelected(x.id);
          } catch {}
        } else {
          const clip = await api.clipboardImage?.();
          if (clip) importImages([clip]);
        }
      } else if (active && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        commit((n) => {
          const o = n.objects.find((x) => x.id === active.id);
          if (e.key === "ArrowLeft") o.x -= d;
          if (e.key === "ArrowRight") o.x += d;
          if (e.key === "ArrowUp") o.y -= d;
          if (e.key === "ArrowDown") o.y += d;
        });
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [screen, active, project, history, future]);

  if (screen === "welcome") return <Welcome start={start} open={open} />;
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        const libraryPath = e.dataTransfer.getData("application/x-tobi-image");
        if (libraryPath) {
          await addLibraryImage(libraryPath);
          return;
        }
        const fs = [...e.dataTransfer.files].filter((f) =>
          f.type.startsWith("image/"),
        );
        importImages(
          await Promise.all(
            fs.map(
              (f) =>
                new Promise((r) => {
                  const rd = new FileReader();
                  rd.onload = () => r({ data: rd.result });
                  rd.readAsDataURL(f);
                }),
            ),
          ),
        );
      }}
    >
      <header>
        <div className="brand">
          PR<span>I</span>SMA
        </div>
        <Menus
          save={save}
          open={open}
          start={start}
          undo={undo}
          redo={redo}
          checkUpdates={() => api.checkForUpdates?.()}
        />
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
        />
        <div className="top-actions">
          <button onClick={undo} disabled={!history.length}>
            <Undo2 /> Undo
          </button>
          <button onClick={redo} disabled={!future.length}>
            <Redo2 /> Redo
          </button>
          <button className="export" onClick={() => setExportOpen(true)}>
            <Download /> Export
          </button>
        </div>
      </header>
      <main>
        <aside className="tools">
          <Tool icon={<MousePointer2 />} label="Select" active />
          <Tool
            icon={<Type />}
            label="Text"
            onClick={() =>
              addObject({
                type: "text",
                text: "THUMBNAIL TEXT",
                width: 720,
                height: 180,
                fontFamily: "Arial",
                fontSize: 110,
                bold: true,
                italic: false,
                fill: "#ffffff",
                align: "center",
                letterSpacing: 0,
                lineHeight: 1.0,
                stroke: "#000000",
                strokeWidth: 8,
              })
            }
          />
          <Tool
            icon={<Image />}
            label="Images"
            active={sidePanel === "images"}
            onClick={() =>
              setSidePanel(sidePanel === "images" ? null : "images")
            }
          />
          <Tool
            icon={<Shapes />}
            label="Shapes"
            active={sidePanel === "shapes"}
            onClick={() =>
              setSidePanel(sidePanel === "shapes" ? null : "shapes")
            }
          />
        </aside>
        {sidePanel === "images" && (
          <ImageBrowser
            library={imageLibrary}
            choose={chooseImageFolder}
            importFiles={pick}
            add={addLibraryImage}
          />
        )}
        {sidePanel === "shapes" && (
          <ShapeBrowser
            add={(s) =>
              addObject({
                type: "shape",
                shape: s,
                width: s === "line" ? 500 : 320,
                height: s === "line" ? 0 : 260,
                fill: s === "line" ? "transparent" : "#7c5cff",
                fillEnabled: s !== "line",
                stroke: "#ffffff",
                strokeWidth: s === "line" ? 8 : 0,
                strokeEnabled: s === "line",
              })
            }
          />
        )}
        <section className="center">
          <div
            ref={workspaceEl}
            className={`workspace ${eyedropper ? "eyedrop-active" : ""}`}
            onPointerMove={(e) => {
              pointerRef.current = { x: e.clientX, y: e.clientY };
            }}
            onContextMenu={(e) => {
              if (eyedropper) {
                e.preventDefault();
                cancelEyedrop();
              }
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                fabric.current?.discardActiveObject();
                setSelected(null);
                fabric.current?.requestRenderAll();
              }
            }}
          >
            <div
              className="canvas-shell"
              style={{
                width: (project.width * zoom) / 100 + editorMargin * 2,
                height: (project.height * zoom) / 100 + editorMargin * 2,
              }}
            >
              <div
                className="project-outline"
                style={{
                  left: editorMargin,
                  top: editorMargin,
                  width: (project.width * zoom) / 100,
                  height: (project.height * zoom) / 100,
                }}
              />
              <canvas ref={canvasEl} />
            </div>
          </div>
          <div className="status">
            <span>
              {project.width} × {project.height}
            </span>
            <button onClick={() => setZoom((z) => Math.max(10, z - 10))}>
              <ZoomOut />
            </button>
            <span>{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(200, z + 10))}>
              <ZoomIn />
            </button>
            <button onClick={() => setZoom(100)}>100%</button>
            <button onClick={fit}>
              <Maximize /> Fit
            </button>
          </div>
        </section>
        <aside className="right">
          <Properties
            active={active}
            update={update}
            updateLive={updateLive}
            beginGesture={beginGesture}
            endGesture={endGesture}
            project={project}
            setProject={setProject}
            beginCanvasGesture={beginCanvasGesture}
            updateCanvasLive={updateCanvasLive}
            setEyedrop={setEyedrop}
          />
          <Layers
            project={project}
            selected={selected}
            setSelected={setSelected}
            commit={commit}
            moveLayer={moveLayer}
            duplicate={duplicate}
            remove={remove}
          />
        </aside>
      </main>
      {exportOpen && (
        <ExportModal
          close={() => setExportOpen(false)}
          run={exportFile}
          size={`${project.width} × ${project.height}`}
        />
      )}{" "}
      {eyedropper && (
        <div className="eyedrop-mode">
          <Pipette />
          <div>
            <b>Pick Color</b>
            <span>
              Click the canvas to sample · Esc or right-click to cancel
            </span>
          </div>
        </div>
      )}
      {!saved && <div className="unsaved">Unsaved changes</div>}
      {updateState && !["current", "checking"].includes(updateState.status) && (
        <UpdateNotice
          state={updateState}
          close={() => setUpdateState(null)}
          download={() => api.downloadUpdate?.()}
          install={installDownloadedUpdate}
        />
      )}
    </div>
  );
}

function Welcome({ start, open }) {
  const [custom, setCustom] = useState(false),
    [w, setW] = useState(1920),
    [h, setH] = useState(1080);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo-mark">P</div>
        <h1>
          Create something <em>worth clicking.</em>
        </h1>
        <p>A fast, private graphics editor built for your thumbnails.</p>
        <h3>Start a new project</h3>
        <div className="presets">
          <button
            className="featured"
            onClick={() => start(1920, 1080, "YouTube Thumbnail")}
          >
            <span className="ratio wide">▶</span>
            <b>YouTube Thumbnail</b>
            <small>1920 × 1080</small>
          </button>
          <button onClick={() => start(1080, 1080, "Square Graphic")}>
            <span className="ratio square" />
            <b>Square</b>
            <small>1080 × 1080</small>
          </button>
          <button onClick={() => start(1080, 1920, "Vertical Graphic")}>
            <span className="ratio tall" />
            <b>Vertical</b>
            <small>1080 × 1920</small>
          </button>
          <button onClick={() => setCustom(!custom)}>
            <Plus />
            <b>Custom size</b>
            <small>Choose dimensions</small>
          </button>
        </div>
        {custom && (
          <div className="custom">
            <input
              type="number"
              value={w}
              onChange={(e) => setW(+e.target.value)}
            />
            <span>×</span>
            <input
              type="number"
              value={h}
              onChange={(e) => setH(+e.target.value)}
            />
            <button onClick={() => start(w, h, "Custom Project")}>
              Create
            </button>
          </div>
        )}
        <button className="open" onClick={open}>
          <FolderOpen /> Open .tobiart project
        </button>
        <footer>Local-first · Your work never leaves your computer</footer>
      </div>
    </div>
  );
}
function Tool({ icon, label, onClick, active }) {
  return (
    <button className={`tool ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
function ShapeMenu({ add }) {
  return (
    <div className="shape-menu">
      {[
        ["rectangle", "Rectangle"],
        ["rounded", "Rounded"],
        ["ellipse", "Ellipse"],
        ["line", "Line"],
        ["triangle", "Triangle"],
      ].map(([a, b]) => (
        <button key={a} onClick={() => add(a)}>
          {b}
        </button>
      ))}
    </div>
  );
}
function ImageBrowser({ library, choose, importFiles, add }) {
  const [thumbnails, setThumbnails] = useState({});
  useEffect(() => {
    let cancelled = false;
    const queue = [...(library?.images || [])];
    setThumbnails({});
    const worker = async () => {
      while (!cancelled && queue.length) {
        const item = queue.shift();
        let result;
        try {
          result = await api.imageThumbnail?.(item.path);
        } catch {
          result = { error: "Unable to load thumbnail" };
        }
        if (!cancelled)
          setThumbnails((current) => ({
            ...current,
            [item.path]: result?.data || "error",
          }));
      }
    };
    Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    return () => {
      cancelled = true;
    };
  }, [library?.folder, library?.images]);
  return (
    <aside className="asset-panel">
      <div className="asset-head">
        <h2>Images</h2>
      </div>
      <button className="browse-library" onClick={choose}>
        <FolderOpen /> Browse
      </button>
      <div className="library-path" title={library?.folder}>
        {library?.folder || "Choose an Image Library Folder"}
      </div>
      <button className="import-secondary" onClick={importFiles}>
        Import an image outside this folder
      </button>
      {library?.unavailable && (
        <p className="muted">
          That folder is unavailable. Choose another folder.
        </p>
      )}
      {library && !library.unavailable && library.images?.length === 0 && (
        <div className="asset-empty">
          <Image />
          <b>No compatible images found</b>
          <span>This folder contains no PNG, JPG, JPEG, or WebP files.</span>
        </div>
      )}
      <div className="asset-grid">
        {library?.images?.map((item) => (
          <button
            key={item.path}
            title={item.name}
            onClick={() => add(item.path)}
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData("application/x-tobi-image", item.path)
            }
          >
            {thumbnails[item.path] && thumbnails[item.path] !== "error" ? (
              <img src={thumbnails[item.path]} alt="" />
            ) : (
              <div
                className={`thumb-placeholder ${thumbnails[item.path] === "error" ? "failed" : "loading"}`}
              >
                {thumbnails[item.path] === "error"
                  ? "Preview unavailable"
                  : "Loading…"}
              </div>
            )}
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
function ShapeBrowser({ add }) {
  return (
    <aside className="asset-panel">
      <div className="asset-head">
        <div>
          <h2>Shapes</h2>
          <small>Click to add to canvas</small>
        </div>
      </div>
      <div className="shape-grid">
        {[
          ["rectangle", "Rectangle"],
          ["rounded", "Rounded"],
          ["ellipse", "Ellipse"],
          ["line", "Line"],
          ["triangle", "Triangle"],
        ].map(([shape, label]) => (
          <button key={shape} onClick={() => add(shape)}>
            <span className={`shape-preview ${shape}`} />
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
}
function Menus({ save, open, start, undo, redo, checkUpdates }) {
  return (
    <nav>
      <details>
        <summary>File</summary>
        <div>
          <button onClick={() => start(1920, 1080, "YouTube Thumbnail")}>
            New project
          </button>
          <button onClick={open}>Open…</button>
          <button onClick={() => save(false)}>
            Save <kbd>Ctrl S</kbd>
          </button>
          <button onClick={() => save(true)}>Save As…</button>
        </div>
      </details>
      <details>
        <summary>Edit</summary>
        <div>
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
        </div>
      </details>
      <details>
        <summary>Help</summary>
        <div>
          <button onClick={checkUpdates}>Check for Updates…</button>
          <button onClick={() => alert("Prisma v0.3.0\nLocal-first thumbnail editor\nhttps://github.com/TobiTired/Prisma")}>About Prisma</button>
          <span className="menu-version">Prisma v0.3.0</span>
        </div>
      </details>
    </nav>
  );
}
function UpdateNotice({ state, close, download, install }) {
  const available = state.status === "available";
  const downloading = state.status === "downloading";
  const downloaded = state.status === "downloaded";
  const title = available
    ? `Prisma ${state.version} is available`
    : downloading
      ? `Downloading update… ${Math.round(state.percent || 0)}%`
      : downloaded
        ? `Prisma ${state.version || "update"} is ready`
        : state.status === "development"
          ? "Development build"
          : "Update check unavailable";
  return (
    <section className="update-notice" role="status">
      <button className="update-close" onClick={close} aria-label="Postpone update">×</button>
      <strong>{title}</strong>
      {state.releaseNotes && <div className="update-notes">{state.releaseNotes}</div>}
      {state.message && <div className="update-message">{state.message}</div>}
      <div className="update-actions">
        {available && <button onClick={download}>Download update</button>}
        {downloaded && <button onClick={install}>Save and install</button>}
        <button onClick={close}>{available || downloaded ? "Later" : "Close"}</button>
      </div>
    </section>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function ScrubNumber({
  value,
  onBegin,
  onLive,
  onEnd,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix = "",
}) {
  const drag = useRef(null);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <div
      className="scrub-number"
      onPointerDown={(e) => {
        if (e.target.tagName === "INPUT") return;
        onBegin();
        drag.current = { x: e.clientX, value: Number(value) || 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const precision = e.shiftKey ? 0.1 : 1;
        onLive(
          clamp(
            drag.current.value +
              (e.clientX - drag.current.x) * step * precision,
          ),
        );
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onEnd();
      }}
    >
      <span className="scrub-grip">↔</span>
      <input
        type="number"
        value={Math.round((Number(value) || 0) * 100) / 100}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        onFocus={onBegin}
        onChange={(e) => onLive(clamp(+e.target.value))}
        onBlur={onEnd}
      />
      {suffix && <i>{suffix}</i>}
    </div>
  );
}
function Properties({
  active,
  update,
  updateLive,
  beginGesture,
  endGesture,
  project,
  beginCanvasGesture,
  updateCanvasLive,
  setEyedrop,
}) {
  return (
    <section className="properties">
      <h2>Properties</h2>
      {!active ? (
        <>
          <p className="muted">Select an object to edit its properties.</p>
          <Field label="Canvas background">
            <ColorControl
              value={project.background}
              onBegin={beginCanvasGesture}
              onLive={updateCanvasLive}
              onEnd={endGesture}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="selection-title">
            <b>{active.name}</b>
            <small>{active.type}</small>
          </div>
          <div className="grid2">
            <Field label="X">
              <ScrubNumber
                value={active.x}
                onBegin={beginGesture}
                onLive={(v) => updateLive("x", v)}
                onEnd={endGesture}
              />
            </Field>
            <Field label="Y">
              <ScrubNumber
                value={active.y}
                onBegin={beginGesture}
                onLive={(v) => updateLive("y", v)}
                onEnd={endGesture}
              />
            </Field>
            <Field label="Width">
              <ScrubNumber
                value={active.width}
                min={1}
                onBegin={beginGesture}
                onLive={(v) => updateLive("width", v)}
                onEnd={endGesture}
              />
            </Field>
            <Field label="Height">
              <ScrubNumber
                value={active.height}
                min={active.shape === "line" ? 0 : 1}
                onBegin={beginGesture}
                onLive={(v) => updateLive("height", v)}
                onEnd={endGesture}
              />
            </Field>
          </div>
          <Field label="Rotation">
            <ScrubNumber
              value={active.rotation || 0}
              suffix="°"
              onBegin={beginGesture}
              onLive={(v) => updateLive("rotation", normalizeAngle(v))}
              onEnd={endGesture}
            />
          </Field>
          <Field label={`Opacity ${Math.round((active.opacity ?? 1) * 100)}%`}>
            <ScrubNumber
              value={(active.opacity ?? 1) * 100}
              min={0}
              max={100}
              suffix="%"
              onBegin={beginGesture}
              onLive={(v) => updateLive("opacity", v / 100)}
              onEnd={endGesture}
            />
          </Field>
          {active.type === "image" && (
            <>
              <Field label={`Blur ${Math.round(active.blur || 0)}`}>
                <ScrubNumber
                  value={active.blur || 0}
                  min={0}
                  max={100}
                  onBegin={beginGesture}
                  onLive={(v) => updateLive("blur", v)}
                  onEnd={endGesture}
                />
              </Field>
              <div className="button-row">
                <button onClick={() => update("flipX", !active.flipX)}>
                  <FlipHorizontal2 /> Flip H
                </button>
                <button onClick={() => update("flipY", !active.flipY)}>
                  <FlipVertical2 /> Flip V
                </button>
              </div>
            </>
          )}
          {active.type === "text" && (
            <TextProps
              a={active}
              u={update}
              live={updateLive}
              begin={beginGesture}
              end={endGesture}
              eyedrop={setEyedrop}
              getSelection={() => rememberTextSelection(active.id)}
              setSelection={(selection) =>
                textSelectionRef.current.set(active.id, selection)
              }
            />
          )}{" "}
          {active.type === "shape" && (
            <ShapeProps
              a={active}
              u={update}
              live={updateLive}
              begin={beginGesture}
              end={endGesture}
              eyedrop={setEyedrop}
            />
          )}
        </>
      )}
    </section>
  );
}
function TextProps({
  a,
  u,
  live,
  begin,
  end,
  eyedrop,
  getSelection,
  setSelection,
}) {
  const textRef = useRef();
  const selectionRef = useRef(getSelection());
  const rememberSelection = (selection = getSelection()) => {
    selectionRef.current = selection;
    setSelection(selection);
    return selection;
  };
  useEffect(() => {
    selectionRef.current = getSelection();
  }, [a.id]);
  const rangeColor = (color) => {
    const { start, end: endAt } = selectionRef.current;
    if (start !== endAt)
      live(
        "styleRuns",
        applyTextRangeColor(a.text, a.styleRuns, start, endAt, color, a.fill),
      );
    else live("fill", color);
  };
  return (
    <div className="subprops">
      <Field label="Text">
        <textarea
          ref={textRef}
          value={a.text}
          onSelect={(e) => {
            rememberSelection({
              start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd,
            });
          }}
          onChange={(e) => {
            const text = e.target.value;
            u({
              text,
              styleRuns: reconcileTextRuns(a.text, text, a.styleRuns, a.fill),
            });
            rememberSelection({
              start: e.target.selectionStart,
              end: e.target.selectionEnd,
            });
          }}
        />
      </Field>
      <Field label="Font">
        <select
          value={a.fontFamily}
          onChange={(e) => u("fontFamily", e.target.value)}
        >
          {[
            "Arial",
            "Arial Black",
            "Bahnschrift",
            "Calibri",
            "Cambria",
            "Comic Sans MS",
            "Georgia",
            "Impact",
            "Segoe UI",
            "Tahoma",
            "Times New Roman",
            "Trebuchet MS",
            "Verdana",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Size">
          <ScrubNumber
            value={a.fontSize}
            min={1}
            onBegin={begin}
            onLive={(v) => live("fontSize", v)}
            onEnd={end}
          />
        </Field>
        <Field label="Align">
          <select value={a.align} onChange={(e) => u("align", e.target.value)}>
            <option>left</option>
            <option>center</option>
            <option>right</option>
          </select>
        </Field>
      </div>
      <div className="button-row">
        <button
          className={a.bold ? "on" : ""}
          onClick={() => u("bold", !a.bold)}
        >
          <b>B</b>
        </button>
        <button
          className={a.italic ? "on" : ""}
          onClick={() => u("italic", !a.italic)}
        >
          <i>I</i>
        </button>
      </div>
      <div className="grid2">
        <Field label="Color">
          <ColorControl
            value={textColorAt(
              a.text,
              a.styleRuns,
              selectionRef.current.start,
              a.fill,
            )}
            onOpen={() => rememberSelection()}
            onBegin={begin}
            onLive={rangeColor}
            onEnd={end}
            onEyedrop={() => eyedrop("fill")}
          />
        </Field>
        <Field label="Outline">
          <ColorControl
            value={a.stroke}
            onBegin={begin}
            onLive={(v) => live("stroke", v)}
            onEnd={end}
            onEyedrop={() => eyedrop("stroke")}
          />
        </Field>
        <Field label="Outline px">
          <ScrubNumber
            value={a.strokeWidth}
            min={0}
            onBegin={begin}
            onLive={(v) => live("strokeWidth", v)}
            onEnd={end}
          />
        </Field>
        <Field label="Letter space">
          <ScrubNumber
            value={a.letterSpacing}
            onBegin={begin}
            onLive={(v) => live("letterSpacing", v)}
            onEnd={end}
          />
        </Field>
        <Field label="Line height">
          <ScrubNumber
            value={a.lineHeight}
            min={0.1}
            step={0.05}
            onBegin={begin}
            onLive={(v) => live("lineHeight", v)}
            onEnd={end}
          />
        </Field>
      </div>
    </div>
  );
}
function ShapeProps({ a, u, live, begin, end, eyedrop }) {
  return (
    <div className="subprops">
      <div className="grid2">
        {a.shape !== "line" && (
          <Field label="Fill">
            <button
              className={`none-toggle ${a.fillEnabled === false ? "on" : ""}`}
              onClick={() => u("fillEnabled", a.fillEnabled === false)}
            >
              None
            </button>
            <ColorControl
              value={a.fill}
              onBegin={begin}
              onLive={(v) => live("fill", v)}
              onEnd={end}
              onEyedrop={() => eyedrop("fill")}
            />
          </Field>
        )}
        <Field label={a.shape === "line" ? "Line color" : "Border"}>
          <button
            className={`none-toggle ${a.strokeEnabled === false ? "on" : ""}`}
            onClick={() => u("strokeEnabled", a.strokeEnabled === false)}
          >
            None
          </button>
          <ColorControl
            value={a.stroke}
            onBegin={begin}
            onLive={(v) => live("stroke", v)}
            onEnd={end}
            onEyedrop={() => eyedrop("stroke")}
          />
        </Field>
      </div>
      <Field label={a.shape === "line" ? "Line thickness" : "Border thickness"}>
        <ScrubNumber
          value={a.strokeWidth}
          min={0}
          onBegin={begin}
          onLive={(v) => live("strokeWidth", v)}
          onEnd={end}
        />
      </Field>
    </div>
  );
}
function ColorControl({
  value = "#ffffff",
  onOpen,
  onBegin,
  onLive,
  onEnd,
  onEyedrop,
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState(null),
    anchor = useRef();
  const hsv = hexToHsv(value);
  const reposition = () =>
    anchor.current &&
    setPosition(colorPopoverPosition(anchor.current.getBoundingClientRect()));
  useEffect(() => {
    if (!open) return;
    reposition();
    const panel = anchor.current?.closest(".properties");
    addEventListener("resize", reposition);
    const close = (e) => {
      if (
        e.key === "Escape" ||
        (e.type === "pointerdown" &&
          !anchor.current?.contains(e.target) &&
          !e.target.closest?.(".color-popover"))
      )
        setOpen(false);
    };
    addEventListener("keydown", close);
    addEventListener("pointerdown", close);
    panel?.addEventListener("scroll", reposition, { passive: true });
    return () => {
      removeEventListener("resize", reposition);
      removeEventListener("keydown", close);
      removeEventListener("pointerdown", close);
      panel?.removeEventListener("scroll", reposition);
    };
  }, [open]);
  const drag = (e) => {
    const r = e.currentTarget.getBoundingClientRect(),
      s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    onLive(hsvToHex(hsv.h, s, v));
  };
  const popup =
    open && position ? (
      <div className="color-popover" style={position}>
        <div
          className="sv-field"
          style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
          onPointerDown={(e) => {
            onBegin();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag(e);
          }}
          onPointerMove={(e) =>
            e.currentTarget.hasPointerCapture(e.pointerId) && drag(e)
          }
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            onEnd();
          }}
        >
          <span
            className="color-dot"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>
        <input
          className="hue"
          type="range"
          min="0"
          max="360"
          value={hsv.h}
          onPointerDown={onBegin}
          onInput={(e) =>
            onLive(hsvToHex(+e.currentTarget.value, hsv.s, hsv.v))
          }
          onPointerUp={onEnd}
        />
        <div className="color-preview">
          <span style={{ background: value }} />
          <code>{value.toUpperCase()}</code>
          <button onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    ) : null;
  return (
    <div className="color-control" ref={anchor}>
      <button
        className="color-swatch"
        style={{ background: value }}
        onPointerDown={() => onOpen?.()}
        onClick={() => {
          if (!open) reposition();
          setOpen(!open);
        }}
        aria-label={`Choose color ${value}`}
      />
      <input
        className="hex"
        value={value}
        onChange={(e) =>
          /^#[0-9a-f]{6}$/i.test(e.target.value) && onLive(e.target.value)
        }
        onFocus={onBegin}
        onBlur={onEnd}
      />
      {onEyedrop && (
        <button
          className="eyedropper-button"
          title="Pick color from canvas"
          onClick={() => {
            setOpen(false);
            onEyedrop();
          }}
        >
          <Pipette />
        </button>
      )}
      {popup && createPortal(popup, document.body)}
    </div>
  );
}
function hexToHsv(hex) {
  const n = parseInt((hex || "#ffffff").slice(1), 16),
    r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255,
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex(h, s, v) {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    "#" +
    [r, g, b]
      .map((q) =>
        Math.round((q + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function Layers({
  project,
  selected,
  setSelected,
  commit,
  moveLayer,
  duplicate,
  remove,
}) {
  return (
    <section className="layers">
      <div className="section-head">
        <h2>Layers</h2>
        <div>
          <button title="Bring forward" onClick={() => moveLayer("up")}>
            <ChevronUp />
          </button>
          <button title="Send backward" onClick={() => moveLayer("down")}>
            <ChevronDown />
          </button>
        </div>
      </div>
      <div className="layer-list">
        {[...project.objects].reverse().map((o) => (
          <LayerRow
            key={o.id}
            object={o}
            selected={selected === o.id}
            select={() => setSelected(o.id)}
            commit={commit}
          />
        ))}
      </div>
      <div className="layer-actions">
        <button onClick={duplicate}>
          <Copy /> Duplicate
        </button>
        <button onClick={() => remove()}>
          <Trash2 /> Delete
        </button>
      </div>
    </section>
  );
}
function LayerRow({ object: o, selected, select, commit }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(o.name);
  const input = useRef();
  useEffect(() => {
    if (renaming) {
      input.current?.focus();
      input.current?.select();
    }
  }, [renaming]);
  const finishRename = (save = true) => {
    if (save && draft.trim() && draft !== o.name)
      commit((n) => {
        n.objects.find((item) => item.id === o.id).name = draft.trim();
      });
    else setDraft(o.name);
    setRenaming(false);
  };
  return (
    <div className={`layer ${selected ? "selected" : ""}`} onClick={select}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          commit((n) => {
            const x = n.objects.find((item) => item.id === o.id);
            x.visible = x.visible === false;
          });
        }}
      >
        {o.visible === false ? <EyeOff /> : <Eye />}
      </button>
      <span className={`type-icon ${o.type}`}>
        {o.type === "text" ? "T" : o.type === "image" ? "▧" : "◆"}
      </span>
      {renaming ? (
        <input
          ref={input}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finishRename(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishRename(true);
            if (e.key === "Escape") finishRename(false);
          }}
        />
      ) : (
        <span
          className="layer-name"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(o.name);
            setRenaming(true);
          }}
        >
          {o.name}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          commit((n) => {
            const x = n.objects.find((item) => item.id === o.id);
            x.locked = !x.locked;
          });
        }}
      >
        {o.locked ? <Lock /> : <Unlock />}
      </button>
    </div>
  );
}
function ExportModal({ close, run, size }) {
  const [format, setFormat] = useState("png"),
    [quality, setQuality] = useState(0.92);
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>Export design</h2>
        <p>
          Native output resolution: <b>{size}</b>
        </p>
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WebP</option>
          </select>
        </Field>
        {format === "jpeg" && (
          <Field label={`Quality ${Math.round(quality * 100)}%`}>
            <input
              type="range"
              min=".4"
              max="1"
              step=".01"
              value={quality}
              onChange={(e) => setQuality(+e.target.value)}
            />
          </Field>
        )}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="export" onClick={() => run(format, quality)}>
            <Download /> Export
          </button>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
