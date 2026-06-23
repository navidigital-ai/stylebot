@echo off
cd /d C:\navi_stylebot
echo === Pushing to GitHub ===
git add -A
git commit -m "debug: show error/timeout if StyleBot fails to load in WebView"
git push origin main
echo.
echo ============================
echo Done! Press any key to close
echo ============================
pause
