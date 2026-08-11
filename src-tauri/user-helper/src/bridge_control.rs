use std::fmt;

use crate::PinnedPackageIdentity;

pub const BRIDGE_CONTROL_VERSION: u8 = 2;
pub const BRIDGE_CONTROL_BYTES: usize = 80;
pub const BRIDGE_OPERATION_ID_BYTES: usize = 32;

const MAGIC: [u8; 8] = *b"FYABRIDG";
const VERSION_OFFSET: usize = 8;
const RESERVED_START: usize = 9;
const VOLUME_OFFSET: usize = 24;
const FILE_INDEX_OFFSET: usize = 32;
const SIZE_OFFSET: usize = 40;
const OPERATION_ID_OFFSET: usize = 48;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BridgeControlError {
    InvalidLength,
    InvalidMagic,
    UnsupportedVersion,
    ReservedBytesSet,
    InvalidPackageIdentity,
    InvalidOperationId,
}

impl fmt::Display for BridgeControlError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidLength => "package bridge control has an invalid length",
            Self::InvalidMagic => "package bridge control has an invalid magic value",
            Self::UnsupportedVersion => "package bridge control version is unsupported",
            Self::ReservedBytesSet => "package bridge control reserved bytes are nonzero",
            Self::InvalidPackageIdentity => "package bridge control identity is invalid",
            Self::InvalidOperationId => "package bridge operation ID is invalid",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for BridgeControlError {}

/// Parent-generated 256-bit identifier for one protected bridge directory.
///
/// The wire carries raw random bytes. Both trusted peers independently render
/// the bytes as one fixed 64-character lowercase hexadecimal component; no
/// path, URI, or caller-provided string crosses this boundary.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct BridgeOperationId([u8; BRIDGE_OPERATION_ID_BYTES]);

impl BridgeOperationId {
    pub fn new(bytes: [u8; BRIDGE_OPERATION_ID_BYTES]) -> Result<Self, BridgeControlError> {
        if bytes.iter().all(|byte| *byte == 0) {
            Err(BridgeControlError::InvalidOperationId)
        } else {
            Ok(Self(bytes))
        }
    }

    pub fn directory_name(self) -> String {
        let mut name = String::with_capacity(BRIDGE_OPERATION_ID_BYTES * 2);
        append_lower_hex(&mut name, &self.0);
        name
    }

    const fn bytes(self) -> [u8; BRIDGE_OPERATION_ID_BYTES] {
        self.0
    }
}

impl fmt::Debug for BridgeOperationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("BridgeOperationId([redacted])")
    }
}

/// Fixed parent-to-helper descriptor for one protected ProgramData bridge.
///
/// It carries only the parent-generated operation ID and exact file identity.
/// Filesystem roots, filenames, paths, URIs, ports, modes, and hashes remain
/// fixed by code or owned by the elevated bridge lifetime.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PackageBridgeControl {
    operation_id: BridgeOperationId,
    package: PinnedPackageIdentity,
}

impl PackageBridgeControl {
    pub fn new(
        operation_id: BridgeOperationId,
        package: PinnedPackageIdentity,
    ) -> Result<Self, BridgeControlError> {
        if package.size() == 0 {
            return Err(BridgeControlError::InvalidPackageIdentity);
        }
        Ok(Self {
            operation_id,
            package,
        })
    }

    pub const fn operation_id(self) -> BridgeOperationId {
        self.operation_id
    }

    pub const fn package(self) -> PinnedPackageIdentity {
        self.package
    }

    pub fn encode(self) -> [u8; BRIDGE_CONTROL_BYTES] {
        let mut bytes = [0_u8; BRIDGE_CONTROL_BYTES];
        bytes[..MAGIC.len()].copy_from_slice(&MAGIC);
        bytes[VERSION_OFFSET] = BRIDGE_CONTROL_VERSION;
        bytes[VOLUME_OFFSET..VOLUME_OFFSET + 8]
            .copy_from_slice(&self.package.volume_serial().to_le_bytes());
        bytes[FILE_INDEX_OFFSET..FILE_INDEX_OFFSET + 8]
            .copy_from_slice(&self.package.file_index().to_le_bytes());
        bytes[SIZE_OFFSET..SIZE_OFFSET + 8].copy_from_slice(&self.package.size().to_le_bytes());
        bytes[OPERATION_ID_OFFSET..].copy_from_slice(&self.operation_id.bytes());
        bytes
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, BridgeControlError> {
        if bytes.len() != BRIDGE_CONTROL_BYTES {
            return Err(BridgeControlError::InvalidLength);
        }
        if bytes[..MAGIC.len()] != MAGIC {
            return Err(BridgeControlError::InvalidMagic);
        }
        if bytes[VERSION_OFFSET] != BRIDGE_CONTROL_VERSION {
            return Err(BridgeControlError::UnsupportedVersion);
        }
        if bytes[RESERVED_START..VOLUME_OFFSET]
            .iter()
            .any(|byte| *byte != 0)
        {
            return Err(BridgeControlError::ReservedBytesSet);
        }

        let volume_serial = u64::from_le_bytes(
            bytes[VOLUME_OFFSET..VOLUME_OFFSET + 8]
                .try_into()
                .expect("fixed volume range"),
        );
        let file_index = u64::from_le_bytes(
            bytes[FILE_INDEX_OFFSET..FILE_INDEX_OFFSET + 8]
                .try_into()
                .expect("fixed file-index range"),
        );
        let size = u64::from_le_bytes(
            bytes[SIZE_OFFSET..SIZE_OFFSET + 8]
                .try_into()
                .expect("fixed size range"),
        );
        let operation_id = BridgeOperationId::new(
            bytes[OPERATION_ID_OFFSET..]
                .try_into()
                .expect("fixed operation-ID range"),
        )?;
        Self::new(
            operation_id,
            PinnedPackageIdentity::new(volume_serial, file_index, size),
        )
    }
}

fn append_lower_hex(output: &mut String, bytes: &[u8]) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.reserve(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACKAGE: PinnedPackageIdentity = PinnedPackageIdentity::new(
        0x0102_0304_0506_0708,
        0x1112_1314_1516_1718,
        0x2122_2324_2526_2728,
    );
    const OPERATION_BYTES: [u8; BRIDGE_OPERATION_ID_BYTES] = [0xab; BRIDGE_OPERATION_ID_BYTES];

    fn operation_id() -> BridgeOperationId {
        BridgeOperationId::new(OPERATION_BYTES).expect("nonzero operation ID")
    }

    fn control() -> PackageBridgeControl {
        PackageBridgeControl::new(operation_id(), PACKAGE).expect("valid bridge control")
    }

    #[test]
    fn exact_v2_fixed_width_encoding_round_trips() {
        let encoded = control().encode();

        assert_eq!(BRIDGE_CONTROL_VERSION, 2);
        assert_eq!(encoded.len(), BRIDGE_CONTROL_BYTES);
        assert_eq!(&encoded[..8], b"FYABRIDG");
        assert_eq!(encoded[VERSION_OFFSET], 2);
        assert_eq!(&encoded[RESERVED_START..VOLUME_OFFSET], &[0; 15]);
        assert_eq!(
            &encoded[VOLUME_OFFSET..FILE_INDEX_OFFSET],
            &PACKAGE.volume_serial().to_le_bytes()
        );
        assert_eq!(
            &encoded[FILE_INDEX_OFFSET..SIZE_OFFSET],
            &PACKAGE.file_index().to_le_bytes()
        );
        assert_eq!(
            &encoded[SIZE_OFFSET..OPERATION_ID_OFFSET],
            &PACKAGE.size().to_le_bytes()
        );
        assert_eq!(&encoded[OPERATION_ID_OFFSET..], &OPERATION_BYTES);
        assert_eq!(PackageBridgeControl::decode(&encoded), Ok(control()));
    }

    #[test]
    fn operation_id_has_only_the_fixed_lower_hex_component_shape() {
        let name = operation_id().directory_name();
        assert_eq!(name, "ab".repeat(BRIDGE_OPERATION_ID_BYTES));
        assert_eq!(name.len(), 64);
        assert!(name
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')));
        for forbidden in ['/', '\\', ':', '.', '\0', ' '] {
            assert!(!name.contains(forbidden));
        }
    }

    #[test]
    fn debug_output_redacts_the_operation_id() {
        let id_debug = format!("{:?}", operation_id());
        let control_debug = format!("{:?}", control());
        assert!(id_debug.contains("[redacted]"));
        assert!(control_debug.contains("[redacted]"));
        assert!(!id_debug.contains("abababab"));
        assert!(!control_debug.contains("abababab"));
    }

    #[test]
    fn rejects_zero_size_and_zero_operation_id() {
        assert_eq!(
            BridgeOperationId::new([0; BRIDGE_OPERATION_ID_BYTES]),
            Err(BridgeControlError::InvalidOperationId)
        );
        assert_eq!(
            PackageBridgeControl::new(operation_id(), PinnedPackageIdentity::new(1, 2, 0)),
            Err(BridgeControlError::InvalidPackageIdentity)
        );

        let mut zero_id = control().encode();
        zero_id[OPERATION_ID_OFFSET..].fill(0);
        assert_eq!(
            PackageBridgeControl::decode(&zero_id),
            Err(BridgeControlError::InvalidOperationId)
        );
    }

    #[test]
    fn rejects_legacy_http_magic_and_version_drift() {
        let mut legacy = control().encode();
        legacy[..8].copy_from_slice(b"FYAHHTTP");
        legacy[VERSION_OFFSET] = 1;
        assert_eq!(
            PackageBridgeControl::decode(&legacy),
            Err(BridgeControlError::InvalidMagic)
        );

        let mut version = control().encode();
        version[VERSION_OFFSET] = 1;
        assert_eq!(
            PackageBridgeControl::decode(&version),
            Err(BridgeControlError::UnsupportedVersion)
        );
    }

    #[test]
    fn rejects_every_magic_and_reserved_byte_mutation() {
        for index in 0..MAGIC.len() {
            let mut encoded = control().encode();
            encoded[index] ^= 1;
            assert_eq!(
                PackageBridgeControl::decode(&encoded),
                Err(BridgeControlError::InvalidMagic),
                "magic byte {index} was accepted"
            );
        }
        for index in RESERVED_START..VOLUME_OFFSET {
            let mut encoded = control().encode();
            encoded[index] = 1;
            assert_eq!(
                PackageBridgeControl::decode(&encoded),
                Err(BridgeControlError::ReservedBytesSet),
                "reserved byte {index} was accepted"
            );
        }
    }

    #[test]
    fn rejects_every_non_exact_length_before_indexing() {
        let encoded = control().encode();
        for length in 0..BRIDGE_CONTROL_BYTES {
            assert_eq!(
                PackageBridgeControl::decode(&encoded[..length]),
                Err(BridgeControlError::InvalidLength),
                "truncated length {length} was accepted"
            );
        }
        for extra in 1..=80 {
            let mut oversized = encoded.to_vec();
            oversized.resize(BRIDGE_CONTROL_BYTES + extra, 0xa5);
            assert_eq!(
                PackageBridgeControl::decode(&oversized),
                Err(BridgeControlError::InvalidLength),
                "oversized length {} was accepted",
                oversized.len()
            );
        }
    }

    #[test]
    fn deterministic_malformed_corpus_never_panics_or_accepts_reserved_bytes() {
        let mut state = 0x9e37_79b9_7f4a_7c15_u64;
        for _ in 0..512 {
            let mut bytes = [0_u8; BRIDGE_CONTROL_BYTES];
            for byte in &mut bytes {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                *byte = state as u8;
            }
            if bytes[..MAGIC.len()] == MAGIC
                && bytes[VERSION_OFFSET] == BRIDGE_CONTROL_VERSION
                && bytes[RESERVED_START..VOLUME_OFFSET]
                    .iter()
                    .any(|byte| *byte != 0)
            {
                assert_eq!(
                    PackageBridgeControl::decode(&bytes),
                    Err(BridgeControlError::ReservedBytesSet)
                );
            } else {
                let _ = PackageBridgeControl::decode(&bytes);
            }
        }
    }
}
