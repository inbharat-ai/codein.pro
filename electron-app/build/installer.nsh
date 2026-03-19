!macro customInstall
  DetailPrint "Running CodIn local modules bootstrap..."
  ExecWait '"$INSTDIR\\CodIn.exe" --bootstrap-only'
!macroend
