# TobiArt V0.2.4

A local-first desktop graphics editor focused on fast YouTube thumbnail creation. Projects save as self-contained `.tobiart` packages containing project data, embedded image assets, and a preview.

## Run from source

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Run `npm run dev`.

## Build for Windows

Run `npm run dist:win` on Windows. The installer and portable executable are written to `dist-electron`/`dist` according to electron-builder's output.

## Included in V0.1

- YouTube, square, vertical, and custom canvas presets
- PNG/JPEG/WebP imports, Explorer drag-and-drop, and clipboard image paste
- Text, images, rectangles, rounded rectangles, ellipses, lines, and triangles
- Selection handles, moving, resizing, rotation, opacity, flipping, keyboard nudging
- Ordered, hideable, lockable, renameable layers
- Undo/redo, duplication, copy/paste, and layer movement
- Self-contained `.tobiart` save/open workflow
- Native-resolution PNG/JPEG/WebP export

## V0.1.1 fixes

- Canvas objects now update in place instead of clearing and rebuilding the canvas, eliminating the editor-wide white flash.
- Corner-scaling text proportionally scales the font and outline; side handles remain available for changing the text container.
- Text, outline, shape, line, and canvas colors use a live draggable saturation/value field with one undo entry per gesture.
- Lines render with a real visible stroke and support selection, transforms, color, thickness, layers, save/load, and export.
- V0.1 `.tobiart` projects remain compatible; legacy zero-width line layers are upgraded to a visible stroke when opened.

## V0.1.2 fixes

- Consecutively created images, text, and shapes become selectable immediately without requiring another object to trigger an update.
- Async image creation can no longer discard a queued canvas reconciliation pass.
- Hit-test coordinates refresh as soon as a new object receives its project position and dimensions.
- Lines use stable rectangular stroke geometry, so moving, resizing, rotating, saving, and reopening preserve their canvas position.
- The live color picker now renders above the Properties panel and automatically opens upward or downward to remain inside the visible window.
- Project serialization now stores normalized project-space transforms only; viewport zoom and display geometry never enter `.tobiart` object data.
- Duplicates retain their offset when space allows and are constrained by rotated canvas bounds near edges.
- Line rotation snaps precisely to 0°, 90°, 180°, and 270° near cardinal angles.

## V0.2 workflow update

- DaVinci-style drag-scrubbable transform and effect values, with one history entry per gesture.
- Ctrl+mouse-wheel viewport zoom and 15° rotation snapping.
- Remembered local image-folder browser and visual shape browser.
- Independent shape fill/stroke enablement, per-range text colors, nondestructive blur, and canvas eyedropper.
- Reliable cut/copy/paste for editor objects plus bitmap clipboard paste.
- Windows `.tobiart` file association and command-line project opening.
- V0.1/V0.1.1/V0.1.2 projects migrate in memory without changing their saved geometry.

## V0.2.1 fixes

- Simplified the Image Library into a remembered Browse-once thumbnail workflow.
- Stabilized text rotation so rotating no longer changes the text object's project position.
- Fixed Ctrl+mouse-wheel zoom and kept it independent from project coordinates.
- Layer names now require a deliberate double-click to rename; normal clicks select.
- Fixed rendered-pixel eyedropper sampling and property targeting.
- Synchronized Layers-panel selection with visible canvas transform controls.
- Prioritized the active object's interaction bounds over overlapping higher layers.
- Separated project artwork clipping from transform controls using an expanded editor viewport and per-object project clip paths.

## V0.2.2 fixes

- Image Library folders now populate immediately, while thumbnails load lazily in a bounded queue so one bad file cannot blank or freeze the panel.
- PNG, JPG/JPEG, and WebP previews support ordinary Windows, spaced, and OneDrive-style paths, with per-image fallback and a useful empty state.
- All object types now rotate around a preserved visual center in both canvas-handle and numeric-property interactions.
- File → Open, Welcome-screen Open, Ctrl+O, and Windows `.tobiart` launch routes share one validated loader again.
- Invalid or incomplete project packages produce a visible error; cancelling Open remains harmless.

## V0.2.4 fixes

- One text layer can contain multiple independently colored character ranges.
- On-canvas text selections survive focus moving into the color picker.
- Live color dragging previews only the selected characters as one undo gesture.
- Fabric's edited character styles are converted back into saved style runs, so
  insertions, deletions, and replacements preserve surrounding formatting.
- Rich-text runs remain intact through copy, duplicate, save/reload, and export.

## V0.2.3 fixes

- Physical Ctrl+mouse-wheel input is bridged from Electron into the editor while browser zoom is explicitly cancelled; DOM wheel handling remains as a fallback.
- Canvas-object copy, cut, and paste now use an in-session object clipboard before checking for external bitmap data.
- Pasted images, text, shapes, and lines preserve their properties, stay within project bounds, and become selected immediately.
- Pick Color mode now shows a persistent status banner and crosshair; Escape or right-click cancels without applying a color.
- Character-range colors are merged into existing style runs instead of replacing them, allowing multiple colors in one text layer.
- Text insertions and deletions reconcile style runs so nearby formatting remains sensible through edits, undo/redo, save/load, and export.

## Notes

- Installed-font discovery is restricted by the browser security model; V0.1 exposes a dependable list of common Windows fonts, and any installed font can be added to the source list.
- Export always uses project pixel dimensions, independent of viewport zoom.
