@echo off
title Us Memory - Tunnel
echo.
echo  ===========================================
echo   Us Memory - Permanent Link
echo  ===========================================
echo.
echo  Starting Tailscale Funnel...
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3001
echo.
echo  Your permanent link (send this to BF):
echo.
echo    https://usmemory.tail01df1e.ts.net
echo.
echo  NOTE: If the link above doesn't work, your Tailscale device name
echo  may still need to be renamed at: https://login.tailscale.com/admin/machines
echo.
echo  This link never changes once the device is renamed!
echo  ===========================================
echo.
pause
