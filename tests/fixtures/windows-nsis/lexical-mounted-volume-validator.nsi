!include FileFunc.nsh
!define FYAGENT_DRIVE_FIXED 3
!define FYAGENT_ERROR_FILE_NOT_FOUND 2
!define FYAGENT_ERROR_PATH_NOT_FOUND 3

; This deliberately models the incomplete lexical-volume policy. It handles a
; mounted volume below C:\, but it does not follow a directory junction or
; symlink to its final local/SMB target before classifying the volume.
Function FyAgentValidateFinalInstallDir
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r3, p 0) i .r4'
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r2'
  System::Call 'kernel32::GetLastError() i .r9'
  ${If} $9 <> ${FYAGENT_ERROR_FILE_NOT_FOUND}
  ${AndIf} $9 <> ${FYAGENT_ERROR_PATH_NOT_FOUND}
  ${EndIf}
  System::Call 'kernel32::GetVolumePathNameW(w "$INSTDIR", w .r3, i ${NSIS_MAX_STRLEN}) i .r4'
  System::Call 'kernel32::GetDriveTypeW(w r3) i .r2'
  IntCmp $2 ${FYAGENT_DRIVE_FIXED} fyagent_install_dir_valid fyagent_install_dir_invalid fyagent_install_dir_invalid
  fyagent_install_dir_valid:
  fyagent_install_dir_invalid:
FunctionEnd
