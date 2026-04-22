@echo off
REM Runs the refinement-only half of the producer pipeline.
REM - Phase A: extract claims from newly-closed eligible verdicts (1 LLM call
REM   per verdict, skipped entirely on ticks with no new closures)
REM - Phase B: generate narrower debates for unrefined claims (1 LLM call
REM   per unrefined claim, skipped on ticks with no pending work)
REM Safe to run at a tight cadence (e.g. every 5 min) — when there is no
REM work, this tick is just three HTTP GETs.

setlocal
cd /d "%~dp0"

echo [%date% %time%] producer refine
call pnpm exec tsx --env-file=.env src/index.ts refine
if errorlevel 1 echo [%date% %time%] producer refine failed with code %errorlevel%

echo [%date% %time%] refine tick complete
endlocal
