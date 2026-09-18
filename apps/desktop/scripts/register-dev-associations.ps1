# register-dev-associations.ps1 - make double-clicking a Studio document open the
# desktop app WITHOUT an installer: user-level file associations (HKCU, nothing
# system-wide) that launch the workspace's own Electron on apps/desktop with the
# file as its argument. The app opens the file's folder, then the file; a second
# launch hands the file to the window already open. Also "Open with Studio" on a
# FOLDER - Explorer's context menu on a folder and on the empty space inside one
# (Windows 11: under "Show more options", where VS Code's entry sits) - which
# opens that folder on its root memory.
#
#   .\register-dev-associations.ps1            register every Studio kind + the folder entry
#   .\register-dev-associations.ps1 -Remove    undo exactly what this script wrote
#
# Prerequisite: the desktop renderer is built (`pnpm desktop:renderer` at the
# workspace root - again after changing the Studio). The installer
# (`pnpm --filter studio-desktop dist`) is the permanent alternative.
param([switch]$Remove)

$desktop = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $desktop "node_modules\electron\dist\electron.exe"
# The Studio's icon (scripts/make-icon.mjs): on every document kind and on the folder entry.
$icon = Join-Path $desktop "build\icon.ico"
if (-not $Remove -and -not (Test-Path $electron)) { throw "Electron not found at $electron - run pnpm install in the workspace first." }
if (-not $Remove -and -not (Test-Path (Join-Path $desktop "renderer\desktop.html"))) { throw "The desktop renderer is not built - run 'pnpm desktop:renderer' at C:\Github\suite first." }

# Every text kind the Studio authors (binary kinds - pdf, xlsx - are viewed only and stay with their own apps).
$exts = @("frame", "flow", "playbook", "plan", "guide", "brief", "points", "policy", "project", "list", "kanban",
          "calendar", "definition", "memory", "schema", "workup", "program", "tablediff", "pulse", "moves", "jsonl", "middleware", "collection", "clip", "song")

foreach ($ext in $exts) {
  $progId  = "Studio.$ext"
  $extKey  = "HKCU:\Software\Classes\.$ext"
  $progKey = "HKCU:\Software\Classes\$progId"
  if ($Remove) {
    $current = (Get-ItemProperty -Path $extKey -ErrorAction SilentlyContinue).'(default)'
    if ($current -eq $progId) { Remove-Item -Path $extKey -Recurse -Force }
    elseif (Test-Path "$extKey\OpenWithProgids") { Remove-ItemProperty -Path "$extKey\OpenWithProgids" -Name $progId -ErrorAction SilentlyContinue }
    if (Test-Path $progKey) { Remove-Item -Path $progKey -Recurse -Force }
    Write-Host "removed .$ext"
    continue
  }
  New-Item -Path $extKey -Force | Out-Null
  Set-ItemProperty -Path $extKey -Name '(default)' -Value $progId
  # Also listed under "Open with", so a kind Windows already associates elsewhere still offers the Studio.
  New-Item -Path "$extKey\OpenWithProgids" -Force | Out-Null
  Set-ItemProperty -Path "$extKey\OpenWithProgids" -Name $progId -Value ""
  New-Item -Path "$progKey\shell\open\command" -Force | Out-Null
  New-Item -Path "$progKey\DefaultIcon" -Force | Out-Null
  Set-ItemProperty -Path $progKey -Name '(default)' -Value "Studio $ext"
  Set-ItemProperty -Path "$progKey\DefaultIcon" -Name '(default)' -Value "`"$icon`""
  Set-ItemProperty -Path "$progKey\shell\open\command" -Name '(default)' -Value "`"$electron`" `"$desktop`" `"%1`""
  Write-Host "registered .$ext -> Studio"
}

# "Open with Studio" on a folder: right-click a folder, or the background of an open one. `%V` is the
# folder either way (a background click has no `%1`). The installer's build/installer.nsh writes the same keys.
foreach ($dirKey in @("HKCU:\Software\Classes\Directory\shell\Studio", "HKCU:\Software\Classes\Directory\Background\shell\Studio")) {
  if ($Remove) {
    if (Test-Path $dirKey) { Remove-Item -Path $dirKey -Recurse -Force }
    Write-Host "removed $dirKey"
    continue
  }
  New-Item -Path "$dirKey\command" -Force | Out-Null
  Set-ItemProperty -Path $dirKey -Name '(default)' -Value "Open with Studio"
  Set-ItemProperty -Path $dirKey -Name 'Icon' -Value "`"$icon`""
  Set-ItemProperty -Path "$dirKey\command" -Name '(default)' -Value "`"$electron`" `"$desktop`" `"%V`""
  Write-Host "registered $dirKey -> Studio"
}

# Tell Explorer the associations changed (SHCNE_ASSOCCHANGED), so icons and double-click pick it up at once.
$sig = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);'
$shell = Add-Type -MemberDefinition $sig -Name Shell32Notify -Namespace Win32 -PassThru
$shell::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
if (-not $Remove) { Write-Host "Done. Double-click any Studio document - if Windows had its own choice for an extension, pick 'Studio <kind>' under Open with once. Right-click a folder > Show more options > Open with Studio." }
