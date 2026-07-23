@echo off
title Hoc lieu Viet Anh
cd /d "D:\school ai\studio"

echo.
echo   ============================================
echo      HOC LIEU VIET ANH
echo   ============================================
echo.

REM Lan dau (hoac sau khi xoa .next) thi build truoc; nhung lan sau chay ngay.
if not exist ".next\BUILD_ID" (
  echo   Chuan bi app lan dau, cho khoang 1-2 phut...
  echo.
  call npm run build
)

echo   Dang khoi dong... trinh duyet se tu mo sau vai giay.
echo   De TAT app: chi can DONG cua so nay.
echo.

REM Mo trinh duyet sau 5 giay (cho server san sang)
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"

REM Chay server ban production (nhanh, on dinh, khong bi 'Compiling')
call npm run start

echo.
echo   App da dung. Nhan phim bat ky de dong cua so.
pause >nul
