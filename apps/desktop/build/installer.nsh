; "Open with Studio" on a FOLDER — Explorer's context menu on a folder and on the empty space
; inside one (the classic "Show more options" menu on Windows 11, where VS Code's entry sits too).
; The app takes a bare folder on its command line and opens it, landing on its root memory.
; SHCTX follows the install mode: HKCU for a per-user install, HKLM for all users.

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\Directory\shell\Studio" "" "Open with Studio"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\Studio" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr SHCTX "Software\Classes\Directory\shell\Studio\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Studio" "" "Open with Studio"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Studio" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Studio\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\Studio"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\Studio"
!macroend
