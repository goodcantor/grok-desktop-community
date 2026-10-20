$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskVersion=(Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskTag='custom'+($taskVersion -split 'custom\.')[-1]
$taskInstaller=Join-Path $taskRoot "release-custom/GrokDesktopCustom-$taskVersion-Setup.exe"
$taskProfile=Join-Path $env:APPDATA 'grok-desktop-custom'
$taskState=Get-Content -LiteralPath (Join-Path $taskProfile 'desktop-state.json') -Raw | ConvertFrom-Json
$taskProject=$taskState.lastProject
$taskSession=$taskState.sessionsByProject.$taskProject
if(-not $taskProject -or -not $taskSession){throw 'Cannot verify the active session; installation was not started.'}
$taskEncoded=[Uri]::EscapeDataString($taskProject)
$taskSessionRoot=Join-Path $env:USERPROFILE ".grok/sessions/$taskEncoded/$taskSession"
$taskEvent=Get-Content -LiteralPath (Join-Path $taskSessionRoot 'events.jsonl') | ForEach-Object {$_|ConvertFrom-Json} | Where-Object {$_.type -eq 'turn_started' -or $_.type -eq 'turn_ended'} | Select-Object -Last 1
if($taskEvent -and $taskEvent.type -ne 'turn_ended'){throw 'A turn may still be running; installation was not started.'}
if(-not $taskEvent){
  # A fresh CLI session contains system/synthetic context but has never run a prompt.
  $taskMessages=@(Get-Content -LiteralPath (Join-Path $taskSessionRoot 'chat_history.jsonl') | ForEach-Object {$_|ConvertFrom-Json} | Where-Object {($_.type -eq 'user' -and -not $_.synthetic_reason) -or $_.type -eq 'assistant'})
  if($taskMessages.Count){throw 'The session has messages but no confirmed completed turn; installation was not started.'}
}
$taskGoalUpdate=Get-Content -LiteralPath (Join-Path $taskSessionRoot 'updates.jsonl') | ForEach-Object {($_|ConvertFrom-Json).params.update} | Where-Object {$_.sessionUpdate -eq 'goal_updated' -or $_.session_update -eq 'goal_updated'} | Select-Object -Last 1
if($taskGoalUpdate.status -eq 'active'){throw 'A goal is still active; installation was not started.'}
$taskAppRoots=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'Grok Desktop Custom.exe' -and $_.CommandLine -notlike '*--type=*'})
if($taskAppRoots.Count -gt 1){throw 'Multiple application instances are open; installation was not started.'}
$taskWasRunning=$taskAppRoots.Count -eq 1
$taskRuntimeFile=Join-Path $taskProfile 'execution-state.json'
if($taskWasRunning -and (Test-Path -LiteralPath $taskRuntimeFile)){
  $taskRuntime=Get-Content -LiteralPath $taskRuntimeFile -Raw | ConvertFrom-Json
  if($taskRuntime.pid -eq $taskAppRoots[0].ProcessId){
    $taskRunningChats=@($taskRuntime.windows | ForEach-Object {$_.chats} | Where-Object {$_.active -or $_.waiting -gt 0})
    if($taskRunningChats.Count){throw 'Chats are still running or awaiting input; installation was not started.'}
  }
}

$taskApp=$null
if($taskWasRunning){
  $taskApp=Get-Process -Id $taskAppRoots[0].ProcessId
  if($taskApp.MainWindowTitle -ne "$(Split-Path $taskProject -Leaf) $([char]0xB7) Grok"){throw 'The active window changed; installation was not started.'}
}
$taskBackup=Join-Path $taskProfile ('backups/before-'+$taskTag+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $taskBackup | Out-Null
foreach($taskName in @('desktop-state.json','history-preferences.json','drafts','queues')){
  $taskSource=Join-Path $taskProfile $taskName
  if(Test-Path -LiteralPath $taskSource){Copy-Item -LiteralPath $taskSource -Destination $taskBackup -Recurse}
}
if($taskWasRunning){
  $taskApp.CloseMainWindow() | Out-Null
  for($taskAttempt=0;$taskAttempt -lt 10;$taskAttempt++){
    if(-not(Get-Process -Id $taskApp.Id -ErrorAction SilentlyContinue)){break}
    Start-Sleep -Milliseconds 500
  }
  if(Get-Process -Id $taskApp.Id -ErrorAction SilentlyContinue){throw 'The app kept its window open, possibly protecting unsaved edits. Installation was not started.'}
}
$taskNativeHistory=Join-Path $taskSessionRoot 'chat_history.jsonl'
$taskHistoryBefore=(Get-FileHash -LiteralPath $taskNativeHistory -Algorithm SHA256).Hash
$taskInstall=Start-Process -FilePath $taskInstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if($taskInstall.ExitCode -ne 0){throw "Installer exited with $($taskInstall.ExitCode)"}
$taskInstalledRoot=Join-Path $env:LOCALAPPDATA 'Programs/Grok Desktop Custom'
$taskInstalledAsar=Join-Path $taskInstalledRoot 'resources/app.asar'
$taskBuiltAsar=Join-Path $taskRoot 'release-custom/win-unpacked/resources/app.asar'
if((Get-FileHash -LiteralPath $taskInstalledAsar -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskBuiltAsar -Algorithm SHA256).Hash){throw 'Installed application differs from the checked build.'}
$taskHistoryUnchanged=(Get-FileHash -LiteralPath $taskNativeHistory -Algorithm SHA256).Hash -eq $taskHistoryBefore
if(-not $taskHistoryUnchanged){throw 'The session history changed during installation; inspect before continuing.'}
$taskAlreadyRunning=@(Get-Process -Name 'Grok Desktop Custom' -ErrorAction SilentlyContinue)
if($taskWasRunning -and -not $taskAlreadyRunning.Count){Start-Process -FilePath (Join-Path $taskInstalledRoot 'Grok Desktop Custom.exe') -ArgumentList ('"'+$taskProject+'"') -WorkingDirectory $taskProject}
$taskReport=[PSCustomObject]@{version=$taskVersion;installerExitCode=$taskInstall.ExitCode;installedMatchesBuild=$true;activeSessionHistoryUnchanged=$taskHistoryUnchanged;wasRunning=$taskWasRunning;backup=$taskBackup;project=$taskProject}
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot ('qa/'+$taskTag+'-install.json')) -Encoding utf8
$taskReport | ConvertTo-Json -Compress
