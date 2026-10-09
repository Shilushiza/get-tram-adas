# Создаёт ярлыки «Разбор АБПВ» на рабочем столе и в меню «Пуск».
# Из «Пуска» приложение можно закрепить на панели задач: правый клик по ярлыку, «Закрепить на панели задач».
$here = $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
$targets = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs')
)
foreach ($dir in $targets) {
    $lnk = $shell.CreateShortcut((Join-Path $dir 'Разбор АБПВ.lnk'))
    $lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $lnk.Arguments = "`"$here\ABPV.vbs`""
    $lnk.WorkingDirectory = Split-Path -Parent $here
    $lnk.IconLocation = "$here\app.ico,0"
    $lnk.Description = 'Разбор срабатываний системы помощи водителю трамвая (хакатон ГЭТ)'
    $lnk.Save()
    Write-Output "Ярлык: $($lnk.FullName)"
}
