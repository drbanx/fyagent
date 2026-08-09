param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath
)

$env:PSModulePath = "$PSHOME\Modules"
$PSModuleAutoLoadingPreference = 'None'
Microsoft.PowerShell.Core\Import-Module `
  -Name "$PSHOME\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1" `
  -Force `
  -ErrorAction Stop
Microsoft.PowerShell.Core\Import-Module `
  -Name "$PSHOME\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1" `
  -Force `
  -ErrorAction Stop
Microsoft.PowerShell.Core\Import-Module `
  -Name "$PSHOME\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1" `
  -Force `
  -ErrorAction Stop
Microsoft.PowerShell.Core\Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'Stop'

function Get-CertificateSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
  )

  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash($Certificate.RawData))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $hasher.Dispose()
  }
}

function Convert-CertificateEvidence {
  param(
    [Parameter(Mandatory = $true)]
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
  )

  $enhancedKeyUsageOids = @()
  foreach ($extension in $Certificate.Extensions) {
    if ($extension.Oid.Value -eq '2.5.29.37') {
      $enhancedKeyUsageExtension = if ($extension -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
        $extension
      }
      else {
        [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
          $extension.RawData,
          $extension.Critical
        )
      }
      foreach ($usage in $enhancedKeyUsageExtension.EnhancedKeyUsages) {
        if ([string]::IsNullOrWhiteSpace($usage.Value)) {
          throw 'Authenticode certificate contains an empty enhanced-key-usage OID'
        }
        $enhancedKeyUsageOids += $usage.Value
      }
    }
  }

  return [ordered]@{
    subject = $Certificate.Subject
    simpleName = $Certificate.GetNameInfo(
      [System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,
      $false
    )
    sha256 = Get-CertificateSha256 -Certificate $Certificate
    notBefore = $Certificate.NotBefore.ToUniversalTime().ToString(
      'o',
      [System.Globalization.CultureInfo]::InvariantCulture
    )
    notAfter = $Certificate.NotAfter.ToUniversalTime().ToString(
      'o',
      [System.Globalization.CultureInfo]::InvariantCulture
    )
    enhancedKeyUsageOids = @(
      $enhancedKeyUsageOids | Microsoft.PowerShell.Utility\Sort-Object -Unique
    )
  }
}

$resolvedArtifact = (
  Microsoft.PowerShell.Management\Resolve-Path -LiteralPath $ArtifactPath
).Path
$artifact = Microsoft.PowerShell.Management\Get-Item `
  -LiteralPath $resolvedArtifact `
  -Force
if (-not ($artifact -is [System.IO.FileInfo])) {
  throw 'Authenticode evidence input must be a regular file'
}
if (($artifact.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Authenticode evidence input must not be a reparse point'
}
if ($artifact.Length -le 0) {
  throw 'Authenticode evidence input must not be empty'
}

$signature = Microsoft.PowerShell.Security\Get-AuthenticodeSignature `
  -LiteralPath $resolvedArtifact
$signerCertificate = if ($null -eq $signature.SignerCertificate) {
  $null
}
else {
  Convert-CertificateEvidence -Certificate $signature.SignerCertificate
}
$timestampCertificate = if ($null -eq $signature.TimeStamperCertificate) {
  $null
}
else {
  Convert-CertificateEvidence -Certificate $signature.TimeStamperCertificate
}
$publisher = if ($null -eq $signature.SignerCertificate) {
  $null
}
else {
  $signature.SignerCertificate.GetNameInfo(
    [System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,
    $false
  )
}

$evidence = [ordered]@{
  schema = 'fyagent-authenticode-evidence/v1'
  status = $signature.Status.ToString()
  publisher = $publisher
  signerCertificate = $signerCertificate
  timestampCertificate = $timestampCertificate
}

$evidence | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6 -Compress
