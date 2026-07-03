$repo = if ($env:ASTERISK_REPO) { $env:ASTERISK_REPO } else { "BackGwa/Asterisk-Code" }
$tag = if ($env:ASTERISK_TAG) { $env:ASTERISK_TAG } else { "main" }
$tempDir = Join-Path $env:TEMP "asterisk-$(Get-Random)"
$globalConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$installDir = if ($env:ASTERISK_INSTALL_DIR) { $env:ASTERISK_INSTALL_DIR } else { Join-Path $globalConfigDir "asterisk" }
$agentsDir = Join-Path $globalConfigDir "agents"
$pluginsDir = Join-Path $globalConfigDir "plugins"
$tuiDir = Join-Path $installDir "tui"
$globalTui = Join-Path $globalConfigDir "tui.jsonc"

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $zipUrl = "https://api.github.com/repos/$repo/tarball/$tag"
    $archive = Join-Path $tempDir "repo.tar.gz"
    Invoke-WebRequest $zipUrl -OutFile $archive

    $extractDir = Join-Path $tempDir "extracted"
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

    if (Get-Command tar -ErrorAction SilentlyContinue) {
        tar xzf $archive -C $extractDir --strip-components=1
    } else {
        Write-Host "tar not available. Install from https://www.gnu.org/software/tar/"
        exit 1
    }

    if (Test-Path (Join-Path $extractDir ".opencode")) {
        New-Item -ItemType Directory -Path $agentsDir, $pluginsDir, $tuiDir -Force | Out-Null
        Copy-Item -Recurse -Force (Join-Path $extractDir ".opencode\agents\*") $agentsDir
        Copy-Item -Recurse -Force (Join-Path $extractDir ".opencode\plugins\*") $pluginsDir
        Copy-Item -Recurse -Force (Join-Path $extractDir ".opencode\tui\*") $tuiDir
    }

    $tuiPluginPath = Join-Path $tuiDir "Asterisk-Tui.ts"
    $pluginPath = [System.Uri]::new((Resolve-Path $tuiPluginPath).Path).AbsoluteUri
    if (-not (Test-Path $globalTui)) {
        New-Item -ItemType Directory -Path $globalConfigDir -Force | Out-Null
        @"
{
  "`$schema": "https://opencode.ai/tui.json",
  "plugin": ["$pluginPath"]
}
"@ | Out-File -FilePath $globalTui -Encoding utf8
    } else {
        $globalTuiText = Get-Content -Raw -Path $globalTui
        if ($globalTuiText -match "Asterisk-Tui\.ts") {
            $updatedGlobalTuiText = [regex]::Replace(
                $globalTuiText,
                'file://[^"]*Asterisk-Tui\.ts',
                [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $pluginPath }
            )
            $updatedGlobalTuiText | Out-File -FilePath $globalTui -Encoding utf8
        } else {
            Write-Host "Global TUI config already exists and was not modified."
            Write-Host "Add this plugin path to ${globalTui}: $pluginPath"
        }
    }

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null

    Write-Host "Installed Asterisk agents to $agentsDir"
    Write-Host "Installed Asterisk plugins to $pluginsDir"
    Write-Host "Installed Asterisk support files to $installDir"
    Write-Host "Global TUI config: $globalTui"
}
finally {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}
