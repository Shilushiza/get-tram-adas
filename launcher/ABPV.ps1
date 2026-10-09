# «Разбор АБПВ»: поднимает API и сайт в фоне, открывает окно приложения и держит значок в трее.
# Запускается ярлыком (через ABPV.vbs, без мигающей консоли). Повторный запуск просто открывает окно.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
$WebUrl = 'http://127.0.0.1:5173/'
$ApiUrl = 'http://127.0.0.1:8000/api/llm'
$Title = 'Разбор АБПВ'
$script:Procs = @()

function Test-Url([string]$u) {
    try { return (Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}

function Get-AppBrowser {
    # окно без адресной строки (--app): Edge есть в любой Windows 11, иначе Яндекс или Chrome
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Yandex\YandexBrowser\Application\browser.exe",
        "$env:LOCALAPPDATA\Yandex\YandexBrowser\Application\browser.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

function Open-AppWindow {
    $b = Get-AppBrowser
    if ($b) { Start-Process $b -ArgumentList "--app=$WebUrl", '--window-size=1440,900', '--no-first-run' }
    else { Start-Process $WebUrl }
}

function Start-Servers {
    if (-not (Test-Url $ApiUrl)) {
        $script:Procs += Start-Process python -PassThru -WindowStyle Hidden -WorkingDirectory $Root `
            -ArgumentList '-m', 'uvicorn', 'api:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000' `
            -RedirectStandardOutput "$Logs\api.log" -RedirectStandardError "$Logs\api.err.log"
    }
    if (-not (Test-Url $WebUrl)) {
        $vite = Join-Path $Root 'frontend\node_modules\vite\bin\vite.js'
        $script:Procs += Start-Process node -PassThru -WindowStyle Hidden -WorkingDirectory (Join-Path $Root 'frontend') `
            -ArgumentList "`"$vite`"", '--host', '127.0.0.1', '--port', '5173', '--strictPort' `
            -RedirectStandardOutput "$Logs\web.log" -RedirectStandardError "$Logs\web.err.log"
    }
}

function Stop-Servers {
    # гасим только то, что запустили сами, вместе с дочерними процессами
    foreach ($p in $script:Procs) { if (-not $p.HasExited) { & taskkill.exe /PID $p.Id /T /F | Out-Null } }
    $script:Procs = @()
}

# второй запуск: серверы уже работают, просто открыть окно
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\GET-ABPV-Launcher', [ref]$created)
if (-not $created) { Open-AppWindow; exit }

# значок в трее и меню
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon (Join-Path $PSScriptRoot 'app.ico')
$tray.Text = "${Title}: запускается"
$tray.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add('Открыть приложение')
$miOpen.Font = New-Object System.Drawing.Font($miOpen.Font, [System.Drawing.FontStyle]::Bold)
$miBrowser = $menu.Items.Add('Открыть в обычном браузере')
$miRestart = $menu.Items.Add('Перезапустить серверы')
$miLogs = $menu.Items.Add('Папка с логами')
[void]$menu.Items.Add('-')
$miExit = $menu.Items.Add('Выйти и остановить серверы')
$tray.ContextMenuStrip = $menu

$script:Ready = $false
$script:Waited = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    $script:Waited++
    if ((Test-Url $ApiUrl) -and (Test-Url $WebUrl)) {
        $timer.Stop()
        $script:Ready = $true
        $tray.Text = "${Title}: работает"
        Open-AppWindow
    } elseif ($script:Waited -ge 90) {
        $timer.Stop()
        $tray.Text = "${Title}: не запустился"
        $tray.ShowBalloonTip(8000, $Title, 'Серверы не ответили за 90 секунд. Подробности в папке с логами (правый клик по значку).', 'Error')
    }
})

$miOpen.Add_Click({ if ($script:Ready) { Open-AppWindow } else { $tray.ShowBalloonTip(3000, $Title, 'Ещё запускается, окно откроется само.', 'Info') } })
$tray.Add_DoubleClick({ if ($script:Ready) { Open-AppWindow } })
$miBrowser.Add_Click({ Start-Process $WebUrl })
$miLogs.Add_Click({ Start-Process explorer.exe $Logs })
$miRestart.Add_Click({
    Stop-Servers
    $script:Ready = $false; $script:Waited = 0
    $tray.Text = "${Title}: перезапускается"
    Start-Sleep -Milliseconds 800
    Start-Servers
    $timer.Start()
})
$miExit.Add_Click({
    $timer.Stop()
    Stop-Servers
    $tray.Visible = $false
    $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$tray.ShowBalloonTip(4000, $Title, 'Запускаю серверы, окно откроется через несколько секунд.', 'Info')
Start-Servers
$timer.Start()
[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
