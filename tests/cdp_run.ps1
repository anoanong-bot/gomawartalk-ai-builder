param([string]$Mode = 'all')
# 헤드리스 크롬을 DevTools 프로토콜로 제어해 (1) 자가 점검 실행 (2) 화면 스크린샷 / 캡처 PNG 저장
$ErrorActionPreference = 'Stop'
$root = 'c:\gomawartalk-ai-builder'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$port = 9333
$prof = Join-Path $env:TEMP ('gmt_cdp_' + [guid]::NewGuid().ToString('N').Substring(0, 6))
$base = 'file:///C:/gomawartalk-ai-builder/LandingBuilder.html'
$proc = Start-Process $chrome -PassThru -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$prof", "--remote-debugging-port=$port", '--window-size=1500,950', 'about:blank')
try {
  Start-Sleep 3
  $targets = Invoke-RestMethod "http://127.0.0.1:$port/json"
  $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Recv {
    $buf = New-Object byte[] 4194304; $sb = New-Object Text.StringBuilder
    do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None).GetAwaiter().GetResult(); [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)) } until ($r.EndOfMessage)
    $sb.ToString()
  }
  function Send($method, $params) {
    $script:id++
    $msg = (@{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress)
    $ws.SendAsync([ArraySegment[byte]][Text.Encoding]::UTF8.GetBytes($msg), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    while ($true) { $m = Recv; if ($m -match '^\{"id":(\d+),') { if ([int]$Matches[1] -eq $script:id) { return $m } } }
  }
  function Eval($expr) {
    $raw = Send 'Runtime.evaluate' @{ expression = $expr; awaitPromise = $true; returnByValue = $true }
    if ($raw -match '"exceptionDetails"') { Write-Host "EVAL EXC: $($raw.Substring(0, [Math]::Min(600, $raw.Length)))" }
    return $raw
  }
  function Shot($name) {
    $raw = Send 'Page.captureScreenshot' @{ format = 'png' }
    $m = [regex]::Match($raw, '"data":"([^"]+)"')
    [IO.File]::WriteAllBytes((Join-Path $root "tests\$name.png"), [Convert]::FromBase64String($m.Groups[1].Value)); Write-Host "shot $name"
  }
  [void](Send 'Page.enable' @{})
  [void](Send 'Emulation.setDeviceMetricsOverride' @{ width = 1500; height = 950; deviceScaleFactor = 1; mobile = $false })

  if ($Mode -eq 'all' -or $Mode -eq 'test') {
    [void](Send 'Page.navigate' @{ url = "$base`?selftest" })
    $deadline = (Get-Date).AddSeconds(150); $txt = ''
    while ((Get-Date) -lt $deadline) {
      Start-Sleep 2
      $raw = Eval "(document.getElementById('selftest-result')||{}).textContent||''"
      try { $txt = (ConvertFrom-Json $raw).result.result.value } catch { $txt = '' }
      if ($txt -and $txt.Length -gt 5 -and $txt -notmatch 'RUNNING') { break }
    }
    Write-Host ("result length: {0}" -f ($txt | Out-String).Length)
    $res = $txt | ConvertFrom-Json
    $pass = 0; $fail = 0
    foreach ($r in $res) { if ($r.ok) { $pass++ } else { $fail++; Write-Host ("FAIL: {0}  [{1}]" -f $r.name, $r.detail) } }
    Write-Host "PASS=$pass FAIL=$fail"
    foreach ($r in $res) { if ($r.ok -and $r.detail) { Write-Host ("  ok: {0} [{1}]" -f $r.name, $r.detail) } }
    foreach ($capId in 'cap-thumb', 'cap-full', 'cap-split1') {
      $raw = Eval "(document.getElementById('$capId')||{}).value||''"
      $c = [regex]::Match($raw, '"value":"data:image/png;base64,([A-Za-z0-9+/=]+)"')
      if ($c.Success) { [IO.File]::WriteAllBytes((Join-Path $root "tests\_$capId.png"), [Convert]::FromBase64String($c.Groups[1].Value)); Write-Host "saved _$capId.png" }
    }
  }

  if ($Mode -eq 'all' -or $Mode -eq 'shots') {
    [void](Send 'Page.navigate' @{ url = $base })
    Start-Sleep 3
    [void](Eval "window.LB.switchTab('tab1'); 1"); Start-Sleep 1; Shot '_shot_tab1'
    [void](Eval "window.LB.switchTab('tab2'); 1"); Start-Sleep 1; Shot '_shot_tab2'
    [void](Eval "window.scrollTo(0, 900); 1"); Start-Sleep 1; Shot '_shot_tab2b'
    [void](Eval "window.scrollTo(0,0); window.LB.switchTab('tab3'); 1"); Start-Sleep 1; Shot '_shot_tab3'
    [void](Eval "window.LB.switchTab('tab4'); 1"); Start-Sleep 1; Shot '_shot_tab4'
    [void](Eval "window.LB.switchMenu('webzine'); 1"); Start-Sleep 1; Shot '_shot_webzine'
    [void](Eval "window.LB.switchMenu('admin'); window.LB.loadPreset('local_store'); window.LB.switchTab('tab1'); 1"); Start-Sleep 1; Shot '_shot_preset_tab1'
  }
}
finally {
  try { Stop-Process -Id $proc.Id -Force } catch {}
  Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.StartInfo -and $false } | Out-Null
}
