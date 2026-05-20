#![deny(clippy::all)]

use napi_derive::napi;

mod hmac;

/// 세이브 데이터 HMAC-SHA256 서명 (키는 바이너리 내부)
#[napi]
pub fn compute_save_sig(snapshot: String) -> String {
  hmac::compute_save_sig(&snapshot)
}

/// 서명 검증 — 일치하면 true
#[napi]
pub fn verify_save_sig(snapshot: String, sig: String) -> bool {
  hmac::verify_save_sig(&snapshot, &sig)
}
