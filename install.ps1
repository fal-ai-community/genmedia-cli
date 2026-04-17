# genmedia installer for Windows
# Usage:
#   irm https://genmedia.sh/install.ps1 | iex
#   irm https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/install.ps1 | iex
#
# Environment variables:
#   GENMEDIA_VERSION   - specific version to install (default: latest)
#   GENMEDIA_DIR       - installation directory (default: %LOCALAPPDATA%\genmedia)

$ErrorActionPreference = "Stop"

$GitHubRepo = "fal-ai-community/cli"
$BinaryName = "genmedia"

function Get-LatestVersion {
    $url = "https://api.github.com/repos/$GitHubRepo/releases/latest"
    try {
        $response = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "genmedia-installer" }
        return $response.tag_name -replace '^v', ''
    }
    catch {
        throw "Could not determine the latest version. Set `$env:GENMEDIA_VERSION to install a specific version."
    }
}

function Get-Checksum {
    param([string]$Version, [string]$AssetName)

    $url = "https://github.com/$GitHubRepo/releases/download/v$Version/checksums.txt"
    try {
        $checksums = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "genmedia-installer" }
        foreach ($line in $checksums -split "`n") {
            if ($line -match "^(\S+)\s+$([regex]::Escape($AssetName))") {
                return $Matches[1]
            }
        }
    }
    catch {
        return $null
    }
    return $null
}

function Test-Checksum {
    param([string]$FilePath, [string]$Expected)

    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $Expected.ToLower()) {
        Remove-Item -Path $FilePath -Force -ErrorAction SilentlyContinue
        throw "Checksum verification failed. Expected: $Expected, Got: $actual"
    }
}

function Add-ToUserPath {
    param([string]$Dir)

    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -split ";" | Where-Object { $_ -eq $Dir }) {
        return $false
    }

    [Environment]::SetEnvironmentVariable("Path", "$Dir;$currentPath", "User")
    $env:Path = "$Dir;$env:Path"
    return $true
}

function Main {
    $Version = if ($env:GENMEDIA_VERSION) { $env:GENMEDIA_VERSION } else { "latest" }

    if ($Version -eq "latest") {
        $Version = Get-LatestVersion
    }

    $InstallDir = if ($env:GENMEDIA_DIR) { $env:GENMEDIA_DIR } else { Join-Path $env:LOCALAPPDATA "genmedia" }
    $BinDir = Join-Path $InstallDir "bin"

    $AssetName = "$BinaryName-windows-x64.exe"
    $DownloadUrl = "https://github.com/$GitHubRepo/releases/download/v$Version/$AssetName"

    Write-Host "Installing genmedia v$Version (windows-x64)..." -ForegroundColor White

    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

    $TmpFile = Join-Path $env:TEMP "genmedia-install-$([guid]::NewGuid().ToString('N')).exe"

    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -UseBasicParsing

        # Verify checksum if available
        $Checksum = Get-Checksum -Version $Version -AssetName $AssetName
        if ($Checksum) {
            Test-Checksum -FilePath $TmpFile -Expected $Checksum
        }

        $DestPath = Join-Path $BinDir "$BinaryName.exe"
        Move-Item -Path $TmpFile -Destination $DestPath -Force
    }
    finally {
        Remove-Item -Path $TmpFile -Force -ErrorAction SilentlyContinue
    }

    $PathAdded = Add-ToUserPath -Dir $BinDir

    Write-Host ""
    Write-Host "genmedia v$Version installed successfully!" -ForegroundColor Green
    Write-Host ""

    if ($PathAdded) {
        Write-Host "Installed to $BinDir and added to your user PATH." -ForegroundColor White
        Write-Host "If 'genmedia' is not found in this shell, open a new terminal or refresh PATH:" -ForegroundColor White
        Write-Host ""
        Write-Host "  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "Installed to $BinDir (already on your PATH)." -ForegroundColor White
        Write-Host ""
    }

    Write-Host "Run 'genmedia --help' to get started." -ForegroundColor White
}

Main
