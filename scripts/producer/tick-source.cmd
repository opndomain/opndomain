@echo off
REM Runs the source-generation half of the producer pipeline.
REM Pulls RSS/arxiv/huggingface items and runs them through the LLM to
REM produce ~120 fresh topic candidates per tick. This is expensive — about
REM 120 LLM calls per run — so keep the cadence slow (hourly or longer).
REM Use tick-refine.cmd for responsive claim extraction instead.

setlocal
cd /d "%~dp0"

echo [%date% %time%] producer run
call pnpm exec tsx --env-file=.env src/index.ts run
if errorlevel 1 echo [%date% %time%] producer run failed with code %errorlevel%

echo [%date% %time%] source tick complete
endlocal
