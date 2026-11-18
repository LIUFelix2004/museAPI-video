# 监视 G:\museAPI\Museroll 目录 90 秒，记录任何创建/删除/重命名事件
# 用法：在放文件前运行本脚本，然后把压缩包放进去观察输出
param([int]$Seconds = 90, [string]$WatchDir = 'G:\museAPI\Museroll')

if (-not (Test-Path $WatchDir)) { New-Item -ItemType Directory -Path $WatchDir -Force | Out-Null }

Write-Host "监视目录: $WatchDir"
Write-Host "持续时间: $Seconds 秒  —— 现在把文件放进去`n" -ForegroundColor Cyan

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WatchDir
$watcher.IncludeSubdirectories = $true
$watcher.Filter = '*'
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, DirectoryName, Size, LastWrite, CreationTime, Attributes, Security'
$watcher.EnableRaisingEvents = $true

$log = New-Object System.Collections.ArrayList
$ts = { (Get-Date).ToString('HH:mm:ss.fff') }

$handlers = @()
$handlers += Register-ObjectEvent $watcher Created -Action {
  $p = $Event.SourceEventArgs.FullPath
  $size = try { (Get-Item -LiteralPath $p -EA Stop).Length } catch { -1 }
  Write-Host ("[{0}] + 创建  {1}  ({2} 字节)" -f (Get-Date).ToString('HH:mm:ss.fff'), $p, $size) -ForegroundColor Green
}
$handlers += Register-ObjectEvent $watcher Changed -Action {
  $p = $Event.SourceEventArgs.FullPath
  $size = try { (Get-Item -LiteralPath $p -EA Stop).Length } catch { -1 }
  Write-Host ("[{0}] ~ 修改  {1}  ({2} 字节)" -f (Get-Date).ToString('HH:mm:ss.fff'), $p, $size) -ForegroundColor Yellow
}
$handlers += Register-ObjectEvent $watcher Deleted -Action {
  $p = $Event.SourceEventArgs.FullPath
  Write-Host ("[{0}] - 删除  {1}" -f (Get-Date).ToString('HH:mm:ss.fff'), $p) -ForegroundColor Red
}
$handlers += Register-ObjectEvent $watcher Renamed -Action {
  Write-Host ("[{0}] > 重命名 {1} -> {2}" -f (Get-Date).ToString('HH:mm:ss.fff'), $Event.SourceEventArgs.OldFullPath, $Event.SourceEventArgs.FullPath) -ForegroundColor Magenta
}
$handlers += Register-ObjectEvent $watcher Error -Action {
  Write-Host ("[{0}] ! 错误 {1}" -f (Get-Date).ToString('HH:mm:ss.fff'), $Event.SourceEventArgs.GetException().Message) -ForegroundColor Red
}

Start-Sleep -Seconds $Seconds

foreach ($h in $handlers) { Unregister-Event -SourceIdentifier $h.Name -EA SilentlyContinue }
$watcher.EnableRaisingEvents = $false
$watcher.Dispose()

Write-Host "`n=== 监视结束，当前目录内容 ===" -ForegroundColor Cyan
Get-ChildItem -LiteralPath $WatchDir -Force -Recurse -EA SilentlyContinue |
  Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
