use hmac::{Hmac, Mac};
use sha2::Sha256;

// 키는 Rust 바이너리에 컴파일됨 — JS 레이어에 비노출
const SAVE_HMAC_KEY: &[u8] = b"pb-save-integrity-2025-v1";

type HmacSha256 = Hmac<Sha256>;

pub fn compute_save_sig(snapshot: &str) -> String {
  let mut mac = HmacSha256::new_from_slice(SAVE_HMAC_KEY)
    .expect("HMAC init failed");
  mac.update(snapshot.as_bytes());
  hex::encode(mac.finalize().into_bytes())
}

pub fn verify_save_sig(snapshot: &str, sig: &str) -> bool {
  compute_save_sig(snapshot) == sig
}
