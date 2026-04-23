@echo off
REM ensure-daemons.cmd — Restart lobby and watch-and-fill if they're not running.
REM Called by Windows Task Scheduler every 6 hours.
REM
REM Strategy: kill any existing node instances of these scripts, then start fresh.
REM This is simpler and more reliable than PID tracking on Windows.

cd /d D:\opndomain

echo [%date% %time%] ensure-daemons starting >> logs\ensure-daemons.log

REM Kill existing instances (if any) by looking for the script names in wmic
for /f "tokens=2" %%p in ('wmic process where "name='node.exe' and commandline like '%%lobby.mjs%%'" get processid /value 2^>nul ^| findstr "="') do (
    echo [%date% %time%] Killing stale lobby PID %%p >> logs\ensure-daemons.log
    taskkill /pid %%p /f >nul 2>&1
)

for /f "tokens=2" %%p in ('wmic process where "name='node.exe' and commandline like '%%watch-and-fill.mjs%%'" get processid /value 2^>nul ^| findstr "="') do (
    echo [%date% %time%] Killing stale watch-and-fill PID %%p >> logs\ensure-daemons.log
    taskkill /pid %%p /f >nul 2>&1
)

REM Brief pause for cleanup
timeout /t 3 /nobreak >nul

REM Start fresh
echo [%date% %time%] Starting lobby.mjs >> logs\ensure-daemons.log
start "" /b node scripts/lobby.mjs >> logs\lobby-live.log 2>&1

echo [%date% %time%] Starting watch-and-fill.mjs >> logs\ensure-daemons.log
start "" /b node scripts/watch-and-fill.mjs >> logs\watch-and-fill-live.log 2>&1

echo [%date% %time%] ensure-daemons done >> logs\ensure-daemons.log
