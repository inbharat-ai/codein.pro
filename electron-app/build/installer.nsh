!macro customInstall
  DetailPrint "Running CodIn local modules bootstrap..."
  ; Suppress DLL-not-found dialogs during bootstrap (SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX)
  System::Call 'kernel32::SetErrorMode(i 0x8003) i .r0'
  ExecWait '"$INSTDIR\CodeIn.exe" --bootstrap-only' $1
  ; Restore previous error mode
  System::Call 'kernel32::SetErrorMode(i r0)'
!macroend
