; installer.nsh
; Silently removes ALL old Edit Bay Studio installs before the new one installs.
; Runs in customInit — BEFORE new files are written — so it won't delete the new install.
; Also clears any install left behind by the pre-1.0 RAVdownloader builds, and
; resets the welcome screen flag so it shows after every install/update.

!macro customInit
  ; Force install path
  StrCpy $INSTDIR "$PROGRAMFILES64\Edit Bay Studio"

  ; --- Check registry for per-user install (HKCU) ---
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.editbaytools.editbaystudio}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing old per-user install (registry)..."
    ExecWait '$0 /S'
    Sleep 2000

  ; --- Check registry for admin install (HKLM 64-bit) ---
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.editbaytools.editbaystudio}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing old admin install (registry)..."
    ExecWait '$0 /S'
    Sleep 2000

  ; --- Check per-user AppData location ---
  IfFileExists "$LOCALAPPDATA\Programs\Edit Bay Studio\Uninstall Edit Bay Studio.exe" 0 +3
    DetailPrint "Removing old per-user install..."
    ExecWait '"$LOCALAPPDATA\Programs\Edit Bay Studio\Uninstall Edit Bay Studio.exe" /S'
    Sleep 2000

  ; --- Check Program Files 64-bit ---
  IfFileExists "$PROGRAMFILES64\Edit Bay Studio\Uninstall Edit Bay Studio.exe" 0 +3
    DetailPrint "Removing old version from Program Files..."
    ExecWait '"$PROGRAMFILES64\Edit Bay Studio\Uninstall Edit Bay Studio.exe" /S'
    Sleep 2000

  ; --- Legacy: pre-1.0 RAVdownloader installs -------------------------------
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.colin.ravdownloader}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing previous-generation install..."
    ExecWait '$0 /S'
    Sleep 2000

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.colin.ravdownloader}" "UninstallString"
  StrCmp $0 "" +3 0
    DetailPrint "Removing previous-generation install..."
    ExecWait '$0 /S'
    Sleep 2000

!macroend

!macro customInstall
  ; Reset the welcome screen flag so it shows on first launch after install/update
  IfFileExists "$APPDATA\edit-bay-studio\settings.json" 0 +2
    Delete "$APPDATA\edit-bay-studio\settings.json.welcome"

  ; Write a small marker file that tells the app to show the welcome screen
  FileOpen $0 "$APPDATA\edit-bay-studio\show-welcome" w
  FileWrite $0 "1"
  FileClose $0
!macroend

!macro customUnInstall
!macroend
