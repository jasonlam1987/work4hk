param(
  [int]$Port = 4174,
  [string]$BindHost = "0.0.0.0",
  [int]$RestartDelaySec = 1
)

Write-Host "[dev:stable] host=$BindHost port=$Port"
Write-Host "[dev:stable] Press Ctrl+C to stop."

while ($true) {
  Write-Host "`n[dev:stable] Starting Vite..."
  npm.cmd run dev -- --host $BindHost --port $Port
  $exitCode = $LASTEXITCODE

  if ($exitCode -eq 0) {
    Write-Host "[dev:stable] Vite exited normally."
    break
  }

  Write-Warning "[dev:stable] Vite exited unexpectedly (code=$exitCode). Restarting in $RestartDelaySec s..."
  Start-Sleep -Seconds $RestartDelaySec
}
