; installer.nsh
; Silently removes ALL old RAVdownloader installs before the new one installs.
; Runs in customInit — BEFORE new files are written — so it won't delete the new install.
; Also resets the welcome screen flag so it shows after every install/update.

!macro customInit
  ; Force install path
  StrCpy $INSTDIR "$PROGRAMFILES64\RAVdownloader"

  ; --- Check registry for per-user install (HKCU) ---
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.colin.ravdownloader}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing old per-user install (registry)..."
    ExecWait '$0 /S'
    Sleep 2000

  ; --- Check registry for admin install (HKLM 64-bit) ---
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.colin.ravdownloader}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing old admin install (registry)..."
    ExecWait '$0 /S'
    Sleep 2000

  ; --- Check per-user AppData location ---
  IfFileExists "$LOCALAPPDATA\Programs\RAVdownloader\Uninstall RAVdownloader.exe" 0 +3
    DetailPrint "Removing old per-user install..."
    ExecWait '"$LOCALAPPDATA\Programs\RAVdownloader\Uninstall RAVdownloader.exe" /S'
    Sleep 2000

  ; --- Check Program Files 64-bit ---
  IfFileExists "$PROGRAMFILES64\RAVdownloader\Uninstall RAVdownloader.exe" 0 +3
    DetailPrint "Removing old version from Program Files..."
    ExecWait '"$PROGRAMFILES64\RAVdownloader\Uninstall RAVdownloader.exe" /S'
    Sleep 2000

  ; --- Check Program Files 32-bit ---
  IfFileExists "$PROGRAMFILES\RAVdownloader\Uninstall RAVdownloader.exe" 0 +3
    DetailPrint "Removing old version from Program Files (x86)..."
    ExecWait '"$PROGRAMFILES\RAVdownloader\Uninstall RAVdownloader.exe" /S'
    Sleep 2000

!macroend

!macro customInstall
  ; Reset the welcome screen flag so it shows on first launch after install/update
  ; Delete the lastSeenVersion from settings.json so the app shows the welcome popup
  IfFileExists "$APPDATA\ravdownloader\settings.json" 0 +2
    Delete "$APPDATA\ravdownloader\settings.json.welcome"

  ; Write a small marker file that tells the app to show the welcome screen
  FileOpen $0 "$APPDATA\ravdownloader\show-welcome" w
  FileWrite $0 "1"
  FileClose $0
!macroend

!macro customUnInstall
!macroend
