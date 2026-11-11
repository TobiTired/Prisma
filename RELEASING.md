# Prisma release workflow

Stable builds are published from version tags only. Repository commits and development builds are never offered by the in-app updater.

1. Update `package.json` and `package-lock.json` to the intended version.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run dist:installer`.
3. Test the generated installer on Windows, including upgrade, uninstall, file association, and settings preservation.
4. Commit the verified release, create an annotated `vX.Y.Z` tag, and push the tag.
5. GitHub Actions builds a draft GitHub Release containing the NSIS installer, `latest.yml`, and blockmap.
6. Review the draft assets and release notes, then publish it as a stable release. Do not mark development builds as latest.

`latest.yml` contains the installer SHA-512 used by `electron-updater` to reject a corrupt or incomplete download. Code signing can be added later through protected repository secrets; no access token or private key is included in the application.
