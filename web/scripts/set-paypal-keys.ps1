# Saves PayPal sandbox keys into web/.env.local, keeping every other line (e.g. AI_API_KEY).
# Run:  powershell -ExecutionPolicy Bypass -File F:\Abin\GeminiXprize\web\scripts\set-paypal-keys.ps1
$f = Join-Path $PSScriptRoot "..\.env.local"
$id = (Read-Host "PayPal Client ID").Trim()
$s = Read-Host "PayPal Secret" -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
if ($id.Length -lt 40 -or $id -notmatch '^[A-Za-z0-9_-]+$') { Write-Host "That Client ID doesn't look right. Nothing saved."; exit 1 }
if ($secret.Length -lt 40 -or $secret -notmatch '^[A-Za-z0-9_-]+$') { Write-Host "That Secret doesn't look right. Nothing saved."; exit 1 }
if ($id -ceq $secret) { Write-Host "Same value pasted twice. Nothing saved."; exit 1 }
Write-Host "ID starts: $($id.Substring(0,4))   Secret starts: $($secret.Substring(0,4))"
$keep = @()
if (Test-Path $f) { $keep = @(Get-Content $f | Where-Object { $_ -notmatch '^PAYPAL_CLIENT_(ID|SECRET)=' }) }
$lines = @("PAYPAL_CLIENT_ID=$id", "PAYPAL_CLIENT_SECRET=$secret") + $keep
[IO.File]::WriteAllText($f, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "Saved"
