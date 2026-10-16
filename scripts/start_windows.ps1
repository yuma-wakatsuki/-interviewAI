[CmdletBinding()]
param(
    [switch]$Refresh,
    [switch]$DiagnosticWav
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python was not found. Install Python 3.10 through 3.13 and retry.'
}

$venvPython = Join-Path $projectRoot (Join-Path '.venv' (Join-Path 'Scripts' 'python.exe'))
$newEnvironment = -not (Test-Path $venvPython)
if ($newEnvironment) {
    Write-Host 'Creating Python virtual environment...'
    & python -m venv .venv
}

if ($newEnvironment -or $Refresh) {
    Write-Host 'Installing required packages...'
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r server\requirements.txt
}

$modelFile = Join-Path $projectRoot (Join-Path 'server' (Join-Path 'models' (Join-Path 'sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01' 'encoder-epoch-99-avg-1.int8.onnx')))
if (-not (Test-Path $modelFile)) {
    Write-Host 'Downloading Japanese ASR model (first run only, about 681 MB)...'
    & $venvPython -m server.download_model
}

if ($DiagnosticWav) {
    $env:INTERVIEWAI_DIAGNOSTIC_WAV = '1'
    Write-Host 'Diagnostic WAV saving is enabled.'
} else {
    Remove-Item Env:INTERVIEWAI_DIAGNOSTIC_WAV -ErrorAction SilentlyContinue
}

Write-Host 'Starting InterviewAI local server: http://127.0.0.1:8765'
& $venvPython -m server.launch
