$repo = if ($env:ASTERISK_REPO) { $env:ASTERISK_REPO } else { "BackGwa/Asterisk-Code" }
$tag = if ($env:ASTERISK_TAG) { $env:ASTERISK_TAG } else { "main" }
$tempDir = Join-Path $env:TEMP "asterisk-$(Get-Random)"

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

    $opencodeDir = Join-Path (Get-Location) ".opencode"
    if (Test-Path (Join-Path $extractDir ".opencode")) {
        Copy-Item -Recurse -Force (Join-Path $extractDir ".opencode") (Get-Location)
    }

    $globalTui = Join-Path $env:USERPROFILE ".config\opencode\tui.jsonc"
    if (-not (Test-Path $globalTui)) {
        $pluginPath = "file://$(Resolve-Path (Join-Path $opencodeDir 'tui\Asterisk-Tui.ts'))"
        New-Item -ItemType Directory -Path (Split-Path $globalTui -Parent) -Force | Out-Null
        @"
{
  "`$schema": "https://opencode.ai/tui.json",
  "plugin": ["$pluginPath"]
}
"@ | Out-File -FilePath $globalTui -Encoding utf8
    }

    $settingsDir = Join-Path $env:USERPROFILE ".config\opencode\asterisk"
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null

    Write-Host "Installed Asterisk-Code to .opencode/"
    Write-Host "Global TUI config: $globalTui"
}
finally {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}
