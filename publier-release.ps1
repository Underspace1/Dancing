# Publie une nouvelle version de Dancing! sur GitHub (Underspace1/Dancing), avec Git seulement.
# Avant : monte "version" dans package.json (ex. 3.1.0).
# Usage : powershell -ExecutionPolicy Bypass -File publier-release.ps1
# Le script construit l'installateur, pousse le code et le tag, puis ouvre la page « Nouvelle release » de GitHub
# et le dossier dist : il reste à glisser Dancing!-Setup.exe dans la page et à cliquer « Publish release ».
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$tag = "v$version"
git rev-parse -q --verify "refs/tags/$tag" | Out-Null
if ($LASTEXITCODE -eq 0) { throw "Le tag $tag existe déjà : monte la version dans package.json." }

Write-Host "Construction de l'installateur $tag..."
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-installer.ps1')
if ($LASTEXITCODE) { throw "build-installer.ps1 a échoué" }

git add -A
git commit -m "Dancing! $version"
git tag $tag
git push origin main $tag
if ($LASTEXITCODE) { throw "git push a échoué" }

$title = [uri]::EscapeDataString("Dancing! $version")
Start-Process "https://github.com/Underspace1/Dancing/releases/new?tag=$tag&title=$title"
Start-Process explorer.exe "/select,`"$(Join-Path $PSScriptRoot 'dist\Dancing!-Setup.exe')`""
Write-Host "Glisse Dancing!-Setup.exe dans la page GitHub, puis clique « Publish release »."
