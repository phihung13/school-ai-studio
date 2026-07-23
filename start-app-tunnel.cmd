@echo off
title Hoc lieu Viet Anh (Tunnel)
cd /d "D:\school ai\studio"

echo.
echo   ============================================
echo      HOC LIEU VIET ANH  -  CHE DO TUNNEL
echo   ============================================
echo.

REM Lan dau (hoac sau khi xoa .next) thi build truoc; nhung lan sau chay ngay.
if not exist ".next\BUILD_ID" (
  echo   Chuan bi app lan dau, cho khoang 1-2 phut...
  echo.
  call npm run build
)

del /q "%TEMP%\hlva-tunnel.log" 2>nul

REM Mo tunnel chay nen (chung cua so nay - DONG cua so la tat ca app lan tunnel)
start /b "" cmd /c "cloudflared tunnel --url http://localhost:3000 --no-autoupdate > "%TEMP%\hlva-tunnel.log" 2>&1"

echo   Dang lay dia chi cong khai...
powershell -NoProfile -Command "$log=\"$env:TEMP\hlva-tunnel.log\"; $url=$null; for($i=0;$i -lt 60;$i++){ if(Test-Path $log){ $m=[regex]::Match([string](Get-Content $log -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com'); if($m.Success){ $url=$m.Value; break } }; Start-Sleep -Milliseconds 500 }; if($url){ Set-Clipboard $url; Write-Host ''; Write-Host '   ==========================================================' -ForegroundColor Green; Write-Host ('   DIA CHI CONG KHAI:  ' + $url) -ForegroundColor Green; Write-Host '   (da tu dong COPY - chi viec dan/gui cho nguoi khac)' -ForegroundColor Green; Write-Host '   ==========================================================' -ForegroundColor Green } else { Write-Host '   Chua lay duoc dia chi tunnel - kiem tra mang, hoac xem log:' -ForegroundColor Yellow; Write-Host ('   ' + $log) -ForegroundColor Yellow }"

echo.
echo   Dang khoi dong... trinh duyet se tu mo sau vai giay.
echo   Luu y: moi lan mo lai, dia chi cong khai se DOI (link ngau nhien).
echo   De TAT app va tunnel: chi can DONG cua so nay.
echo.

REM Mo trinh duyet sau 5 giay (cho server san sang)
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"

REM Chay server ban production
call npm run start

echo.
echo   App da dung. Nhan phim bat ky de dong cua so.
pause >nul
