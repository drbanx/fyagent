param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet('x64', 'arm64')]
  [string]$Architecture,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$AppVersion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'The NSIS lifecycle must run on a native Windows runner.'
}

$principal = [Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'The NSIS lifecycle requires an elevated administrator process.'
}

$resolvedInstaller = (Resolve-Path -LiteralPath $InstallerPath).Path
$expectedOsArchitecture = if ($Architecture -eq 'arm64') { 'Arm64' } else { 'X64' }
$actualOsArchitecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($actualOsArchitecture -cne $expectedOsArchitecture) {
  throw "Native runner architecture is $actualOsArchitecture; expected $expectedOsArchitecture"
}

$uninstallRegistrySubKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\FyAgent'
$protocolRegistrySubKey = 'Software\Classes\fyagent'
$installLocationRegistrySubKey = 'Software\fyagent\FyAgent'
$nsisProcessTimeoutMilliseconds = 10 * 60 * 1000
$cleanupNsisTimeoutMilliseconds = 2 * 60 * 1000
$signatureVerifierTimeoutMilliseconds = 3 * 60 * 1000
$nativeToolTimeoutMilliseconds = 2 * 60 * 1000
$processRootExitAfterTreeKillTimeoutMilliseconds = 15 * 1000
$redirectedOutputDrainTimeoutMilliseconds = 15 * 1000

function Stop-CaseOwnedProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [Diagnostics.Process]$Process,

    [Parameter(Mandatory = $true)]
    [string]$CaseName
  )

  try {
    if ($Process.HasExited) {
      return 'root-already-exited-before-tree-kill'
    }
    $Process.Kill($true)
    if (-not $Process.WaitForExit($processRootExitAfterTreeKillTimeoutMilliseconds)) {
      return "tree-kill-issued-root-still-running-after-${processRootExitAfterTreeKillTimeoutMilliseconds}ms"
    }
    # .NET's direct-process wait does not prove that every descendant has
    # exited after Kill(true); report only the state this handle can establish.
    return 'tree-kill-issued-root-exited'
  } catch {
    return "termination-failed-for-${CaseName}: $($_.Exception.Message)"
  }
}

function Receive-RedirectedProcessOutput {
  param(
    [Parameter(Mandatory = $true)]
    [object]$StandardOutputTask,

    [Parameter(Mandatory = $true)]
    [object]$StandardErrorTask
  )

  $failure = $null
  try {
    $tasks = [Threading.Tasks.Task[]]@($StandardOutputTask, $StandardErrorTask)
    if (-not [Threading.Tasks.Task]::WaitAll(
      $tasks,
      $redirectedOutputDrainTimeoutMilliseconds
    )) {
      $failure = "output-drain-timeout-after-${redirectedOutputDrainTimeoutMilliseconds}ms"
    }
  } catch {
    $failure = "output-drain-failed: $($_.Exception.Message)"
  }

  $standardOutput = ''
  $standardError = ''
  try {
    if ($StandardOutputTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion) {
      $standardOutput = $StandardOutputTask.GetAwaiter().GetResult()
    }
  } catch {
    if ($null -eq $failure) {
      $failure = "output-drain-failed: $($_.Exception.Message)"
    }
  }
  try {
    if ($StandardErrorTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion) {
      $standardError = $StandardErrorTask.GetAwaiter().GetResult()
    }
  } catch {
    if ($null -eq $failure) {
      $failure = "output-drain-failed: $($_.Exception.Message)"
    }
  }

  return [pscustomobject]@{
    Completed = $null -eq $failure
    StandardOutput = $standardOutput
    StandardError = $standardError
    Failure = $failure
  }
}

function Get-CapturedProcessOutputFailureDetail {
  param(
    [switch]$CaptureOutput,

    [AllowEmptyString()]
    [string]$StandardOutput,

    [AllowEmptyString()]
    [string]$StandardError
  )

  if (-not $CaptureOutput) {
    return ''
  }

  try {
    $details = @()
    if (-not [string]::IsNullOrWhiteSpace($StandardOutput)) {
      $details += "stdout=$($StandardOutput.TrimEnd())"
    }
    if (-not [string]::IsNullOrWhiteSpace($StandardError)) {
      $details += "stderr=$($StandardError.TrimEnd())"
    }
    if ($details.Count -eq 0) {
      return ''
    }
    return '; ' + [string]::Join('; ', $details)
  } catch {
    # Output diagnostics are best effort and must not replace the process
    # timeout, drain failure, or unexpected-exit error being reported.
    return '; captured-output-formatting-failed'
  }
}

function Invoke-BoundedCaseProcess {
  param(
    [Parameter(Mandatory = $true)]
    [Diagnostics.ProcessStartInfo]$StartInfo,

    [Parameter(Mandatory = $true)]
    [string]$CaseName,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$TimeoutMilliseconds,

    [switch]$CaptureOutput,

    [ValidateSet('Any', 'Zero', 'NonZero')]
    [string]$ExpectedExit = 'Any'
  )

  if (
    $CaptureOutput -and
    (-not $StartInfo.RedirectStandardOutput -or -not $StartInfo.RedirectStandardError)
  ) {
    throw "${CaseName} must redirect both stdout and stderr before launch."
  }
  if (
    -not $CaptureOutput -and
    ($StartInfo.RedirectStandardOutput -or $StartInfo.RedirectStandardError)
  ) {
    throw "${CaseName} must capture every configured redirected stream."
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $StartInfo
  $startedUtc = [DateTime]::UtcNow
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $processId = 'not-started'
  $exitCode = 'unavailable'
  $outcome = 'start-failed'
  $startMarkerWritten = $false
  $standardOutput = ''
  $standardError = ''
  $result = $null
  $operationFailure = $null
  $disposalFailure = $null
  try {
    if (-not $process.Start()) {
      throw "${CaseName} failed to start $($StartInfo.FileName)"
    }
    $processId = [string]$process.Id
    Write-Host (
      'CASE START name={0} utc={1} pid={2} timeoutMs={3}' -f
        $CaseName,
        $startedUtc.ToString('o'),
        $processId,
        $TimeoutMilliseconds
    )
    $startMarkerWritten = $true
    if ($CaptureOutput) {
      $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
      $standardErrorTask = $process.StandardError.ReadToEndAsync()
    }
    if (-not $process.WaitForExit($TimeoutMilliseconds)) {
      $outcome = 'timed-out'
      $termination = Stop-CaseOwnedProcessTree -Process $process -CaseName $CaseName
      $drainStatus = 'not-captured'
      if ($CaptureOutput) {
        $drain = Receive-RedirectedProcessOutput `
          -StandardOutputTask $standardOutputTask `
          -StandardErrorTask $standardErrorTask
        $drainStatus = if ($drain.Completed) { 'completed' } else { $drain.Failure }
        $standardOutput = $drain.StandardOutput
        $standardError = $drain.StandardError
      }
      try {
        if ($process.HasExited) {
          $exitCode = [string]$process.ExitCode
        }
      } catch {
        $exitCode = 'unavailable'
      }
      $capturedOutputDetail = Get-CapturedProcessOutputFailureDetail `
        -CaptureOutput:$CaptureOutput `
        -StandardOutput $standardOutput `
        -StandardError $standardError
      throw (
        "${CaseName} timed out after ${TimeoutMilliseconds}ms (pid=${processId}; " +
        "termination=${termination}; outputDrain=${drainStatus})${capturedOutputDetail}."
      )
    }

    $exitCode = [string]$process.ExitCode
    if ($CaptureOutput) {
      $drain = Receive-RedirectedProcessOutput `
        -StandardOutputTask $standardOutputTask `
        -StandardErrorTask $standardErrorTask
      $standardOutput = $drain.StandardOutput
      $standardError = $drain.StandardError
      if (-not $drain.Completed) {
        $outcome = 'output-drain-failed'
        $capturedOutputDetail = Get-CapturedProcessOutputFailureDetail `
          -CaptureOutput:$CaptureOutput `
          -StandardOutput $standardOutput `
          -StandardError $standardError
        throw "${CaseName} $($drain.Failure) (pid=${processId})${capturedOutputDetail}."
      }
    }
    $unexpectedExitMessage = if (
      $ExpectedExit -eq 'Zero' -and $process.ExitCode -ne 0
    ) {
      "${CaseName} failed with exit code $($process.ExitCode)"
    } elseif ($ExpectedExit -eq 'NonZero' -and $process.ExitCode -eq 0) {
      "${CaseName} unexpectedly succeeded"
    } else {
      $null
    }
    if ($null -ne $unexpectedExitMessage) {
      $outcome = 'unexpected-exit'
      $capturedOutputDetail = Get-CapturedProcessOutputFailureDetail `
        -CaptureOutput:$CaptureOutput `
        -StandardOutput $standardOutput `
        -StandardError $standardError
      throw "${unexpectedExitMessage}${capturedOutputDetail}"
    }
    $outcome = 'completed'
    $result = [pscustomobject]@{
      ExitCode = $process.ExitCode
      StandardOutput = $standardOutput
      StandardError = $standardError
    }
  } catch {
    $operationFailure = $_
  } finally {
    $stopwatch.Stop()
    if (-not $startMarkerWritten) {
      Write-Host (
        'CASE START name={0} utc={1} pid={2} timeoutMs={3}' -f
          $CaseName,
          $startedUtc.ToString('o'),
          $processId,
          $TimeoutMilliseconds
      )
    }
    if ($processId -ne 'not-started' -and $exitCode -eq 'unavailable') {
      try {
        if ($process.HasExited) {
          $exitCode = [string]$process.ExitCode
        }
      } catch {
        $exitCode = 'unavailable'
      }
    }
    try {
      $process.Dispose()
    } catch {
      $disposalFailure = $_
      if ($null -eq $operationFailure) {
        $outcome = 'dispose-failed'
      }
    }
    Write-Host (
      'CASE END name={0} utc={1} pid={2} elapsedMs={3} exitCode={4} outcome={5}' -f
        $CaseName,
        ([DateTime]::UtcNow).ToString('o'),
        $processId,
        $stopwatch.ElapsedMilliseconds,
        $exitCode,
        $outcome
    )
  }
  if ($null -ne $operationFailure) {
    if ($null -ne $disposalFailure) {
      try {
        Write-Warning "${CaseName} process disposal also failed: $($disposalFailure.Exception.Message)"
      } catch {
        # Diagnostics are best effort and must not replace the process failure.
      }
    }
    throw $operationFailure
  }
  if ($null -ne $disposalFailure) {
    throw "${CaseName} process disposal failed: $($disposalFailure.Exception.Message)"
  }
  return $result
}

function Get-Registry64Value {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SubKey,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$ValueName
  )

  $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::LocalMachine,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  $key = $null
  try {
    $key = $baseKey.OpenSubKey($SubKey, $false)
    if ($null -eq $key) {
      throw "The native 64-bit registry key is missing: HKLM\$SubKey"
    }
    $value = $key.GetValue(
      $ValueName,
      $null,
      [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
    )
    if ($null -eq $value) {
      throw "The native 64-bit registry value is missing: HKLM\$SubKey [$ValueName]"
    }
    return $value
  } finally {
    if ($null -ne $key) {
      $key.Dispose()
    }
    $baseKey.Dispose()
  }
}

function Test-Registry64Key {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SubKey
  )

  $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::LocalMachine,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  $key = $null
  try {
    $key = $baseKey.OpenSubKey($SubKey, $false)
    return $null -ne $key
  } finally {
    if ($null -ne $key) {
      $key.Dispose()
    }
    $baseKey.Dispose()
  }
}

function Get-InstallerShortcutPaths {
  $commonPrograms = [Environment]::GetFolderPath(
    [Environment+SpecialFolder]::CommonPrograms
  )
  $commonDesktop = [Environment]::GetFolderPath(
    [Environment+SpecialFolder]::CommonDesktopDirectory
  )
  return @(
    (Join-Path $commonPrograms 'FyAgent\FyAgent.lnk'),
    (Join-Path $commonDesktop 'FyAgent.lnk')
  )
}

function Get-PeMachine {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $bytes = [IO.File]::ReadAllBytes($resolvedPath)
  if ($bytes.Length -lt 0x40 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) {
    throw "Installed executable is not a PE image: $resolvedPath"
  }
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
  if (
    $peOffset -lt 0x40 -or
    $peOffset + 6 -gt $bytes.Length -or
    $bytes[$peOffset] -ne 0x50 -or
    $bytes[$peOffset + 1] -ne 0x45 -or
    $bytes[$peOffset + 2] -ne 0 -or
    $bytes[$peOffset + 3] -ne 0
  ) {
    throw "Installed executable has no valid PE header: $resolvedPath"
  }
  return [BitConverter]::ToUInt16($bytes, $peOffset + 4)
}

function Invoke-NsisProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [bool]$ShouldSucceed,

    [Parameter(Mandatory = $true)]
    [string]$CaseName,

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,

    [ValidateSet('Install', 'Uninstall')]
    [string]$ArgumentKind = 'Install',

    [ValidateRange(1, 2147483647)]
    [int]$TimeoutMilliseconds = $nsisProcessTimeoutMilliseconds
  )

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $hasValidInstallArguments =
    $ArgumentKind -ceq 'Install' -and
    ($Arguments.Count -eq 1 -or $Arguments.Count -eq 2) -and
    $Arguments[0] -ceq '/S' -and
    (
      $Arguments.Count -eq 1 -or
      (
        $Arguments[1].Length -gt 3 -and
        $Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)
      )
    )
  $hasValidUninstallArguments =
    $ArgumentKind -ceq 'Uninstall' -and
    $Arguments.Count -eq 2 -and
    $Arguments[0] -ceq '/S' -and
    $Arguments[1].Length -gt 3 -and
    $Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)
  if (-not $hasValidInstallArguments -and -not $hasValidUninstallArguments) {
    throw "${CaseName} has an invalid NSIS argument shape."
  }
  foreach ($argument in $Arguments) {
    if ($argument.Contains([char]34)) {
      throw "${CaseName} contains a forbidden NSIS command-line character."
    }
    foreach ($character in $argument.ToCharArray()) {
      if ([char]::IsControl($character)) {
        throw "${CaseName} contains a forbidden NSIS command-line character."
      }
    }
  }
  # NSIS requires final /D= and _?= values to remain unquoted even when their
  # paths have spaces. ProcessStartInfo.ArgumentList would quote them, so this
  # validated NSIS-only command line intentionally uses the raw Arguments
  # property.
  $startInfo.Arguments = [string]::Join(' ', $Arguments)
  Write-Host "CASE ${CaseName}: $FilePath $($Arguments -join ' ')"
  $expectedExit = if ($ShouldSucceed) { 'Zero' } else { 'NonZero' }
  $result = Invoke-BoundedCaseProcess `
    -StartInfo $startInfo `
    -CaseName $CaseName `
    -TimeoutMilliseconds $TimeoutMilliseconds `
    -ExpectedExit $expectedExit
  return $result.ExitCode
}

function Invoke-NsisUninstall {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,

    [Parameter(Mandatory = $true)]
    [string]$CaseName,

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,

    [ValidateRange(1, 2147483647)]
    [int]$TimeoutMilliseconds = $nsisProcessTimeoutMilliseconds
  )

  $sourceUninstaller = [IO.Path]::GetFullPath(
    (Join-Path $InstallDirectory 'uninstall.exe')
  )
  if (-not (Test-Path -LiteralPath $sourceUninstaller -PathType Leaf)) {
    throw "NSIS uninstaller is missing: $sourceUninstaller"
  }

  $resolvedWorkingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
  $copyRoot = [IO.Path]::GetFullPath(
    (Join-Path $resolvedWorkingDirectory (
      'nsis-uninstall-' + [Guid]::NewGuid().ToString('N')
    ))
  )
  $workingDirectoryInfo = [IO.DirectoryInfo]::new($resolvedWorkingDirectory)
  $copyRootInfo = [IO.DirectoryInfo]::new($copyRoot)
  if (-not [string]::Equals(
    $copyRootInfo.Parent.FullName,
    $workingDirectoryInfo.FullName,
    [StringComparison]::OrdinalIgnoreCase
  )) {
    throw "NSIS uninstaller copy root escaped its case working directory: $copyRoot"
  }
  $copiedUninstaller = [IO.Path]::GetFullPath(
    (Join-Path $copyRoot 'uninstall.exe')
  )
  if (-not [string]::Equals(
    [IO.Path]::GetDirectoryName($copiedUninstaller),
    $copyRootInfo.FullName,
    [StringComparison]::OrdinalIgnoreCase
  )) {
    throw "NSIS uninstaller copy escaped its unique case root: $copiedUninstaller"
  }

  $operationFailure = $null
  $copyCleanupFailure = $null
  try {
    New-Item -ItemType Directory -Path $copyRoot | Out-Null
    [IO.File]::Copy($sourceUninstaller, $copiedUninstaller, $false)

    # A normal uninstall.exe /S launch exits after spawning its self-copied
    # worker. Launching a case-local copy with final raw _?= disables that
    # handoff, so the bounded direct Process owns the actual uninstall and its
    # exit code.
    [void](Invoke-NsisProcess `
      -FilePath $copiedUninstaller `
      -Arguments @('/S', "_?=$InstallDirectory") `
      -ShouldSucceed $true `
      -CaseName $CaseName `
      -WorkingDirectory $WorkingDirectory `
      -ArgumentKind Uninstall `
      -TimeoutMilliseconds $TimeoutMilliseconds)
  } catch {
    $operationFailure = $_
  } finally {
    try {
      if (Test-Path -LiteralPath $copiedUninstaller) {
        Remove-Item -LiteralPath $copiedUninstaller -Force -ErrorAction Stop
      }
      if (Test-Path -LiteralPath $copyRoot) {
        # This deliberately has no -Recurse: any unexpected child turns a
        # successful uninstall into a failed case instead of widening cleanup.
        Remove-Item -LiteralPath $copyRoot -Force -ErrorAction Stop
      }
    } catch {
      $copyCleanupFailure = $_
    }
  }

  if ($null -ne $operationFailure) {
    if ($null -ne $copyCleanupFailure) {
      try {
        Write-Warning "${CaseName} case-local uninstaller cleanup also failed: $($copyCleanupFailure.Exception.Message)"
      } catch {
        # Diagnostics are best effort and must not replace the uninstall failure.
      }
    }
    throw $operationFailure
  }
  if ($null -ne $copyCleanupFailure) {
    throw "${CaseName} case-local uninstaller cleanup failed: $($copyCleanupFailure.Exception.Message)"
  }
}

function Invoke-BestEffortNsisUninstall {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,

    [Parameter(Mandatory = $true)]
    [string]$CaseName,

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  try {
    $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
      return
    }
    Write-Warning "Cleanup ${CaseName}: invoking a case-local uninstaller copy"
    Invoke-NsisUninstall `
      -InstallDirectory $InstallDirectory `
      -CaseName "cleanup-${CaseName}" `
      -WorkingDirectory $WorkingDirectory `
      -TimeoutMilliseconds $cleanupNsisTimeoutMilliseconds
  } catch {
    Write-Warning "Cleanup ${CaseName} failed: $($_.Exception.Message)"
  }
}

function Get-OwnerDaclSddl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Runtime bootstrap must not be a reparse point: $Path"
  }
  $sections =
    [Security.AccessControl.AccessControlSections]::Owner -bor
    [Security.AccessControl.AccessControlSections]::Access
  return (Get-Acl -LiteralPath $Path).GetSecurityDescriptorSddlForm($sections)
}

function Assert-StrictRuntimeRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $sddl = Get-OwnerDaclSddl -Path $Path
  $allowed = @(
    'O:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)',
    'O:SYD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)',
    'O:SYD:P(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)',
    'O:SYD:PAI(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)',
    'O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)',
    'O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)',
    'O:BAD:P(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)',
    'O:BAD:PAI(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)'
  )
  if ($allowed -cnotcontains $sddl) {
    throw "Runtime bootstrap SDDL is outside the Rust allowlist: ${Path}: ${sddl}"
  }
}

function Assert-InstalledState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedArchitecture,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion
  )

  $installedExe = Join-Path $InstallDirectory 'fyagent.exe'
  $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'
  if (-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
    throw "Installed FyAgent executable is missing: $installedExe"
  }
  if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
    throw "NSIS uninstaller is missing: $uninstaller"
  }

  [uint16]$expectedMachine = if ($ExpectedArchitecture -eq 'arm64') { 0xAA64 } else { 0x8664 }
  [uint16]$machine = Get-PeMachine -Path $installedExe
  if ($machine -ne $expectedMachine) {
    throw "Installed fyagent.exe PE Machine is 0x$($machine.ToString('X4')); expected 0x$($expectedMachine.ToString('X4'))"
  }

  $installLocation = Get-Registry64Value `
    -SubKey $uninstallRegistrySubKey `
    -ValueName 'InstallLocation'
  if ([string]$installLocation -ne "`"${InstallDirectory}`"") {
    throw "NSIS InstallLocation does not match $InstallDirectory"
  }
  $displayVersion = Get-Registry64Value `
    -SubKey $uninstallRegistrySubKey `
    -ValueName 'DisplayVersion'
  if ([string]$displayVersion -cne $ExpectedVersion) {
    throw "NSIS DisplayVersion is '$displayVersion'; expected '$ExpectedVersion'."
  }

  $locationMarker = Get-Registry64Value `
    -SubKey $installLocationRegistrySubKey `
    -ValueName ''
  if ([string]$locationMarker -cne $InstallDirectory) {
    throw "NSIS MANUPRODUCTKEY does not match $InstallDirectory"
  }

  $protocolCommand = Get-Registry64Value `
    -SubKey "$protocolRegistrySubKey\shell\open\command" `
    -ValueName ''
  if (-not ([string]$protocolCommand).Contains($installedExe, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The all-users fyagent:// protocol does not target the installed executable.'
  }

  foreach ($shortcut in @(Get-InstallerShortcutPaths)) {
    if (-not (Test-Path -LiteralPath $shortcut -PathType Leaf)) {
      throw "Expected all-users shortcut is missing: $shortcut"
    }
  }

  $programDataParent = Join-Path $env:ProgramData 'FyAgent'
  $programDataRuntime = Join-Path $programDataParent 'runtime'
  Assert-StrictRuntimeRoot -Path $programDataParent
  Assert-StrictRuntimeRoot -Path $programDataRuntime
}

function Assert-UninstalledState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,

    [Parameter(Mandatory = $true)]
    [string[]]$UserSentinels
  )

  $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'
  if (Test-Path -LiteralPath (Join-Path $InstallDirectory 'fyagent.exe')) {
    throw "Installer-owned executable survived uninstall: $InstallDirectory"
  }
  if (Test-Path -LiteralPath $uninstaller) {
    throw "NSIS uninstaller survived uninstall: $uninstaller"
  }
  if (Test-Path -LiteralPath $InstallDirectory) {
    throw "Fresh install directory survived uninstall: $InstallDirectory"
  }
  if (Test-Registry64Key -SubKey $uninstallRegistrySubKey) {
    throw 'Installer-owned uninstall registration survived uninstall.'
  }
  if (Test-Registry64Key -SubKey $protocolRegistrySubKey) {
    throw 'Installer-owned fyagent:// registration survived uninstall.'
  }
  if (Test-Registry64Key -SubKey $installLocationRegistrySubKey) {
    throw 'Installer-owned MANUPRODUCTKEY survived uninstall.'
  }
  foreach ($shortcut in @(Get-InstallerShortcutPaths)) {
    if (Test-Path -LiteralPath $shortcut) {
      throw "Installer-owned all-users shortcut survived uninstall: $shortcut"
    }
  }
  if (Test-Path -LiteralPath (Join-Path $env:ProgramData 'FyAgent')) {
    throw 'Installer/runtime-owned ProgramData parent survived uninstall.'
  }
  foreach ($sentinel in $UserSentinels) {
    if (-not (Test-Path -LiteralPath $sentinel -PathType Leaf)) {
      throw "User data sentinel was deleted by uninstall: $sentinel"
    }
  }
}

function New-PreexistingRuntimeAclDrift {
  $parent = Join-Path $env:ProgramData 'FyAgent'
  $runtime = Join-Path $parent 'runtime'
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  foreach ($path in @($parent, $runtime)) {
    $acl = Get-Acl -LiteralPath $path
    $users = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
      $users,
      [Security.AccessControl.FileSystemRights]::FullControl,
      [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $path -AclObject $acl
  }

  $sentinel = Join-Path $runtime 'unsafe-preimage.sentinel'
  [IO.File]::WriteAllText($sentinel, 'unsafe-preimage-must-not-change')
  return [pscustomobject]@{
    Parent = $parent
    Runtime = $runtime
    ParentSddl = Get-OwnerDaclSddl -Path $parent
    RuntimeSddl = Get-OwnerDaclSddl -Path $runtime
    Sentinel = $sentinel
    SentinelBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($sentinel))
  }
}

function Assert-PreexistingRuntimeAclDriftUnchanged {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Evidence
  )

  if ((Get-OwnerDaclSddl -Path $Evidence.Parent) -cne $Evidence.ParentSddl) {
    throw 'Rejected ProgramData parent ACL was modified by the installer.'
  }
  if ((Get-OwnerDaclSddl -Path $Evidence.Runtime) -cne $Evidence.RuntimeSddl) {
    throw 'Rejected ProgramData runtime ACL was modified by the installer.'
  }
  $actualBytes = [Convert]::ToBase64String(
    [IO.File]::ReadAllBytes([string]$Evidence.Sentinel)
  )
  if ($actualBytes -cne $Evidence.SentinelBytes) {
    throw 'Rejected ProgramData preimage contents were modified by the installer.'
  }
}

function New-StrictRuntimePreimage {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('TrustedLegacy', 'UnknownContent', 'PinnedNoDeleteShare')]
    [string]$Kind,

    [Parameter(Mandatory = $true)]
    [string]$Identifier
  )

  $parent = Join-Path $env:ProgramData 'FyAgent'
  $runtime = Join-Path $parent 'runtime'
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  $security = [Security.AccessControl.DirectorySecurity]::new()
  $security.SetSecurityDescriptorSddlForm(
    'O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'
  )
  Set-Acl -LiteralPath $parent -AclObject $security
  Set-Acl -LiteralPath $runtime -AclObject $security
  Assert-StrictRuntimeRoot -Path $parent
  Assert-StrictRuntimeRoot -Path $runtime

  if ($Kind -eq 'TrustedLegacy') {
    [IO.File]::WriteAllText(
      (Join-Path $runtime "business-$Identifier.state"),
      'trusted-state'
    )
    [IO.File]::WriteAllText(
      (Join-Path $runtime "business-$Identifier.lock"),
      'trusted-lock'
    )
  } elseif ($Kind -eq 'UnknownContent') {
    [IO.File]::WriteAllText(
      (Join-Path $runtime "unknown-$Identifier.keep"),
      'unknown-content-must-survive-rejection'
    )
  }
  return $runtime
}

function Remove-TestOwnedRuntimePreimage {
  $parent = Join-Path $env:ProgramData 'FyAgent'
  if (Test-Path -LiteralPath $parent) {
    Remove-Item -LiteralPath $parent -Recurse -Force
  }
}

function Assert-RejectedInstallLeftNoMachineWrites {
  param(
    [string]$CandidateInstallDirectory,

    [switch]$AllowTestOwnedProgramData
  )

  if (
    -not [string]::IsNullOrWhiteSpace($CandidateInstallDirectory) -and
    (Test-Path -LiteralPath $CandidateInstallDirectory)
  ) {
    throw "Rejected install created its final install directory: $CandidateInstallDirectory"
  }
  if (
    -not $AllowTestOwnedProgramData -and
    (Test-Path -LiteralPath (Join-Path $env:ProgramData 'FyAgent'))
  ) {
    throw 'Rejected install wrote ProgramData before its final path was admitted.'
  }
  foreach ($subKey in @(
    $uninstallRegistrySubKey,
    $protocolRegistrySubKey,
    $installLocationRegistrySubKey
  )) {
    if (Test-Registry64Key -SubKey $subKey) {
      throw "Rejected install wrote HKLM registry state: $subKey"
    }
  }
  foreach ($shortcut in @(Get-InstallerShortcutPaths)) {
    if (Test-Path -LiteralPath $shortcut) {
      throw "Rejected install wrote an all-users shortcut: $shortcut"
    }
  }
}

if (-not ('FyAgent.NsisLifecycle.NativeDirectoryHandle' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace FyAgent.NsisLifecycle {
  public static class NativeDirectoryHandle {
    private const uint FILE_READ_ATTRIBUTES = 0x80;
    private const uint FILE_SHARE_READ = 0x1;
    private const uint FILE_SHARE_WRITE = 0x2;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileW(
      string path,
      uint desiredAccess,
      uint shareMode,
      IntPtr securityAttributes,
      uint creationDisposition,
      uint flagsAndAttributes,
      IntPtr templateFile
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);

    public static IntPtr OpenWithoutDeleteShare(string path) {
      return CreateFileW(
        path,
        FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        IntPtr.Zero,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS,
        IntPtr.Zero
      );
    }
  }
}
'@
}

if (-not ('FyAgent.NsisLifecycle.NativeNetworkDrive' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace FyAgent.NsisLifecycle {
  public static class NativeNetworkDrive {
    public const uint DRIVE_NO_ROOT_DIR = 1;
    public const uint DRIVE_REMOTE = 4;
    private const uint RESOURCETYPE_DISK = 1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class NetworkResource {
      public uint Scope;
      public uint Type;
      public uint DisplayType;
      public uint Usage;

      [MarshalAs(UnmanagedType.LPWStr)]
      public string LocalName;

      [MarshalAs(UnmanagedType.LPWStr)]
      public string RemoteName;

      [MarshalAs(UnmanagedType.LPWStr)]
      public string Comment;

      [MarshalAs(UnmanagedType.LPWStr)]
      public string Provider;
    }

    [DllImport("mpr.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int WNetAddConnection2W(
      [In] NetworkResource networkResource,
      string password,
      string username,
      uint flags
    );

    [DllImport("mpr.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int WNetCancelConnection2W(
      string name,
      uint flags,
      [MarshalAs(UnmanagedType.Bool)] bool force
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern uint GetDriveTypeW(string rootPathName);

    public static int Connect(string localName, string remoteName) {
      NetworkResource resource = new NetworkResource {
        Type = RESOURCETYPE_DISK,
        LocalName = localName,
        RemoteName = remoteName
      };
      return WNetAddConnection2W(resource, null, null, 0);
    }

    public static int Disconnect(string localName) {
      return WNetCancelConnection2W(localName, 0, false);
    }
  }
}
'@
}

function Invoke-RequiredUnsupportedDriveAcceptance {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,

    [Parameter(Mandatory = $true)]
    [string]$Identifier
  )

  $smbModuleManifest = Join-Path $env:SystemRoot `
    'System32\WindowsPowerShell\v1.0\Modules\SmbShare\SmbShare.psd1'
  if (-not (Test-Path -LiteralPath $smbModuleManifest -PathType Leaf)) {
    throw "The system SmbShare module is unavailable: $smbModuleManifest"
  }
  Microsoft.PowerShell.Core\Import-Module `
    -Name $smbModuleManifest `
    -Force `
    -ErrorAction Stop

  $shareName = "FyAgentNsis-$Identifier"
  $shareRoot = Join-Path $WorkingDirectory 'unsupported-network-share'
  $remoteName = "\\$env:COMPUTERNAME\$shareName"
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $driveLetter = $null
  $driveLocalName = $null
  $driveRoot = $null
  $markerPath = $null
  $markerBackingPath = $null
  $reparseLink = $null
  $shareCreated = $false
  $driveConnected = $false
  $caseCount = 0
  $operationFailure = $null
  $cleanupFailures = [Collections.Generic.List[string]]::new()

  try {
    New-Item -ItemType Directory -Path $shareRoot | Out-Null
    $existingShare = SmbShare\Get-SmbShare `
      -Name $shareName `
      -ErrorAction SilentlyContinue
    if ($null -ne $existingShare) {
      throw "The unique unsupported-drive SMB share already exists: $shareName"
    }
    $createdShare = SmbShare\New-SmbShare `
      -Name $shareName `
      -Path $shareRoot `
      -FullAccess $currentIdentity `
      -Temporary `
      -ErrorAction Stop
    $shareCreated = $true
    if (
      [string]$createdShare.Name -cne $shareName -or
      [IO.Path]::GetFullPath([string]$createdShare.Path) -cne
        [IO.Path]::GetFullPath($shareRoot)
    ) {
      throw 'The created unsupported-drive SMB share identity drifted.'
    }

    foreach ($codePoint in 90..68) {
      $candidateLetter = [char]$codePoint
      $candidateRoot = '{0}:\' -f $candidateLetter
      $candidateType = [FyAgent.NsisLifecycle.NativeNetworkDrive]::GetDriveTypeW(
        $candidateRoot
      )
      if (
        $candidateType -eq
          [FyAgent.NsisLifecycle.NativeNetworkDrive]::DRIVE_NO_ROOT_DIR
      ) {
        $driveLetter = [string]$candidateLetter
        break
      }
    }
    if ([string]::IsNullOrWhiteSpace($driveLetter)) {
      throw 'No unused drive letter is available for the required unsupported-drive fixture.'
    }
    $driveLocalName = "${driveLetter}:"
    $driveRoot = "${driveLocalName}\"
    $connectResult = [FyAgent.NsisLifecycle.NativeNetworkDrive]::Connect(
      $driveLocalName,
      $remoteName
    )
    if ($connectResult -ne 0) {
      throw "Could not map the required SMB fixture to ${driveLocalName}: WNetAddConnection2W=$connectResult"
    }
    $driveConnected = $true
    $actualDriveType = [FyAgent.NsisLifecycle.NativeNetworkDrive]::GetDriveTypeW(
      $driveRoot
    )
    if (
      $actualDriveType -ne
        [FyAgent.NsisLifecycle.NativeNetworkDrive]::DRIVE_REMOTE
    ) {
      throw "The controlled unsupported drive is type $actualDriveType instead of DRIVE_REMOTE."
    }

    $markerName = "mapped-drive-$Identifier.marker"
    $markerPath = Join-Path $driveRoot $markerName
    $markerBackingPath = Join-Path $shareRoot $markerName
    $markerValue = "fyagent-unsupported-drive-$Identifier"
    [IO.File]::WriteAllText($markerPath, $markerValue)
    if (
      -not (Test-Path -LiteralPath $markerBackingPath -PathType Leaf) -or
      [IO.File]::ReadAllText($markerBackingPath) -cne $markerValue
    ) {
      throw 'The mapped unsupported drive did not round-trip through its SMB backing path.'
    }

    # CASE: unsupported-drive-network-negative
    $unsupportedPath = Join-Path $driveRoot "FyAgent-$Identifier"
    [void](Invoke-NsisProcess -FilePath $InstallerPath -Arguments @('/S', "/D=$unsupportedPath") -ShouldSucceed $false -CaseName 'unsupported-drive-network-negative' -WorkingDirectory $WorkingDirectory)
    Assert-RejectedInstallLeftNoMachineWrites `
      -CandidateInstallDirectory $unsupportedPath
    $caseCount += 1

    # CASE: reparse-unsupported-drive-network-negative
    $reparseTarget = Join-Path $driveRoot 'reparse-target'
    New-Item -ItemType Directory -Path $reparseTarget | Out-Null
    $reparseLink = Join-Path $WorkingDirectory 'unsupported-network-reparse'
    [void][IO.Directory]::CreateSymbolicLink($reparseLink, $reparseTarget)
    $reparseItem = Get-Item -LiteralPath $reparseLink -Force
    if (
      ($reparseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0
    ) {
      throw 'The controlled unsupported-drive reparse fixture is not a reparse point.'
    }
    $reparseInstallPath = Join-Path $reparseLink "FyAgent-$Identifier"
    [void](Invoke-NsisProcess -FilePath $InstallerPath -Arguments @('/S', "/D=$reparseInstallPath") -ShouldSucceed $false -CaseName 'reparse-unsupported-drive-network-negative' -WorkingDirectory $WorkingDirectory)
    Assert-RejectedInstallLeftNoMachineWrites `
      -CandidateInstallDirectory $reparseInstallPath
    $caseCount += 1
  } catch {
    $operationFailure = $_
  } finally {
    if (
      -not [string]::IsNullOrWhiteSpace($markerPath) -and
      (Test-Path -LiteralPath $markerPath -PathType Leaf)
    ) {
      try {
        [IO.File]::Delete($markerPath)
      } catch {
        $cleanupFailures.Add(
          "Mapped-drive marker cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if (
      -not [string]::IsNullOrWhiteSpace($markerBackingPath) -and
      (Test-Path -LiteralPath $markerBackingPath)
    ) {
      $cleanupFailures.Add(
        "Mapped-drive marker survived cleanup: $markerBackingPath"
      )
    }
    if (
      -not [string]::IsNullOrWhiteSpace($reparseLink) -and
      (Test-Path -LiteralPath $reparseLink)
    ) {
      try {
        [IO.Directory]::Delete($reparseLink)
      } catch {
        $cleanupFailures.Add(
          "Unsupported-drive reparse cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if ($driveConnected) {
      try {
        $disconnectResult = [FyAgent.NsisLifecycle.NativeNetworkDrive]::Disconnect(
          $driveLocalName
        )
        if ($disconnectResult -ne 0) {
          throw "WNetCancelConnection2W=$disconnectResult"
        }
        $remainingDriveType = [FyAgent.NsisLifecycle.NativeNetworkDrive]::GetDriveTypeW(
          $driveRoot
        )
        if (
          $remainingDriveType -eq
            [FyAgent.NsisLifecycle.NativeNetworkDrive]::DRIVE_REMOTE
        ) {
          throw 'The unique mapped drive remains connected.'
        }
      } catch {
        $cleanupFailures.Add(
          "Unsupported-drive mapping cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if ($shareCreated) {
      try {
        SmbShare\Remove-SmbShare `
          -Name $shareName `
          -Force `
          -Confirm:$false `
          -ErrorAction Stop
        if (
          $null -ne (
            SmbShare\Get-SmbShare `
              -Name $shareName `
              -ErrorAction SilentlyContinue
          )
        ) {
          throw 'The unique SMB share remains registered.'
        }
      } catch {
        $cleanupFailures.Add(
          "Unsupported-drive SMB share cleanup failed: $($_.Exception.Message)"
        )
      }
    }
  }

  if ($cleanupFailures.Count -ne 0) {
    if ($null -ne $operationFailure) {
      $cleanupFailures.Insert(
        0,
        "Unsupported-drive operation failed before cleanup: $($operationFailure.Exception.Message)"
      )
    }
    throw [string]::Join(' | ', $cleanupFailures.ToArray())
  }
  if ($null -ne $operationFailure) {
    throw $operationFailure
  }
  if ($caseCount -ne 2) {
    throw "Required unsupported-drive case count is $caseCount instead of 2."
  }
  return $caseCount
}

function Invoke-WebView2SignatureVerification {
  param(
    [Parameter(Mandatory = $true)]
    [string]$HelperPath,

    [Parameter(Mandatory = $true)]
    [string]$CandidatePath,

    [Parameter(Mandatory = $true)]
    [string]$MaliciousModuleRoot,

    [Parameter(Mandatory = $true)]
    [string]$MarkerPath,

    [Parameter(Mandatory = $true)]
    [bool]$ShouldSucceed,

    [Parameter(Mandatory = $true)]
    [string]$CaseName
  )

  $windowsPowerShell = Join-Path $env:SystemRoot `
    'System32\WindowsPowerShell\v1.0\powershell.exe'
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $windowsPowerShell
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $HelperPath,
    '-Mode',
    'VerifyOnly',
    '-VerifyPath',
    $CandidatePath
  )) {
    [void]$startInfo.ArgumentList.Add($argument)
  }
  $startInfo.Environment['PSModulePath'] = $MaliciousModuleRoot
  $startInfo.Environment['FYAGENT_MALICIOUS_MODULE_MARKER'] = $MarkerPath
  Write-Host "CASE ${CaseName}: trusted Windows PowerShell VerifyOnly"
  $expectedExit = if ($ShouldSucceed) { 'Zero' } else { 'NonZero' }
  $result = Invoke-BoundedCaseProcess `
    -StartInfo $startInfo `
    -CaseName $CaseName `
    -TimeoutMilliseconds $signatureVerifierTimeoutMilliseconds `
    -CaptureOutput `
    -ExpectedExit $expectedExit
  if (-not [string]::IsNullOrWhiteSpace($result.StandardOutput)) {
    Write-Host $result.StandardOutput.TrimEnd()
  }
  if (-not [string]::IsNullOrWhiteSpace($result.StandardError)) {
    Write-Host $result.StandardError.TrimEnd()
  }
  if (Test-Path -LiteralPath $MarkerPath) {
    throw "${CaseName} imported a user-controlled PowerShell module."
  }
}

function Save-OfficialWebView2BootstrapperFixture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
  )

  [void][Reflection.Assembly]::Load(
    'System.Net.Http, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
  )
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $true
  $handler.MaxAutomaticRedirections = 5
  $client = [Net.Http.HttpClient]::new($handler, $true)
  $client.Timeout = [TimeSpan]::FromMinutes(2)
  $cancellation = [Threading.CancellationTokenSource]::new(
    [TimeSpan]::FromMinutes(2)
  )
  $response = $null
  $source = $null
  $destination = $null
  try {
    $response = $client.GetAsync(
      'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
      [Net.Http.HttpCompletionOption]::ResponseHeadersRead,
      $cancellation.Token
    ).GetAwaiter().GetResult()
    [void]$response.EnsureSuccessStatusCode()
    if (
      $null -eq $response.RequestMessage -or
      $null -eq $response.RequestMessage.RequestUri -or
      $response.RequestMessage.RequestUri.Scheme -cne [Uri]::UriSchemeHttps
    ) {
      throw 'Official WebView2 lifecycle fixture redirected outside HTTPS.'
    }
    $contentLength = $response.Content.Headers.ContentLength
    if ($null -ne $contentLength -and ($contentLength -le 0 -or $contentLength -gt 64MB)) {
      throw 'Official WebView2 lifecycle fixture has an invalid Content-Length.'
    }
    $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $destination = [IO.FileStream]::new(
      $DestinationPath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None
    )
    $buffer = [byte[]]::new(65536)
    [long]$totalBytes = 0
    while ((
      $read = $source.ReadAsync(
        $buffer,
        0,
        $buffer.Length,
        $cancellation.Token
      ).GetAwaiter().GetResult()
    ) -gt 0) {
      $totalBytes += $read
      if ($totalBytes -gt 64MB) {
        throw 'Official WebView2 lifecycle fixture exceeded 64 MiB.'
      }
      $destination.Write($buffer, 0, $read)
    }
    if ($totalBytes -eq 0) {
      throw 'Official WebView2 lifecycle fixture was empty.'
    }
    $destination.Flush($true)
  } finally {
    if ($null -ne $destination) {
      $destination.Dispose()
    }
    if ($null -ne $source) {
      $source.Dispose()
    }
    if ($null -ne $response) {
      $response.Dispose()
    }
    $cancellation.Dispose()
    $client.Dispose()
  }
}

function Get-WindowsSdkSignTool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedArchitecture
  )

  $kitsBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $architectureCandidates = if ($ExpectedArchitecture -eq 'arm64') {
    @('arm64', 'x64')
  } else {
    @('x64')
  }
  $versions = @(
    Get-ChildItem -LiteralPath $kitsBin -Directory -ErrorAction SilentlyContinue |
      Sort-Object -Property Name -Descending
  )
  foreach ($version in $versions) {
    foreach ($architectureName in $architectureCandidates) {
      $candidate = Join-Path $version.FullName "$architectureName\signtool.exe"
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return $candidate
      }
    }
  }
  throw "Windows SDK signtool.exe is unavailable beneath $kitsBin"
}

function Invoke-NativeTool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$CaseName
  )

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) {
    [void]$startInfo.ArgumentList.Add($argument)
  }
  $result = Invoke-BoundedCaseProcess `
    -StartInfo $startInfo `
    -CaseName $CaseName `
    -TimeoutMilliseconds $nativeToolTimeoutMilliseconds `
    -CaptureOutput `
    -ExpectedExit Zero
  if (-not [string]::IsNullOrWhiteSpace($result.StandardOutput)) {
    Write-Host $result.StandardOutput.TrimEnd()
  }
  if (-not [string]::IsNullOrWhiteSpace($result.StandardError)) {
    Write-Host $result.StandardError.TrimEnd()
  }
}

function Invoke-FakeCurrentUserRootAttackFixture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$HelperPath,

    [Parameter(Mandatory = $true)]
    [string]$FixtureRoot,

    [Parameter(Mandatory = $true)]
    [string]$MaliciousModuleRoot,

    [Parameter(Mandatory = $true)]
    [string]$MarkerPath,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedArchitecture,

    [Parameter(Mandatory = $true)]
    [string]$Identifier
  )

  $rootKey = [Security.Cryptography.RSA]::Create(2048)
  $leafKey = [Security.Cryptography.RSA]::Create(2048)
  $rootCertificate = $null
  $rootPublic = $null
  $leafCertificate = $null
  $leafWithPrivateKey = $null
  $leafPublic = $null
  $rootStore = $null
  $publisherStore = $null
  $unsignedPe = $null
  $pfxPath = $null
  $operationFailure = $null
  $cleanupFailures = [Collections.Generic.List[string]]::new()
  try {
    $rootRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
      "CN=FyAgent CurrentUser Root $Identifier, O=Fixture Only",
      $rootKey,
      [Security.Cryptography.HashAlgorithmName]::SHA256,
      [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $rootRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new(
        $true,
        $false,
        0,
        $true
      )
    )
    $rootRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
        [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign,
        $true
      )
    )
    $rootRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new(
        $rootRequest.PublicKey,
        $false
      )
    )
    $notBefore = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    $notAfter = [DateTimeOffset]::UtcNow.AddDays(1)
    $rootCertificate = $rootRequest.CreateSelfSigned($notBefore, $notAfter)
    $rootPublic = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $rootCertificate.RawData
    )

    $leafRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
      "CN=Fake Microsoft WebView2 Signer $Identifier, O=Microsoft Corporation, L=Redmond, S=Washington, C=US",
      $leafKey,
      [Security.Cryptography.HashAlgorithmName]::SHA256,
      [Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $leafRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new(
        $false,
        $false,
        0,
        $true
      )
    )
    $leafRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
        [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
        $true
      )
    )
    $codeSigningOids = [Security.Cryptography.OidCollection]::new()
    [void]$codeSigningOids.Add(
      [Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3')
    )
    $leafRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
        $codeSigningOids,
        $true
      )
    )
    $leafRequest.CertificateExtensions.Add(
      [Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new(
        $leafRequest.PublicKey,
        $false
      )
    )
    $serial = [byte[]]::new(16)
    [Security.Cryptography.RandomNumberGenerator]::Fill($serial)
    $leafCertificate = $leafRequest.Create(
      $rootCertificate,
      $notBefore,
      $notAfter,
      $serial
    )
    $leafWithPrivateKey = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey(
      $leafCertificate,
      $leafKey
    )
    $leafPublic = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $leafCertificate.RawData
    )

    $rootStore = [Security.Cryptography.X509Certificates.X509Store]::new(
      [Security.Cryptography.X509Certificates.StoreName]::Root,
      [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    )
    $publisherStore = [Security.Cryptography.X509Certificates.X509Store]::new(
      [Security.Cryptography.X509Certificates.StoreName]::TrustedPublisher,
      [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    )
    $rootStore.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $publisherStore.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $rootStore.Add($rootPublic)
    $publisherStore.Add($leafPublic)

    $unsignedPe = Join-Path $FixtureRoot 'fake Microsoft signed fixture.exe'
    Add-Type `
      -TypeDefinition "namespace FyAgentFakeSigner$Identifier { public sealed class Fixture {} }" `
      -OutputAssembly $unsignedPe `
      -ErrorAction Stop
    $pfxPath = Join-Path $FixtureRoot 'fake-current-user-signer.pfx'
    $pfxPassword = [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllBytes(
      $pfxPath,
      $leafWithPrivateKey.Export(
        [Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
        $pfxPassword
      )
    )
    $signTool = Get-WindowsSdkSignTool -ExpectedArchitecture $ExpectedArchitecture
    Invoke-NativeTool `
      -FilePath $signTool `
      -Arguments @('sign', '/fd', 'SHA256', '/f', $pfxPath, '/p', $pfxPassword, $unsignedPe) `
      -CaseName 'fake-current-user-root-signing-fixture'

    $defaultSignature = Get-AuthenticodeSignature -LiteralPath $unsignedPe
    if ($defaultSignature.Status -ne [Management.Automation.SignatureStatus]::Valid) {
      throw "CurrentUser fake-root fixture did not become Valid: $($defaultSignature.Status)"
    }
    Invoke-WebView2SignatureVerification `
      -HelperPath $HelperPath `
      -CandidatePath $unsignedPe `
      -MaliciousModuleRoot $MaliciousModuleRoot `
      -MarkerPath $MarkerPath `
      -ShouldSucceed $false `
      -CaseName 'webview2-current-user-fake-root-negative'
  } catch {
    $operationFailure = $_
  } finally {
    if ($null -ne $publisherStore -and $null -ne $leafPublic) {
      try {
        $publisherStore.Remove($leafPublic)
        if (
          $publisherStore.Certificates.Find(
            [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $leafPublic.Thumbprint,
            $false
          ).Count -ne 0
        ) {
          $cleanupFailures.Add(
            'Fake TrustedPublisher leaf survived lifecycle cleanup.'
          )
        }
      } catch {
        $cleanupFailures.Add(
          "Fake TrustedPublisher cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if ($null -ne $rootStore -and $null -ne $rootPublic) {
      try {
        $rootStore.Remove($rootPublic)
        if (
          $rootStore.Certificates.Find(
            [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $rootPublic.Thumbprint,
            $false
          ).Count -ne 0
        ) {
          $cleanupFailures.Add(
            'Fake CurrentUser root survived lifecycle cleanup.'
          )
        }
      } catch {
        $cleanupFailures.Add(
          "Fake CurrentUser root cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if ($null -ne $publisherStore) {
      try {
        $publisherStore.Dispose()
      } catch {
        $cleanupFailures.Add(
          "TrustedPublisher store disposal failed: $($_.Exception.Message)"
        )
      }
    }
    if ($null -ne $rootStore) {
      try {
        $rootStore.Dispose()
      } catch {
        $cleanupFailures.Add(
          "CurrentUser Root store disposal failed: $($_.Exception.Message)"
        )
      }
    }
    foreach ($certificate in @(
      $leafPublic,
      $leafWithPrivateKey,
      $leafCertificate,
      $rootPublic,
      $rootCertificate
    )) {
      if ($null -ne $certificate) {
        try {
          $certificate.Dispose()
        } catch {
          $cleanupFailures.Add(
            "Fixture certificate disposal failed: $($_.Exception.Message)"
          )
        }
      }
    }
    foreach ($key in @($leafKey, $rootKey)) {
      try {
        $key.Dispose()
      } catch {
        $cleanupFailures.Add(
          "Fixture key disposal failed: $($_.Exception.Message)"
        )
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($pfxPath)) {
      try {
        [IO.File]::Delete($pfxPath)
      } catch {
        $cleanupFailures.Add("PFX cleanup failed: $($_.Exception.Message)")
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($unsignedPe)) {
      try {
        [IO.File]::Delete($unsignedPe)
      } catch {
        $cleanupFailures.Add(
          "Fake signed PE cleanup failed: $($_.Exception.Message)"
        )
      }
    }
    if ($cleanupFailures.Count -ne 0) {
      if ($null -ne $operationFailure) {
        $cleanupFailures.Insert(
          0,
          "Fixture operation failed before cleanup: $($operationFailure.Exception.Message)"
        )
      }
      throw [string]::Join(' | ', $cleanupFailures.ToArray())
    }
  }
  if ($null -ne $operationFailure) {
    throw $operationFailure
  }
}

$runId = [Guid]::NewGuid().ToString('N')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "fyagent-nsis-lifecycle-$runId"
$dedicatedHome = Join-Path $testRoot 'home'
$dedicatedHomeSentinel = Join-Path $dedicatedHome '.fyagent\preserve.sentinel'
$userProfileFyagentDirectory = Join-Path (
  [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
) '.fyagent'
$userProfileFyagentSentinel = Join-Path (
  $userProfileFyagentDirectory
) "nsis-$runId-preserve.sentinel"
$roamingSentinel = Join-Path (
  [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
) "com.fyagent.desktop\nsis-$runId-roaming.sentinel"
$localSentinel = Join-Path (
  [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
) "com.fyagent.desktop\nsis-$runId-local.sentinel"
$userSentinels = @(
  $dedicatedHomeSentinel,
  $userProfileFyagentSentinel,
  $roamingSentinel,
  $localSentinel
)
$defaultProgramFiles = [Environment]::GetEnvironmentVariable('ProgramW6432')
if ([string]::IsNullOrWhiteSpace($defaultProgramFiles)) {
  $defaultProgramFiles = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
}
$defaultInstallDir = Join-Path $defaultProgramFiles 'FyAgent'
$customCaseRoot = Join-Path $env:SystemDrive "FyAgent NSIS 生命周期-$runId"
$customInstallDir = Join-Path $customCaseRoot 'FyAgent'
$previousHome = $env:HOME
$cleanupAuthorized = $false
$sentinelParentsCreatedByTest = @{}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  foreach ($sentinel in $userSentinels) {
    $sentinelParent = Split-Path -Parent $sentinel
    $sentinelParentsCreatedByTest[$sentinelParent] = -not (
      Test-Path -LiteralPath $sentinelParent -PathType Container
    )
    New-Item -ItemType Directory -Path $sentinelParent -Force | Out-Null
    Set-Content -LiteralPath $sentinel -Value "preserve-$runId" -NoNewline
  }
  $env:HOME = $dedicatedHome

  if (Test-Path -LiteralPath $defaultInstallDir) {
    throw "Default install directory must be absent on the clean runner: $defaultInstallDir"
  }
  if (Test-Registry64Key -SubKey $uninstallRegistrySubKey) {
    throw 'A pre-existing FyAgent NSIS registration would invalidate the lifecycle.'
  }
  foreach ($subKey in @($protocolRegistrySubKey, $installLocationRegistrySubKey)) {
    if (Test-Registry64Key -SubKey $subKey) {
      throw "A pre-existing FyAgent machine registration would invalidate the lifecycle: $subKey"
    }
  }
  if (Test-Path -LiteralPath (Join-Path $env:ProgramData 'FyAgent')) {
    throw 'A pre-existing ProgramData\FyAgent directory would invalidate the lifecycle.'
  }
  if (Test-Path -LiteralPath $customCaseRoot) {
    throw "The unique custom install root already exists: $customCaseRoot"
  }
  foreach ($shortcut in @(Get-InstallerShortcutPaths)) {
    if (Test-Path -LiteralPath $shortcut) {
      throw "A pre-existing FyAgent shortcut would invalidate the lifecycle: $shortcut"
    }
  }
  $cleanupAuthorized = $true

  # CASE: webview2-signed-space-unicode-verify
  # CASE: webview2-malicious-psmodulepath-negative
  $webView2Helper = [IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..\src-tauri\nsis\install-webview2-bootstrapper.ps1')
  )
  if (-not (Test-Path -LiteralPath $webView2Helper -PathType Leaf)) {
    throw "Repo-owned WebView2 verifier is missing: $webView2Helper"
  }
  $webView2FixtureRoot = Join-Path $testRoot 'WebView2 验签 空格'
  $maliciousModuleRoot = Join-Path $webView2FixtureRoot 'malicious-modules'
  $maliciousMarker = Join-Path $webView2FixtureRoot 'malicious-module-loaded.marker'
  New-Item -ItemType Directory -Path $webView2FixtureRoot -Force | Out-Null
  foreach ($moduleName in @(
    'Microsoft.PowerShell.Management',
    'Microsoft.PowerShell.Security'
  )) {
    $moduleDirectory = Join-Path $maliciousModuleRoot $moduleName
    New-Item -ItemType Directory -Path $moduleDirectory -Force | Out-Null
    [IO.File]::WriteAllText(
      (Join-Path $moduleDirectory "$moduleName.psm1"),
      @'
[IO.File]::WriteAllText(
  $env:FYAGENT_MALICIOUS_MODULE_MARKER,
  'a user-controlled PowerShell module was imported'
)
throw 'malicious module import fixture'
'@
    )
  }
  $signedCandidate = Join-Path $webView2FixtureRoot 'Microsoft WebView2 正版.exe'
  Save-OfficialWebView2BootstrapperFixture -DestinationPath $signedCandidate
  Invoke-WebView2SignatureVerification `
    -HelperPath $webView2Helper `
    -CandidatePath $signedCandidate `
    -MaliciousModuleRoot $maliciousModuleRoot `
    -MarkerPath $maliciousMarker `
    -ShouldSucceed $true `
    -CaseName 'webview2-signed-space-unicode-verify'

  # CASE: webview2-valid-microsoft-wrong-pin-negative
  $wrongPinnedMicrosoftBinary = Join-Path $env:SystemRoot `
    'System32\WindowsPowerShell\v1.0\powershell.exe'
  Invoke-WebView2SignatureVerification `
    -HelperPath $webView2Helper `
    -CandidatePath $wrongPinnedMicrosoftBinary `
    -MaliciousModuleRoot $maliciousModuleRoot `
    -MarkerPath $maliciousMarker `
    -ShouldSucceed $false `
    -CaseName 'webview2-valid-microsoft-wrong-pin-negative'

  # CASE: webview2-current-user-fake-root-negative
  Invoke-FakeCurrentUserRootAttackFixture `
    -HelperPath $webView2Helper `
    -FixtureRoot $webView2FixtureRoot `
    -MaliciousModuleRoot $maliciousModuleRoot `
    -MarkerPath $maliciousMarker `
    -ExpectedArchitecture $Architecture `
    -Identifier $runId

  # CASE: webview2-tamper-negative
  $tamperedCandidate = Join-Path $webView2FixtureRoot 'Microsoft PowerShell tampered.exe'
  [IO.File]::Copy($signedCandidate, $tamperedCandidate, $false)
  $tamperedBytes = [IO.File]::ReadAllBytes($tamperedCandidate)
  if ($tamperedBytes.Length -le 0x1000) {
    throw 'The signed WebView2 verification fixture is unexpectedly small.'
  }
  $tamperedBytes[0x1000] = $tamperedBytes[0x1000] -bxor 0x01
  [IO.File]::WriteAllBytes($tamperedCandidate, $tamperedBytes)
  Invoke-WebView2SignatureVerification `
    -HelperPath $webView2Helper `
    -CandidatePath $tamperedCandidate `
    -MaliciousModuleRoot $maliciousModuleRoot `
    -MarkerPath $maliciousMarker `
    -ShouldSucceed $false `
    -CaseName 'webview2-tamper-negative'

  # CASE: relative-path-negative
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=relative-$runId") -ShouldSucceed $false -CaseName 'relative-path-negative' -WorkingDirectory $testRoot)
  Assert-RejectedInstallLeftNoMachineWrites `
    -CandidateInstallDirectory (Join-Path $testRoot "relative-$runId")
  # CASE: unc-network-negative
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=\\127.0.0.1\fyagent-missing-$runId\FyAgent") -ShouldSucceed $false -CaseName 'unc-network-negative' -WorkingDirectory $testRoot)
  Assert-RejectedInstallLeftNoMachineWrites

  # CASE: access-denied-ancestor-negative
  # An inaccessible existing ancestor must not be treated as a missing path
  # and peeled until a local fixed-drive parent is found.
  $accessDeniedAncestor = Join-Path $testRoot 'access-denied-ancestor'
  New-Item -ItemType Directory -Path $accessDeniedAncestor | Out-Null
  $deniedSecurity = [Security.AccessControl.DirectorySecurity]::new()
  $deniedSecurity.SetSecurityDescriptorSddlForm(
    'O:BAD:P(D;;0x81;;;BU)(A;;FA;;;SY)(A;;FA;;;BA)'
  )
  Set-Acl -LiteralPath $accessDeniedAncestor -AclObject $deniedSecurity
  $accessDeniedCandidate = Join-Path $accessDeniedAncestor 'FyAgent'
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$accessDeniedCandidate") -ShouldSucceed $false -CaseName 'access-denied-ancestor-negative' -WorkingDirectory $testRoot)
  Assert-RejectedInstallLeftNoMachineWrites `
    -CandidateInstallDirectory $accessDeniedCandidate
  $cleanupSecurity = [Security.AccessControl.DirectorySecurity]::new()
  $cleanupSecurity.SetSecurityDescriptorSddlForm(
    'O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'
  )
  Set-Acl -LiteralPath $accessDeniedAncestor -AclObject $cleanupSecurity

  # CASE: reparse-network-negative
  # This local-looking path proves that the validator follows its directory
  # reparse point before classifying the final SMB target.
  $networkReparseLink = Join-Path $testRoot 'network-reparse-link'
  [void][IO.Directory]::CreateSymbolicLink(
    $networkReparseLink,
    "\\127.0.0.1\fyagent-missing-$runId"
  )
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$networkReparseLink\FyAgent") -ShouldSucceed $false -CaseName 'reparse-network-negative' -WorkingDirectory $testRoot)
  Assert-RejectedInstallLeftNoMachineWrites

  $unsupportedDriveCaseCount = Invoke-RequiredUnsupportedDriveAcceptance `
    -InstallerPath $resolvedInstaller `
    -WorkingDirectory $testRoot `
    -Identifier $runId
  if ($unsupportedDriveCaseCount -ne 2) {
    throw "The native lifecycle executed $unsupportedDriveCaseCount unsupported-drive cases instead of 2."
  }

  # CASE: default-install
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S') -ShouldSucceed $true -CaseName 'default-install' -WorkingDirectory $testRoot)
  Assert-InstalledState `
    -InstallDirectory $defaultInstallDir `
    -ExpectedArchitecture $Architecture `
    -ExpectedVersion $AppVersion
  # CASE: default-uninstall-user-data-preservation
  Invoke-NsisUninstall `
    -InstallDirectory $defaultInstallDir `
    -CaseName 'default-uninstall-user-data-preservation' `
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $defaultInstallDir -UserSentinels $userSentinels

  # CASE: preexisting-runtime-extra-ace-negative
  $unsafeEvidence = New-PreexistingRuntimeAclDrift
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$customInstallDir") -ShouldSucceed $false -CaseName 'preexisting-runtime-extra-ace-negative' -WorkingDirectory $testRoot)
  Assert-PreexistingRuntimeAclDriftUnchanged -Evidence $unsafeEvidence
  Assert-RejectedInstallLeftNoMachineWrites `
    -CandidateInstallDirectory $customInstallDir `
    -AllowTestOwnedProgramData
  Remove-TestOwnedRuntimePreimage

  # CASE: preexisting-runtime-unknown-content-negative
  $unknownRuntime = New-StrictRuntimePreimage `
    -Kind 'UnknownContent' `
    -Identifier $runId
  $unknownFile = Join-Path $unknownRuntime "unknown-$runId.keep"
  $unknownBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($unknownFile))
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$customInstallDir") -ShouldSucceed $false -CaseName 'preexisting-runtime-unknown-content-negative' -WorkingDirectory $testRoot)
  if (
    -not (Test-Path -LiteralPath $unknownFile -PathType Leaf) -or
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($unknownFile)) -cne $unknownBytes
  ) {
    throw 'Unknown trusted-runtime content was changed by a rejected install.'
  }
  Assert-RejectedInstallLeftNoMachineWrites `
    -CandidateInstallDirectory $customInstallDir `
    -AllowTestOwnedProgramData
  Remove-TestOwnedRuntimePreimage

  # CASE: preexisting-runtime-no-delete-share-negative
  $pinnedRuntime = New-StrictRuntimePreimage `
    -Kind 'PinnedNoDeleteShare' `
    -Identifier $runId
  $pinnedHandle = [FyAgent.NsisLifecycle.NativeDirectoryHandle]::OpenWithoutDeleteShare(
    $pinnedRuntime
  )
  if ($pinnedHandle -eq [IntPtr]::Zero -or $pinnedHandle -eq [IntPtr](-1)) {
    throw 'Could not create the native no-delete-share runtime fixture.'
  }
  try {
    [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$customInstallDir") -ShouldSucceed $false -CaseName 'preexisting-runtime-no-delete-share-negative' -WorkingDirectory $testRoot)
    Assert-StrictRuntimeRoot -Path $pinnedRuntime
    Assert-RejectedInstallLeftNoMachineWrites `
      -CandidateInstallDirectory $customInstallDir `
      -AllowTestOwnedProgramData
  } finally {
    if (-not [FyAgent.NsisLifecycle.NativeDirectoryHandle]::CloseHandle($pinnedHandle)) {
      throw 'Could not close the native no-delete-share runtime fixture.'
    }
  }
  Remove-TestOwnedRuntimePreimage

  # CASE: trusted-legacy-runtime-rebuild
  [void](New-StrictRuntimePreimage -Kind 'TrustedLegacy' -Identifier $runId)
  $legacyState = Join-Path $env:ProgramData "FyAgent\runtime\business-$runId.state"
  $legacyLock = Join-Path $env:ProgramData "FyAgent\runtime\business-$runId.lock"
  # CASE: custom-space-unicode-silent-D
  [void](Invoke-NsisProcess -FilePath $resolvedInstaller -Arguments @('/S', "/D=$customInstallDir") -ShouldSucceed $true -CaseName 'custom-space-unicode-silent-D' -WorkingDirectory $testRoot)
  if ((Test-Path -LiteralPath $legacyState) -or (Test-Path -LiteralPath $legacyLock)) {
    throw 'Trusted legacy runtime state was not retired with the old directory object.'
  }
  Assert-InstalledState `
    -InstallDirectory $customInstallDir `
    -ExpectedArchitecture $Architecture `
    -ExpectedVersion $AppVersion
  # CASE: custom-uninstall-user-data-preservation
  Invoke-NsisUninstall `
    -InstallDirectory $customInstallDir `
    -CaseName 'custom-uninstall-user-data-preservation' `
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $customInstallDir -UserSentinels $userSentinels

  Write-Host "Windows NSIS native lifecycle verified for $Architecture."
} finally {
  if ($cleanupAuthorized) {
    Invoke-BestEffortNsisUninstall `
      -InstallDirectory $customInstallDir `
      -CaseName 'custom-install' `
      -WorkingDirectory $testRoot
    Invoke-BestEffortNsisUninstall `
      -InstallDirectory $defaultInstallDir `
      -CaseName 'default-install' `
      -WorkingDirectory $testRoot
  }

  $env:HOME = $previousHome
  foreach ($sentinel in $userSentinels) {
    Remove-Item -LiteralPath $sentinel -Force -ErrorAction SilentlyContinue
  }
  foreach ($entry in $sentinelParentsCreatedByTest.GetEnumerator()) {
    if ([bool]$entry.Value) {
      # Only remove a test-created directory if it is now empty. Never recurse
      # through a real user-data parent, even on a clean ephemeral runner.
      Remove-Item -LiteralPath ([string]$entry.Key) -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue

  if ($cleanupAuthorized) {
    Remove-Item -LiteralPath $customCaseRoot -Recurse -Force -ErrorAction SilentlyContinue

    # The boolean is set only after every clean-runner precondition passes. If
    # installation then fails before writing an uninstaller, these roots were
    # created by this lifecycle and are safe to remove from the ephemeral host.
    Remove-Item -LiteralPath $defaultInstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item `
      -LiteralPath (Join-Path $env:ProgramData 'FyAgent') `
      -Recurse `
      -Force `
      -ErrorAction SilentlyContinue
  }
}
