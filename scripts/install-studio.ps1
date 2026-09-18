# Installs (or updates) the Studio on this PC from a GitHub Release of the studio-kinds
# repository: the desktop app, the VS Code extension, the `studio-check` command and the
# studio-files skill for Claude Code. Nothing else is needed — no clone, no servers.
#
#   .\install-studio.ps1                 # the latest release
#   .\install-studio.ps1 -Tag studio-v0.2.0
#
# Needs: the GitHub CLI signed in (`gh auth login`) if the repository is private; `code` on the
# PATH for the extension; Node/npm for the checker. A step whose tool is missing is skipped and said.
param(
  [string]$Tag = "",
  [string]$Repo = "MaherKSantina/studio-kinds"
)
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:TEMP "studio-release"
if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
New-Item -ItemType Directory -Path $dir | Out-Null

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "The GitHub CLI (gh) is needed to download from the private repository: https://cli.github.com, then gh auth login." }
$patterns = @("-p", "*.exe", "-p", "*.vsix", "-p", "*.tgz", "-p", "*skill*.zip")
if ($Tag) { gh release download $Tag --repo $Repo -D $dir @patterns } else { gh release download --repo $Repo -D $dir @patterns }
Write-Host "Downloaded:"; Get-ChildItem $dir | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length / 1MB, 1)) MB" }

$exe = Get-ChildItem $dir -Filter "*.exe" | Select-Object -First 1
if ($exe) {
  Write-Host "Installing the desktop app ($($exe.Name)) — silent, per user…"
  Start-Process -FilePath $exe.FullName -ArgumentList "/S" -Wait
} else { Write-Host "No installer in the release." }

$vsix = Get-ChildItem $dir -Filter "*.vsix" | Select-Object -First 1
if ($vsix) {
  if (Get-Command code -ErrorAction SilentlyContinue) { Write-Host "Installing the VS Code extension…"; code --install-extension $vsix.FullName --force }
  else { Write-Host "VS Code's code command is not on the PATH — install the extension by hand: Extensions › … › Install from VSIX: $($vsix.FullName)" }
}

$tgz = Get-ChildItem $dir -Filter "*.tgz" | Select-Object -First 1
if ($tgz) {
  if (Get-Command npm -ErrorAction SilentlyContinue) { Write-Host "Installing the studio-check command…"; npm install -g $tgz.FullName }
  else { Write-Host "npm is not on the PATH — install Node.js, then: npm install -g $($tgz.FullName)" }
}

$zip = Get-ChildItem $dir -Filter "*skill*.zip" | Select-Object -First 1
if ($zip) {
  $skills = Join-Path $env:USERPROFILE ".claude\skills"
  New-Item -ItemType Directory -Force -Path $skills | Out-Null
  Expand-Archive -Path $zip.FullName -DestinationPath $skills -Force
  Write-Host "Skill installed: $skills\studio-files"
}
Write-Host "Done. Open a folder of documents in the Studio (Start menu) or in VS Code; studio-check --kinds lists the kinds."
