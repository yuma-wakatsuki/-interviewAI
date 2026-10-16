$ErrorActionPreference = 'Stop'
python -m PyInstaller --noconfirm --onefile --name InterviewAI-Local --collect-all sherpa_onnx server/launch.py
Write-Host 'Created dist/InterviewAI-Local.exe'
