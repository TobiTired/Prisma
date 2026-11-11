function normalizeReleaseNotes(notes) {
  if (Array.isArray(notes)) return notes.map((item) => item.note || "").filter(Boolean).join("\n\n");
  return typeof notes === "string" ? notes : "";
}

function publicUpdateInfo(info) {
  return {
    version: info?.version || "",
    releaseName: info?.releaseName || "",
    releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    releaseDate: info?.releaseDate || "",
  };
}

function friendlyUpdateError(error) {
  const message = String(error?.message || error || "Update check failed.");
  if (/net::|ENOTFOUND|ECONN|offline|network/i.test(message))
    return "TobiArt could not reach GitHub Releases. You can keep working and try again later.";
  return message.replace(/^Error:\s*/i, "");
}

module.exports = { normalizeReleaseNotes, publicUpdateInfo, friendlyUpdateError };
