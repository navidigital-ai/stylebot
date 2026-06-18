@echo off
cd /d C:\navi_stylebot

echo === Removing .git folder (force) ===
powershell -Command "if (Test-Path '.git') { Remove-Item -Recurse -Force '.git'; Write-Host 'Deleted .git' } else { Write-Host 'No .git found' }"

echo === Init repo ===
git init -b main
git config user.email "vanvanivan94@gmail.com"
git config user.name "navidigital-ai"

echo === Adding files ===
git add .

echo === Commit ===
git commit -m "feat: stylebot — multiposting TG/VK/MAX/VC + style passport"

echo === Push ===
git remote add origin https://github.com/navidigital-ai/stylebot.git
git push -u origin main

echo.
echo ============================
echo Done! Press any key to close
echo ============================
pause
