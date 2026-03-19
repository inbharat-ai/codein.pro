!macro customInstall
  DetailPrint "Running CodIn local modules bootstrap..."
  ExecWait '"$INSTDIR\\CodeIn.exe" --bootstrap-only'
!macroend
