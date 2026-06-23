@echo off
cd /d C:\navi_stylebot
echo === Pushing to GitHub ===
git add -A
git commit -m "fix: use static import instead of dynamic to fix MAX WebView"
git push origin main
echo.
echo ============================
echo Done! Press any key to close
echo ============================
pause
