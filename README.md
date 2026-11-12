# Prisma v0.3.1

Prisma is a local-first Windows thumbnail editor built for a focused thumbnail-creation workflow. It supports images, rich text, shapes, layers, nondestructive blur, pixel sampling, native-resolution export, and self-contained project files.

## Compatibility

Prisma projects now use `.prisma`. Existing `.tobiart` projects remain supported with the same internal project format. Saving a legacy project opens a migration Save As dialog for a sibling `.prisma` copy and leaves the original untouched. On first launch, Prisma imports the remembered Image Library folder from an existing TobiArt settings directory when present. Projects remain wherever the user saved them.

## Install

Download `Prisma-0.3.1-x64-Setup.exe` from [GitHub Releases](https://github.com/TobiTired/Prisma/releases). The per-user installer does not normally require administrator privileges. It installs Prisma, creates a Start Menu shortcut, offers a desktop shortcut, registers uninstall support, and associates both primary `.prisma` and legacy `.tobiart` projects with Prisma.

The Windows build is currently unsigned. Windows SmartScreen may display an unknown-publisher warning. GitHub release metadata includes the installer size and SHA-512 used by Prisma's updater to reject incomplete or corrupt downloads.

## Updates

Installed stable builds check the official `TobiTired/Prisma` GitHub Releases feed at startup. Help → Check for Updates performs a manual check. Updates are never forced: Prisma displays the available version and notes, downloads only after approval, and asks the user to save an unsaved project before installation. Offline and failed checks leave the editor usable.

## Run from source

Requires Node.js 22 or newer.

```powershell
npm ci
npm test
npm run dev
```

## Build for Windows

```powershell
npm run dist:win
```

Stable releases are created from reviewed `vX.Y.Z` tags. Manual workflow runs build verification artifacts and never publish a release. See [RELEASING.md](RELEASING.md).

## Privacy

Prisma stores settings locally through Electron's per-user application-data directory. Project files and imported images are not uploaded by the application. GitHub is contacted only for release update checks and downloads. No GitHub token or private credential is embedded in the distributed application.

## Major editor features

- YouTube, square, vertical, and custom canvas presets
- PNG, JPEG, and WebP import and export
- Remembered local Image Library folder and visual thumbnail browser
- Images, rich text, rectangles, rounded rectangles, ellipses, lines, and triangles
- Mixed-color character ranges within one text layer
- Selection, transforms, rotation snapping, opacity, flipping, blur, and eyedropper
- Ordered, hideable, lockable, and renameable layers
- Undo/redo, duplicate, cut/copy/paste, and keyboard nudging
- Viewport-independent project coordinates and native-resolution export
- Native `.prisma` projects with compatible V0.1–V0.3.0 `.tobiart` loading
