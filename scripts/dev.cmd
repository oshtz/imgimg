@echo off
cd /d "%~dp0.."
npm --prefix web run dev -- --port 3000
