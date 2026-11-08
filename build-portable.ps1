param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist/Dancing!'),
    [string]$ToolsDirectory = (Join-Path $PSScriptRoot '../..'),
    [string]$ChromiumDirectory = (Join-Path $PSScriptRoot 'app/headless/chrome-headless-shell-win64'),
    [string]$NodePath = (Get-Command node.exe).Source
)

$ErrorActionPreference = 'Stop'
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) {
    throw "Choisis un nouveau dossier de sortie pour préserver les réglages et les vidéos existants."
}

$danser = Join-Path $ToolsDirectory 'danser-hud'
$tosu = Join-Path $ToolsDirectory 'tosu'
$danserFiles = @('danser-cli.exe', 'danser-core.dll', 'bass.dll', 'bass_fx.dll',
    'bassmix.dll', 'libyuv.dll', 'assets.dpak', 'LICENSE', 'CREDITS.md',
    'danser-hud-source.zip')
foreach ($name in $danserFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $danser $name))) { throw "Fichier danser absent : $name" }
}
if (!(Test-Path -LiteralPath (Join-Path $tosu 'tosu.exe'))) { throw 'tosu.exe absent.' }
if (!(Test-Path -LiteralPath (Join-Path $danser 'ffmpeg/ffmpeg.exe'))) { throw 'ffmpeg.exe absent.' }
if (!(Test-Path -LiteralPath (Join-Path $ChromiumDirectory 'chrome-headless-shell.exe'))) { throw 'Chromium Headless Shell est absent.' }
$profile = Get-Content -Raw -LiteralPath (Join-Path $danser 'settings/default.json') | ConvertFrom-Json
$profile.General.OsuSongsDir = ''
$profile.General.OsuSkinsDir = ''
$profile.General.OsuReplaysDir = ''
$profile.Recording.OutputDir = ''
$profile.Recording.FrameWidth = 1920
$profile.Recording.FrameHeight = 1080
$profile.Recording.FPS = 60
$profile.Recording.Encoder = 'libx264'
$profile.Recording.MotionBlur.Enabled = $false

$target = Join-Path $PSScriptRoot 'app/target'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$exe = Join-Path $target 'Dancing!.exe'
$framework = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319"
$mediaReferences = @('WindowsFormsIntegration','WindowsBase','PresentationCore','PresentationFramework') | ForEach-Object { "/r:$framework/WPF/$_.dll" }
& "$framework/csc.exe" /nologo /codepage:65001 /target:winexe /platform:x64 /optimize+ "/out:$exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Xaml.dll @mediaReferences (Join-Path $PSScriptRoot 'app/Dancing.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilation de Dancing! échouée.' }

$bundle = Join-Path $OutputDirectory 'runtime'
$danserOut = Join-Path $bundle 'danser-hud'
$tosuOut = Join-Path $bundle 'tosu'
New-Item -ItemType Directory -Path (Join-Path $danserOut 'settings'), (Join-Path $danserOut 'ffmpeg'), (Join-Path $tosuOut 'static') -Force | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $OutputDirectory 'Dancing!.exe')
Copy-Item -LiteralPath $ChromiumDirectory -Destination (Join-Path $bundle 'chromium') -Recurse
$assets = Join-Path $OutputDirectory 'assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app/fonts') -Destination $assets -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $bundle 'node.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../Node-LICENSE.txt') -Destination (Join-Path $bundle 'Node-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $tosu 'tosu.exe') -Destination $tosuOut
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'third-party/tosu-LICENSE.txt') -Destination (Join-Path $tosuOut 'LICENSE')
foreach ($name in $danserFiles) {
    Copy-Item -LiteralPath (Join-Path $danser $name) -Destination $danserOut
}
Get-ChildItem -LiteralPath (Join-Path $danser 'ffmpeg') -File | Copy-Item -Destination (Join-Path $danserOut 'ffmpeg')
$profile | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $danserOut 'settings/default.json') -Encoding UTF8
foreach ($name in @('server.mjs', 'compose.mjs', 'extras.mjs', 'package.json', 'web', 'node_modules', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $OutputDirectory -Recurse
}
Get-Item -LiteralPath (Join-Path $OutputDirectory 'Dancing!.exe')
