; The previous per-user installer registered this GUID for com.yloader.app.
!define LEGACY_YLOADER_INSTALL_KEY "Software\cfab03ba-1102-58cc-a498-9325b57d020c"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "${LEGACY_YLOADER_INSTALL_KEY}" "InstallLocation"
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\Uninstall yLoader.exe"
    ClearErrors
    ; The old uninstaller preserves the user profile in update mode.
    ExecWait '"$R0\Uninstall yLoader.exe" /S /currentuser --updated' $R1
    ${If} ${Errors}
    ${OrIf} $R1 != 0
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The old updater uses --force-run where the current installer expects /R.
  ${If} ${Silent}
    ${GetOptions} $CMDLINE "--force-run" $R0
    ${IfNot} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
!macroend
