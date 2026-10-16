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
$stdoutLog = Join-Path $ReleaseRoot 'package-smoke-test.stdout.log'
$stderrLog = Join-Path $ReleaseRoot 'package-smoke-test.stderr.log'

try {
  Remove-Item $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $exe -WorkingDirectory $exeDirectory -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
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
      if ($process.HasExited) {
        $details = ''
        if (Test-Path $stderrLog) { $details = Get-Content -Raw -Path $stderrLog }
        if (-not $details -and (Test-Path $stdoutLog)) { $details = Get-Content -Raw -Path $stdoutLog }
        throw "Packaged server exited before responding to /health. Output: $details"
      }
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
