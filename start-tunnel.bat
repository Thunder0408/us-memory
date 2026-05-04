@echo off
title Our Memory - Tunnel
echo.
echo  ===========================================
echo   Our Memory - Permanent Link
echo  ===========================================
echo.
echo  Starting Tailscale Funnel...
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3001
echo.
echo  Your permanent link (send this to BF):
echo.
echo    https://capybarachihuahuawithmonkeyandpiglet.tail01df1e.ts.net
echo.
echo  This link never changes!
echo  ===========================================
echo.
pause
