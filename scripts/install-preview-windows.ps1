$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$installer = Join-Path (Get-Location) "release/GrokDesktopCommunity-$version-Windows-x64-Unsigned-Setup.exe"
if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'NotSigned') { throw 'Preview installer must be explicitly unsigned' }
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'Community Preview'))
$tempRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (-not $installRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install target leaves runner temporary directory' }
$process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installRoot" -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "NSIS returned $($process.ExitCode)" }
$executable = Join-Path $installRoot 'Grok Desktop Community.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Installed executable missing' }
"GROK_COMMUNITY_TEST_EXE=$executable" | Out-File -LiteralPath $env:GITHUB_ENV -Encoding utf8 -Append
Write-Output 'UNSIGNED_NSIS_INSTALL_OK'
