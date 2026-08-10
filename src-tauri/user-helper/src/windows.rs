use std::{
    ffi::OsStr,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use url::Url;
use windows::{
    core::{HRESULT, HSTRING, PCWSTR},
    Foundation::Uri,
    Management::Deployment::{
        AddPackageOptions, DeploymentProgress, DeploymentResult, PackageManager,
    },
    Win32::{
        Foundation::HANDLE,
        Storage::FileSystem::{
            CreateFileW, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_MODE, OPEN_EXISTING,
            SECURITY_EFFECTIVE_ONLY, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT,
        },
        System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    },
};
use windows_future::AsyncOperationProgressHandler;

use fyagent_user_helper::{
    derive_install_layout, encode_frame, helper_error_code_for_deployment_hresult,
    layout::{pipe_name, USER_HELPER_PIPE_CLIENT_ACCESS_MASK},
    HelperErrorCode, HelperMessage, InstallRequest,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum HelperRunError {
    PipeUnavailable,
    PipeWriteFailed,
    OperationFailed(HelperErrorCode),
}

impl std::fmt::Display for HelperRunError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::PipeUnavailable => "the one-shot helper pipe is unavailable",
            Self::PipeWriteFailed => "the helper pipe closed before the operation completed",
            Self::OperationFailed(_) => "the current-user package installation failed",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for HelperRunError {}

pub(crate) fn run_install(request: &InstallRequest) -> Result<(), HelperRunError> {
    let channel = Arc::new(PipeChannel::connect(&pipe_name(request.pipe_nonce()))?);
    channel.send_started()?;

    match deploy_fixed_package(request, &channel) {
        Ok(()) => channel.send_terminal(HelperMessage::Success),
        Err(DeploymentFailure::Pipe) => Err(HelperRunError::PipeWriteFailed),
        Err(DeploymentFailure::Operation(code)) => {
            channel.send_terminal(HelperMessage::error(code))?;
            Err(HelperRunError::OperationFailed(code))
        }
    }
}

fn deploy_fixed_package(
    request: &InstallRequest,
    channel: &Arc<PipeChannel>,
) -> Result<(), DeploymentFailure> {
    let executable = std::env::current_exe()
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::InstallLayoutInvalid))?;
    let layout = derive_install_layout(&executable, request.job_id())
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::InstallLayoutInvalid))?;
    let package_uri = local_file_uri(layout.installer_path())?;

    let _apartment = WinRtApartment::initialize()?;
    let uri = Uri::CreateUri(&HSTRING::from(package_uri.as_str()))
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::PackageUriInvalid))?;
    let package_manager = PackageManager::new()
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::PackageManagerUnavailable))?;
    // Defaults deliberately retain Windows signature enforcement and leave
    // force-shutdown/developer options disabled.
    let options = AddPackageOptions::new()
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::PackageManagerUnavailable))?;
    let operation = package_manager
        .AddPackageByUriAsync(&uri, &options)
        .map_err(|error| {
            DeploymentFailure::Operation(helper_error_code_for_deployment_hresult(error.code().0))
        })?;

    channel
        .send_progress(0)
        .map_err(|_| DeploymentFailure::Pipe)?;
    let progress_channel = channel.clone();
    operation
        .SetProgress(&AsyncOperationProgressHandler::<
            DeploymentResult,
            DeploymentProgress,
        >::new(move |_, progress| {
            progress_channel
                .send_progress(progress.percentage.min(100) as u8)
                .map_err(|_| windows::core::Error::from_hresult(HRESULT(0x8000_4004_u32 as i32)))
        }))
        .map_err(|error| {
            DeploymentFailure::Operation(helper_error_code_for_deployment_hresult(error.code().0))
        })?;

    let result = operation.get().map_err(|error| {
        if channel.write_failed() {
            DeploymentFailure::Pipe
        } else {
            DeploymentFailure::Operation(helper_error_code_for_deployment_hresult(error.code().0))
        }
    })?;
    if channel.write_failed() {
        return Err(DeploymentFailure::Pipe);
    }

    let extended_error = result
        .ExtendedErrorCode()
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::DeploymentResultInvalid))?;
    if extended_error.0 != 0 {
        return Err(DeploymentFailure::Operation(
            helper_error_code_for_deployment_hresult(extended_error.0),
        ));
    }
    if !result
        .IsRegistered()
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::DeploymentResultInvalid))?
    {
        return Err(DeploymentFailure::Operation(
            HelperErrorCode::DeploymentResultInvalid,
        ));
    }

    channel
        .send_progress(100)
        .map_err(|_| DeploymentFailure::Pipe)
}

fn local_file_uri(path: &Path) -> Result<Url, DeploymentFailure> {
    let uri = Url::from_file_path(path)
        .map_err(|_| DeploymentFailure::Operation(HelperErrorCode::PackageUriInvalid))?;
    if uri.scheme() != "file"
        || uri.host().is_some()
        || uri.query().is_some()
        || uri.fragment().is_some()
    {
        return Err(DeploymentFailure::Operation(
            HelperErrorCode::PackageUriInvalid,
        ));
    }
    Ok(uri)
}

struct WinRtApartment;

impl WinRtApartment {
    fn initialize() -> Result<Self, DeploymentFailure> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|_| {
            DeploymentFailure::Operation(HelperErrorCode::WinRtInitializationFailed)
        })?;
        Ok(Self)
    }
}

impl Drop for WinRtApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

enum DeploymentFailure {
    Pipe,
    Operation(HelperErrorCode),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ChannelState {
    Initial,
    Started { last_progress: Option<u8> },
    Terminal,
}

struct PipeState {
    handle: OwnedHandle,
    state: ChannelState,
}

struct PipeChannel {
    state: Mutex<PipeState>,
    write_failed: AtomicBool,
}

impl PipeChannel {
    fn connect(name: &str) -> Result<Self, HelperRunError> {
        let wide_name: Vec<u16> = OsStr::new(name).encode_wide().chain(Some(0)).collect();
        // The parent creates the one and only server instance before launching
        // this process. A single CreateFileW attempt therefore avoids silently
        // attaching to a replacement endpoint after any failure.
        let handle = unsafe {
            CreateFileW(
                PCWSTR(wide_name.as_ptr()),
                USER_HELPER_PIPE_CLIENT_ACCESS_MASK,
                FILE_SHARE_MODE(0),
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL
                    | SECURITY_SQOS_PRESENT
                    | SECURITY_IDENTIFICATION
                    | SECURITY_EFFECTIVE_ONLY,
                None,
            )
        }
        .map_err(|_| HelperRunError::PipeUnavailable)?;

        let owned = unsafe { OwnedHandle::from_raw_handle(handle.0) };
        Ok(Self {
            state: Mutex::new(PipeState {
                handle: owned,
                state: ChannelState::Initial,
            }),
            write_failed: AtomicBool::new(false),
        })
    }

    fn send_started(&self) -> Result<(), HelperRunError> {
        let mut state = self.lock_state()?;
        if state.state != ChannelState::Initial {
            return self.fail_write();
        }
        write_message(&state.handle, &HelperMessage::Started).map_err(|_| {
            self.write_failed.store(true, Ordering::Release);
            HelperRunError::PipeWriteFailed
        })?;
        state.state = ChannelState::Started {
            last_progress: None,
        };
        Ok(())
    }

    fn send_progress(&self, completed: u8) -> Result<(), HelperRunError> {
        let completed = completed.min(100);
        let mut state = self.lock_state()?;
        let ChannelState::Started { last_progress } = state.state else {
            return self.fail_write();
        };
        if last_progress.is_some_and(|previous| completed <= previous) {
            return Ok(());
        }
        write_message(&state.handle, &HelperMessage::Progress { completed }).map_err(|_| {
            self.write_failed.store(true, Ordering::Release);
            HelperRunError::PipeWriteFailed
        })?;
        state.state = ChannelState::Started {
            last_progress: Some(completed),
        };
        Ok(())
    }

    fn send_terminal(&self, message: HelperMessage) -> Result<(), HelperRunError> {
        if !matches!(
            message,
            HelperMessage::Success | HelperMessage::Error { .. }
        ) {
            return self.fail_write();
        }
        let mut state = self.lock_state()?;
        if !matches!(state.state, ChannelState::Started { .. }) {
            return self.fail_write();
        }
        write_message(&state.handle, &message).map_err(|_| {
            self.write_failed.store(true, Ordering::Release);
            HelperRunError::PipeWriteFailed
        })?;
        state.state = ChannelState::Terminal;
        Ok(())
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, PipeState>, HelperRunError> {
        self.state.lock().map_err(|_| {
            self.write_failed.store(true, Ordering::Release);
            HelperRunError::PipeWriteFailed
        })
    }

    fn fail_write<T>(&self) -> Result<T, HelperRunError> {
        self.write_failed.store(true, Ordering::Release);
        Err(HelperRunError::PipeWriteFailed)
    }

    fn write_failed(&self) -> bool {
        self.write_failed.load(Ordering::Acquire)
    }
}

fn write_message(handle: &OwnedHandle, message: &HelperMessage) -> Result<(), ()> {
    let frame = encode_frame(message).map_err(|_| ())?;
    let mut written = 0_u32;
    unsafe {
        WriteFile(
            HANDLE(handle.as_raw_handle()),
            Some(&frame),
            Some(&mut written),
            None,
        )
    }
    .map_err(|_| ())?;
    if written as usize == frame.len() {
        Ok(())
    } else {
        Err(())
    }
}
