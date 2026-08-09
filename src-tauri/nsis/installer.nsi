; FyAgent custom NSIS template.
; Upstream: tauri-apps/tauri tauri-cli-v2.8.1
; Commit: 662b39adb33d1d26f0de213e5a04fc4116fd0683
; Upstream SHA-256: fe22026f68bdb3292fab376756035496ce0a35e3d580e06ebaa6a28295916eb3
; The reviewed delta is limited to the final install-path gate, removal of
; WiX migration and user-data deletion, and secure machine-runtime ownership.

Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"
!define FYAGENT_DRIVE_FIXED 3
!define FYAGENT_FILE_ATTRIBUTE_DIRECTORY 0x10
!define FYAGENT_FILE_ATTRIBUTE_REPARSE_POINT 0x400
!define FYAGENT_FILE_READ_ATTRIBUTES 0x80
!define FYAGENT_DELETE 0x00010000
!define FYAGENT_READ_CONTROL 0x00020000
!define FYAGENT_FILE_SHARE_READ 0x1
!define FYAGENT_FILE_SHARE_ALL 0x7
!define FYAGENT_OPEN_EXISTING 3
!define FYAGENT_INVALID_HANDLE_VALUE -1
!define FYAGENT_FILE_FLAG_BACKUP_SEMANTICS 0x02000000
!define FYAGENT_FILE_FLAG_OPEN_REPARSE_POINT 0x00200000
!define FYAGENT_BY_HANDLE_FILE_INFORMATION_SIZE 52
!define FYAGENT_SECURITY_ATTRIBUTES_SIZE 12
!define FYAGENT_SDDL_REVISION_1 1
!define FYAGENT_ERROR_FILE_NOT_FOUND 2
!define FYAGENT_ERROR_PATH_NOT_FOUND 3
!define FYAGENT_SE_FILE_OBJECT 1
!define FYAGENT_OWNER_SECURITY_INFORMATION 0x1
!define FYAGENT_DACL_SECURITY_INFORMATION 0x4
!define FYAGENT_FILE_DISPOSITION_INFO 4
!define FYAGENT_RUNTIME_ROOT_SDDL "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var OldMainBinaryName
Var FyAgentInstallDirValid
Var FyAgentInstallDirError
Var FyAgentRuntimeProvisionValid
Var FyAgentRuntimeParentHandle
Var FyAgentRuntimeLeafHandle
Var FyAgentRuntimeParentMissing
Var FyAgentRuntimeLeafMissing

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP  "${HEADERIMAGE}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Function PageReinstall
  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installer version with the existing NSIS installation
  ; and modify the messages presented to the user accordingly
  StrCpy $R4 "$(older)"
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0
  ; Reinstalling the same version
  ${If} $R0 = 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
  ; Upgrading
  ${ElseIf} $R0 = 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ; Downgrading
  ${ElseIf} $R0 = -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ${Else}
    Abort
  ${EndIf}

  ; Skip showing the page if passive
  ;
  ; Note that we don't call this earlier at the begining
  ; of this function because we need to populate some variables
  ; related to current installed version if detected and whether
  ; we are downgrading or not.
  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1

    ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
    Pop $R2
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
    Pop $R3
    ; Disable this radio button if downgrading and downgrades are disabled
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ; Check the first radio button if this the first time
    ; we enter this page or if the second button wasn't
    ; selected the last time we were on this page
    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; In update mode, always proceeds without uninstalling
  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ; $R0 holds whether same(0)/upgrading(1)/downgrading(-1) version
  ; $R1 holds the radio buttons state:
  ;   1 => first choice was selected
  ;   0 => second choice was selected
  ${If} $R0 = 0 ; Same version, proceed
    ${If} $R1 = 1              ; User chose to add/reinstall
      Goto reinst_done
    ${Else}                    ; User chose to uninstall
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R0 = 1 ; Upgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${ElseIf} $R0 = -1 ; Downgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${EndIf}

  reinst_uninstall:
    ; Removing an existing NSIS installation writes before the new sections
    ; run, so admit its restored path through the same fixed-volume validator.
    Call FyAgentValidateFinalInstallDir
    ${If} $FyAgentInstallDirValid <> 1
      MessageBox MB_ICONSTOP|MB_OK "$FyAgentInstallDirError"
      Abort
    ${EndIf}
    HideWindow
    ClearErrors

    ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
    ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
    ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|} ; append /UPDATE
    ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|} ; append /P
    StrCpy $R1 "$R1 _?=$4" ; append uninstall directory
    ExecWait '$R1' $0

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ; User cancelled NSIS uninstaller? return to select un/reinstall page
      ${If} $0 = 1
        Abort
      ${EndIf}

      ; Other erros? show generic error message and return to select un/reinstall page
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${EndIf}
  reinst_done:
FunctionEnd

; 5. Choose install directory page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE FyAgentValidateInstallDirPageLeave
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
Var AppStartMenuFolder
!if "${STARTMENUFOLDER}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"
!else
  !define MUI_PAGE_CUSTOMFUNCTION_PRE Skip
!endif
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Use show readme button in the finish page as a button create a desktop shortcut
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(createDesktop)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut
; Show run app after installation.
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; Uninstaller Pages
; 1. Confirm uninstall page
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}
LangString fyagentInvalidInstallDir ${LANG_ENGLISH} "Choose an absolute path on a local fixed drive (for example, C:\\Program Files\\FyAgent)."
LangString fyagentInvalidInstallDir ${LANG_SIMPCHINESE} "请选择本地固定磁盘上的绝对路径（例如 C:\\Program Files\\FyAgent）。"
LangString fyagentRuntimeProvisionFailed ${LANG_ENGLISH} "FyAgent could not securely provision its machine runtime directory."
LangString fyagentRuntimeProvisionFailed ${LANG_SIMPCHINESE} "FyAgent 无法安全创建计算机运行时目录。"

Function .onInit
  ; Tauri ships an x86 NSIS launcher even for native x64/ARM64 payloads. Keep
  ; every per-machine registration in the native 64-bit view on both targets.
  SetRegView 64

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd

; Shared by the interactive directory page and the first executable section.
; This is deliberately only an absolute-local-fixed-drive admission rule; it
; does not classify ACLs, owners, protected folders, or existing contents.
Function FyAgentValidateFinalInstallDir
  StrCpy $FyAgentInstallDirValid 0
  StrCpy $FyAgentInstallDirError "$(fyagentInvalidInstallDir)"

  StrCmp $INSTDIR "" fyagent_install_dir_invalid
  StrCpy $0 $INSTDIR 1 1
  StrCmp $0 ":" 0 fyagent_install_dir_invalid
  StrCpy $0 $INSTDIR 1 2
  StrCmp $0 "\" 0 fyagent_install_dir_invalid

  ; Normalize only after the DOS absolute-path shape has been admitted so a
  ; relative value can never be expanded against the installer's working dir.
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r3, p 0) i .r4'
  ${If} $4 == 0
    Goto fyagent_install_dir_invalid
  ${EndIf}
  ${If} $4 >= ${NSIS_MAX_STRLEN}
    Goto fyagent_install_dir_invalid
  ${EndIf}
  StrCpy $INSTDIR $3

  ; Peel nonexistent target segments without creating them. Open the closest
  ; existing ancestor without FILE_FLAG_OPEN_REPARSE_POINT so junctions and
  ; symlinks are followed, then classify the final target volume. A lexical
  ; C:\ path can otherwise reach a removable mount or a network reparse target.
  StrCpy $1 $INSTDIR
  fyagent_find_existing_install_ancestor:
    System::Call 'kernel32::GetFileAttributesW(w r1) i .r2'
    System::Call 'kernel32::GetLastError() i .r9'
    ${If} $2 != -1
      Goto fyagent_install_ancestor_found
    ${EndIf}
    ${If} $9 <> ${FYAGENT_ERROR_FILE_NOT_FOUND}
    ${AndIf} $9 <> ${FYAGENT_ERROR_PATH_NOT_FOUND}
      Goto fyagent_install_dir_invalid
    ${EndIf}
    ${GetParent} "$1" $3
    StrCmp $3 "" fyagent_install_dir_invalid
    StrCmp $3 $1 fyagent_install_dir_invalid
    StrCpy $1 $3
    Goto fyagent_find_existing_install_ancestor

  fyagent_install_ancestor_found:
    System::Call 'kernel32::CreateFileW(w r1, i ${FYAGENT_FILE_READ_ATTRIBUTES}, i ${FYAGENT_FILE_SHARE_ALL}, p 0, i ${FYAGENT_OPEN_EXISTING}, i ${FYAGENT_FILE_FLAG_BACKUP_SEMANTICS}, p 0) p .r5'
    ${If} $5 == -1
      Goto fyagent_install_dir_invalid
    ${EndIf}
    ${If} $5 == 0
      Goto fyagent_install_dir_invalid
    ${EndIf}

    System::Call 'kernel32::GetFinalPathNameByHandleW(p r5, w .r6, i ${NSIS_MAX_STRLEN}, i 0) i .r7'
    System::Call 'kernel32::CloseHandle(p r5) i .r5'
    ${If} $5 == 0
      Goto fyagent_install_dir_invalid
    ${EndIf}
    ${If} $7 == 0
      Goto fyagent_install_dir_invalid
    ${EndIf}
    ${If} $7 >= ${NSIS_MAX_STRLEN}
      Goto fyagent_install_dir_invalid
    ${EndIf}

    ; Default VOLUME_NAME_DOS results use \\?\UNC\ for SMB targets. Reject
    ; both that form and a conventional UNC result explicitly; the drive-type
    ; check below remains the final allow-list for every other volume form.
    StrCpy $0 $6 8
    StrCmp $0 "\\?\UNC\" fyagent_install_dir_invalid
    StrCpy $0 $6 2
    StrCmp $0 "\\" fyagent_install_dir_invalid

    System::Call 'kernel32::GetVolumePathNameW(w r6, w .r3, i ${NSIS_MAX_STRLEN}) i .r4'
    ${If} $4 == 0
      Goto fyagent_install_dir_invalid
    ${EndIf}
    System::Call 'kernel32::GetDriveTypeW(w r3) i .r2'
  IntCmp $2 ${FYAGENT_DRIVE_FIXED} fyagent_install_dir_valid fyagent_install_dir_invalid fyagent_install_dir_invalid

  fyagent_install_dir_valid:
    StrCpy $FyAgentInstallDirValid 1
    Return

  fyagent_install_dir_invalid:
FunctionEnd

Function FyAgentValidateInstallDirPageLeave
  Call FyAgentValidateFinalInstallDir
  ${If} $FyAgentInstallDirValid <> 1
    MessageBox MB_ICONSTOP|MB_OK "$FyAgentInstallDirError"
    Abort
  ${EndIf}
FunctionEnd

; Existing machine-runtime directories are never repaired. They are opened
; without following reparse points, pinned against write/delete sharing, and
; admitted only when the handle reports the exact Rust owner/DACL allow-list.
!macro FyAgentOpenExistingTrustedRuntimeDirectory Path Label OutputHandle MissingFlag
  StrCpy ${OutputHandle} 0
  StrCpy ${MissingFlag} 0

  System::Call 'kernel32::CreateFileW(w "${Path}", i ${FYAGENT_FILE_READ_ATTRIBUTES}|${FYAGENT_DELETE}|${FYAGENT_READ_CONTROL}, i ${FYAGENT_FILE_SHARE_READ}, p 0, i ${FYAGENT_OPEN_EXISTING}, i ${FYAGENT_FILE_FLAG_BACKUP_SEMANTICS}|${FYAGENT_FILE_FLAG_OPEN_REPARSE_POINT}, p 0) p .r8'
  System::Call 'kernel32::GetLastError() i .r9'
  ${If} $8 == ${FYAGENT_INVALID_HANDLE_VALUE}
    ${If} $9 == ${FYAGENT_ERROR_FILE_NOT_FOUND}
    ${OrIf} $9 == ${FYAGENT_ERROR_PATH_NOT_FOUND}
      StrCpy ${MissingFlag} 1
      Goto fyagent_${Label}_done
    ${EndIf}
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  ${If} $8 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}

  System::Alloc ${FYAGENT_BY_HANDLE_FILE_INFORMATION_SIZE}
  Pop $6
  ${If} $6 == 0
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  System::Call 'kernel32::GetFileInformationByHandle(p r8, p r6) i .r7'
  ${If} $7 == 0
    System::Free $6
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  System::Call '*$6(i .r0)'
  System::Free $6
  IntOp $4 $0 & ${FYAGENT_FILE_ATTRIBUTE_DIRECTORY}
  ${If} $4 == 0
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  IntOp $4 $0 & ${FYAGENT_FILE_ATTRIBUTE_REPARSE_POINT}
  ${If} $4 <> 0
    Goto fyagent_${Label}_close_fail
  ${EndIf}

  ; GetSecurityInfo returns a LocalAlloc security descriptor. Both that buffer
  ; and the converted SDDL buffer must be released successfully before trust is
  ; granted to the still-open directory handle.
  System::Call 'advapi32::GetSecurityInfo(p r8, i ${FYAGENT_SE_FILE_OBJECT}, i ${FYAGENT_OWNER_SECURITY_INFORMATION}|${FYAGENT_DACL_SECURITY_INFORMATION}, p 0, p 0, p 0, p 0, p .r5) i .r4'
  ${If} $4 <> 0
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  System::Call 'advapi32::ConvertSecurityDescriptorToStringSecurityDescriptorW(p r5, i ${FYAGENT_SDDL_REVISION_1}, i ${FYAGENT_OWNER_SECURITY_INFORMATION}|${FYAGENT_DACL_SECURITY_INFORMATION}, p .r6, *i .r7) i .r4'
  ${If} $4 == 0
    System::Call 'kernel32::LocalFree(p r5) p .r4'
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  ${If} $7 >= ${NSIS_MAX_STRLEN}
    System::Call 'kernel32::LocalFree(p r6) p .r4'
    ${If} $4 != 0
      System::Call 'kernel32::LocalFree(p r5) p .r4'
      Goto fyagent_${Label}_close_fail
    ${EndIf}
    System::Call 'kernel32::LocalFree(p r5) p .r4'
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  StrCpy $2 $6
  System::Call '*$2(&w${NSIS_MAX_STRLEN} .r6)'
  System::Call 'kernel32::LocalFree(p r2) p .r4'
  ${If} $4 != 0
    System::Call 'kernel32::LocalFree(p r5) p .r4'
    Goto fyagent_${Label}_close_fail
  ${EndIf}
  System::Call 'kernel32::LocalFree(p r5) p .r4'
  ${If} $4 != 0
    Goto fyagent_${Label}_close_fail
  ${EndIf}

  StrCmp $6 "O:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)" fyagent_${Label}_trusted
  StrCmp $6 "O:SYD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)" fyagent_${Label}_trusted
  StrCmp $6 "O:SYD:P(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)" fyagent_${Label}_trusted
  StrCmp $6 "O:SYD:PAI(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)" fyagent_${Label}_trusted
  StrCmp $6 "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)" fyagent_${Label}_trusted
  StrCmp $6 "O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)" fyagent_${Label}_trusted
  StrCmp $6 "O:BAD:P(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)" fyagent_${Label}_trusted
  StrCmp $6 "O:BAD:PAI(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)" fyagent_${Label}_trusted
  Goto fyagent_${Label}_close_fail

  fyagent_${Label}_trusted:
    StrCpy ${OutputHandle} $8
    Goto fyagent_${Label}_done

  fyagent_${Label}_close_fail:
    System::Call 'kernel32::CloseHandle(p r8) i .r4'
    Goto fyagent_runtime_provision_fail

  fyagent_${Label}_done:
!macroend

; A missing directory is created once with the final protected descriptor.
; ERROR_ALREADY_EXISTS is deliberately not accepted: a competing preimage
; loses the race by failing the installation and is never normalized in place.
!macro FyAgentCreateTrustedRuntimeDirectory Path Label OutputHandle MissingFlag
  StrCpy ${OutputHandle} 0
  StrCpy ${MissingFlag} 0
  System::Call 'advapi32::ConvertStringSecurityDescriptorToSecurityDescriptorW(w "${FYAGENT_RUNTIME_ROOT_SDDL}", i ${FYAGENT_SDDL_REVISION_1}, p .r1, p 0) i .r3'
  ${If} $3 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  System::Call '*(i ${FYAGENT_SECURITY_ATTRIBUTES_SIZE}, p r1, i 0) p .r2'
  ${If} $2 == 0
    System::Call 'kernel32::LocalFree(p r1) p .r4'
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  System::Call 'kernel32::CreateDirectoryW(w "${Path}", p r2) i .r3'
  System::Free $2
  System::Call 'kernel32::LocalFree(p r1) p .r4'
  ${If} $4 != 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  ${If} $3 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  !insertmacro FyAgentOpenExistingTrustedRuntimeDirectory "${Path}" ${Label}_open ${OutputHandle} ${MissingFlag}
  ${If} ${MissingFlag} <> 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
!macroend

!macro FyAgentMarkRuntimeDirectoryForDeletion Handle
  System::Call '*(i 1) p .r1'
  ${If} $1 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  System::Call 'kernel32::SetFileInformationByHandle(p ${Handle}, i ${FYAGENT_FILE_DISPOSITION_INFO}, p r1, i 4) i .r2'
  System::Free $1
  ${If} $2 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
!macroend

Function FyAgentProvisionMachineRuntime
  StrCpy $FyAgentRuntimeProvisionValid 0
  StrCpy $FyAgentRuntimeParentHandle 0
  StrCpy $FyAgentRuntimeLeafHandle 0
  StrCpy $FyAgentRuntimeParentMissing 0
  StrCpy $FyAgentRuntimeLeafMissing 0

  ; A trusted legacy object is still rebuilt. Deletion-by-handle makes any
  ; stale shared handle refer only to the retired object; a stale handle that
  ; does not share DELETE makes this operation fail closed.
  !insertmacro FyAgentOpenExistingTrustedRuntimeDirectory "$COMMONAPPDATA\FyAgent" runtime_parent $FyAgentRuntimeParentHandle $FyAgentRuntimeParentMissing
  ${If} $FyAgentRuntimeParentMissing == 1
    Goto fyagent_runtime_create_fresh
  ${EndIf}

  !insertmacro FyAgentOpenExistingTrustedRuntimeDirectory "$COMMONAPPDATA\FyAgent\runtime" runtime_leaf $FyAgentRuntimeLeafHandle $FyAgentRuntimeLeafMissing
  ${If} $FyAgentRuntimeLeafMissing <> 1
    ; Only the runtime-owned lease/descriptor names are eligible for legacy
    ; cleanup. Unknown content leaves the directory nonempty, so handle-based
    ; disposition fails without widening the deletion set.
    Delete "$COMMONAPPDATA\FyAgent\runtime\business-*.state"
    Delete "$COMMONAPPDATA\FyAgent\runtime\business-*.lock"
    !insertmacro FyAgentMarkRuntimeDirectoryForDeletion $FyAgentRuntimeLeafHandle
    System::Call 'kernel32::CloseHandle(p $FyAgentRuntimeLeafHandle) i .r4'
    StrCpy $FyAgentRuntimeLeafHandle 0
    ${If} $4 == 0
      Goto fyagent_runtime_provision_fail
    ${EndIf}
    ${If} ${FileExists} "$COMMONAPPDATA\FyAgent\runtime"
      Goto fyagent_runtime_provision_fail
    ${EndIf}
  ${EndIf}

  !insertmacro FyAgentMarkRuntimeDirectoryForDeletion $FyAgentRuntimeParentHandle
  System::Call 'kernel32::CloseHandle(p $FyAgentRuntimeParentHandle) i .r4'
  StrCpy $FyAgentRuntimeParentHandle 0
  ${If} $4 == 0
    Goto fyagent_runtime_provision_fail
  ${EndIf}
  ${If} ${FileExists} "$COMMONAPPDATA\FyAgent"
    Goto fyagent_runtime_provision_fail
  ${EndIf}

  fyagent_runtime_create_fresh:
    !insertmacro FyAgentCreateTrustedRuntimeDirectory "$COMMONAPPDATA\FyAgent" runtime_create_parent $FyAgentRuntimeParentHandle $FyAgentRuntimeParentMissing
    ; Keep the no-follow parent handle pinned until leaf creation, validation,
    ; and every cleanup decision is complete.
    !insertmacro FyAgentCreateTrustedRuntimeDirectory "$COMMONAPPDATA\FyAgent\runtime" runtime_create_leaf $FyAgentRuntimeLeafHandle $FyAgentRuntimeLeafMissing
    StrCpy $0 1
    Goto fyagent_runtime_provision_close

  fyagent_runtime_provision_fail:
    StrCpy $0 0

  fyagent_runtime_provision_close:
    ${If} $FyAgentRuntimeLeafHandle != 0
      System::Call 'kernel32::CloseHandle(p $FyAgentRuntimeLeafHandle) i .r4'
      ${If} $4 == 0
        StrCpy $0 0
      ${EndIf}
      StrCpy $FyAgentRuntimeLeafHandle 0
    ${EndIf}
    ${If} $FyAgentRuntimeParentHandle != 0
      System::Call 'kernel32::CloseHandle(p $FyAgentRuntimeParentHandle) i .r4'
      ${If} $4 == 0
        StrCpy $0 0
      ${EndIf}
      StrCpy $FyAgentRuntimeParentHandle 0
    ${EndIf}
    ${If} $0 == 1
      StrCpy $FyAgentRuntimeProvisionValid 1
    ${EndIf}
FunctionEnd

; Section order is the security boundary. The final $INSTDIR selected by the
; GUI or supplied through final `/D=...` is checked before WebView2, SetOutPath,
; ProgramData provisioning, payload extraction, registry, or shortcut writes.
Section -FyAgentInstallDirGate
  Call FyAgentValidateFinalInstallDir
  ${If} $FyAgentInstallDirValid <> 1
    DetailPrint "$FyAgentInstallDirError"
    SetErrorLevel 2
    Abort "$FyAgentInstallDirError"
  ${EndIf}
SectionEnd

; Provision the machine runtime before any network bootstrap or payload write.
; The app must be stopped before trusted legacy state can be retired by handle.
Section -FyAgentMachineRuntimeBootstrap
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  Call FyAgentProvisionMachineRuntime
  ${If} $FyAgentRuntimeProvisionValid <> 1
    DetailPrint "$(fyagentRuntimeProvisionFailed)"
    SetErrorLevel 3
    Abort "$(fyagentRuntimeProvisionFailed)"
  ${EndIf}
SectionEnd

Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
    ; If downgrading
    ${If} $R0 = -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 <> 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" != "downloadBootstrapper"
        !error "FyAgent requires the reviewed secure downloadBootstrapper flow"
      !endif

      DetailPrint "$(webview2Downloading)"
      !insertmacro FyAgentSetWebView2CommandEnvironment
      ${If} $7 <> 1
        !insertmacro FyAgentClearWebView2CommandEnvironment
        DetailPrint "$(webview2DownloadError)"
        Abort "$(webview2AbortError)"
      ${EndIf}

      ClearErrors
      ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${FYAGENT_WEBVIEW2_LOADER_BASE64}' $1
      ${If} ${Errors}
        StrCpy $1 90
      ${EndIf}
      !insertmacro FyAgentClearWebView2CommandEnvironment
      ${If} $6 <> 1
        StrCpy $1 91
      ${EndIf}

      ${If} $1 = 0
        DetailPrint "$(webview2DownloadSuccess)"
        DetailPrint "$(webview2InstallSuccess)"
      ${Else}
        DetailPrint "$(webview2InstallError)"
        Abort "$(webview2AbortError)"
      ${EndIf}
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$INSTDIR\${MAINBINARYNAME}.exe,0" "Open with ${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create desktop shortcut for silent and passive installers
  ; because finish page will be skipped
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; Auto close this page for passive mode
  ${If} $PassiveMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  SetRegView 64
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; The runtime process owns only these bounded descriptor/lease names. Remove
  ; them after process shutdown, then remove the known directories only when
  ; empty. Never recursively delete a caller-selected $INSTDIR.
  Delete "$COMMONAPPDATA\FyAgent\runtime\business-*.state"
  Delete "$COMMONAPPDATA\FyAgent\runtime\business-*.lock"
  RMDir "$COMMONAPPDATA\FyAgent\runtime"
  RMDir "$COMMONAPPDATA\FyAgent"

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Remove installer-owned location/language markers without touching the
  ; application's per-user ${BUNDLEID} stores or ~/.fyagent data.
  DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
  DeleteRegKey /ifempty SHCTX "${MANUKEY}"
  DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
  DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
  DeleteRegKey /ifempty HKCU "${MANUKEY}"

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Auto close if passive mode or updating
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ${If} $UpdateMode = 1
  ${OrIf} $NoShortcutMode = 1
    Return
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ${If} $UpdateMode = 1
  ${OrIf} $NoShortcutMode = 1
    Return
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd
