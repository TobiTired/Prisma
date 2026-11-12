$ErrorActionPreference = "Stop"

$setup = Get-ChildItem "release/Prisma-*-Setup.exe" | Select-Object -First 1
$portable = Get-ChildItem "release/Prisma-*-Portable.exe" | Select-Object -First 1
$blockmap = Get-ChildItem "release/Prisma-*-Setup.exe.blockmap" | Select-Object -First 1
$metadata = Get-Item "release/latest.yml"

if (-not $setup -or -not $portable -or -not $blockmap -or -not $metadata) {
  throw "Release output is missing an installer, portable build, blockmap, or latest.yml."
}

$releaseVersion = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
$latest = Get-Content $metadata.FullName -Raw
if ($latest -notmatch "version:\s+$([regex]::Escape($releaseVersion))") {
  throw "latest.yml does not contain version $releaseVersion."
}
if ($latest -notmatch [regex]::Escape($setup.Name)) {
  throw "latest.yml does not reference $($setup.Name)."
}
if ($latest -notmatch "sha512:\s+\S+") {
  throw "latest.yml does not contain an installer SHA-512."
}

Write-Host "Verified $($setup.Name), $($portable.Name), $($blockmap.Name), and latest.yml."
