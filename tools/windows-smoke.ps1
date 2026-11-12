$ErrorActionPreference = "Stop"

$setup = Get-ChildItem "release/Prisma-*-Setup.exe" | Select-Object -First 1
if (-not $setup) { throw "Windows smoke test could not find the installer." }

$settingsDir = Join-Path $env:APPDATA "Prisma"
$settingsFile = Join-Path $settingsDir "settings.json"
$projectDir = Join-Path $env:TEMP "PrismaReleaseSmoke"
$prismaProject = Join-Path $projectDir "smoke.prisma"
$legacyProject = Join-Path $projectDir "legacy.tobiart"

New-Item -ItemType Directory -Force $settingsDir, $projectDir | Out-Null
'{"releaseSmokeMarker":true}' | Set-Content $settingsFile -Encoding UTF8
'release-smoke-project' | Set-Content $prismaProject -Encoding UTF8
'legacy-release-smoke-project' | Set-Content $legacyProject -Encoding UTF8

$install = Start-Process $setup.FullName -ArgumentList "/S" -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }

$exe = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Programs") -Filter "Prisma.exe" -Recurse |
  Select-Object -First 1
$uninstaller = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Programs") -Filter "Uninstall Prisma.exe" -Recurse |
  Select-Object -First 1
if (-not $exe) { throw "Installed Prisma.exe was not found." }
if (-not $uninstaller) { throw "Prisma uninstaller was not found." }

foreach ($extension in @(".prisma", ".tobiart")) {
  $extensionKey = "Registry::HKEY_CLASSES_ROOT\$extension"
  if (-not (Test-Path $extensionKey)) { throw "$extension is not registered." }
  $progId = (Get-Item $extensionKey).GetValue("")
  if (-not $progId) { throw "$extension has no registered ProgID." }
  $commandKey = "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command"
  if (-not (Test-Path $commandKey)) { throw "$extension has no open command." }
  $command = (Get-Item $commandKey).GetValue("")
  if ($command -notmatch "Prisma\.exe" -or $command -notmatch "%1") {
    throw "$extension open command does not invoke Prisma.exe with the selected file."
  }
}

foreach ($project in @($prismaProject, $legacyProject)) {
  $process = Start-Process $exe.FullName -ArgumentList ('"' + $project + '"') -PassThru
  Start-Sleep -Seconds 8
  if ($process.HasExited) { throw "Prisma exited unexpectedly while opening $project." }
  & taskkill /PID $process.Id /T /F | Out-Null
}

$uninstall = Start-Process $uninstaller.FullName -ArgumentList "/S" -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstall.ExitCode)." }

foreach ($preserved in @($settingsFile, $prismaProject, $legacyProject)) {
  if (-not (Test-Path $preserved)) { throw "Uninstall removed user data: $preserved" }
}

Write-Host "Windows install, launch, associations, uninstall, and preservation smoke test passed."
