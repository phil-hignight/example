@echo off
echo ================================
echo CCC Production Unpacker
echo ================================
echo.

if not exist ccc-bundle.txt (
    echo ERROR: ccc-bundle.txt not found!
    pause
    exit /b 1
)

echo Creating PowerShell extraction script...

echo $content = Get-Content 'ccc-bundle.txt' -Raw > extract.ps1
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
echo - package.json
echo - config.json
echo - src/java-agent/ClipboardAgent.java
echo - src/java-agent/StandaloneAgent.java  
echo - mock-env/server.js
echo - mock-env/ui.html
echo - src/browser-bridge/bridge-api.js
echo - run-prod.bat (production - requires real Claude UI)
echo - run-dev.bat (development - includes mock server)
echo.
echo To run CCC:
echo For development/testing: run-dev.bat
echo For production: run-prod.bat
echo.
pause
