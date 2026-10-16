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
  --collect-all sherpa_onnx --collect-all webrtcvad --collect-all numpy `
  --add-data "$modelPath;server/models/$modelName" `
  --distpath $releaseRoot --workpath (Join-Path $projectRoot 'build') --specpath (Join-Path $projectRoot 'build') `
  server/launch.py

$extensionRelease = Join-Path $releaseRoot 'InterviewAI-Chrome-Extension'
Remove-Item $extensionRelease -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $projectRoot 'dist') $extensionRelease -Recurse
Copy-Item (Join-Path $projectRoot 'docs\licenses.md') $releaseRoot
Write-Host "Created Windows distribution in $releaseRoot"
