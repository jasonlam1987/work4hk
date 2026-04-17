param(
  [int]$Port = 4174,
  [int]$TimeoutSec = 3
)

$url = "http://localhost:$Port/"

try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec $TimeoutSec
  Write-Host "[dev:health] OK $url status=$($resp.StatusCode)"
  exit 0
} catch {
  Write-Host "[dev:health] DOWN $url"
  exit 1
}

