!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Orbita"
    ${if} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Orbita"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Orbita"
    ${endif}
  ${endif}
!macroend
