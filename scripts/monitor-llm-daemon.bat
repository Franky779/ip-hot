@echo off
chcp 65001 > nul
cd /d "d:\claudecode\临时文件夹\github网页\ip-hot"
echo [%date% %time%] LLM监控守护进程启动

:loop
  echo [%date% %time%] 执行监控检查...
  node scripts\monitor-llm.mjs report > monitor-output.txt 2>&1

  for /f "tokens=*" %%a in ('type monitor-output.txt ^| findstr "待分类:"') do set STATUS=%%a
  echo [%date% %time%] %STATUS%

  echo [%date% %time%] 等待15分钟...
  timeout /t 900 /nobreak > nul
goto loop
