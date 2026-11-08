# Builds dist\Dancing!-Setup.exe: the custom-UI installer (app\installer) with the portable folder appended as a zip.
# Personal files are never packed: data, videos, cache, osu! credentials, danser database/logs, installed tosu widgets, backups.
param([string]$Portable = "$PSScriptRoot\dist\Dancing!", [string]$Out = "$PSScriptRoot\dist\Dancing!-Setup.exe")
$ErrorActionPreference = 'Stop'
$installer = "$PSScriptRoot\app\target\release\dancing-setup.exe"
if (-not (Test-Path $installer)) { throw "Compile d'abord l'installateur : cd app\installer; cargo build --release --target-dir ..\target" }
if (-not (Test-Path "$Portable\Dancing!.exe")) { throw "Portable introuvable : $Portable" }

$work = Join-Path $env:TEMP ("dancing-setup-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $work | Out-Null
try {
  $zip = Join-Path $work 'payload.zip'
  $exclude = @('./data', './videos', './cache', './runtime/danser-hud/settings/credentials.json', './runtime/danser-hud/settings/replay-hud-v2.json',
    './runtime/danser-hud/danser.db', './runtime/danser-hud/danser.log', './runtime/tosu/static', './runtime/tosu/settings', './runtime/tosu/logs',
    './runtime/tosu/tosu.env', '*.bak', '*.avant-*', './Dancing!.exe.avant-webfix') | ForEach-Object { "--exclude=$_" }
  Push-Location $Portable
  try { & "$env:WINDIR\System32\tar.exe" -a -c -f $zip @exclude . ; if ($LASTEXITCODE) { throw "tar a échoué ($LASTEXITCODE)" } }
  finally { Pop-Location }

  $offset = (Get-Item $installer).Length
  $outStream = [IO.File]::Create($Out)
  try {
    foreach ($part in @($installer, $zip)) { $in = [IO.File]::OpenRead($part); try { $in.CopyTo($outStream) } finally { $in.Dispose() } }
    $tail = [BitConverter]::GetBytes([UInt64]$offset) + [Text.Encoding]::ASCII.GetBytes('DNCPAYLD')
    $outStream.Write($tail, 0, $tail.Length)
  } finally { $outStream.Dispose() }
  "{0} ({1:N0} Mo)" -f $Out, ((Get-Item $Out).Length / 1MB)
} finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
