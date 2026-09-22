# Installs (or updates) the Studio on this PC from ONE named GitHub Release of the studio-kinds
# repository: the desktop app, the VS Code extension, the `studio-check` command and the
# studio-files skill for Claude Code. Nothing else is needed — no clone, no servers.
#
#   .\install-studio.ps1 -Tag studio-v0.2.5
#   .\install-studio.ps1 -Tag studio-v0.2.5 -Only cli,skill     # a subset: desktop, vscode, cli, skill
#
# The tag is required: an install names the release it comes from, so what lands on the PC is what
# the release's build log describes, not whatever is latest at the moment. Every download is verified
# against the release's SHA256SUMS before anything runs; a file whose digest differs stops the script.
# With the GitHub CLI signed in, each file's build provenance is verified too (`gh attestation
# verify`), proving it was built by this repository's release workflow at the tag's commit; without
# `gh`, the digests alone are checked and the script says so.
#
# Needs: `code` on the PATH for the extension; Python 3.10+ with pip for the checker. A step whose tool is missing
# is skipped and said. The desktop installer is unsigned — Windows will say so; the digest and the
# attestation are its provenance.
param(
  [Parameter(Mandatory = $true)][string]$Tag,
  [string]$Repo = "MaherKSantina/studio-kinds",
  [ValidateSet("desktop", "vscode", "cli", "skill")][string[]]$Only = @("desktop", "vscode", "cli", "skill")
)
$ErrorActionPreference = "Stop"
if ($Tag -notmatch '^studio-v\d+\.\d+\.\d+$') { throw "Tag must look like studio-v0.2.5 — the release to install." }
$dir = Join-Path $env:TEMP "studio-release"
if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
New-Item -ItemType Directory -Path $dir | Out-Null

# Download: the GitHub CLI when it is there (also needed for a private repository), plain HTTPS otherwise.
$gh = Get-Command gh -ErrorAction SilentlyContinue
$patterns = @("-p", "*.exe", "-p", "*.vsix", "-p", "*.whl", "-p", "*skill*.zip", "-p", "SHA256SUMS")
if ($gh) {
  gh release download $Tag --repo $Repo -D $dir @patterns
} else {
  $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers @{ "User-Agent" = "install-studio" }
  foreach ($a in $release.assets) {
    if ($a.name -match '\.(exe|vsix|whl)$' -or $a.name -like "*skill*.zip" -or $a.name -eq "SHA256SUMS") {
      Invoke-WebRequest $a.browser_download_url -OutFile (Join-Path $dir $a.name)
    }
  }
}
Write-Host "Downloaded from $Repo $Tag :"; Get-ChildItem $dir | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length / 1MB, 1)) MB" }

# Verify: every file against SHA256SUMS; nothing runs before this passes.
$sums = Join-Path $dir "SHA256SUMS"
if (-not (Test-Path $sums)) { throw "The release has no SHA256SUMS — nothing is installed unverified. Releases from studio-v0.2.5 carry one." }
$expected = @{}
foreach ($line in Get-Content $sums) { if ($line -match '^([0-9a-f]{64})\s+(.+)$') { $expected[$Matches[2].Trim()] = $Matches[1] } }
foreach ($f in Get-ChildItem $dir -File | Where-Object Name -ne "SHA256SUMS") {
  $want = $expected[$f.Name]
  if (-not $want) { throw "$($f.Name) is not listed in SHA256SUMS — not installed." }
  $got = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
  if ($got -ne $want) { throw "$($f.Name): digest $got does not match the release's $want — not installed." }
  Write-Host "  verified $($f.Name)"
}
if ($gh) {
  foreach ($f in Get-ChildItem $dir -File | Where-Object Name -ne "SHA256SUMS") {
    gh attestation verify $f.FullName --repo $Repo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$($f.Name): no build provenance attestation from $Repo — not installed." }
    Write-Host "  attested $($f.Name) — built by the release workflow of $Repo"
  }
} else {
  Write-Host "  (gh is not on the PATH: digests verified, build provenance not — install the GitHub CLI to verify that too)"
}

if ($Only -contains "desktop") {
  $exe = Get-ChildItem $dir -Filter "*.exe" | Select-Object -First 1
  if ($exe) {
    Write-Host "Installing the desktop app ($($exe.Name)) — per user, no prompts…"
    Start-Process -FilePath $exe.FullName -ArgumentList "/S" -Wait
  } else { Write-Host "No installer in the release." }
}

if ($Only -contains "vscode") {
  $vsix = Get-ChildItem $dir -Filter "*.vsix" | Select-Object -First 1
  if ($vsix) {
    if (Get-Command code -ErrorAction SilentlyContinue) { Write-Host "Installing the VS Code extension…"; code --install-extension $vsix.FullName --force }
    else { Write-Host "VS Code's code command is not on the PATH — install the extension by hand: Extensions › … › Install from VSIX: $($vsix.FullName)" }
  }
}

if ($Only -contains "cli") {
  $whl = Get-ChildItem $dir -Filter "*.whl" | Select-Object -First 1
  if ($whl) {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) { Write-Host "Installing the studio-check command…"; python -m pip install --user --upgrade $whl.FullName }
    else { Write-Host "python is not on the PATH — install Python 3.10+, then: python -m pip install --user $($whl.FullName)" }
  }
}

if ($Only -contains "skill") {
  $zip = Get-ChildItem $dir -Filter "*skill*.zip" | Select-Object -First 1
  if ($zip) {
    $skills = Join-Path $env:USERPROFILE ".claude\skills"
    New-Item -ItemType Directory -Force -Path $skills | Out-Null
    Expand-Archive -Path $zip.FullName -DestinationPath $skills -Force
    Write-Host "Skill installed: $skills\studio-files — it loads into every Claude Code session on this PC; read it once (it is short) so you know what it tells the agent."
  }
}
Write-Host "Done ($Tag). Open a folder of documents in the Studio (Start menu) or in VS Code; studio-check --kinds lists the kinds."
