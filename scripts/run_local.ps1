$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = "py"
    & $Python -3 --version | Out-Null
    $ArgsPrefix = @("-3")
} else {
    $ArgsPrefix = @()
}

& $Python @ArgsPrefix -m http.server 8502 --bind 127.0.0.1 --directory web
