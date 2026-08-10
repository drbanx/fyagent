//! Minimal protocol and executable boundary for the FyAgent current-user
//! Windows package helper.
//!
//! The portable modules deliberately own all parsing, path derivation, and
//! wire validation. Native calls live only in the executable's private
//! Windows module, so a normal library dependency cannot reach deployment.

pub mod cli;
pub mod layout;
pub mod protocol;

pub use cli::{
    parse_cli_args, CanonicalJobId, CliError, InstallRequest, PipeNonce, INSTALL_ACTION,
};
pub use layout::{derive_install_layout, InstallLayout, LayoutError};
pub use protocol::{
    decode_frame, decode_frame_length, encode_frame, helper_error_code_for_deployment_hresult,
    HelperErrorCode, HelperMessage, ProtocolError, FRAME_LENGTH_BYTES, MAX_ERROR_MESSAGE_BYTES,
    MAX_FRAME_BYTES, MAX_PAYLOAD_BYTES, PROTOCOL_VERSION,
};
