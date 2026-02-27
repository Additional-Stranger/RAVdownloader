; installer.nsh
; Silently removes the old RAVdownloader before the new one installs.
; Does NOT delete the install directory — electron-builder writes new files there.

!macro customInit
  ; Force install path to match old version location
  StrCpy $INSTDIR "$PROGRAMFILES64\RAVdownloader"
!macroend

!macro customInstall
  ; Check 64-bit Program Files first
  IfFileExists "$PROGRAMFILES64\RAVdownloader\Uninstall RAVdownloader.exe" RunUninstall64 Check32

  RunUninstall64:
    DetailPrint "Removing old version..."
    ExecWait '"$PROGRAMFILES64\RAVdownloader\Uninstall RAVdownloader.exe" /S'
    Sleep 2000
    Goto Done

  Check32:
    IfFileExists "$PROGRAMFILES\RAVdownloader\Uninstall RAVdownloader.exe" RunUninstall32 Done

  RunUninstall32:
    DetailPrint "Removing old version..."
    ExecWait '"$PROGRAMFILES\RAVdownloader\Uninstall RAVdownloader.exe" /S'
    Sleep 2000

  Done:
!macroend

!macro customUnInstall
!macroend
