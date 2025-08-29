@echo off
echo ================================
echo CCC Production Unpacker v2
echo ================================
echo.

if not exist ccc-bundle.txt (
    echo ERROR: ccc-bundle.txt not found!
    echo Make sure you're in the same directory as the bundle file.
    exit /b 1
)

echo Creating PowerShell extraction script...

REM Create a PowerShell script to handle the extraction
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
echo             $buffer = $buffer -replace "`r`n", "`n" -replace "`r", "`n" -replace "`n", "`r`n" >> extract.ps1
echo             [System.IO.File]::WriteAllText($current, $buffer, [System.Text.Encoding]::UTF8) >> extract.ps1
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
echo - src/node-server/coordinator-demo.js  
echo - src/browser-bridge/bridge-api.js
echo - run-prod.bat
echo.
echo To run CCC:
echo 1. Make sure you have Java and Node.js installed
echo 2. Run: run-prod.bat
echo.
pause
