@echo off
@echo off
cd /d "d:\claudecode\临时文件夹\github网页\ip-hot"
start /b "" cmd /c "node _pipeline.mjs >> _pipeline.log 2>&1"
echo IP-HOT pipeline started
