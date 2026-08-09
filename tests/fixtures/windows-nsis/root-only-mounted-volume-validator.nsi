!include FileFunc.nsh
!define FYAGENT_DRIVE_FIXED 3
!define FYAGENT_ERROR_FILE_NOT_FOUND 2
!define FYAGENT_ERROR_PATH_NOT_FOUND 3

; This deliberately models the unsafe root-only policy: a path such as
; C:\mount\usb\FyAgent would be classified from C:\ instead of its mounted
; volume. The real contract verifier must reject this fixture.
Function FyAgentValidateFinalInstallDir
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r3, p 0) i .r4'
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r2'
  System::Call 'kernel32::GetLastError() i .r9'
  ${If} $9 <> ${FYAGENT_ERROR_FILE_NOT_FOUND}
  ${AndIf} $9 <> ${FYAGENT_ERROR_PATH_NOT_FOUND}
  ${EndIf}
  ${GetRoot} "$INSTDIR" $1
  System::Call 'kernel32::GetDriveTypeW(w r1) i .r2'
  IntCmp $2 ${FYAGENT_DRIVE_FIXED} fyagent_install_dir_valid fyagent_install_dir_invalid fyagent_install_dir_invalid
  fyagent_install_dir_valid:
  fyagent_install_dir_invalid:
FunctionEnd
