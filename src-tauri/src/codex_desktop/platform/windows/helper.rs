//! Parent-side boundary for the unelevated current-user package helper.
//!
//! This module owns only the one-shot pipe, client identity validation, and
//! bounded protocol consumer. The helper executable owns PackageManager. The
//! install call remains disconnected until the downloader's verified file is
//! pinned for the full helper operation.

use std::{
    ffi::{OsStr, OsString},
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use fyagent_user_helper::{
    decode_frame, layout::pipe_name, CanonicalJobId, HelperErrorCode, HelperMessage, PipeNonce,
    MAX_FRAME_BYTES,
};
use windows::{
    core::{HRESULT, PCWSTR, PWSTR},
    Win32::{
        Foundation::{
            CloseHandle, ERROR_BROKEN_PIPE, ERROR_IO_PENDING, ERROR_NO_DATA, ERROR_PIPE_CONNECTED,
            GENERIC_READ, HANDLE, HLOCAL,
        },
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
                SDDL_REVISION_1,
            },
            GetTokenInformation, RevertToSelf, TokenSessionId, TokenUser, PSECURITY_DESCRIPTOR,
            PSID, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
        },
        Storage::FileSystem::{
            CreateFileW, GetFileInformationByHandle, ReadFile, BY_HANDLE_FILE_INFORMATION,
            FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL, FILE_ATTRIBUTE_REPARSE_POINT,
            FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OPEN_REPARSE_POINT, FILE_FLAG_OVERLAPPED,
            FILE_SHARE_READ, OPEN_EXISTING, PIPE_ACCESS_INBOUND,
        },
        System::{
            Pipes::{
                ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe,
                GetNamedPipeClientProcessId, GetNamedPipeClientSessionId,
                ImpersonateNamedPipeClient, PIPE_READMODE_MESSAGE, PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_TYPE_MESSAGE, PIPE_WAIT,
            },
            Threading::{
                CreateEventW, GetCurrentThread, OpenProcess, OpenProcessToken, OpenThreadToken,
                QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
            },
            IO::{CancelIoEx, GetOverlappedResult, GetOverlappedResultEx, OVERLAPPED},
        },
    },
};

use super::PlatformProgressSink;
use crate::{
    codex_desktop::{
        error::{InstallerError, InstallerErrorCode},
        types::{JobProgress, ProgressPhase},
    },
    platform::process_launch::{fixed_user_helper_path, launch_fyagent_user_helper_as_user},
    windows_runtime::InteractiveUserContext,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const OPERATION_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const TERMINAL_CLOSE_TIMEOUT: Duration = Duration::from_secs(5);
const PIPE_DEFAULT_TIMEOUT_MS: u32 = 30_000;
const MAX_PROTOCOL_MESSAGES: usize = 104;

/// Runs the already-packaged helper after its package file has been pinned by
/// the caller. This function intentionally accepts no package path or command.
///
/// Commit 6 leaves this boundary uncalled. Commit 7 supplies the pinned-file
/// capability and keeps that handle alive across this entire call.
#[allow(dead_code)]
pub(super) fn run_pinned_user_helper(
    context: &InteractiveUserContext,
    job_id: &CanonicalJobId,
    progress: PlatformProgressSink,
) -> Result<(), InstallerError> {
    let helper_path = fixed_user_helper_path().map_err(|_| helper_launch_error())?;
    let helper_image = PinnedHelperImage::open(&helper_path)?;
    let nonce = generate_nonce()?;
    let server = OneShotPipeServer::create(context.canonical_sid(), &nonce)?;

    launch_fyagent_user_helper_as_user(job_id, &nonce).map_err(|_| helper_launch_error())?;
    server.connect(CONNECT_TIMEOUT)?;
    let operation_deadline = Instant::now() + OPERATION_TIMEOUT;
    // ImpersonateNamedPipeClient binds to the last message read. Read one
    // bounded frame without decoding or accepting it, authenticate that
    // connection, and only then admit the frame into the protocol state.
    let first_frame_timeout = remaining_until(operation_deadline)?.min(CONNECT_TIMEOUT);
    let first_frame = match server.read_frame(first_frame_timeout)? {
        PipeFrameRead::Frame(frame) => frame,
        PipeFrameRead::Closed => {
            return Err(helper_pipe_error(
                "the user-helper pipe closed before its identity was admitted",
            ))
        }
    };
    server.validate_client(context, helper_image.identity())?;
    let first_message = decode_protocol_frame(&first_frame)?;
    let result = consume_protocol(&server, first_message, progress, operation_deadline);
    drop(helper_image);
    result
}

fn generate_nonce() -> Result<PipeNonce, InstallerError> {
    use windows::Win32::Security::Cryptography::{
        BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
    };

    let mut random = [0_u8; 32];
    let status = unsafe { BCryptGenRandom(None, &mut random, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    if status.0 < 0 {
        return Err(helper_pipe_error(
            "the user-helper pipe nonce could not be generated",
        ));
    }
    let mut encoded = String::with_capacity(64);
    for byte in random {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}")
            .map_err(|_| helper_pipe_error("the user-helper pipe nonce could not be encoded"))?;
    }
    PipeNonce::parse(&encoded)
        .map_err(|_| helper_pipe_error("the user-helper pipe nonce was invalid"))
}

struct OneShotPipeServer {
    handle: OwnedHandle,
}

impl OneShotPipeServer {
    fn create(shell_sid: &str, nonce: &PipeNonce) -> Result<Self, InstallerError> {
        let security = PipeSecurityDescriptor::new(shell_sid)?;
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: security.as_ptr(),
            bInheritHandle: false.into(),
        };
        let name = wide_null(&pipe_name(nonce));
        let handle = unsafe {
            CreateNamedPipeW(
                PCWSTR(name.as_ptr()),
                PIPE_ACCESS_INBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                1,
                0,
                MAX_FRAME_BYTES as u32,
                PIPE_DEFAULT_TIMEOUT_MS,
                Some(&attributes),
            )
        };
        if handle.is_invalid() {
            return Err(helper_pipe_error(
                "the one-shot user-helper pipe could not be created",
            ));
        }
        Ok(Self {
            handle: unsafe { OwnedHandle::from_raw_handle(handle.0) },
        })
    }

    fn raw(&self) -> HANDLE {
        HANDLE(self.handle.as_raw_handle())
    }

    fn connect(&self, timeout: Duration) -> Result<(), InstallerError> {
        let event = OwnedEvent::new()?;
        let mut overlapped = OVERLAPPED {
            hEvent: event.raw(),
            ..Default::default()
        };
        match unsafe { ConnectNamedPipe(self.raw(), Some(&mut overlapped)) } {
            Ok(()) => Ok(()),
            Err(error) if error.code() == hresult_from_win32(ERROR_PIPE_CONNECTED.0) => Ok(()),
            Err(error) if error.code() == hresult_from_win32(ERROR_IO_PENDING.0) => {
                wait_for_overlapped(self.raw(), &overlapped, timeout).map(|_| ())
            }
            Err(_) => Err(helper_pipe_error(
                "the user-helper did not connect to its one-shot pipe",
            )),
        }
    }

    fn validate_client(
        &self,
        context: &InteractiveUserContext,
        expected_identity: &FileIdentity,
    ) -> Result<(), InstallerError> {
        let mut process_id = 0_u32;
        let mut pipe_session_id = 0_u32;
        unsafe { GetNamedPipeClientProcessId(self.raw(), &mut process_id) }
            .map_err(|_| helper_identity_error())?;
        unsafe { GetNamedPipeClientSessionId(self.raw(), &mut pipe_session_id) }
            .map_err(|_| helper_identity_error())?;
        if process_id == 0 || pipe_session_id != context.shell_session_id() {
            return Err(helper_identity_error());
        }

        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }
            .map_err(|_| helper_identity_error())?;
        let process = OwnedWin32Handle::new(process)?;
        let image = process_image_path(process.raw())?;
        let connected_image = PinnedHelperImage::open(&image)?;
        if connected_image.identity() != expected_identity {
            return Err(helper_identity_error());
        }

        let mut token = HANDLE::default();
        unsafe { OpenProcessToken(process.raw(), TOKEN_QUERY, &mut token) }
            .map_err(|_| helper_identity_error())?;
        let token = OwnedWin32Handle::new(token)?;
        let process_token_sid = token_user_sid(token.raw())?;
        let process_token_session_id = token_session_id(token.raw())?;

        let (connection_token_sid, connection_token_session_id) =
            connected_client_token_identity(self.raw())?;

        if process_token_sid != context.canonical_sid()
            || process_token_session_id != context.shell_session_id()
            || connection_token_sid != process_token_sid
            || connection_token_session_id != process_token_session_id
        {
            return Err(helper_identity_error());
        }
        Ok(())
    }

    fn read_frame(&self, remaining: Duration) -> Result<PipeFrameRead, InstallerError> {
        let event = OwnedEvent::new()?;
        let mut overlapped = OVERLAPPED {
            hEvent: event.raw(),
            ..Default::default()
        };
        let mut frame = [0_u8; MAX_FRAME_BYTES];
        let mut transferred = 0_u32;
        match unsafe {
            ReadFile(
                self.raw(),
                Some(&mut frame),
                Some(&mut transferred),
                Some(&mut overlapped),
            )
        } {
            Ok(()) => {
                unsafe { GetOverlappedResult(self.raw(), &overlapped, &mut transferred, true) }
                    .map_err(|_| helper_pipe_error("the user-helper message could not be read"))?
            }
            Err(error) if error.code() == hresult_from_win32(ERROR_IO_PENDING.0) => {
                match wait_for_pipe_read(self.raw(), &overlapped, remaining)? {
                    PipeReadCompletion::Bytes(bytes) => transferred = bytes,
                    PipeReadCompletion::Closed => return Ok(PipeFrameRead::Closed),
                }
            }
            Err(error) if is_clean_pipe_disconnect(&error) => return Ok(PipeFrameRead::Closed),
            Err(_) => {
                return Err(helper_pipe_error(
                    "the user-helper pipe closed before a terminal message",
                ))
            }
        }

        let transferred = usize::try_from(transferred)
            .map_err(|_| helper_pipe_error("the user-helper message length was invalid"))?;
        Ok(PipeFrameRead::Frame(frame[..transferred].to_vec()))
    }

    fn read_message(&self, remaining: Duration) -> Result<PipeMessageRead, InstallerError> {
        match self.read_frame(remaining)? {
            PipeFrameRead::Frame(frame) => {
                decode_protocol_frame(&frame).map(PipeMessageRead::Message)
            }
            PipeFrameRead::Closed => Ok(PipeMessageRead::Closed),
        }
    }
}

fn connected_client_token_identity(pipe: HANDLE) -> Result<(String, u32), InstallerError> {
    let raw_pipe = pipe.0 as usize;
    std::thread::Builder::new()
        .name("fyagent-helper-peer-token".to_owned())
        .spawn(move || {
            let pipe = HANDLE(raw_pipe as *mut core::ffi::c_void);
            let impersonation = PipeClientImpersonation::begin(pipe)?;
            let mut thread_token = HANDLE::default();
            unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, &mut thread_token) }
                .map_err(|_| helper_identity_error())?;
            let thread_token = OwnedWin32Handle::new(thread_token)?;
            let sid = token_user_sid(thread_token.raw())?;
            let session_id = token_session_id(thread_token.raw())?;
            drop(thread_token);
            impersonation.revert()?;
            Ok((sid, session_id))
        })
        .map_err(|_| helper_identity_error())?
        .join()
        .map_err(|_| helper_identity_error())?
}

enum PipeFrameRead {
    Frame(Vec<u8>),
    Closed,
}

enum PipeMessageRead {
    Message(HelperMessage),
    Closed,
}

impl Drop for OneShotPipeServer {
    fn drop(&mut self) {
        unsafe {
            let _ = DisconnectNamedPipe(self.raw());
        }
    }
}

fn consume_protocol(
    server: &OneShotPipeServer,
    first_message: HelperMessage,
    progress: PlatformProgressSink,
    deadline: Instant,
) -> Result<(), InstallerError> {
    let mut sequence = ProtocolSequence::default();
    let mut first_message = Some(first_message);
    let terminal = loop {
        if sequence.message_count == MAX_PROTOCOL_MESSAGES {
            return Err(helper_pipe_error(
                "the user-helper exceeded its bounded message count",
            ));
        }
        sequence.message_count += 1;
        let message = match first_message.take() {
            Some(message) => message,
            None => {
                let remaining = remaining_until(deadline)?;
                match server.read_message(remaining)? {
                    PipeMessageRead::Message(message) => message,
                    PipeMessageRead::Closed => {
                        return Err(helper_pipe_error(
                            "the user-helper pipe closed before a terminal message",
                        ))
                    }
                }
            }
        };
        match sequence.accept(message)? {
            ProtocolAction::Started => progress.report_progress(JobProgress::new(
                ProgressPhase::Installation,
                Some(0),
                Some(100),
            )),
            ProtocolAction::Progress(completed) => {
                progress.report_progress(JobProgress::new(
                    ProgressPhase::Installation,
                    Some(completed as u64),
                    Some(100),
                ));
            }
            ProtocolAction::Success => break ProtocolTerminal::Success,
            ProtocolAction::Failure(code) => break ProtocolTerminal::Failure(code),
        }
    };

    let remaining = remaining_until(deadline)?.min(TERMINAL_CLOSE_TIMEOUT);
    match server.read_message(remaining)? {
        PipeMessageRead::Closed => match terminal {
            ProtocolTerminal::Success => Ok(()),
            ProtocolTerminal::Failure(code) => Err(map_helper_error(code)),
        },
        PipeMessageRead::Message(message) => {
            sequence.accept(message)?;
            Err(helper_pipe_error(
                "the user-helper sent data after its terminal message",
            ))
        }
    }
}

fn remaining_until(deadline: Instant) -> Result<Duration, InstallerError> {
    deadline
        .checked_duration_since(Instant::now())
        .ok_or_else(|| helper_pipe_error("the user-helper operation timed out"))
}

fn decode_protocol_frame(frame: &[u8]) -> Result<HelperMessage, InstallerError> {
    decode_frame(frame).map_err(|_| helper_pipe_error("the user-helper message was invalid"))
}

#[derive(Default)]
struct ProtocolSequence {
    message_count: usize,
    started: bool,
    last_progress: Option<u8>,
    terminal: bool,
}

enum ProtocolAction {
    Started,
    Progress(u8),
    Success,
    Failure(HelperErrorCode),
}

enum ProtocolTerminal {
    Success,
    Failure(HelperErrorCode),
}

impl ProtocolSequence {
    fn accept(&mut self, message: HelperMessage) -> Result<ProtocolAction, InstallerError> {
        if self.terminal {
            return Err(helper_pipe_error(
                "the user-helper sent data after its terminal message",
            ));
        }
        match message {
            HelperMessage::Started if !self.started => {
                self.started = true;
                Ok(ProtocolAction::Started)
            }
            HelperMessage::Progress { completed }
                if self.started
                    && self
                        .last_progress
                        .is_none_or(|previous| completed > previous) =>
            {
                self.last_progress = Some(completed);
                Ok(ProtocolAction::Progress(completed))
            }
            HelperMessage::Success if self.started => {
                self.terminal = true;
                Ok(ProtocolAction::Success)
            }
            HelperMessage::Error { code, message }
                if self.started && message == code.redacted_message() =>
            {
                self.terminal = true;
                Ok(ProtocolAction::Failure(code))
            }
            _ => Err(helper_pipe_error(
                "the user-helper message sequence was invalid",
            )),
        }
    }
}

fn map_helper_error(code: HelperErrorCode) -> InstallerError {
    let installer_code = match code {
        HelperErrorCode::PackageInUse => InstallerErrorCode::WindowsPackageInUse,
        HelperErrorCode::DeploymentBlocked => InstallerErrorCode::WindowsDeploymentBlocked,
        HelperErrorCode::DependencyMissing => InstallerErrorCode::WindowsDependencyMissing,
        HelperErrorCode::SignatureInvalid => InstallerErrorCode::PackageSignatureInvalid,
        HelperErrorCode::PackageInvalid => InstallerErrorCode::PackageParseFailed,
        HelperErrorCode::InstallLayoutInvalid
        | HelperErrorCode::WinRtInitializationFailed
        | HelperErrorCode::PackageUriInvalid
        | HelperErrorCode::PackageManagerUnavailable
        | HelperErrorCode::DeploymentFailed
        | HelperErrorCode::DeploymentResultInvalid => InstallerErrorCode::WindowsDeploymentFailed,
    };
    InstallerError::new(installer_code)
        .with_diagnostic_message("the current-user package helper reported a bounded failure")
}

fn wait_for_overlapped(
    handle: HANDLE,
    overlapped: &OVERLAPPED,
    timeout: Duration,
) -> Result<u32, InstallerError> {
    let milliseconds = timeout.as_millis().min(u32::MAX as u128) as u32;
    let mut transferred = 0_u32;
    match unsafe {
        GetOverlappedResultEx(handle, overlapped, &mut transferred, milliseconds, false)
    } {
        Ok(()) => Ok(transferred),
        Err(_) => {
            unsafe {
                let _ = CancelIoEx(handle, Some(overlapped));
                let _ = GetOverlappedResult(handle, overlapped, &mut transferred, true);
            }
            Err(helper_pipe_error(
                "the user-helper operation timed out or disconnected",
            ))
        }
    }
}

enum PipeReadCompletion {
    Bytes(u32),
    Closed,
}

fn wait_for_pipe_read(
    handle: HANDLE,
    overlapped: &OVERLAPPED,
    timeout: Duration,
) -> Result<PipeReadCompletion, InstallerError> {
    let milliseconds = timeout.as_millis().min(u32::MAX as u128) as u32;
    let mut transferred = 0_u32;
    match unsafe {
        GetOverlappedResultEx(handle, overlapped, &mut transferred, milliseconds, false)
    } {
        Ok(()) => Ok(PipeReadCompletion::Bytes(transferred)),
        Err(error) if is_clean_pipe_disconnect(&error) => Ok(PipeReadCompletion::Closed),
        Err(_) => {
            unsafe {
                let _ = CancelIoEx(handle, Some(overlapped));
                // The OVERLAPPED and buffer are stack-owned, so cancellation
                // must complete before either can be dropped.
                let _ = GetOverlappedResult(handle, overlapped, &mut transferred, true);
            }
            Err(helper_pipe_error(
                "the user-helper operation timed out or disconnected",
            ))
        }
    }
}

fn is_clean_pipe_disconnect(error: &windows::core::Error) -> bool {
    error.code() == hresult_from_win32(ERROR_BROKEN_PIPE.0)
        || error.code() == hresult_from_win32(ERROR_NO_DATA.0)
}

struct PipeSecurityDescriptor(PSECURITY_DESCRIPTOR);

impl PipeSecurityDescriptor {
    fn new(shell_sid: &str) -> Result<Self, InstallerError> {
        let sddl = format!("D:P(A;;0x00100002;;;{shell_sid})(A;;RC;;;SY)(A;;RC;;;BA)");
        let sddl = wide_null(&sddl);
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
        }
        .map_err(|_| helper_pipe_error("the user-helper pipe DACL could not be created"))?;
        if descriptor.0.is_null() {
            return Err(helper_pipe_error(
                "the user-helper pipe DACL was unavailable",
            ));
        }
        Ok(Self(descriptor))
    }

    fn as_ptr(&self) -> *mut core::ffi::c_void {
        self.0 .0
    }
}

impl Drop for PipeSecurityDescriptor {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::LocalFree(Some(HLOCAL(self.0 .0)));
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    volume_serial_number: u32,
    file_index: u64,
    size: u64,
}

struct PinnedHelperImage {
    _handle: OwnedWin32Handle,
    identity: FileIdentity,
}

impl PinnedHelperImage {
    fn open(path: &Path) -> Result<Self, InstallerError> {
        let path = wide_os_null(path.as_os_str());
        let handle = unsafe {
            CreateFileW(
                PCWSTR(path.as_ptr()),
                GENERIC_READ.0,
                FILE_SHARE_READ,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
                None,
            )
        }
        .map_err(|_| helper_identity_error())?;
        let handle = OwnedWin32Handle::new(handle)?;
        let mut information = BY_HANDLE_FILE_INFORMATION::default();
        unsafe { GetFileInformationByHandle(handle.raw(), &mut information) }
            .map_err(|_| helper_identity_error())?;
        if information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 != 0
            || information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0
        {
            return Err(helper_identity_error());
        }
        let identity = FileIdentity {
            volume_serial_number: information.dwVolumeSerialNumber,
            file_index: (u64::from(information.nFileIndexHigh) << 32)
                | u64::from(information.nFileIndexLow),
            size: (u64::from(information.nFileSizeHigh) << 32)
                | u64::from(information.nFileSizeLow),
        };
        if identity.size == 0 {
            return Err(helper_identity_error());
        }
        Ok(Self {
            _handle: handle,
            identity,
        })
    }

    fn identity(&self) -> &FileIdentity {
        &self.identity
    }
}

struct PipeClientImpersonation {
    active: bool,
}

impl PipeClientImpersonation {
    fn begin(pipe: HANDLE) -> Result<Self, InstallerError> {
        unsafe { ImpersonateNamedPipeClient(pipe) }.map_err(|_| helper_identity_error())?;
        Ok(Self { active: true })
    }

    fn revert(mut self) -> Result<(), InstallerError> {
        unsafe { RevertToSelf() }.map_err(|_| helper_identity_error())?;
        self.active = false;
        Ok(())
    }
}

impl Drop for PipeClientImpersonation {
    fn drop(&mut self) {
        if self.active {
            // This guard exists only on the dedicated one-shot identity
            // thread. Even if this best-effort retry fails, exiting that
            // thread releases its impersonation token instead of contaminating
            // a reusable Tauri or Tokio worker.
            unsafe {
                let _ = RevertToSelf();
            }
        }
    }
}

struct OwnedEvent(OwnedWin32Handle);

impl OwnedEvent {
    fn new() -> Result<Self, InstallerError> {
        let handle = unsafe { CreateEventW(None, true, false, PCWSTR::null()) }
            .map_err(|_| helper_pipe_error("the user-helper wait event could not be created"))?;
        Ok(Self(OwnedWin32Handle::new(handle)?))
    }

    fn raw(&self) -> HANDLE {
        self.0.raw()
    }
}

struct OwnedWin32Handle(HANDLE);

impl OwnedWin32Handle {
    fn new(handle: HANDLE) -> Result<Self, InstallerError> {
        if handle.is_invalid() {
            Err(helper_identity_error())
        } else {
            Ok(Self(handle))
        }
    }

    fn raw(&self) -> HANDLE {
        self.0
    }
}

impl Drop for OwnedWin32Handle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

fn process_image_path(process: HANDLE) -> Result<PathBuf, InstallerError> {
    let mut buffer = vec![0_u16; 32_768];
    let mut length = buffer.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )
    }
    .map_err(|_| helper_identity_error())?;
    if length == 0 || length as usize > buffer.len() {
        return Err(helper_identity_error());
    }
    Ok(PathBuf::from(OsString::from_wide(
        &buffer[..length as usize],
    )))
}

fn token_session_id(token: HANDLE) -> Result<u32, InstallerError> {
    let mut session_id = 0_u32;
    let mut returned = 0_u32;
    unsafe {
        GetTokenInformation(
            token,
            TokenSessionId,
            Some((&mut session_id as *mut u32).cast()),
            std::mem::size_of::<u32>() as u32,
            &mut returned,
        )
    }
    .map_err(|_| helper_identity_error())?;
    if returned < std::mem::size_of::<u32>() as u32 {
        return Err(helper_identity_error());
    }
    Ok(session_id)
}

fn token_user_sid(token: HANDLE) -> Result<String, InstallerError> {
    let mut required = 0_u32;
    let _ = unsafe { GetTokenInformation(token, TokenUser, None, 0, &mut required) };
    if required == 0 {
        return Err(helper_identity_error());
    }
    let word = std::mem::size_of::<usize>();
    let mut aligned = vec![0_usize; (required as usize).div_ceil(word)];
    unsafe {
        GetTokenInformation(
            token,
            TokenUser,
            Some(aligned.as_mut_ptr().cast()),
            required,
            &mut required,
        )
    }
    .map_err(|_| helper_identity_error())?;
    let token_user = unsafe { &*aligned.as_ptr().cast::<TOKEN_USER>() };
    sid_to_string(token_user.User.Sid)
}

fn sid_to_string(sid: PSID) -> Result<String, InstallerError> {
    let mut string_sid = PWSTR::null();
    unsafe { ConvertSidToStringSidW(sid, &mut string_sid) }.map_err(|_| helper_identity_error())?;
    if string_sid.is_null() {
        return Err(helper_identity_error());
    }
    let rendered = unsafe { PCWSTR(string_sid.0).to_string() }.map_err(|_| helper_identity_error());
    unsafe {
        let _ = windows::Win32::Foundation::LocalFree(Some(HLOCAL(string_sid.0.cast())));
    }
    rendered
}

fn wide_null(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

fn wide_os_null(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}

const fn hresult_from_win32(value: u32) -> HRESULT {
    HRESULT::from_win32(value)
}

fn helper_launch_error() -> InstallerError {
    InstallerError::new(InstallerErrorCode::WindowsDeploymentFailed)
        .with_diagnostic_message("the fixed current-user package helper could not be launched")
}

fn helper_pipe_error(message: &'static str) -> InstallerError {
    InstallerError::new(InstallerErrorCode::WindowsDeploymentFailed)
        .with_diagnostic_message(message)
}

fn helper_identity_error() -> InstallerError {
    InstallerError::new(InstallerErrorCode::PackageIdentityMismatch)
        .with_diagnostic_message("the current-user package helper identity was rejected")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_requires_started_monotonic_progress_and_one_terminal_message() {
        let mut sequence = ProtocolSequence::default();
        assert!(matches!(
            sequence.accept(HelperMessage::Started).unwrap(),
            ProtocolAction::Started
        ));
        assert!(matches!(
            sequence
                .accept(HelperMessage::Progress { completed: 0 })
                .unwrap(),
            ProtocolAction::Progress(0)
        ));
        assert!(sequence
            .accept(HelperMessage::Progress { completed: 0 })
            .is_err());

        let mut success = ProtocolSequence::default();
        success.accept(HelperMessage::Started).unwrap();
        assert!(matches!(
            success.accept(HelperMessage::Success).unwrap(),
            ProtocolAction::Success
        ));
        assert!(success.accept(HelperMessage::Success).is_err());
    }

    #[test]
    fn protocol_rejects_early_or_noncanonical_error_messages() {
        let mut sequence = ProtocolSequence::default();
        assert!(sequence.accept(HelperMessage::Success).is_err());
        sequence.accept(HelperMessage::Started).unwrap();
        assert!(sequence
            .accept(HelperMessage::Error {
                code: HelperErrorCode::DeploymentFailed,
                message: "untrusted detail".to_owned(),
            })
            .is_err());
    }

    #[test]
    fn pipe_security_contract_is_local_first_instance_message_mode_and_minimal() {
        let source = include_str!("helper.rs");
        assert!(source.contains("FILE_FLAG_FIRST_PIPE_INSTANCE"));
        assert!(source.contains("PIPE_TYPE_MESSAGE"));
        assert!(source.contains("PIPE_READMODE_MESSAGE"));
        assert!(source.contains("PIPE_REJECT_REMOTE_CLIENTS"));
        assert!(source.contains("D:P(A;;0x00100002;;;{shell_sid})(A;;RC;;;SY)(A;;RC;;;BA)"));
        assert!(source.contains("GetNamedPipeClientProcessId"));
        assert!(source.contains("OpenProcessToken"));
        assert!(source.contains("QueryFullProcessImageNameW"));
    }
}
