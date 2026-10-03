@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ルミナスクエストを起動します。このウィンドウは閉じないでください（閉じると終了）。
echo.
echo  パソコン:  http://localhost:8765/
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo  スマホ(同じWi-Fi): http://%%a:8765/
echo.
start "" http://localhost:8765/
python -m http.server 8765
