<#
Starts the local InterviewAI server on Windows.

First run: creates .venv, installs the pinned server packages, and downloads
the approved Japanese model. Later runs only start the server.
#>
[CmdletBinding()]
param(
    [switch]$Refresh,
    [switch]$DiagnosticWav
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python が見つかりません。Python 3.10〜3.13 をインストールしてから、もう一度実行してください。'
}

$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
$newEnvironment = -not (Test-Path $venvPython)
if ($newEnvironment) {
    Write-Host '初回セットアップ: Python 仮想環境を作成しています…'
    & python -m venv .venv
}

if ($newEnvironment -or $Refresh) {
    Write-Host '必要なライブラリを準備しています…'
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r server\requirements.txt
}

$modelFile = Join-Path $projectRoot 'server\models\sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01\encoder-epoch-99-avg-1.int8.onnx'
if (-not (Test-Path $modelFile)) {
    Write-Host '日本語認識モデルをダウンロードしています（初回のみ、約681 MB）…'
    & $venvPython -m server.download_model
}

if ($DiagnosticWav) {
    $env:INTERVIEWAI_DIAGNOSTIC_WAV = '1'
    Write-Host '診断WAV保存を有効にして起動します。実際の面接ではこのオプションを外してください。'
} else {
    Remove-Item Env:INTERVIEWAI_DIAGNOSTIC_WAV -ErrorAction SilentlyContinue
}

Write-Host 'InterviewAI ローカルサーバーを起動します: http://127.0.0.1:8765'
& $venvPython -m server.launch
