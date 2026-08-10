use std::fmt;

pub const PROTOCOL_VERSION: u8 = 1;
pub const FRAME_LENGTH_BYTES: usize = 4;
pub const MAX_ERROR_MESSAGE_BYTES: usize = 256;
pub const MAX_PAYLOAD_BYTES: usize = 2 + 1 + 2 + MAX_ERROR_MESSAGE_BYTES;
pub const MAX_FRAME_BYTES: usize = FRAME_LENGTH_BYTES + MAX_PAYLOAD_BYTES;

const STARTED_KIND: u8 = 1;
const PROGRESS_KIND: u8 = 2;
const SUCCESS_KIND: u8 = 3;
const ERROR_KIND: u8 = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum HelperErrorCode {
    InstallLayoutInvalid = 1,
    WinRtInitializationFailed = 2,
    PackageUriInvalid = 3,
    PackageManagerUnavailable = 4,
    PackageInUse = 5,
    DeploymentBlocked = 6,
    DependencyMissing = 7,
    SignatureInvalid = 8,
    PackageInvalid = 9,
    DeploymentFailed = 10,
    DeploymentResultInvalid = 11,
}

impl HelperErrorCode {
    pub const ALL: [Self; 11] = [
        Self::InstallLayoutInvalid,
        Self::WinRtInitializationFailed,
        Self::PackageUriInvalid,
        Self::PackageManagerUnavailable,
        Self::PackageInUse,
        Self::DeploymentBlocked,
        Self::DependencyMissing,
        Self::SignatureInvalid,
        Self::PackageInvalid,
        Self::DeploymentFailed,
        Self::DeploymentResultInvalid,
    ];

    pub const fn wire_code(self) -> u8 {
        self as u8
    }

    pub const fn redacted_message(self) -> &'static str {
        match self {
            Self::InstallLayoutInvalid => "The installed helper layout is invalid",
            Self::WinRtInitializationFailed => "Windows package services could not initialize",
            Self::PackageUriInvalid => "The fixed local package path is invalid",
            Self::PackageManagerUnavailable => "Windows PackageManager is unavailable",
            Self::PackageInUse => "Codex is in use and must be closed before installation",
            Self::DeploymentBlocked => "Windows policy blocked the current-user installation",
            Self::DependencyMissing => "A required Windows package dependency is missing",
            Self::SignatureInvalid => "Windows rejected the package signature",
            Self::PackageInvalid => "Windows rejected the package contents",
            Self::DeploymentFailed => "Windows PackageManager deployment failed",
            Self::DeploymentResultInvalid => {
                "Windows did not register the package for the current user"
            }
        }
    }

    fn from_wire(value: u8) -> Option<Self> {
        Self::ALL
            .iter()
            .copied()
            .find(|candidate| candidate.wire_code() == value)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HelperMessage {
    Started,
    Progress {
        completed: u8,
    },
    Success,
    Error {
        code: HelperErrorCode,
        message: String,
    },
}

impl HelperMessage {
    pub fn error(code: HelperErrorCode) -> Self {
        Self::Error {
            code,
            message: code.redacted_message().to_owned(),
        }
    }
}

/// Maps only stable Windows deployment categories into the bounded helper
/// error enum. Raw HRESULT values never cross the pipe.
pub fn helper_error_code_for_deployment_hresult(value: i32) -> HelperErrorCode {
    match value as u32 {
        0x8007_3D02 | 0x8007_3D06 => HelperErrorCode::PackageInUse,
        0x8007_3CFF | 0x8007_3D01 | 0x8007_3D19 | 0x8007_3D21 | 0x8007_3D22 | 0x8007_3D23
        | 0x8007_0005 => HelperErrorCode::DeploymentBlocked,
        0x8007_3CF3 | 0x8007_3CFD => HelperErrorCode::DependencyMissing,
        0x8007_3CF0 | 0x800B_0100 | 0x800B_0109 | 0x800B_010A | 0x800B_0004 => {
            HelperErrorCode::SignatureInvalid
        }
        0x8008_0204..=0x8008_0207 => HelperErrorCode::PackageInvalid,
        _ => HelperErrorCode::DeploymentFailed,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolError {
    FrameTooShort,
    PayloadTooLarge,
    TruncatedFrame,
    TrailingBytes,
    UnsupportedVersion,
    UnknownMessageKind,
    InvalidMessageLength,
    InvalidProgress,
    UnknownErrorCode,
    ErrorMessageTooLong,
    EmptyErrorMessage,
    ErrorMessageContainsControl,
    InvalidUtf8,
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::FrameTooShort => "helper protocol frame is shorter than its length prefix",
            Self::PayloadTooLarge => "helper protocol payload exceeds its absolute limit",
            Self::TruncatedFrame => "helper protocol frame is truncated",
            Self::TrailingBytes => "helper protocol frame has trailing bytes",
            Self::UnsupportedVersion => "helper protocol version is unsupported",
            Self::UnknownMessageKind => "helper protocol message kind is unknown",
            Self::InvalidMessageLength => "helper protocol message has an invalid length",
            Self::InvalidProgress => "helper protocol progress is outside 0..=100",
            Self::UnknownErrorCode => "helper protocol error code is unknown",
            Self::ErrorMessageTooLong => "helper protocol error message is too long",
            Self::EmptyErrorMessage => "helper protocol error message is empty",
            Self::ErrorMessageContainsControl => {
                "helper protocol error message contains a control character"
            }
            Self::InvalidUtf8 => "helper protocol error message is not valid UTF-8",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for ProtocolError {}

pub fn encode_frame(message: &HelperMessage) -> Result<Vec<u8>, ProtocolError> {
    let mut payload = Vec::with_capacity(MAX_PAYLOAD_BYTES);
    payload.push(PROTOCOL_VERSION);

    match message {
        HelperMessage::Started => payload.push(STARTED_KIND),
        HelperMessage::Progress { completed } => {
            if *completed > 100 {
                return Err(ProtocolError::InvalidProgress);
            }
            payload.push(PROGRESS_KIND);
            payload.push(*completed);
        }
        HelperMessage::Success => payload.push(SUCCESS_KIND),
        HelperMessage::Error { code, message } => {
            validate_error_message(message)?;
            payload.push(ERROR_KIND);
            payload.push(code.wire_code());
            payload.extend_from_slice(&(message.len() as u16).to_le_bytes());
            payload.extend_from_slice(message.as_bytes());
        }
    }

    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(ProtocolError::PayloadTooLarge);
    }
    let mut frame = Vec::with_capacity(FRAME_LENGTH_BYTES + payload.len());
    frame.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    frame.extend_from_slice(&payload);
    Ok(frame)
}

pub fn decode_frame_length(prefix: [u8; FRAME_LENGTH_BYTES]) -> Result<usize, ProtocolError> {
    let length = u32::from_le_bytes(prefix) as usize;
    if length > MAX_PAYLOAD_BYTES {
        Err(ProtocolError::PayloadTooLarge)
    } else {
        Ok(length)
    }
}

pub fn decode_frame(frame: &[u8]) -> Result<HelperMessage, ProtocolError> {
    if frame.len() < FRAME_LENGTH_BYTES {
        return Err(ProtocolError::FrameTooShort);
    }
    let mut prefix = [0_u8; FRAME_LENGTH_BYTES];
    prefix.copy_from_slice(&frame[..FRAME_LENGTH_BYTES]);
    let payload_length = decode_frame_length(prefix)?;
    let expected_length = FRAME_LENGTH_BYTES + payload_length;
    if frame.len() < expected_length {
        return Err(ProtocolError::TruncatedFrame);
    }
    if frame.len() > expected_length {
        return Err(ProtocolError::TrailingBytes);
    }
    if payload_length < 2 {
        return Err(ProtocolError::InvalidMessageLength);
    }

    let payload = &frame[FRAME_LENGTH_BYTES..];
    if payload[0] != PROTOCOL_VERSION {
        return Err(ProtocolError::UnsupportedVersion);
    }

    match payload[1] {
        STARTED_KIND if payload.len() == 2 => Ok(HelperMessage::Started),
        PROGRESS_KIND if payload.len() == 3 => {
            let completed = payload[2];
            if completed > 100 {
                Err(ProtocolError::InvalidProgress)
            } else {
                Ok(HelperMessage::Progress { completed })
            }
        }
        SUCCESS_KIND if payload.len() == 2 => Ok(HelperMessage::Success),
        ERROR_KIND => decode_error_payload(payload),
        STARTED_KIND | PROGRESS_KIND | SUCCESS_KIND => Err(ProtocolError::InvalidMessageLength),
        _ => Err(ProtocolError::UnknownMessageKind),
    }
}

fn decode_error_payload(payload: &[u8]) -> Result<HelperMessage, ProtocolError> {
    if payload.len() < 5 {
        return Err(ProtocolError::InvalidMessageLength);
    }
    let code = HelperErrorCode::from_wire(payload[2]).ok_or(ProtocolError::UnknownErrorCode)?;
    let message_length = u16::from_le_bytes([payload[3], payload[4]]) as usize;
    if message_length > MAX_ERROR_MESSAGE_BYTES {
        return Err(ProtocolError::ErrorMessageTooLong);
    }
    if payload.len() != 5 + message_length {
        return Err(ProtocolError::InvalidMessageLength);
    }
    let message = std::str::from_utf8(&payload[5..]).map_err(|_| ProtocolError::InvalidUtf8)?;
    validate_error_message(message)?;
    Ok(HelperMessage::Error {
        code,
        message: message.to_owned(),
    })
}

fn validate_error_message(message: &str) -> Result<(), ProtocolError> {
    if message.len() > MAX_ERROR_MESSAGE_BYTES {
        return Err(ProtocolError::ErrorMessageTooLong);
    }
    if message.trim().is_empty() {
        return Err(ProtocolError::EmptyErrorMessage);
    }
    if message.chars().any(char::is_control) {
        return Err(ProtocolError::ErrorMessageContainsControl);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_wire_codes_are_stable_and_unique() {
        assert_eq!(PROTOCOL_VERSION, 1);
        assert_eq!(
            HelperErrorCode::ALL.map(HelperErrorCode::wire_code),
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        );
        assert_eq!(
            encode_frame(&HelperMessage::Started).unwrap(),
            [2, 0, 0, 0, 1, 1]
        );
        assert_eq!(
            encode_frame(&HelperMessage::Progress { completed: 42 }).unwrap(),
            [3, 0, 0, 0, 1, 2, 42]
        );
        assert_eq!(
            encode_frame(&HelperMessage::Success).unwrap(),
            [2, 0, 0, 0, 1, 3]
        );
    }

    #[test]
    fn every_message_and_error_enum_round_trips() {
        let mut messages = vec![
            HelperMessage::Started,
            HelperMessage::Progress { completed: 0 },
            HelperMessage::Progress { completed: 50 },
            HelperMessage::Progress { completed: 100 },
            HelperMessage::Success,
        ];
        messages.extend(HelperErrorCode::ALL.map(HelperMessage::error));

        for message in messages {
            let encoded = encode_frame(&message).expect("known message must encode");
            assert!(encoded.len() <= MAX_FRAME_BYTES);
            assert_eq!(decode_frame(&encoded).unwrap(), message);
        }
    }

    #[test]
    fn maximum_error_message_fits_the_absolute_frame_bound() {
        let message = HelperMessage::Error {
            code: HelperErrorCode::DeploymentFailed,
            message: "x".repeat(MAX_ERROR_MESSAGE_BYTES),
        };
        let encoded = encode_frame(&message).expect("maximum message must fit");
        assert_eq!(encoded.len(), MAX_FRAME_BYTES);
        assert_eq!(decode_frame(&encoded).unwrap(), message);

        let oversized = HelperMessage::Error {
            code: HelperErrorCode::DeploymentFailed,
            message: "x".repeat(MAX_ERROR_MESSAGE_BYTES + 1),
        };
        assert_eq!(
            encode_frame(&oversized).unwrap_err(),
            ProtocolError::ErrorMessageTooLong
        );
    }

    #[test]
    fn rejects_invalid_progress_on_encode_and_decode() {
        assert_eq!(
            encode_frame(&HelperMessage::Progress { completed: 101 }).unwrap_err(),
            ProtocolError::InvalidProgress
        );
        let invalid = [3, 0, 0, 0, PROTOCOL_VERSION, PROGRESS_KIND, 101];
        assert_eq!(
            decode_frame(&invalid).unwrap_err(),
            ProtocolError::InvalidProgress
        );
    }

    #[test]
    fn rejects_unknown_versions_variants_and_error_codes() {
        assert_eq!(
            decode_frame(&[2, 0, 0, 0, 2, STARTED_KIND]).unwrap_err(),
            ProtocolError::UnsupportedVersion
        );
        assert_eq!(
            decode_frame(&[2, 0, 0, 0, PROTOCOL_VERSION, 99]).unwrap_err(),
            ProtocolError::UnknownMessageKind
        );
        assert_eq!(
            decode_frame(&[6, 0, 0, 0, PROTOCOL_VERSION, ERROR_KIND, 99, 1, 0, b'x']).unwrap_err(),
            ProtocolError::UnknownErrorCode
        );
    }

    #[test]
    fn rejects_short_truncated_trailing_and_oversized_frames() {
        assert_eq!(
            decode_frame(&[0, 0, 0]).unwrap_err(),
            ProtocolError::FrameTooShort
        );
        assert_eq!(
            decode_frame(&[2, 0, 0, 0, PROTOCOL_VERSION]).unwrap_err(),
            ProtocolError::TruncatedFrame
        );
        assert_eq!(
            decode_frame(&[2, 0, 0, 0, PROTOCOL_VERSION, STARTED_KIND, 0]).unwrap_err(),
            ProtocolError::TrailingBytes
        );
        assert_eq!(
            decode_frame_length(((MAX_PAYLOAD_BYTES + 1) as u32).to_le_bytes()).unwrap_err(),
            ProtocolError::PayloadTooLarge
        );
    }

    #[test]
    fn rejects_wrong_lengths_and_malformed_utf8() {
        assert_eq!(
            decode_frame(&[3, 0, 0, 0, PROTOCOL_VERSION, STARTED_KIND, 0]).unwrap_err(),
            ProtocolError::InvalidMessageLength
        );
        let malformed = [6, 0, 0, 0, PROTOCOL_VERSION, ERROR_KIND, 1, 1, 0, 0xff];
        assert_eq!(
            decode_frame(&malformed).unwrap_err(),
            ProtocolError::InvalidUtf8
        );
    }

    #[test]
    fn rejects_empty_or_control_character_error_text() {
        for message in ["", "   ", "line one\nline two", "prefix\0suffix"] {
            assert!(encode_frame(&HelperMessage::Error {
                code: HelperErrorCode::DeploymentFailed,
                message: message.to_owned(),
            })
            .is_err());
        }
    }

    #[test]
    fn deployment_hresult_mapping_is_bounded_and_keeps_both_in_use_codes() {
        let cases = [
            (0x8007_3D02_u32 as i32, HelperErrorCode::PackageInUse),
            (0x8007_3D06_u32 as i32, HelperErrorCode::PackageInUse),
            (0x8007_3CFF_u32 as i32, HelperErrorCode::DeploymentBlocked),
            (0x8007_3CF3_u32 as i32, HelperErrorCode::DependencyMissing),
            (0x800B_0100_u32 as i32, HelperErrorCode::SignatureInvalid),
            (0x8008_0205_u32 as i32, HelperErrorCode::PackageInvalid),
            (0x8123_4567_u32 as i32, HelperErrorCode::DeploymentFailed),
        ];
        for (hresult, expected) in cases {
            assert_eq!(helper_error_code_for_deployment_hresult(hresult), expected);
        }
    }
}
