const path = require("path");

const PRIMARY_EXTENSION = ".prisma";
const LEGACY_EXTENSION = ".tobiart";
const PROJECT_EXTENSIONS = [PRIMARY_EXTENSION, LEGACY_EXTENSION];

function isProjectPath(value) {
  return (
    typeof value === "string" &&
    PROJECT_EXTENSIONS.includes(path.extname(value).toLowerCase())
  );
}

function isLegacyProjectPath(value) {
  return (
    typeof value === "string" &&
    path.extname(value).toLowerCase() === LEGACY_EXTENSION
  );
}

function prismaPathFor(value) {
  const parsed = path.parse(value || "Untitled");
  return path.join(parsed.dir, `${parsed.name}${PRIMARY_EXTENSION}`);
}

module.exports = {
  PRIMARY_EXTENSION,
  LEGACY_EXTENSION,
  PROJECT_EXTENSIONS,
  isProjectPath,
  isLegacyProjectPath,
  prismaPathFor,
};
