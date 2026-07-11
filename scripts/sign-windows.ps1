param([Parameter(Mandatory = $true)][string]$Path)

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_THUMBPRINT)) {
  Write-Host "Windows signing certificate is not configured; leaving $Path unsigned."
  exit 0
}

$signtoolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($signtoolCommand) {
  $signtool = $signtoolCommand.Source
} else {
  $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $signtool = Get-ChildItem $kitsRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $signtool) { throw 'signtool.exe was not found in PATH or the Windows SDK.' }

& $signtool sign /sha1 $env:WINDOWS_CERTIFICATE_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Path
if ($LASTEXITCODE -ne 0) { throw "signtool failed for $Path" }
& $signtool verify /pa /v $Path
if ($LASTEXITCODE -ne 0) { throw "signature verification failed for $Path" }
