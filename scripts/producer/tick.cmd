@echo off
REM Scheduled producer tick: run source generation, then vertical refinement.
REM Each command is run independently — one failure won't block the other.
REM Expects scripts/producer/.env to exist (Node 20+ loads it via --env-file).

setlocal
cd /d "%~dp0"

echo [%date% %time%] producer run
call pnpm exec tsx --env-file=.env src/index.ts run
if errorlevel 1 echo [%date% %time%] producer run failed with code %errorlevel%

echo [%date% %time%] producer refine
call pnpm exec tsx --env-file=.env src/index.ts refine
if errorlevel 1 echo [%date% %time%] producer refine failed with code %errorlevel%

echo [%date% %time%] tick complete
endlocal
