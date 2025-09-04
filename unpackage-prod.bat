@echo off
echo ================================
echo CCC Production Unpacker
echo ================================
echo.

if not exist ccc-prod-bundle.txt (
    echo ERROR: ccc-prod-bundle.txt not found!
    pause
    exit /b 1
)

echo Creating PowerShell extraction script...

echo $content = Get-Content 'ccc-prod-bundle.txt' -Raw > extract.ps1
echo $current = $null >> extract.ps1
echo $buffer = "" >> extract.ps1
echo $inFile = $false >> extract.ps1
echo. >> extract.ps1
echo foreach ($line in ($content -split "`r?`n")) { >> extract.ps1
echo     if ($line -match '^-~\{File: (.+)\}~-$') { >> extract.ps1
echo         $current = $matches[1] >> extract.ps1
echo         Write-Host "Extracting: $current" >> extract.ps1
echo         $dir = Split-Path $current -Parent >> extract.ps1
echo         if ($dir -and -not (Test-Path $dir)) { >> extract.ps1
echo             New-Item -ItemType Directory -Path $dir -Force ^| Out-Null >> extract.ps1
echo         } >> extract.ps1
echo         $buffer = "" >> extract.ps1
echo         $inFile = $true >> extract.ps1
echo     } >> extract.ps1
echo     elseif ($line -eq '-~{END}~-') { >> extract.ps1
echo         if ($inFile -and $current) { >> extract.ps1
echo             $buffer = $buffer -replace "`n", "`r`n" >> extract.ps1
echo             # Create UTF-8 encoding without BOM >> extract.ps1
echo             $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList @($false) >> extract.ps1
echo             [System.IO.File]::WriteAllText($current, $buffer, $utf8NoBom) >> extract.ps1
echo         } >> extract.ps1
echo         $inFile = $false >> extract.ps1
echo         $current = $null >> extract.ps1
echo         $buffer = "" >> extract.ps1
echo     } >> extract.ps1
echo     elseif ($inFile) { >> extract.ps1
echo         if ($buffer) { $buffer += "`n" } >> extract.ps1
echo         $buffer += $line >> extract.ps1
echo     } >> extract.ps1
echo } >> extract.ps1

echo Running extraction...
powershell -ExecutionPolicy Bypass -File extract.ps1

echo Cleaning up...
del extract.ps1

echo.
echo ================================
echo Unpacking Complete!
echo ================================
echo.
echo Files extracted:
echo - src/java-agent/ (Java source files + web UI assets)
echo - src/browser-bridge/bridge-api.js
echo - run-prod.bat
echo.
echo To run CCC:
echo 1. Make sure you have Java installed
echo 2. Run: run-prod.bat
echo.
pause
