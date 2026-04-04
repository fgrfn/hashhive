#Requires -Version 5.1
<#
.SYNOPSIS
    HashHive Setup-Skript für Windows
#>

Write-Host ""
Write-Host "══════════════════════════════════" -ForegroundColor Magenta
Write-Host "      HashHive Setup (Windows)    " -ForegroundColor Magenta
Write-Host "══════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

# ── Python prüfen ────────────────────────────────────────────────────────────
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "✗  Python nicht gefunden. Bitte Python 3.10+ installieren." -ForegroundColor Red
    Write-Host "   https://www.python.org/downloads/" -ForegroundColor Gray
    exit 1
}

$pyVer = python --version 2>&1
Write-Host "✓  $pyVer" -ForegroundColor Green

# ── Abhängigkeiten installieren ───────────────────────────────────────────────
Write-Host ""
Write-Host "Installiere Abhängigkeiten..." -ForegroundColor Cyan

$backendDir = Join-Path $PSScriptRoot "backend"
Push-Location $backendDir

pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗  pip install fehlgeschlagen." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "✓  Abhängigkeiten installiert." -ForegroundColor Green

# ── Autostart abfragen ───────────────────────────────────────────────────────
Write-Host ""
$answer = Read-Host "Autostart aktivieren? (Aufgabenplanung, startet beim Anmelden) [j/N]"

if ($answer -match '^[jJyY]') {
    $pyPath    = (Get-Command python).Source
    $workDir   = (Resolve-Path $backendDir).Path
    $taskName  = "HashHive"

    $action = New-ScheduledTaskAction `
        -Execute    $pyPath `
        -Argument   "-m uvicorn main:app --host 0.0.0.0 --port 8000" `
        -WorkingDirectory $workDir

    $trigger  = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
        -RestartOnIdle:$false

    Register-ScheduledTask `
        -TaskName   $taskName `
        -Action     $action `
        -Trigger    $trigger `
        -Settings   $settings `
        -Description "HashHive Mining Dashboard" `
        -RunLevel   Highest `
        -Force | Out-Null

    Write-Host "✓  Geplante Aufgabe '$taskName' erstellt." -ForegroundColor Green
    Write-Host "   Verwalten: Aufgabenplanung → $taskName" -ForegroundColor Gray
    Write-Host "   Jetzt starten? " -ForegroundColor Cyan -NoNewline
    $startNow = Read-Host "[j/N]"
    if ($startNow -match '^[jJyY]') {
        Start-ScheduledTask -TaskName $taskName
        Write-Host "✓  HashHive gestartet." -ForegroundColor Green
    }
} else {
    Write-Host "  Kein Autostart eingerichtet." -ForegroundColor Gray
}

# ── Fertig ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host " Manuell starten:" -ForegroundColor Yellow
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   uvicorn main:app --host 0.0.0.0 --port 8000 --reload" -ForegroundColor White
Write-Host ""
Write-Host " Dashboard: http://localhost:8000" -ForegroundColor Cyan
Write-Host " API-Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
