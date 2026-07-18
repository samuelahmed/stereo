$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repository = "samuelahmed/stereo"
$ReleaseBase = "https://github.com/$Repository/releases/latest/download"
$Asset = "stereo-windows-x64.zip"
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("stereo-install-" + [guid]::NewGuid())
$Archive = Join-Path $TemporaryDirectory $Asset
$Checksums = Join-Path $TemporaryDirectory "SHA256SUMS"
$Staging = Join-Path $TemporaryDirectory "staging"
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs"
$InstallDirectory = Join-Path $InstallRoot "Stereo"
$BackupDirectory = Join-Path $InstallRoot (".Stereo.previous." + $PID)

try {
  New-Item -ItemType Directory -Force -Path $TemporaryDirectory, $Staging, $InstallRoot | Out-Null
  Write-Host "Downloading Stereo for Windows x64..."
  Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/$Asset" -OutFile $Archive
  Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/SHA256SUMS" -OutFile $Checksums

  $EscapedAsset = [regex]::Escape($Asset)
  $ChecksumLine = Get-Content $Checksums | Where-Object { $_ -match "^[0-9a-fA-F]{64}\s+\*?${EscapedAsset}$" } | Select-Object -First 1
  if (-not $ChecksumLine) { throw "The release does not contain a checksum for $Asset." }
  $Expected = ($ChecksumLine -split "\s+")[0].ToLowerInvariant()
  $Actual = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) { throw "Checksum verification failed." }

  $Running = Get-Process -Name "Stereo" -ErrorAction SilentlyContinue
  if ($Running) { throw "Stereo is running. Close it, then run the installer again." }

  Expand-Archive -Path $Archive -DestinationPath $Staging -Force
  $Executable = Get-ChildItem -Path $Staging -Filter "Stereo.exe" -File -Recurse | Select-Object -First 1
  if (-not $Executable) { throw "The Windows release did not contain Stereo.exe." }
  $SourceDirectory = $Executable.Directory.FullName

  $HadPrevious = Test-Path $InstallDirectory
  if ($HadPrevious) { Move-Item -Path $InstallDirectory -Destination $BackupDirectory }
  try {
    Move-Item -Path $SourceDirectory -Destination $InstallDirectory
  } catch {
    if ($HadPrevious -and -not (Test-Path $InstallDirectory)) {
      Move-Item -Path $BackupDirectory -Destination $InstallDirectory
    }
    throw
  }
  if ($HadPrevious) { Remove-Item -Path $BackupDirectory -Recurse -Force }

  $InstalledExecutable = Join-Path $InstallDirectory "Stereo.exe"
  $StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
  $ShortcutPath = Join-Path $StartMenu "Stereo.lnk"
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $InstalledExecutable
  $Shortcut.WorkingDirectory = $InstallDirectory
  $Shortcut.Save()

  Write-Host "Installed Stereo at $InstallDirectory"
  Write-Host "Verified against the checksums published with the GitHub release."
  Start-Process $InstalledExecutable
} finally {
  if (Test-Path $TemporaryDirectory) { Remove-Item -Path $TemporaryDirectory -Recurse -Force }
}
