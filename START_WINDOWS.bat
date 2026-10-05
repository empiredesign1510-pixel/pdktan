@echo off
echo Installing dependencies...
call npm install
if not exist .env (
  copy .env.example .env
  echo.
  echo File .env sudah dibuat.
  echo Isi OPENAI_API_KEY di file .env lalu jalankan START_WINDOWS.bat lagi.
  pause
  exit /b
)
echo Starting ReplyMuse...
call npm start
pause
