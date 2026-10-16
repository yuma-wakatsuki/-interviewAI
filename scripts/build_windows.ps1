[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$python = Join-Path $projectRoot (Join-Path '.venv' (Join-Path 'Scripts' 'python.exe'))
$modelName = 'sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01'
$modelPath = Join-Path $projectRoot (Join-Path 'server' (Join-Path 'models' $modelName))
$releaseRoot = Join-Path $projectRoot 'release'

if (-not (Test-Path $python)) { throw 'Run scripts\start_windows.ps1 once before packaging.' }
if (-not (Test-Path (Join-Path $modelPath 'encoder-epoch-99-avg-1.int8.onnx'))) { throw 'Japanese ASR model is missing. Run scripts\start_windows.ps1 first.' }

& $python -m PyInstaller --noconfirm --clean --onedir --name InterviewAI-Local `
  --collect-all sherpa_onnx --collect-all numpy `
  --additional-hooks-dir (Join-Path $PSScriptRoot 'pyinstaller-hooks') `
  --add-data "$modelPath;server/models/$modelName" `
  --distpath $releaseRoot --workpath (Join-Path $projectRoot 'build') --specpath (Join-Path $projectRoot 'build') `
  server/launch.py

$extensionRelease = Join-Path $releaseRoot 'InterviewAI-Chrome-Extension'
Remove-Item $extensionRelease -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $projectRoot 'dist') $extensionRelease -Recurse
Copy-Item (Join-Path $projectRoot 'docs\licenses.md') $releaseRoot

$startScript = @"
@echo off
setlocal
cd /d "%~dp0"
start "InterviewAI Local Server" /D "%~dp0InterviewAI-Local" cmd /k "InterviewAI-Local.exe"
"@
Set-Content -Path (Join-Path $releaseRoot 'Start-InterviewAI.cmd') -Value $startScript -Encoding ascii

$packageGuide = @"
InterviewAI for Windows

No Python, Node.js, or separate Japanese speech model installation is required.

First-time setup
1. Extract this ZIP to a local folder. Do not run it from inside the ZIP.
2. Double-click Start-InterviewAI.cmd and leave the server window running.
3. In Chrome, open chrome://extensions and enable Developer mode.
4. Click Load unpacked and choose the InterviewAI-Chrome-Extension folder.
5. Open a Google Meet tab, click the InterviewAI toolbar icon, and grant microphone permission once.

Daily use
1. Double-click Start-InterviewAI.cmd.
2. Join Google Meet and click the InterviewAI toolbar icon.

Audio recognition runs locally. The server does not retain interview audio or transcripts.
"@
Set-Content -Path (Join-Path $releaseRoot 'README.txt') -Value $packageGuide -Encoding utf8

& (Join-Path $PSScriptRoot 'test_windows_package.ps1') -ReleaseRoot $releaseRoot

$archive = Join-Path $projectRoot 'InterviewAI-Windows.zip'
Remove-Item $archive -Force -ErrorAction SilentlyContinue
$packageFiles = @(
  (Join-Path $releaseRoot 'InterviewAI-Local'),
  $extensionRelease,
  (Join-Path $releaseRoot 'licenses.md'),
  (Join-Path $releaseRoot 'README.txt'),
  (Join-Path $releaseRoot 'Start-InterviewAI.cmd')
)
Compress-Archive -Path $packageFiles -DestinationPath $archive
Write-Host "Created Windows distribution in $releaseRoot"
Write-Host "Created shareable archive: $archive"
