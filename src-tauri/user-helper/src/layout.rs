use std::{
    fmt,
    path::{Component, Path, PathBuf},
};

use crate::CanonicalJobId;

pub const CACHE_DIRECTORY: &str = "cache";
pub const CODEX_INSTALLER_DIRECTORY: &str = "codex-installer";
pub const INSTALLER_FILE_NAME: &str = "installer.msix";
pub const USER_HELPER_PIPE_PREFIX: &str = r"\\.\pipe\LOCAL\FyAgent.UserHelper.v1.";
/// `FILE_WRITE_DATA | SYNCHRONIZE`; shared with the parent pipe DACL.
///
/// `FILE_GENERIC_WRITE` is intentionally not used because its append-data bit
/// aliases `FILE_CREATE_PIPE_INSTANCE` for named pipes.
pub const USER_HELPER_PIPE_CLIENT_ACCESS_MASK: u32 = 0x0010_0002;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstallLayout {
    install_root: PathBuf,
    installer_path: PathBuf,
}

impl InstallLayout {
    pub fn install_root(&self) -> &Path {
        &self.install_root
    }

    pub fn installer_path(&self) -> &Path {
        &self.installer_path
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LayoutError {
    ExecutablePathNotAbsolute,
    ExecutablePathNotNormalized,
    ExecutablePathHasNoFileName,
    ExecutablePathHasNoParent,
}

impl fmt::Display for LayoutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::ExecutablePathNotAbsolute => "helper executable path is not absolute",
            Self::ExecutablePathNotNormalized => "helper executable path is not normalized",
            Self::ExecutablePathHasNoFileName => "helper executable path has no file name",
            Self::ExecutablePathHasNoParent => "helper executable path has no installation root",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for LayoutError {}

pub fn derive_install_layout(
    current_executable: &Path,
    job_id: &CanonicalJobId,
) -> Result<InstallLayout, LayoutError> {
    if !current_executable.is_absolute() {
        return Err(LayoutError::ExecutablePathNotAbsolute);
    }
    if current_executable
        .components()
        .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(LayoutError::ExecutablePathNotNormalized);
    }
    if current_executable.file_name().is_none() {
        return Err(LayoutError::ExecutablePathHasNoFileName);
    }

    let install_root = current_executable
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or(LayoutError::ExecutablePathHasNoParent)?
        .to_path_buf();
    let installer_path = install_root
        .join(CACHE_DIRECTORY)
        .join(CODEX_INSTALLER_DIRECTORY)
        .join(job_id.as_str())
        .join(INSTALLER_FILE_NAME);

    Ok(InstallLayout {
        install_root,
        installer_path,
    })
}

pub fn pipe_name(nonce: &crate::PipeNonce) -> String {
    let mut name = String::with_capacity(USER_HELPER_PIPE_PREFIX.len() + nonce.as_str().len());
    name.push_str(USER_HELPER_PIPE_PREFIX);
    name.push_str(nonce.as_str());
    name
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::{CanonicalJobId, PipeNonce};

    use super::*;

    const JOB_ID: &str = "123e4567-e89b-12d3-a456-426614174000";
    const NONCE: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn job_id() -> CanonicalJobId {
        CanonicalJobId::parse(JOB_ID).expect("canonical UUID")
    }

    #[test]
    fn derives_only_the_fixed_direct_child_installer_path() {
        let layout =
            derive_install_layout(Path::new("/opt/FyAgent/fyagent-user-helper.exe"), &job_id())
                .expect("absolute helper path");

        assert_eq!(layout.install_root(), Path::new("/opt/FyAgent"));
        assert_eq!(
            layout.installer_path(),
            Path::new(
                "/opt/FyAgent/cache/codex-installer/123e4567-e89b-12d3-a456-426614174000/installer.msix"
            )
        );
        assert_eq!(
            layout
                .installer_path()
                .strip_prefix(layout.install_root())
                .expect("installer must remain under its derived root")
                .components()
                .count(),
            4
        );
    }

    #[test]
    fn preserves_install_roots_with_spaces_without_using_the_working_directory() {
        let layout = derive_install_layout(
            Path::new("/mnt/install root/FyAgent/fyagent-user-helper.exe"),
            &job_id(),
        )
        .expect("absolute helper path");
        assert_eq!(
            layout.install_root(),
            Path::new("/mnt/install root/FyAgent")
        );
        assert!(layout.installer_path().ends_with(INSTALLER_FILE_NAME));
    }

    #[test]
    fn rejects_relative_or_parentless_executable_paths() {
        assert_eq!(
            derive_install_layout(Path::new("fyagent-user-helper.exe"), &job_id()).unwrap_err(),
            LayoutError::ExecutablePathNotAbsolute
        );
        assert_eq!(
            derive_install_layout(Path::new("/"), &job_id()).unwrap_err(),
            LayoutError::ExecutablePathHasNoFileName
        );
    }

    #[test]
    fn rejects_parent_traversal_in_the_executable_path() {
        assert_eq!(
            derive_install_layout(
                Path::new("/opt/FyAgent/../other/fyagent-user-helper.exe"),
                &job_id()
            )
            .unwrap_err(),
            LayoutError::ExecutablePathNotNormalized
        );
    }

    #[test]
    fn pipe_name_is_exactly_the_fixed_local_prefix_and_nonce() {
        let nonce = PipeNonce::parse(NONCE).expect("valid nonce");
        let name = pipe_name(&nonce);
        assert_eq!(name, format!("{USER_HELPER_PIPE_PREFIX}{NONCE}"));
        assert_eq!(name.len(), USER_HELPER_PIPE_PREFIX.len() + 64);
        assert!(!name.contains(JOB_ID));
    }

    #[test]
    fn pipe_client_access_is_write_data_plus_synchronize_only() {
        const FILE_WRITE_DATA: u32 = 0x0000_0002;
        const FILE_APPEND_DATA_OR_CREATE_PIPE_INSTANCE: u32 = 0x0000_0004;
        const SYNCHRONIZE: u32 = 0x0010_0000;

        assert_eq!(
            USER_HELPER_PIPE_CLIENT_ACCESS_MASK,
            FILE_WRITE_DATA | SYNCHRONIZE
        );
        assert_eq!(
            USER_HELPER_PIPE_CLIENT_ACCESS_MASK & FILE_APPEND_DATA_OR_CREATE_PIPE_INSTANCE,
            0
        );
    }
}
