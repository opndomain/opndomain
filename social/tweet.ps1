#
# tweet.ps1 — Generate a daily AI research tweet for @opndomain (Windows)
#
# Usage:
#   .\social\tweet.ps1                                # Random style + topic
#   .\social\tweet.ps1 -Style signal                  # Curated research signal
#   .\social\tweet.ps1 -Style question                # Engaging question
#   .\social\tweet.ps1 -Style quip                    # Casual Karpathy-style take
#   .\social\tweet.ps1 -Style thread                  # 2-3 tweet thread
#   .\social\tweet.ps1 -Style quip -TopicHint "cot"   # Style + topic
#   .\social\tweet.ps1 -DryRun                        # Preview without logging
#

param(
    [ValidateSet("signal", "question", "quip", "thread", "")]
    [string]$Style = "",
    [string]$TopicHint = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PromptFile = Join-Path $ScriptDir "SOCIAL-PROMPT.md"
$SourcesFile = Join-Path $ScriptDir "sources.md"
$LogFile = Join-Path $ScriptDir "tweet-log.jsonl"
$Today = Get-Date -Format "yyyy-MM-dd"

# Pick random style if not specified (weighted: 40% signal, 20% question, 25% quip, 15% thread)
if (-not $Style) {
    $Styles = @("signal","signal","signal","signal","question","question","quip","quip","quip","thread")
    $Style = $Styles | Get-Random
}

# Build user prompt
$UserPrompt = "Generate one tweet for @opndomain to post today ($Today).`n`nSTYLE MODE: $Style"

if ($TopicHint) {
    $UserPrompt += "`nTopic angle: $TopicHint"
}

# Check recent tweets to avoid repetition
if (Test-Path $LogFile) {
    $Recent = Get-Content $LogFile -Tail 5 | ForEach-Object {
        ($_ | ConvertFrom-Json).text
    } | Out-String
    if ($Recent.Trim()) {
        $UserPrompt += "`n`nRecent tweets (avoid repeating these topics):`n$Recent"
    }
}

# Load system prompt + sources
$SystemPrompt = (Get-Content $PromptFile -Raw) + "`n`n" + (Get-Content $SourcesFile -Raw)

# Generate via claude CLI
Write-Host "[$Style] Generating tweet..." -ForegroundColor DarkGray

$Tweet = claude -p `
    --system-prompt $SystemPrompt `
    $UserPrompt `
    --output-format text `
    2>$null

# Display
Write-Host ""
Write-Host "--- @opndomain [$Style] ---" -ForegroundColor Cyan
Write-Host $Tweet
Write-Host "---" -ForegroundColor Cyan
Write-Host ""

# Character count
if ($Style -eq "thread") {
    $Parts = $Tweet -split '---'
    $i = 1
    foreach ($part in $Parts) {
        $trimmed = $part.Trim()
        if ($trimmed) {
            $count = $trimmed.Length
            Write-Host "Tweet $i`: $count/280 chars" -ForegroundColor DarkGray
            if ($count -gt 280) { Write-Host "WARNING: Tweet $i exceeds 280 characters." -ForegroundColor Yellow }
            $i++
        }
    }
} else {
    $CharCount = $Tweet.Length
    Write-Host "Characters: $CharCount/280" -ForegroundColor DarkGray
    if ($CharCount -gt 280) {
        Write-Host "WARNING: Tweet exceeds 280 characters. Regenerate or edit." -ForegroundColor Yellow
    }
}

# Log unless dry run
if (-not $DryRun) {
    $LogEntry = @{
        date  = $Today
        style = $Style
        text  = $Tweet.Trim()
    } | ConvertTo-Json -Compress

    Add-Content -Path $LogFile -Value $LogEntry
    Write-Host "Logged to $LogFile" -ForegroundColor DarkGray
}
