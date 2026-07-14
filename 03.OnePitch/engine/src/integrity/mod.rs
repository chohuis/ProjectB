use hmac::{Hmac, Mac};
use rusqlite::Connection;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const SIGNING_KEY: &[u8] = b"onepitch-dev-placeholder-key";

pub fn sign(data: &[u8]) -> anyhow::Result<String> {
    let mut mac = HmacSha256::new_from_slice(SIGNING_KEY)?;
    mac.update(data);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub fn verify(data: &[u8], sig: &str) -> anyhow::Result<bool> {
    Ok(sign(data)? == sig)
}

pub fn sign_core_state(_conn: &Connection) -> anyhow::Result<String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_is_deterministic() {
        assert_eq!(sign(b"hello").unwrap(), sign(b"hello").unwrap());
    }

    #[test]
    fn sign_differs_by_input() {
        assert_ne!(sign(b"hello").unwrap(), sign(b"world").unwrap());
    }

    #[test]
    fn verify_roundtrip() {
        let sig = sign(b"hello").unwrap();
        assert!(verify(b"hello", &sig).unwrap());
        assert!(!verify(b"tampered", &sig).unwrap());
    }
}