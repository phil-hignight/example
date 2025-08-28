@echo off
echo ================================
echo CCC Production Unpacker
echo ================================
echo.

if not exist ccc-bundle.txt (
    echo ERROR: ccc-bundle.txt not found!
    echo Make sure you're in the same directory as the bundle file.
    exit /b 1
)

echo Unpacking files...
echo.

setlocal enabledelayedexpansion

REM Read the bundle file and extract files
set "currentFile="
set "inFile=0"

for /f "usebackq delims=" %%A in ("ccc-bundle.txt") do (
    set "line=%%A"
    
    REM Check for file header
    if "!line:~0,8!"=="-~{File:" (
        set "currentFile=!line:~9,-3!"
        echo Extracting: !currentFile!
        
        REM Create directory if needed
        for %%F in ("!currentFile!") do (
            set "dir=%%~dpF"
            if not "!dir!"=="" (
                if not exist "!dir!" mkdir "!dir!"
            )
        )
        
        REM Clear/create the file
        type nul > "!currentFile!"
        set "inFile=1"
    ) else if "!line!"=="-~{END}~-" (
        set "inFile=0"
        set "currentFile="
    ) else if "!inFile!"=="1" (
        REM Write line to current file
        echo.%%A>>"!currentFile!"
    )
)

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
