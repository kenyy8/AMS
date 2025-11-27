# Simple verification script (PowerShell) to call payment-history endpoints and monthly breakdown
try {
  Write-Host "Fetching latest payment history..."
  $ph = Invoke-RestMethod -Uri 'http://localhost:5001/api/payment-history' -Method Get
  $ph | ConvertTo-Json | Write-Output
  Write-Host "\nFetching monthly breakdown for current month..."
  $now = Get-Date
  $year = $now.Year
  $month = $now.Month
  $url = "http://localhost:5001/api/payment-history/monthly/$year/$month"
  $res = Invoke-RestMethod -Uri $url -Method Get
  $res | ConvertTo-Json | Write-Output
} catch {
  Write-Host "Error during verification: $_"
}
