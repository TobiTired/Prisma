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
  const technical = String(error?.stack || error?.message || error || "Update check failed.");
  const offline = /net::|ENOTFOUND|ECONN|offline|network/i.test(technical);
  return {
    message: offline
      ? "Unable to check for updates while offline. You can keep working and try again later."
      : "Unable to check for updates. Please try again later.",
    technical,
  };
}

module.exports = { normalizeReleaseNotes, publicUpdateInfo, friendlyUpdateError };
