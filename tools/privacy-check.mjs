import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", "dist", "release", "release-local"]);
const binaryExtensions = new Set([".ico", ".png"]);
const allowedEmails = new Set(["tobi.tiredandbored@gmail.com", "noreply@github.com"]);
const findings = [];

function filesUnder(dir) {
  const result = [];
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) result.push(...filesUnder(full));
    else result.push(full);
  }
  return result;
}

const patterns = [
  ["Windows user path", /[A-Za-z]:\\Users\\(?!Public\\|Default\\)[^\\\r\n]+/gi],
  ["Unix home path", /\/(?:home|Users)\/(?!agent(?:\/|$))[^/\s]+/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["credential assignment", /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"']{8,}["']/gi],
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
];

for (const file of filesUnder(root)) {
  if (binaryExtensions.has(extname(file).toLowerCase())) continue;
  const path = relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${path}: ${label}`);
  }
  if (path === "package-lock.json") continue;
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase();
    if (!allowedEmails.has(email) && !email.endsWith("@users.noreply.github.com"))
      findings.push(`${path}: unexpected email address`);
  }
}

try {
  const identities = execFileSync("git", ["log", "--all", "--format=%an%x00%ae%x00%cn%x00%ce"], { encoding: "utf8" });
  for (const line of identities.trim().split("\n").filter(Boolean)) {
    const [author, authorEmail, committer, committerEmail] = line.split("\0");
    for (const [name, email] of [[author, authorEmail], [committer, committerEmail]]) {
      const okName = name === "TobiTired" || name === "GitHub";
      const normalized = (email || "").toLowerCase();
      const okEmail = allowedEmails.has(normalized) || normalized.endsWith("@users.noreply.github.com") || normalized === "noreply@github.com";
      if (!okName || !okEmail) findings.push("Git history contains an unapproved author or committer identity");
    }
  }
} catch {
  // Source archives may not contain .git. CI always checks the complete history.
}

if (findings.length) {
  console.error(`Privacy audit failed with ${findings.length} finding(s):`);
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Privacy audit passed: source patterns and available Git history are clean.");
