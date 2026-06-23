@echo off
cd /d C:\navi_stylebot
echo === Pushing to GitHub ===
git add -A
git commit -m "diag: add public/diag.html for MAX WebView diagnostics"
git push origin main
echo.
echo ============================
echo Done! Press any key to close
echo ============================
pause
