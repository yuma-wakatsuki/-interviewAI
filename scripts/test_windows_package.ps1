[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseRoot
)

$ErrorActionPreference = 'Stop'
$exeDirectory = Join-Path $ReleaseRoot 'InterviewAI-Local'
$exe = Join-Path $exeDirectory 'InterviewAI-Local.exe'
$manifest = Join-Path $ReleaseRoot 'InterviewAI-Chrome-Extension\manifest.json'

if (-not (Test-Path $exe)) { throw "Package executable was not created: $exe" }
if (-not (Test-Path $manifest)) { throw "Extension manifest was not copied: $manifest" }

$manifestJson = Get-Content -Raw -Path $manifest | ConvertFrom-Json
if ($manifestJson.manifest_version -ne 3) { throw 'The packaged extension is not Manifest V3.' }

$previousPort = $env:INTERVIEWAI_PORT
$env:INTERVIEWAI_PORT = '18765'
$process = $null

try {
  $process = Start-Process -FilePath $exe -WorkingDirectory $exeDirectory -PassThru
  $healthy = $false
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/health' -TimeoutSec 2
      if ($response.status -eq 'ok') {
        $healthy = $true
        break
      }
    } catch {
      if ($process.HasExited) { throw 'Packaged server exited before responding to /health.' }
    }
  }
  if (-not $healthy) { throw 'Packaged server did not respond to /health within 30 seconds.' }
  Write-Host 'Windows package smoke test passed.'
} finally {
  if ($null -ne $process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  $env:INTERVIEWAI_PORT = $previousPort
}
