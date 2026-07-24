@echo off
title Hoc lieu Viet Anh (Tunnel)
cd /d "D:\school ai\studio"

echo.
echo   ============================================
echo      HOC LIEU VIET ANH  -  CHE DO TUNNEL
echo   ============================================
echo.

REM Build lai NEU co code moi (file nguon moi hon ban build gan nhat), hoac chua build lan nao.
set "NEED_BUILD=0"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "check-rebuild.ps1"`) do set "NEED_BUILD=%%i"
if "%NEED_BUILD%"=="1" (
  echo   Phat hien CODE MOI - dang build lai, cho 1-2 phut...
  echo.
  call npm run build
) else (
  echo   Khong co code moi - mo web luon.
)

del /q "%TEMP%\hlva-tunnel.log" 2>nul

REM Mo tunnel chay nen (chung cua so nay - DONG cua so la tat ca app lan tunnel)
start /b "" cmd /c "cloudflared tunnel --url http://localhost:3456 --no-autoupdate > "%TEMP%\hlva-tunnel.log" 2>&1"

echo   Dang lay dia chi cong khai...
powershell -NoProfile -Command "$log=\"$env:TEMP\hlva-tunnel.log\"; $url=$null; for($i=0;$i -lt 60;$i++){ if(Test-Path $log){ $m=[regex]::Match([string](Get-Content $log -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com'); if($m.Success){ $url=$m.Value; break } }; Start-Sleep -Milliseconds 500 }; if($url){ Set-Clipboard $url; Write-Host ''; Write-Host '   ==========================================================' -ForegroundColor Green; Write-Host ('   DIA CHI CONG KHAI:  ' + $url) -ForegroundColor Green; Write-Host '   (da tu dong COPY - chi viec dan/gui cho nguoi khac)' -ForegroundColor Green; Write-Host '   ==========================================================' -ForegroundColor Green } else { Write-Host '   Chua lay duoc dia chi tunnel - kiem tra mang, hoac xem log:' -ForegroundColor Yellow; Write-Host ('   ' + $log) -ForegroundColor Yellow }"

echo.
echo   Dang khoi dong... trinh duyet se tu mo sau vai giay.
echo   Luu y: moi lan mo lai, dia chi cong khai se DOI (link ngau nhien).
echo   De TAT app va tunnel: chi can DONG cua so nay.
echo.

REM Mo trinh duyet sau 5 giay (cho server san sang)
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3456"

REM Chay server ban production o cong 3456
call npm run start -- -p 3456

echo.
echo   App da dung. Nhan phim bat ky de dong cua so.
pause >nul
