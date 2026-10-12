; Keep the Windows startup registration tidy when uninstalling.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.bettercalendar.desktop"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.bettercalendar.desktop"
!macroend
