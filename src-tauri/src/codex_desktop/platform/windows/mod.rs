//! Windows x64 and ARM64 current-user MSIX adapter.
//!
//! The normal adapter has no install scope, no arbitrary URL/path input, and
//! no elevation capability. It accepts only core-owned `VerifiedPackage`
//! evidence, deploys it by local `file://` URI through PackageManager, then
//! relies on the common service to re-query the registered package.

mod deployment;
#[cfg(target_os = "windows")]
pub(crate) mod elevation;
mod manifest;

use std::{
    fmt,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use futures::future::BoxFuture;

use self::{
    deployment::{
        deployment_error, launch_error, local_file_uri, verify_context_evidence,
        WindowsDeploymentProgressSink, WindowsPackageManager, WindowsPackageRecord,
    },
    manifest::{parse_msix_manifest, WindowsPackageManifest},
};

#[cfg(test)]
use self::deployment::{
    WindowsPackageInventory, WindowsUserContextEvidence, WindowsUserOperationReceipt,
};

#[cfg(test)]
use self::deployment::WindowsNativeError;
#[cfg(target_os = "windows")]
mod runtime;
use super::{
    CodexDesktopPlatform, PlatformInstallPlan, PlatformProgressSink, RestartCandidateInspection,
    RestartInstallationScope, RuntimeInspection, TrustedInstallationCandidate,
    TrustedRuntimeInstance, VerifiedPackage, WINDOWS_CODEX_STABLE_IDENTITY,
};
use crate::codex_desktop::{
    download::DownloadedArtifact,
    error::{InstallerError, InstallerErrorCode},
    types::{
        CpuArchitecture, DesktopPlatform, InstalledApplication, InstalledApplicationSummary,
        JobProgress, LaunchTarget, LocalInstallStatus, PlatformVersion, ProgressPhase,
        ReleaseDescriptor, UnsupportedReason,
    },
};
use crate::windows_runtime::InteractiveUserContext;

#[cfg(target_os = "windows")]
#[cfg_attr(test, allow(unused_imports))]
pub use deployment::SystemWindowsDiskSpaceProbe;
#[cfg(target_os = "windows")]
pub use deployment::SystemWindowsPackageManager;

/// Exact Publisher allowlist from read-only local Windows evidence collected on
/// 2026-07-29. The current-user Microsoft Store package was
/// `OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0` with
/// `Name=OpenAI.Codex`, version `26.721.4979.0`,
/// `PublisherId=2p2nqsd0c76g0`, `SignatureKind=Store`, `Status=Ok`, and
/// `IsDevelopmentMode=False`. The same-day AgentsMirror x64 package moniker,
/// version, and Package Family Name suffix matched.
///
/// This is deliberately an exact Publisher DN, not a PFN suffix, prefix, or
/// mirror field. A Publisher change must fail closed until a human reviews
/// equivalent signed-package and system-trust evidence before updating it.
const OFFICIAL_WINDOWS_CODEX_PUBLISHER: &str = "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B";

/// Opaque evidence that a Publisher string has passed the production evidence
/// gate. The production constructor remains confined to this module, so
/// release metadata cannot select a different trusted Publisher.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct VerifiedPublisherEvidence {
    publisher: String,
}

impl VerifiedPublisherEvidence {
    pub(crate) fn publisher(&self) -> &str {
        &self.publisher
    }

    #[cfg(test)]
    pub(crate) fn for_test(publisher: &str) -> Self {
        assert!(
            !publisher.is_empty(),
            "test Publisher evidence must be non-empty"
        );
        assert!(
            !publisher.bytes().any(|byte| byte.is_ascii_control()),
            "test Publisher evidence must not contain control characters"
        );
        Self {
            publisher: publisher.to_owned(),
        }
    }
}

impl fmt::Debug for VerifiedPublisherEvidence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("VerifiedPublisherEvidence(<redacted>)")
    }
}

/// Builds production evidence from the reviewed exact Publisher allowlist.
///
/// PackageManager still validates the MSIX signature and trust chain at
/// deployment. This gate keeps pre-deployment identity validation exact rather
/// than accepting a PFN suffix, a mirror field, or a prefix comparison.
pub(crate) fn current_official_publisher_evidence(
) -> Result<VerifiedPublisherEvidence, InstallerError> {
    Ok(VerifiedPublisherEvidence {
        publisher: OFFICIAL_WINDOWS_CODEX_PUBLISHER.to_owned(),
    })
}

/// Host facts are injected for fake-based tests. The deployment volume is a
/// trusted system root used only for shared free-space preflight; it is never a
/// user-selected install directory.
#[derive(Debug, Clone)]
pub struct WindowsHost {
    architecture: CpuArchitecture,
    os_version: PlatformVersion,
    deployment_volume: PathBuf,
}

impl WindowsHost {
    pub fn new(
        architecture: CpuArchitecture,
        os_version: &str,
        deployment_volume: PathBuf,
    ) -> Result<Self, InstallerError> {
        if deployment_volume.as_os_str().is_empty() {
            return Err(InstallerError::new(InstallerErrorCode::PlatformUnsupported)
                .with_diagnostic_message("Windows deployment volume could not be determined"));
        }
        let os_version = PlatformVersion::parse_windows_msix(os_version).map_err(|_| {
            InstallerError::new(InstallerErrorCode::OsVersionUnsupported)
                .with_diagnostic_message("Windows version could not be parsed")
        })?;
        Ok(Self {
            architecture,
            os_version,
            deployment_volume,
        })
    }

    #[cfg(target_os = "windows")]
    pub fn for_current_host() -> Result<Self, InstallerError> {
        let version = windows_version::OsVersion::current();
        let revision = windows_version::revision();
        let version_text = format!(
            "{}.{}.{}.{}",
            version.major, version.minor, version.build, revision
        );
        Self::new(
            native_host::architecture(),
            &version_text,
            native_host::deployment_volume()?,
        )
    }

    pub(crate) fn architecture(&self) -> CpuArchitecture {
        self.architecture
    }

    pub(crate) fn os_version(&self) -> &PlatformVersion {
        &self.os_version
    }

    pub(crate) fn deployment_volume(&self) -> &Path {
        &self.deployment_volume
    }
}

/// Windows installer adapter with injectable PackageManager facts. The public
/// construction boundary is side-effect-free, so tests never query, deploy,
/// or activate a real system package. The production facade calls
/// `revalidate_interactive_user_context` before and after native operations;
/// this adapter independently verifies every returned context stamp.
pub(crate) struct WindowsPlatformAdapter {
    package_manager: Arc<dyn WindowsPackageManager>,
    user_context: Arc<InteractiveUserContext>,
    host: WindowsHost,
    publisher_evidence: VerifiedPublisherEvidence,
}

impl WindowsPlatformAdapter {
    pub(crate) fn new(
        package_manager: Arc<dyn WindowsPackageManager>,
        user_context: Arc<InteractiveUserContext>,
        host: WindowsHost,
        publisher_evidence: VerifiedPublisherEvidence,
    ) -> Self {
        Self {
            package_manager,
            user_context,
            host,
            publisher_evidence,
        }
    }

    /// Production factory. Callers must first pass the evidence gate above;
    /// this module deliberately cannot construct one from unverified metadata.
    #[cfg(target_os = "windows")]
    pub(crate) fn for_current_host(
        publisher_evidence: VerifiedPublisherEvidence,
        user_context: Arc<InteractiveUserContext>,
    ) -> Result<Self, InstallerError> {
        Ok(Self::new(
            Arc::new(SystemWindowsPackageManager),
            user_context,
            WindowsHost::for_current_host()?,
            publisher_evidence,
        ))
    }

    fn host_support_error(&self) -> Option<InstallerError> {
        match self.host.architecture() {
            CpuArchitecture::X86_64 | CpuArchitecture::Aarch64 => None,
            architecture => Some(
                InstallerError::new(InstallerErrorCode::ArchitectureUnsupported)
                    .with_context("architecture", architecture.as_str())
                    .with_diagnostic_message("Windows V1 supports x64 and ARM64 only"),
            ),
        }
    }
}

impl CodexDesktopPlatform for WindowsPlatformAdapter {
    fn platform(&self) -> Option<DesktopPlatform> {
        Some(DesktopPlatform::Windows)
    }

    fn architecture(&self) -> CpuArchitecture {
        self.host.architecture()
    }

    fn inspect_local(&self) -> BoxFuture<'_, Result<LocalInstallStatus, InstallerError>> {
        let package_manager = self.package_manager.clone();
        let user_context = self.user_context.clone();
        let host = self.host.clone();
        let publisher_evidence = self.publisher_evidence.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if host.architecture() != CpuArchitecture::X86_64
                && host.architecture() != CpuArchitecture::Aarch64
            {
                return Ok(LocalInstallStatus::Unsupported {
                    reason: UnsupportedReason::Architecture,
                });
            }
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                inspect_local(
                    package_manager.as_ref(),
                    &user_context,
                    &host,
                    &publisher_evidence,
                )
            })
            .await
        })
    }

    fn inspect_restart_candidates(
        &self,
    ) -> BoxFuture<'_, Result<RestartCandidateInspection, InstallerError>> {
        let package_manager = self.package_manager.clone();
        let user_context = self.user_context.clone();
        let host = self.host.clone();
        let publisher_evidence = self.publisher_evidence.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if host.architecture() != CpuArchitecture::X86_64
                && host.architecture() != CpuArchitecture::Aarch64
            {
                return Ok(RestartCandidateInspection::Unsupported(
                    UnsupportedReason::Architecture,
                ));
            }
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                inspect_restart_candidates(
                    package_manager.as_ref(),
                    &user_context,
                    &host,
                    &publisher_evidence,
                )
            })
            .await
        })
    }

    fn preflight<'a>(
        &'a self,
        release: &'a ReleaseDescriptor,
        temp_root: &'a Path,
    ) -> BoxFuture<'a, Result<PlatformInstallPlan, InstallerError>> {
        let host = self.host.clone();
        let release = release.clone();
        let temp_root = temp_root.to_path_buf();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || preflight(&host, &release, &temp_root)).await
        })
    }

    fn verify_package<'a>(
        &'a self,
        release: &'a ReleaseDescriptor,
        artifact: &'a DownloadedArtifact,
    ) -> BoxFuture<'a, Result<VerifiedPackage, InstallerError>> {
        let host = self.host.clone();
        let publisher_evidence = self.publisher_evidence.clone();
        let release = release.clone();
        let artifact = artifact.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                artifact.revalidate_against(&release)?;
                validate_package(&host, &publisher_evidence, &release, artifact.path())?;
                VerifiedPackage::from_completed_validation(&release, artifact)
            })
            .await
        })
    }

    fn install_current_user<'a>(
        &'a self,
        package: &'a VerifiedPackage,
        progress: PlatformProgressSink,
    ) -> BoxFuture<'a, Result<(), InstallerError>> {
        let package_manager = self.package_manager.clone();
        let user_context = self.user_context.clone();
        let host = self.host.clone();
        let package = package.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                install_current_user(
                    package_manager.as_ref(),
                    &user_context,
                    &host,
                    &package,
                    progress,
                )
            })
            .await
        })
    }

    fn launch<'a>(
        &'a self,
        installed: &'a InstalledApplication,
    ) -> BoxFuture<'a, Result<(), InstallerError>> {
        let package_manager = self.package_manager.clone();
        let user_context = self.user_context.clone();
        let host = self.host.clone();
        let publisher_evidence = self.publisher_evidence.clone();
        let installed = installed.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                launch(
                    package_manager.as_ref(),
                    &user_context,
                    &host,
                    &publisher_evidence,
                    &installed,
                )
            })
            .await
        })
    }

    fn inspect_runtime<'a>(
        &'a self,
        installed: &'a InstalledApplication,
    ) -> BoxFuture<'a, Result<RuntimeInspection, InstallerError>> {
        let user_context = self.user_context.clone();
        let installed = installed.clone();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || runtime::inspect(&user_context, &installed)).await
        })
    }

    fn force_shutdown<'a>(
        &'a self,
        installed: &'a InstalledApplication,
        instances: &'a [TrustedRuntimeInstance],
    ) -> BoxFuture<'a, Result<(), InstallerError>> {
        let user_context = self.user_context.clone();
        let installed = installed.clone();
        let instances = instances.to_vec();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || runtime::force_shutdown(&user_context, &installed, &instances))
                .await
        })
    }

    fn is_runtime_instance_running<'a>(
        &'a self,
        installed: &'a InstalledApplication,
        instances: &'a [TrustedRuntimeInstance],
    ) -> BoxFuture<'a, Result<bool, InstallerError>> {
        let user_context = self.user_context.clone();
        let installed = installed.clone();
        let instances = instances.to_vec();
        let host_error = self.host_support_error();
        Box::pin(async move {
            if let Some(error) = host_error {
                return Err(error);
            }
            run_blocking(move || {
                runtime::is_instance_running(&user_context, &installed, &instances)
            })
            .await
        })
    }
}

fn inspect_local(
    package_manager: &dyn WindowsPackageManager,
    user_context: &InteractiveUserContext,
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
) -> Result<LocalInstallStatus, InstallerError> {
    let records = inventory_records(package_manager, user_context)?;
    let stable_records = records
        .iter()
        .filter(|record| record.identity_name == WINDOWS_CODEX_STABLE_IDENTITY)
        .collect::<Vec<_>>();
    if stable_records.is_empty() {
        return Ok(LocalInstallStatus::NotInstalled {
            platform: DesktopPlatform::Windows,
            architecture: host.architecture(),
        });
    }

    let applications = stable_records
        .into_iter()
        .map(|record| installed_application_from_record(record, host, publisher_evidence))
        .collect::<Result<Vec<_>, _>>()?;
    match applications.as_slice() {
        [application] => Ok(LocalInstallStatus::Installed {
            application: application.clone(),
        }),
        _ => Ok(LocalInstallStatus::Ambiguous {
            candidates: applications
                .iter()
                .map(InstalledApplicationSummary::from)
                .collect(),
            error: InstallerError::new(InstallerErrorCode::MultipleInstallations)
                .with_diagnostic_message(
                    "multiple Stable Windows packages prevent a safe update or launch",
                )
                .to_dto(),
        }),
    }
}

/// Produces the one current-user exact PFN-bound installation candidate for
/// the restart planner, or explicit ambiguity when more than one survives.
/// `family_name` is obtained from PackageManager and validated while forming
/// the verified AUMID; display name, executable name, window title, and package
/// path never participate in candidate discovery or ordering.
fn inspect_restart_candidates(
    package_manager: &dyn WindowsPackageManager,
    user_context: &InteractiveUserContext,
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
) -> Result<RestartCandidateInspection, InstallerError> {
    let records = inventory_records(package_manager, user_context)?;
    let stable_records = records
        .iter()
        .filter(|record| record.identity_name == WINDOWS_CODEX_STABLE_IDENTITY)
        .collect::<Vec<_>>();
    if stable_records.is_empty() {
        return Ok(RestartCandidateInspection::NotInstalled);
    }

    let candidates = stable_records
        .into_iter()
        .map(|record| {
            let application = installed_application_from_record(record, host, publisher_evidence)?;
            Ok(TrustedInstallationCandidate {
                // The Package Family Name is the exact Windows lifecycle
                // identity. It stays private to the planner/token record and
                // never crosses IPC or appears in ordinary diagnostics.
                stable_key: format!("windows-pfn:{}", record.family_name),
                application,
                scope: RestartInstallationScope::CurrentUser,
            })
        })
        .collect::<Result<Vec<_>, InstallerError>>()?;
    match candidates.as_slice() {
        [candidate] => Ok(RestartCandidateInspection::Trusted(vec![candidate.clone()])),
        _ => Ok(RestartCandidateInspection::AmbiguousInstallations),
    }
}

fn inventory_records(
    package_manager: &dyn WindowsPackageManager,
    user_context: &InteractiveUserContext,
) -> Result<Vec<WindowsPackageRecord>, InstallerError> {
    let inventory = package_manager
        .packages_for_user(user_context)
        .map_err(deployment_error)?;
    verify_context_evidence(user_context, inventory.context_evidence())?;
    Ok(inventory.records().to_vec())
}

fn installed_application_from_record(
    record: &WindowsPackageRecord,
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
) -> Result<InstalledApplication, InstallerError> {
    if record.identity_name != WINDOWS_CODEX_STABLE_IDENTITY {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                .with_diagnostic_message("PackageManager record does not have the Stable identity"),
        );
    }
    if record.publisher != publisher_evidence.publisher() {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                .with_diagnostic_message(
                    "PackageManager Publisher does not match verified evidence",
                ),
        );
    }
    if record.architecture != host.architecture() {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageArchitectureMismatch)
                .with_context("architecture", record.architecture.as_str())
                .with_diagnostic_message(
                    "installed Stable package architecture does not match this host",
                ),
        );
    }
    if !matches!(&record.version, PlatformVersion::WindowsMsix { .. }) {
        return Err(InstallerError::new(InstallerErrorCode::PackageParseFailed)
            .with_diagnostic_message("PackageManager returned a non-Windows package version"));
    }
    let application_id = single_application_id(record)?;
    let aumid = verified_aumid(&record.family_name, application_id)?;
    Ok(InstalledApplication {
        stable_identity: WINDOWS_CODEX_STABLE_IDENTITY.to_owned(),
        display_name: record.display_name.clone(),
        display_version: Some(windows_version_text(&record.version)?),
        platform_version: record.version.clone(),
        architecture: record.architecture,
        location: None,
        launch_target: LaunchTarget::WindowsAumid(aumid),
    })
}

fn preflight(
    host: &WindowsHost,
    release: &ReleaseDescriptor,
    temp_root: &Path,
) -> Result<PlatformInstallPlan, InstallerError> {
    validate_release_for_host(host, release)?;
    if !temp_root.is_dir() {
        return Err(InstallerError::new(InstallerErrorCode::InternalError)
            .with_diagnostic_message("installer temporary root is not an available directory"));
    }
    Ok(PlatformInstallPlan::new(vec![host
        .deployment_volume()
        .to_path_buf()]))
}

fn validate_package(
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
    release: &ReleaseDescriptor,
    artifact_path: &Path,
) -> Result<(), InstallerError> {
    validate_release_for_host(host, release)?;
    let manifest = parse_msix_manifest(artifact_path)?;
    validate_manifest_for_release(&manifest, host, publisher_evidence, release)?;
    // Structural ZIP/manifest checks and the exact Publisher evidence gate are
    // complete here. PackageManager performs Windows' actual MSIX signature
    // and chain validation during `AddPackageByUriAsync`; a deployment failure
    // can therefore never become a successful installation result.
    Ok(())
}

/// Repeats the Windows host and MSIX manifest trust gates for the experimental
/// elevated child.  It deliberately returns no `VerifiedPackage`: all-users
/// provisioning is not part of the normal current-user platform trait and
/// cannot be reached through ordinary IPC.
#[cfg(target_os = "windows")]
pub(crate) fn revalidate_all_users_package(
    release: &ReleaseDescriptor,
    artifact_path: &Path,
) -> Result<(), InstallerError> {
    let host = WindowsHost::for_current_host()?;
    let publisher_evidence = current_official_publisher_evidence()?;
    validate_package(&host, &publisher_evidence, release, artifact_path)
}

fn install_current_user(
    package_manager: &dyn WindowsPackageManager,
    user_context: &InteractiveUserContext,
    host: &WindowsHost,
    package: &VerifiedPackage,
    progress: PlatformProgressSink,
) -> Result<(), InstallerError> {
    if package.platform() != DesktopPlatform::Windows
        || package.architecture() != host.architecture()
    {
        return Err(InstallerError::new(InstallerErrorCode::InternalError)
            .with_diagnostic_message(
                "non-Windows validation evidence reached the Windows installer",
            ));
    }
    // Re-open the downloader-owned fixed artifact and bind its current bytes
    // to the descriptor retained by `VerifiedPackage` immediately before the
    // `file://` URI is handed to PackageManager.
    package.revalidate_artifact()?;
    let package_file_uri = local_file_uri(package.artifact_path())?;
    progress.report_progress(JobProgress::new(
        ProgressPhase::Installation,
        Some(0),
        Some(100),
    ));
    let progress_for_native = progress.clone();
    let native_reported_completion = Arc::new(AtomicBool::new(false));
    let native_reported_completion_for_sink = native_reported_completion.clone();
    let native_progress: WindowsDeploymentProgressSink = Arc::new(move |percentage| {
        let percentage = percentage.min(100) as u64;
        if percentage == 100 {
            native_reported_completion_for_sink.store(true, Ordering::Release);
        }
        progress_for_native.report_progress(JobProgress::new(
            ProgressPhase::Installation,
            Some(percentage),
            Some(100),
        ));
    });
    let receipt = package_manager
        .deploy_current_user(user_context, &package_file_uri, native_progress)
        .map_err(deployment_error)?;
    verify_context_evidence(user_context, receipt.context_evidence())?;
    if !native_reported_completion.load(Ordering::Acquire) {
        progress.report_progress(JobProgress::new(
            ProgressPhase::Installation,
            Some(100),
            Some(100),
        ));
    }
    Ok(())
}

fn launch(
    package_manager: &dyn WindowsPackageManager,
    user_context: &InteractiveUserContext,
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
    installed: &InstalledApplication,
) -> Result<(), InstallerError> {
    if installed.stable_identity != WINDOWS_CODEX_STABLE_IDENTITY
        || installed.architecture != host.architecture()
        || !matches!(
            &installed.platform_version,
            PlatformVersion::WindowsMsix { .. }
        )
    {
        return Err(
            InstallerError::new(InstallerErrorCode::LaunchFailed).with_diagnostic_message(
                "launch request does not contain a verified Stable Windows app",
            ),
        );
    }
    let LaunchTarget::WindowsAumid(aumid) = &installed.launch_target else {
        return Err(InstallerError::new(InstallerErrorCode::LaunchFailed)
            .with_diagnostic_message("launch request does not contain a Windows AUMID"));
    };
    if !is_valid_aumid(aumid) {
        return Err(InstallerError::new(InstallerErrorCode::LaunchFailed)
            .with_diagnostic_message("launch request contains an invalid Windows AUMID"));
    }

    // A previously selected application is not itself a launch capability.
    // Re-enumerate the frozen SID/Main inventory immediately before Explorer
    // activation and require the one trusted result to be byte-for-byte the
    // same domain record.
    let records = inventory_records(package_manager, user_context)?;
    let stable_records = records
        .iter()
        .filter(|record| record.identity_name == WINDOWS_CODEX_STABLE_IDENTITY)
        .collect::<Vec<_>>();
    let record = match stable_records.as_slice() {
        [record] => *record,
        [] => {
            return Err(InstallerError::new(InstallerErrorCode::LaunchFailed)
                .with_diagnostic_message(
                    "launch requires one exact Stable package for the interactive user",
                ));
        }
        _ => {
            return Err(
                InstallerError::new(InstallerErrorCode::MultipleInstallations)
                    .with_diagnostic_message(
                        "multiple Stable Windows packages prevent a safe launch",
                    ),
            );
        }
    };
    let current = installed_application_from_record(record, host, publisher_evidence)?;
    if &current != installed {
        return Err(
            InstallerError::new(InstallerErrorCode::LaunchFailed).with_diagnostic_message(
                "the selected Stable Windows application changed before launch",
            ),
        );
    }

    let receipt = package_manager
        .launch_aumid(user_context, aumid)
        .map_err(launch_error)?;
    verify_context_evidence(user_context, receipt.context_evidence())
}

fn validate_release_for_host(
    host: &WindowsHost,
    release: &ReleaseDescriptor,
) -> Result<(), InstallerError> {
    if release.platform != DesktopPlatform::Windows
        || !matches!(
            &release.platform_version,
            PlatformVersion::WindowsMsix { .. }
        )
    {
        return Err(InstallerError::new(InstallerErrorCode::PlatformUnsupported)
            .with_diagnostic_message("Windows adapter received a non-Windows release"));
    }
    if !matches!(
        release.architecture,
        CpuArchitecture::X86_64 | CpuArchitecture::Aarch64
    ) || release.architecture != host.architecture()
    {
        return Err(
            InstallerError::new(InstallerErrorCode::ArchitectureUnsupported)
                .with_context("architecture", release.architecture.as_str())
                .with_diagnostic_message("Windows release architecture does not match this host"),
        );
    }
    if let Some(minimum_os_version) = release.minimum_os_version.as_deref() {
        let minimum_os_version =
            PlatformVersion::parse_windows_msix(minimum_os_version).map_err(|_| {
                InstallerError::new(InstallerErrorCode::ReleaseMetadataInvalid)
                    .with_diagnostic_message("Windows release minimum OS version is invalid")
            })?;
        ensure_host_meets_minimum_os(host, &minimum_os_version)?;
    }
    Ok(())
}

fn validate_manifest_for_release(
    manifest: &WindowsPackageManifest,
    host: &WindowsHost,
    publisher_evidence: &VerifiedPublisherEvidence,
    release: &ReleaseDescriptor,
) -> Result<(), InstallerError> {
    if manifest.identity_name() != WINDOWS_CODEX_STABLE_IDENTITY {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                .with_diagnostic_message(
                    "MSIX Identity Name is not the exact Stable allowlist value",
                ),
        );
    }
    if manifest.publisher() != publisher_evidence.publisher() {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                .with_diagnostic_message(
                    "MSIX Publisher does not match verified official evidence",
                ),
        );
    }
    if manifest.architecture() != release.architecture {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageArchitectureMismatch)
                .with_context("architecture", manifest.architecture().as_str())
                .with_diagnostic_message("MSIX architecture does not match the resolved release"),
        );
    }
    if manifest.version() != &release.platform_version {
        return Err(
            InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                .with_diagnostic_message(
                    "MSIX Identity Version does not match the resolved release",
                ),
        );
    }
    if let Some(release_minimum) = release.minimum_os_version.as_deref() {
        let release_minimum =
            PlatformVersion::parse_windows_msix(release_minimum).map_err(|_| {
                InstallerError::new(InstallerErrorCode::ReleaseMetadataInvalid)
                    .with_diagnostic_message("Windows release minimum OS version is invalid")
            })?;
        if manifest.minimum_os_version() != &release_minimum {
            return Err(
                InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
                    .with_diagnostic_message(
                        "MSIX TargetDeviceFamily MinVersion does not match release metadata",
                    ),
            );
        }
    }
    ensure_host_meets_minimum_os(host, manifest.minimum_os_version())
}

fn ensure_host_meets_minimum_os(
    host: &WindowsHost,
    minimum_os_version: &PlatformVersion,
) -> Result<(), InstallerError> {
    if !host.os_version().is_at_least(minimum_os_version)? {
        return Err(
            InstallerError::new(InstallerErrorCode::OsVersionUnsupported).with_diagnostic_message(
                "Windows version does not meet the MSIX minimum requirement",
            ),
        );
    }
    Ok(())
}

fn single_application_id(record: &WindowsPackageRecord) -> Result<&str, InstallerError> {
    let [application_id] = record.application_ids.as_slice() else {
        return Err(InstallerError::new(InstallerErrorCode::PackageParseFailed)
            .with_diagnostic_message(
                "installed Stable package does not have exactly one app entry",
            ));
    };
    if !is_valid_application_id(application_id) {
        return Err(InstallerError::new(InstallerErrorCode::PackageParseFailed)
            .with_diagnostic_message("installed Stable package Application Id is invalid"));
    }
    Ok(application_id)
}

fn verified_aumid(family_name: &str, application_id: &str) -> Result<String, InstallerError> {
    if family_name.is_empty()
        || family_name.len() > 512
        || family_name.contains('!')
        || family_name.bytes().any(|byte| byte.is_ascii_control())
        || !is_valid_application_id(application_id)
    {
        return Err(InstallerError::new(InstallerErrorCode::PackageParseFailed)
            .with_diagnostic_message("installed Stable package cannot form a verified AUMID"));
    }
    Ok(format!("{family_name}!{application_id}"))
}

fn is_valid_application_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
}

fn is_valid_aumid(value: &str) -> bool {
    let Some((family_name, application_id)) = value.split_once('!') else {
        return false;
    };
    !family_name.is_empty()
        && !family_name.contains('!')
        && family_name.len() <= 512
        && !family_name.bytes().any(|byte| byte.is_ascii_control())
        && is_valid_application_id(application_id)
}

fn windows_version_text(version: &PlatformVersion) -> Result<String, InstallerError> {
    let PlatformVersion::WindowsMsix {
        major,
        minor,
        build,
        revision,
    } = version
    else {
        return Err(InstallerError::new(InstallerErrorCode::PackageParseFailed)
            .with_diagnostic_message("installed package version is not a Windows MSIX version"));
    };
    Ok(format!("{major}.{minor}.{build}.{revision}"))
}

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, InstallerError> + Send + 'static,
) -> Result<T, InstallerError> {
    tokio::task::spawn_blocking(operation).await.map_err(|_| {
        InstallerError::new(InstallerErrorCode::InternalError)
            .with_diagnostic_message("Windows platform worker stopped unexpectedly")
    })?
}

#[cfg(target_os = "windows")]
mod native_host {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf};

    use windows::Win32::System::SystemInformation::{
        GetNativeSystemInfo, GetWindowsDirectoryW, PROCESSOR_ARCHITECTURE_AMD64,
        PROCESSOR_ARCHITECTURE_ARM64, SYSTEM_INFO,
    };

    use crate::codex_desktop::{error::InstallerError, types::CpuArchitecture};

    pub(super) fn architecture() -> CpuArchitecture {
        let mut info = SYSTEM_INFO::default();
        unsafe { GetNativeSystemInfo(&mut info) };
        let native_architecture = unsafe { info.Anonymous.Anonymous.wProcessorArchitecture };
        match native_architecture {
            PROCESSOR_ARCHITECTURE_AMD64 => CpuArchitecture::X86_64,
            PROCESSOR_ARCHITECTURE_ARM64 => CpuArchitecture::Aarch64,
            _ => CpuArchitecture::Unsupported,
        }
    }

    pub(super) fn deployment_volume() -> Result<PathBuf, InstallerError> {
        let mut buffer = vec![0_u16; 32_768];
        let length = unsafe { GetWindowsDirectoryW(Some(&mut buffer)) } as usize;
        if length == 0 || length >= buffer.len() {
            return Err(InstallerError::new(
                crate::codex_desktop::error::InstallerErrorCode::PlatformUnsupported,
            )
            .with_diagnostic_message("Windows deployment volume could not be determined"));
        }
        let windows_directory = PathBuf::from(OsString::from_wide(&buffer[..length]));
        windows_directory
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| {
                InstallerError::new(
                    crate::codex_desktop::error::InstallerErrorCode::PlatformUnsupported,
                )
                .with_diagnostic_message("Windows deployment volume could not be determined")
            })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs::{self, File},
        io::Write,
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, AtomicUsize, Ordering},
            Arc, Mutex,
        },
    };

    use super::*;
    use crate::codex_desktop::{
        all_users::{AllUsersProvisioner, ValidatedAllUsersJob},
        download::DownloadedArtifact,
        error::{InstallerErrorCode, SuggestedAction},
        temp::JobTempDir,
        types::{PlatformVersion, TrustedDownloadEndpoint},
        verify::{sha256_hex, ArtifactKind},
    };
    use uuid::Uuid;
    use zip::{write::SimpleFileOptions, ZipWriter};

    const PUBLISHER: &str = "CN=fixture publisher";
    const FAMILY_NAME: &str = "OpenAI.Codex_fixture";
    const USER_SID: &str = "S-1-5-21-1000";
    const OTHER_USER_SID: &str = "S-1-5-21-2000";

    #[derive(Clone)]
    enum FakeEvidence {
        Bound,
        Missing,
        Override(WindowsUserContextEvidence),
    }

    impl FakeEvidence {
        fn for_context(
            &self,
            context: &InteractiveUserContext,
        ) -> Option<WindowsUserContextEvidence> {
            match self {
                Self::Bound => Some(WindowsUserContextEvidence::for_test(context)),
                Self::Missing => None,
                Self::Override(evidence) => Some(evidence.clone()),
            }
        }
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum FakePackageOperation {
        InventoryMain {
            canonical_sid: String,
        },
        Deploy {
            canonical_sid: String,
            uri: String,
        },
        Launch {
            canonical_sid: String,
            aumid: String,
        },
    }

    struct FakePackageManager {
        records_by_sid: Mutex<HashMap<String, Vec<WindowsPackageRecord>>>,
        context_is_current: AtomicBool,
        inventory_evidence: Mutex<FakeEvidence>,
        deployment_evidence: Mutex<FakeEvidence>,
        launch_evidence: Mutex<FakeEvidence>,
        deployment_result: Mutex<Result<(), WindowsNativeError>>,
        deployment_progress: Mutex<Vec<u32>>,
        deployed_uris: Mutex<Vec<String>>,
        launched_aumids: Mutex<Vec<String>>,
        launch_result: Mutex<Result<(), WindowsNativeError>>,
        operations: Mutex<Vec<FakePackageOperation>>,
        all_users_calls: AtomicUsize,
    }

    impl FakePackageManager {
        fn with_records(records: Vec<WindowsPackageRecord>) -> Self {
            Self::with_user_records([(USER_SID, records)])
        }

        fn with_user_records(
            records: impl IntoIterator<Item = (&'static str, Vec<WindowsPackageRecord>)>,
        ) -> Self {
            Self {
                records_by_sid: Mutex::new(
                    records
                        .into_iter()
                        .map(|(sid, records)| (sid.to_owned(), records))
                        .collect(),
                ),
                context_is_current: AtomicBool::new(true),
                inventory_evidence: Mutex::new(FakeEvidence::Bound),
                deployment_evidence: Mutex::new(FakeEvidence::Bound),
                launch_evidence: Mutex::new(FakeEvidence::Bound),
                deployment_result: Mutex::new(Ok(())),
                deployment_progress: Mutex::new(vec![35, 80]),
                deployed_uris: Mutex::new(Vec::new()),
                launched_aumids: Mutex::new(Vec::new()),
                launch_result: Mutex::new(Ok(())),
                operations: Mutex::new(Vec::new()),
                all_users_calls: AtomicUsize::new(0),
            }
        }

        fn set_user_records(&self, sid: &str, records: Vec<WindowsPackageRecord>) {
            self.records_by_sid
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(sid.to_owned(), records);
        }

        fn set_context_is_current(&self, value: bool) {
            self.context_is_current.store(value, Ordering::Release);
        }

        fn set_inventory_evidence(&self, evidence: FakeEvidence) {
            *self
                .inventory_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = evidence;
        }

        fn set_deployment_evidence(&self, evidence: FakeEvidence) {
            *self
                .deployment_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = evidence;
        }

        fn set_launch_evidence(&self, evidence: FakeEvidence) {
            *self
                .launch_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = evidence;
        }

        fn set_deployment_result(&self, result: Result<(), WindowsNativeError>) {
            *self
                .deployment_result
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = result;
        }

        fn set_launch_result(&self, result: Result<(), WindowsNativeError>) {
            *self
                .launch_result
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = result;
        }

        fn operations(&self) -> Vec<FakePackageOperation> {
            self.operations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }

        fn all_users_call_count(&self) -> usize {
            self.all_users_calls.load(Ordering::Acquire)
        }
    }

    impl Default for FakePackageManager {
        fn default() -> Self {
            Self::with_records(Vec::new())
        }
    }

    impl WindowsPackageManager for FakePackageManager {
        fn packages_for_user(
            &self,
            context: &InteractiveUserContext,
        ) -> Result<WindowsPackageInventory, WindowsNativeError> {
            self.operations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(FakePackageOperation::InventoryMain {
                    canonical_sid: context.canonical_sid().to_owned(),
                });
            if !self.context_is_current.load(Ordering::Acquire) {
                return Err(WindowsNativeError::context_mismatch());
            }
            let records = self
                .records_by_sid
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .get(context.canonical_sid())
                .cloned()
                .unwrap_or_default();
            let evidence = self
                .inventory_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .for_context(context);
            Ok(WindowsPackageInventory::for_test(evidence, records))
        }

        fn deploy_current_user(
            &self,
            context: &InteractiveUserContext,
            package_file_uri: &str,
            progress: WindowsDeploymentProgressSink,
        ) -> Result<WindowsUserOperationReceipt, WindowsNativeError> {
            if !self.context_is_current.load(Ordering::Acquire) {
                return Err(WindowsNativeError::context_mismatch());
            }
            self.deployed_uris
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(package_file_uri.to_owned());
            self.operations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(FakePackageOperation::Deploy {
                    canonical_sid: context.canonical_sid().to_owned(),
                    uri: package_file_uri.to_owned(),
                });
            for value in self
                .deployment_progress
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .iter()
                .copied()
            {
                progress(value);
            }
            (*self
                .deployment_result
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()))?;
            let evidence = self
                .deployment_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .for_context(context);
            Ok(WindowsUserOperationReceipt::for_test(evidence))
        }

        fn launch_aumid(
            &self,
            context: &InteractiveUserContext,
            aumid: &str,
        ) -> Result<WindowsUserOperationReceipt, WindowsNativeError> {
            if !self.context_is_current.load(Ordering::Acquire) {
                return Err(WindowsNativeError::context_mismatch());
            }
            self.launched_aumids
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(aumid.to_owned());
            self.operations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(FakePackageOperation::Launch {
                    canonical_sid: context.canonical_sid().to_owned(),
                    aumid: aumid.to_owned(),
                });
            (*self
                .launch_result
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()))?;
            let evidence = self
                .launch_evidence
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .for_context(context);
            Ok(WindowsUserOperationReceipt::for_test(evidence))
        }
    }

    // The same fake deliberately owns the separate elevated capability. The
    // ordinary adapter receives it only through WindowsPackageManager, so any
    // capability-boundary regression makes these zero-call assertions fail.
    impl AllUsersProvisioner for FakePackageManager {
        fn stage_and_provision(
            &self,
            _job: &ValidatedAllUsersJob,
            _release: &ReleaseDescriptor,
        ) -> Result<(), InstallerError> {
            self.all_users_calls.fetch_add(1, Ordering::AcqRel);
            Ok(())
        }
    }

    fn host(architecture: CpuArchitecture, version: &str) -> WindowsHost {
        WindowsHost::new(architecture, version, PathBuf::from("C:\\")).unwrap()
    }

    fn user_context(sid: &str) -> Arc<InteractiveUserContext> {
        Arc::new(InteractiveUserContext::for_test(sid, 1))
    }

    fn release(
        architecture: CpuArchitecture,
        minimum_os_version: Option<&str>,
    ) -> ReleaseDescriptor {
        ReleaseDescriptor::new(
            DesktopPlatform::Windows,
            architecture,
            "1.2.3.4",
            PlatformVersion::parse_windows_msix("1.2.3.4").unwrap(),
            "OpenAI.Codex_1.2.3.4_fixture.msix",
            "a".repeat(64),
            1024,
            match architecture {
                CpuArchitecture::X86_64 => TrustedDownloadEndpoint::WinX64,
                CpuArchitecture::Aarch64 => TrustedDownloadEndpoint::WinArm64,
                _ => panic!("fixture release architecture must be supported"),
            },
            minimum_os_version.map(str::to_owned),
        )
        .unwrap()
    }

    fn record(
        identity_name: &str,
        publisher: &str,
        architecture: CpuArchitecture,
        application_ids: Vec<&str>,
    ) -> WindowsPackageRecord {
        WindowsPackageRecord::new(
            identity_name,
            publisher,
            FAMILY_NAME,
            PlatformVersion::parse_windows_msix("1.2.3.4").unwrap(),
            architecture,
            Some("Codex".to_owned()),
            application_ids.into_iter().map(str::to_owned).collect(),
        )
    }

    fn adapter(manager: Arc<dyn WindowsPackageManager>) -> WindowsPlatformAdapter {
        WindowsPlatformAdapter::new(
            manager,
            user_context(USER_SID),
            host(CpuArchitecture::X86_64, "10.0.22631.0"),
            VerifiedPublisherEvidence::for_test(PUBLISHER),
        )
    }

    fn release_for_artifact(bytes: &[u8]) -> ReleaseDescriptor {
        ReleaseDescriptor::new(
            DesktopPlatform::Windows,
            CpuArchitecture::X86_64,
            "1.2.3.4",
            PlatformVersion::parse_windows_msix("1.2.3.4").unwrap(),
            "OpenAI.Codex_1.2.3.4_fixture.msix",
            sha256_hex(bytes),
            bytes.len() as u64,
            TrustedDownloadEndpoint::WinX64,
            None,
        )
        .unwrap()
    }

    fn downloaded_artifact_for(
        release: &ReleaseDescriptor,
        bytes: &[u8],
    ) -> (tempfile::TempDir, DownloadedArtifact) {
        let root = tempfile::tempdir().unwrap();
        let directory =
            JobTempDir::create(root.path(), &Uuid::new_v4().hyphenated().to_string()).unwrap();
        fs::write(directory.final_path(ArtifactKind::Msix), bytes).unwrap();
        let artifact = DownloadedArtifact::from_test_file(&directory, release).unwrap();
        (root, artifact)
    }

    fn verified_msix_artifact() -> (tempfile::TempDir, ReleaseDescriptor, DownloadedArtifact) {
        let root = tempfile::tempdir().unwrap();
        let directory =
            JobTempDir::create(root.path(), &Uuid::new_v4().hyphenated().to_string()).unwrap();
        let path = directory.final_path(ArtifactKind::Msix);
        let file = File::create(&path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("AppxManifest.xml", options).unwrap();
        archive
            .write_all(include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/codex_desktop/OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0.AppxManifest.xml"
            )))
            .unwrap();
        archive.start_file("AppxBlockMap.xml", options).unwrap();
        archive.write_all(b"fixture block map").unwrap();
        archive.start_file("AppxSignature.p7x", options).unwrap();
        archive.write_all(b"fixture signature").unwrap();
        archive.finish().unwrap();

        let bytes = fs::read(&path).unwrap();
        let release = ReleaseDescriptor::new(
            DesktopPlatform::Windows,
            CpuArchitecture::X86_64,
            "26.721.4979",
            PlatformVersion::parse_windows_msix("26.721.4979.0").unwrap(),
            "OpenAI.Codex_26.721.4979.0_fixture.msix",
            sha256_hex(&bytes),
            bytes.len() as u64,
            TrustedDownloadEndpoint::WinX64,
            None,
        )
        .unwrap();
        let artifact = DownloadedArtifact::from_test_file(&directory, &release).unwrap();
        (root, release, artifact)
    }

    #[tokio::test]
    async fn current_user_inventory_uses_exact_identity_publisher_architecture_and_aumid() {
        let manager = Arc::new(FakePackageManager::with_records(vec![
            record(
                "OpenAI.CodexBeta",
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["Beta"],
            ),
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["CodexApp"],
            ),
        ]));
        let status = adapter(manager.clone()).inspect_local().await.unwrap();
        let LocalInstallStatus::Installed { application } = status else {
            panic!("exact Stable record should be installed")
        };
        assert_eq!(application.stable_identity, WINDOWS_CODEX_STABLE_IDENTITY);
        assert_eq!(application.display_version.as_deref(), Some("1.2.3.4"));
        assert_eq!(
            application.launch_target,
            LaunchTarget::WindowsAumid(format!("{FAMILY_NAME}!CodexApp"))
        );
        assert_eq!(application.location, None);
        assert_eq!(
            manager.operations(),
            vec![FakePackageOperation::InventoryMain {
                canonical_sid: USER_SID.to_owned(),
            }]
        );
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn explicit_sid_main_inventory_ignores_other_users_and_never_queries_all_users() {
        let manager = Arc::new(FakePackageManager::with_user_records([
            (
                USER_SID,
                vec![record(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    vec!["CodexApp"],
                )],
            ),
            (
                OTHER_USER_SID,
                vec![
                    record(
                        WINDOWS_CODEX_STABLE_IDENTITY,
                        PUBLISHER,
                        CpuArchitecture::X86_64,
                        vec!["OtherOne"],
                    ),
                    record(
                        WINDOWS_CODEX_STABLE_IDENTITY,
                        PUBLISHER,
                        CpuArchitecture::X86_64,
                        vec!["OtherTwo"],
                    ),
                ],
            ),
        ]));

        let status = adapter(manager.clone()).inspect_local().await.unwrap();
        let LocalInstallStatus::Installed { application } = status else {
            panic!("the one same-SID Stable Main package must be selected")
        };
        assert_eq!(
            application.launch_target,
            LaunchTarget::WindowsAumid(format!("{FAMILY_NAME}!CodexApp"))
        );
        assert_eq!(
            manager.operations(),
            vec![FakePackageOperation::InventoryMain {
                canonical_sid: USER_SID.to_owned(),
            }]
        );
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn other_user_packages_do_not_change_same_user_absence() {
        let manager = Arc::new(FakePackageManager::with_user_records([(
            OTHER_USER_SID,
            vec![record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["OtherCodex"],
            )],
        )]));
        let adapter = adapter(manager.clone());

        assert_eq!(
            adapter.inspect_local().await.unwrap(),
            LocalInstallStatus::NotInstalled {
                platform: DesktopPlatform::Windows,
                architecture: CpuArchitecture::X86_64,
            }
        );
        assert_eq!(
            adapter.inspect_restart_candidates().await.unwrap(),
            RestartCandidateInspection::NotInstalled
        );
        assert!(manager.operations().iter().all(|operation| matches!(
            operation,
            FakePackageOperation::InventoryMain { canonical_sid }
                if canonical_sid == USER_SID
        )));
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn multiple_same_sid_stable_main_packages_are_ambiguous_for_discovery_and_restart() {
        let manager = Arc::new(FakePackageManager::with_records(vec![
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["CodexOne"],
            ),
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["CodexTwo"],
            ),
        ]));
        let adapter = adapter(manager.clone());

        let LocalInstallStatus::Ambiguous { candidates, .. } =
            adapter.inspect_local().await.unwrap()
        else {
            panic!("same-user duplicate Stable Main packages must be ambiguous")
        };
        assert_eq!(candidates.len(), 2);
        assert_eq!(
            adapter.inspect_restart_candidates().await.unwrap(),
            RestartCandidateInspection::AmbiguousInstallations
        );
        assert!(manager.operations().iter().all(|operation| matches!(
            operation,
            FakePackageOperation::InventoryMain { canonical_sid }
                if canonical_sid == USER_SID
        )));
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn missing_or_wrong_context_inventory_evidence_fails_closed() {
        let manager = Arc::new(FakePackageManager::with_records(vec![record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        )]));
        let adapter = adapter(manager.clone());

        manager.set_inventory_evidence(FakeEvidence::Missing);
        let missing = adapter.inspect_local().await.unwrap_err();
        assert_eq!(missing.code(), InstallerErrorCode::PackageIdentityMismatch);

        let other_context = InteractiveUserContext::for_test(OTHER_USER_SID, 1);
        manager.set_inventory_evidence(FakeEvidence::Override(
            WindowsUserContextEvidence::for_test(&other_context),
        ));
        let wrong_owner = adapter.inspect_local().await.unwrap_err();
        assert_eq!(
            wrong_owner.code(),
            InstallerErrorCode::PackageIdentityMismatch
        );
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn inventory_fails_closed_for_wrong_publisher_architecture_and_multiple_apps() {
        for record in [
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                "CN=untrusted",
                CpuArchitecture::X86_64,
                vec!["CodexApp"],
            ),
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::Aarch64,
                vec!["CodexApp"],
            ),
            record(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                vec!["One", "Two"],
            ),
        ] {
            let error = adapter(Arc::new(FakePackageManager::with_records(vec![record])))
                .inspect_local()
                .await
                .unwrap_err();
            assert!(matches!(
                error.code(),
                InstallerErrorCode::PackageIdentityMismatch
                    | InstallerErrorCode::PackageArchitectureMismatch
                    | InstallerErrorCode::PackageParseFailed
            ));
        }
    }

    #[tokio::test]
    async fn preflight_rejects_architecture_and_minimum_os_without_a_native_call() {
        let adapter = adapter(Arc::new(FakePackageManager::default()));
        let temporary = tempfile::tempdir().unwrap();
        let plan = adapter
            .preflight(&release(CpuArchitecture::X86_64, None), temporary.path())
            .await
            .unwrap();
        assert_eq!(plan.additional_disk_paths(), &[PathBuf::from("C:\\")]);

        let architecture_error = adapter
            .preflight(&release(CpuArchitecture::Aarch64, None), temporary.path())
            .await
            .unwrap_err();
        assert_eq!(
            architecture_error.code(),
            InstallerErrorCode::ArchitectureUnsupported
        );

        let minimum_os_error = adapter
            .preflight(
                &release(CpuArchitecture::X86_64, Some("10.0.65535.0")),
                temporary.path(),
            )
            .await
            .unwrap_err();
        assert_eq!(
            minimum_os_error.code(),
            InstallerErrorCode::OsVersionUnsupported
        );
    }

    #[test]
    fn manifest_release_gate_requires_exact_stable_identity_publisher_architecture_and_versions() {
        let host = host(CpuArchitecture::X86_64, "10.0.22631.0");
        let publisher_evidence = VerifiedPublisherEvidence::for_test(PUBLISHER);
        let descriptor = release(CpuArchitecture::X86_64, Some("10.0.19041.0"));
        let valid = manifest::manifest_for_test(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            "1.2.3.4",
            "10.0.19041.0",
            "CodexApp",
        );
        validate_manifest_for_release(&valid, &host, &publisher_evidence, &descriptor).unwrap();

        for (manifest, expected) in [
            (
                manifest::manifest_for_test(
                    "OpenAI.CodexBeta",
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    "1.2.3.4",
                    "10.0.19041.0",
                    "CodexApp",
                ),
                InstallerErrorCode::PackageIdentityMismatch,
            ),
            (
                manifest::manifest_for_test(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    "CN=untrusted",
                    CpuArchitecture::X86_64,
                    "1.2.3.4",
                    "10.0.19041.0",
                    "CodexApp",
                ),
                InstallerErrorCode::PackageIdentityMismatch,
            ),
            (
                manifest::manifest_for_test(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::Aarch64,
                    "1.2.3.4",
                    "10.0.19041.0",
                    "CodexApp",
                ),
                InstallerErrorCode::PackageArchitectureMismatch,
            ),
            (
                manifest::manifest_for_test(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    "1.2.3.5",
                    "10.0.19041.0",
                    "CodexApp",
                ),
                InstallerErrorCode::PackageIdentityMismatch,
            ),
            (
                manifest::manifest_for_test(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    "1.2.3.4",
                    "10.0.19042.0",
                    "CodexApp",
                ),
                InstallerErrorCode::PackageIdentityMismatch,
            ),
        ] {
            let error =
                validate_manifest_for_release(&manifest, &host, &publisher_evidence, &descriptor)
                    .unwrap_err();
            assert_eq!(error.code(), expected);
        }

        let host_os_error = validate_manifest_for_release(
            &manifest::manifest_for_test(
                WINDOWS_CODEX_STABLE_IDENTITY,
                PUBLISHER,
                CpuArchitecture::X86_64,
                "1.2.3.4",
                "10.0.65535.0",
                "CodexApp",
            ),
            &host,
            &publisher_evidence,
            &release(CpuArchitecture::X86_64, None),
        )
        .unwrap_err();
        assert_eq!(
            host_os_error.code(),
            InstallerErrorCode::OsVersionUnsupported
        );
    }

    #[tokio::test]
    async fn fake_current_user_deployment_reports_progress_uses_file_uri_and_maps_failures() {
        let manager = Arc::new(FakePackageManager::default());
        let adapter = adapter(manager.clone());
        let trusted_bytes = b"fixture";
        let release = release_for_artifact(trusted_bytes);
        let (_root, artifact) = downloaded_artifact_for(&release, trusted_bytes);
        let package = VerifiedPackage::from_completed_validation(&release, artifact).unwrap();
        let reported = Arc::new(Mutex::new(Vec::<u64>::new()));
        let reported_for_sink = reported.clone();
        let progress: PlatformProgressSink = Arc::new(move |progress: JobProgress| {
            reported_for_sink
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(progress.completed_bytes.unwrap());
        });
        adapter
            .install_current_user(&package, progress)
            .await
            .unwrap();
        assert_eq!(
            *reported
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
            vec![0, 35, 80, 100]
        );
        let deployed = manager
            .deployed_uris
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        assert_eq!(deployed.len(), 1);
        assert!(deployed[0].starts_with("file:///"));
        assert!(!deployed[0].starts_with("https://"));
        assert!(matches!(
            manager.operations().first(),
            Some(FakePackageOperation::Deploy { canonical_sid, .. })
                if canonical_sid == USER_SID
        ));

        for (hresult, expected) in [
            (
                0x8007_3D02_u32 as i32,
                InstallerErrorCode::WindowsPackageInUse,
            ),
            (
                0x8007_3D01_u32 as i32,
                InstallerErrorCode::WindowsDeploymentBlocked,
            ),
            (
                0x8007_3CF3_u32 as i32,
                InstallerErrorCode::WindowsDependencyMissing,
            ),
            (
                0x800B_0100_u32 as i32,
                InstallerErrorCode::PackageSignatureInvalid,
            ),
            (
                0x8123_4567_u32 as i32,
                InstallerErrorCode::WindowsDeploymentFailed,
            ),
        ] {
            manager.set_deployment_result(Err(WindowsNativeError::from_hresult(hresult)));
            let error = adapter
                .install_current_user(&package, Arc::new(|_| {}))
                .await
                .unwrap_err();
            assert_eq!(error.code(), expected);
        }
    }

    #[tokio::test]
    async fn deployment_requires_current_context_and_a_same_context_receipt() {
        let trusted_bytes = b"fixture";
        let release = release_for_artifact(trusted_bytes);
        let (_root, artifact) = downloaded_artifact_for(&release, trusted_bytes);
        let package = VerifiedPackage::from_completed_validation(&release, artifact).unwrap();

        let drifted_before_deploy = Arc::new(FakePackageManager::default());
        drifted_before_deploy.set_context_is_current(false);
        let error = adapter(drifted_before_deploy.clone())
            .install_current_user(&package, Arc::new(|_| {}))
            .await
            .unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::PackageIdentityMismatch);
        assert!(drifted_before_deploy
            .deployed_uris
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty());

        let wrong_receipt = Arc::new(FakePackageManager::default());
        let other_context = InteractiveUserContext::for_test(OTHER_USER_SID, 1);
        wrong_receipt.set_deployment_evidence(FakeEvidence::Override(
            WindowsUserContextEvidence::for_test(&other_context),
        ));
        let error = adapter(wrong_receipt.clone())
            .install_current_user(&package, Arc::new(|_| {}))
            .await
            .unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::PackageIdentityMismatch);
        assert_eq!(
            wrong_receipt
                .deployed_uris
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn context_drift_after_deploy_blocks_the_same_context_post_query() {
        let manager = Arc::new(FakePackageManager::with_records(vec![record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        )]));
        let adapter = adapter(manager.clone());
        let trusted_bytes = b"fixture";
        let release = release_for_artifact(trusted_bytes);
        let (_root, artifact) = downloaded_artifact_for(&release, trusted_bytes);
        let package = VerifiedPackage::from_completed_validation(&release, artifact).unwrap();

        adapter
            .install_current_user(&package, Arc::new(|_| {}))
            .await
            .unwrap();
        manager.set_context_is_current(false);
        let error = adapter.inspect_local().await.unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::PackageIdentityMismatch);
        assert_eq!(
            manager.operations()[0],
            FakePackageOperation::Deploy {
                canonical_sid: USER_SID.to_owned(),
                uri: manager
                    .deployed_uris
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())[0]
                    .clone(),
            }
        );
        assert!(matches!(
            manager.operations().last(),
            Some(FakePackageOperation::InventoryMain { canonical_sid })
                if canonical_sid == USER_SID
        ));
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn replacement_after_platform_verification_never_reaches_current_user_deployment() {
        let manager = Arc::new(FakePackageManager::default());
        let adapter = WindowsPlatformAdapter::new(
            manager.clone(),
            user_context(USER_SID),
            host(CpuArchitecture::X86_64, "10.0.22631.0"),
            VerifiedPublisherEvidence::for_test(OFFICIAL_WINDOWS_CODEX_PUBLISHER),
        );
        let (_root, release, artifact) = verified_msix_artifact();
        let package = adapter.verify_package(&release, &artifact).await.unwrap();
        let mut replacement = fs::read(package.artifact_path()).unwrap();
        replacement[0] ^= 0x01;
        fs::write(package.artifact_path(), replacement).unwrap();

        let error = adapter
            .install_current_user(&package, Arc::new(|_| {}))
            .await
            .expect_err("a post-verification replacement must not reach PackageManager");

        assert_eq!(error.code(), InstallerErrorCode::ChecksumMismatch);
        assert!(manager
            .deployed_uris
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty());
    }

    #[tokio::test]
    async fn launch_accepts_only_verified_aumid_and_preserves_a_stable_error() {
        let manager = Arc::new(FakePackageManager::with_records(vec![record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        )]));
        let adapter = adapter(manager.clone());
        let installed = InstalledApplication {
            stable_identity: WINDOWS_CODEX_STABLE_IDENTITY.to_owned(),
            display_name: Some("Codex".to_owned()),
            display_version: Some("1.2.3.4".to_owned()),
            platform_version: PlatformVersion::parse_windows_msix("1.2.3.4").unwrap(),
            architecture: CpuArchitecture::X86_64,
            location: None,
            launch_target: LaunchTarget::WindowsAumid(format!("{FAMILY_NAME}!CodexApp")),
        };
        adapter.launch(&installed).await.unwrap();
        assert_eq!(
            *manager
                .launched_aumids
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
            vec![format!("{FAMILY_NAME}!CodexApp")]
        );
        assert_eq!(
            &manager.operations()[..2],
            &[
                FakePackageOperation::InventoryMain {
                    canonical_sid: USER_SID.to_owned(),
                },
                FakePackageOperation::Launch {
                    canonical_sid: USER_SID.to_owned(),
                    aumid: format!("{FAMILY_NAME}!CodexApp"),
                },
            ]
        );

        manager.set_launch_result(Err(WindowsNativeError::from_hresult(
            0x8000_4005_u32 as i32,
        )));
        let error = adapter.launch(&installed).await.unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::LaunchFailed);

        let invalid = InstalledApplication {
            launch_target: LaunchTarget::WindowsAumid("not-an-aumid".to_owned()),
            ..installed
        };
        let error = adapter.launch(&invalid).await.unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::LaunchFailed);
    }

    #[tokio::test]
    async fn launch_requeries_unique_same_context_installation_before_activation() {
        let manager = Arc::new(FakePackageManager::with_records(vec![record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        )]));
        let adapter = adapter(manager.clone());
        let LocalInstallStatus::Installed { application } = adapter.inspect_local().await.unwrap()
        else {
            panic!("fixture must select one installed application")
        };
        manager
            .operations
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();

        let mut replacement = record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        );
        replacement.family_name = "OpenAI.Codex_replacement".to_owned();
        manager.set_user_records(USER_SID, vec![replacement]);
        let error = adapter.launch(&application).await.unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::LaunchFailed);
        assert!(manager
            .launched_aumids
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty());

        manager.set_user_records(
            USER_SID,
            vec![
                record(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    vec!["CodexApp"],
                ),
                record(
                    WINDOWS_CODEX_STABLE_IDENTITY,
                    PUBLISHER,
                    CpuArchitecture::X86_64,
                    vec!["SecondApp"],
                ),
            ],
        );
        let error = adapter.launch(&application).await.unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::MultipleInstallations);
        let error = error.to_dto();
        assert!(!error.retryable);
        assert_eq!(error.suggested_action, SuggestedAction::ResolvePathConflict);
        assert!(manager
            .launched_aumids
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty());
        assert_eq!(manager.all_users_call_count(), 0);
    }

    #[tokio::test]
    async fn launch_blocks_context_drift_and_rejects_a_wrong_context_receipt() {
        let installed_record = record(
            WINDOWS_CODEX_STABLE_IDENTITY,
            PUBLISHER,
            CpuArchitecture::X86_64,
            vec!["CodexApp"],
        );
        let installed = installed_application_from_record(
            &installed_record,
            &host(CpuArchitecture::X86_64, "10.0.22631.0"),
            &VerifiedPublisherEvidence::for_test(PUBLISHER),
        )
        .unwrap();

        let drifted = Arc::new(FakePackageManager::with_records(vec![
            installed_record.clone()
        ]));
        drifted.set_context_is_current(false);
        let error = adapter(drifted.clone())
            .launch(&installed)
            .await
            .unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::PackageIdentityMismatch);
        assert!(drifted
            .launched_aumids
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty());

        let wrong_receipt = Arc::new(FakePackageManager::with_records(vec![installed_record]));
        let other_context = InteractiveUserContext::for_test(OTHER_USER_SID, 1);
        wrong_receipt.set_launch_evidence(FakeEvidence::Override(
            WindowsUserContextEvidence::for_test(&other_context),
        ));
        let error = adapter(wrong_receipt.clone())
            .launch(&installed)
            .await
            .unwrap_err();
        assert_eq!(error.code(), InstallerErrorCode::PackageIdentityMismatch);
        assert_eq!(
            wrong_receipt
                .launched_aumids
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .len(),
            1
        );
    }

    #[test]
    fn production_publisher_evidence_returns_the_audited_exact_publisher() {
        let evidence = current_official_publisher_evidence()
            .expect("audited production Publisher evidence should be available");
        assert_eq!(
            evidence.publisher(),
            "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B"
        );
    }

    #[test]
    fn production_publisher_evidence_matches_the_reviewed_identity_fixture() {
        let fixture = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/codex_desktop/OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0.AppxManifest.xml"
        ));
        let evidence = current_official_publisher_evidence()
            .expect("audited production Publisher evidence should be available");

        assert!(fixture.contains(r#"Name="OpenAI.Codex""#));
        assert!(fixture.contains(r#"Version="26.721.4979.0""#));
        assert!(fixture.contains(r#"ProcessorArchitecture="x64""#));
        assert!(fixture.contains(r#"MinVersion="10.0.19041.0""#));
        assert!(fixture.contains(r#"Id="App""#));
        assert!(fixture.contains(&format!(r#"Publisher="{}""#, evidence.publisher())));
    }
}
