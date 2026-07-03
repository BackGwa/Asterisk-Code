$repoUrl = if ($env:ASTERISK_REPO_URL) { $env:ASTERISK_REPO_URL } else { "https://github.com/BackGwa/Asterisk-Code.git" }
$ref = if ($env:ASTERISK_REF) { $env:ASTERISK_REF } else { "main" }
$sourceDir = if ($env:ASTERISK_SOURCE_DIR) { $env:ASTERISK_SOURCE_DIR } elseif ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$opencodeSourceDir = Join-Path $sourceDir ".opencode"
$globalConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$agentsDir = Join-Path $globalConfigDir "agents"
$pluginsDir = Join-Path $globalConfigDir "plugins"
$commandsDir = Join-Path $globalConfigDir "commands"
$libDir = Join-Path $globalConfigDir "lib"
$tuiDir = Join-Path $globalConfigDir "tui"
$globalTui = Join-Path $globalConfigDir "tui.jsonc"
$tempDir = $null

if (-not (Test-Path $opencodeSourceDir)) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Error "git is required for remote installation."
        exit 1
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "asterisk-$(Get-Random)"
    git clone --depth 1 --branch $ref $repoUrl $tempDir
    $sourceDir = $tempDir
    $opencodeSourceDir = Join-Path $sourceDir ".opencode"
}

try {
    New-Item -ItemType Directory -Path $agentsDir, $pluginsDir, $commandsDir, $libDir, $tuiDir -Force | Out-Null
    Copy-Item -Recurse -Force (Join-Path $opencodeSourceDir "agents\*") $agentsDir
    Copy-Item -Recurse -Force (Join-Path $opencodeSourceDir "plugins\*") $pluginsDir
    Copy-Item -Recurse -Force (Join-Path $opencodeSourceDir "commands\*") $commandsDir
    Copy-Item -Recurse -Force (Join-Path $opencodeSourceDir "lib\*") $libDir
    Copy-Item -Recurse -Force (Join-Path $opencodeSourceDir "tui\*") $tuiDir

    if (-not (Test-Path $globalTui)) {
        Copy-Item -Force (Join-Path $opencodeSourceDir "tui.jsonc") $globalTui
    }
    else {
        Write-Host "Global TUI config already exists and was not modified."
        Write-Host "Add ./tui/Asterisk-Code.ts to ${globalTui} if Asterisk TUI is not already configured."
    }

    Write-Host "Installed Asterisk agents to $agentsDir"
    Write-Host "Installed Asterisk plugins to $pluginsDir"
    Write-Host "Installed Asterisk commands to $commandsDir"
    Write-Host "Installed Asterisk libraries to $libDir"
    Write-Host "Installed Asterisk TUI to $tuiDir"
    Write-Host "Global TUI config: $globalTui"
}
finally {
    if ($tempDir) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }
}
