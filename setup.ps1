#Requires -Version 5.1
<#
.SYNOPSIS
    HashHive setup script for Windows.
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==================================" -ForegroundColor Magenta
Write-Host "      HashHive Setup (Windows)    " -ForegroundColor Magenta
Write-Host "==================================" -ForegroundColor Magenta
Write-Host ""

# Check Python.
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python was not found. Install Python 3.10 or newer." -ForegroundColor Red
    Write-Host "        https://www.python.org/downloads/" -ForegroundColor Gray
    exit 1
}

$pythonVersion = python --version 2>&1
Write-Host "[OK] $pythonVersion" -ForegroundColor Green
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] HashHive requires Python 3.10 or newer." -ForegroundColor Red
    exit 1
}

# Create an isolated environment and install locked dependencies.
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan

$backendDir = Join-Path $PSScriptRoot "backend"
$venvDir = Join-Path $PSScriptRoot ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$requirementsFile = Join-Path $backendDir "requirements.lock"

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "Creating virtual environment .venv..." -ForegroundColor Cyan
    python -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Could not create the virtual environment." -ForegroundColor Red
        exit 1
    }
}

& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r $requirementsFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Dependency installation failed." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Dependencies installed." -ForegroundColor Green

# Optional scheduled task.
Write-Host ""
$answer = Read-Host "Enable autostart through Task Scheduler? [y/N]"

if ($answer -match "^[jJyY]") {
    $workDir = (Resolve-Path $backendDir).Path
    $taskName = "HashHive"

    $action = New-ScheduledTaskAction `
        -Execute $venvPython `
        -Argument "-m uvicorn main:app --host 0.0.0.0 --port 8000" `
        -WorkingDirectory $workDir

    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $taskSettings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
        -RestartOnIdle:$false

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $taskSettings `
        -Description "HashHive Mining Dashboard" `
        -RunLevel Highest `
        -Force | Out-Null

    Write-Host "[OK] Scheduled task '$taskName' created." -ForegroundColor Green
    Write-Host "     Manage it in Windows Task Scheduler." -ForegroundColor Gray
    $startNow = Read-Host "Start HashHive now? [y/N]"
    if ($startNow -match "^[jJyY]") {
        Start-ScheduledTask -TaskName $taskName
        Write-Host "[OK] HashHive started." -ForegroundColor Green
    }
} else {
    Write-Host "Autostart was not enabled." -ForegroundColor Gray
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Magenta
Write-Host " Manual start:" -ForegroundColor Yellow
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   ..\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000" -ForegroundColor White
Write-Host ""
Write-Host " Dashboard: http://localhost:8000" -ForegroundColor Cyan
Write-Host " API docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Magenta
Write-Host ""
