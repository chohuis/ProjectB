use hmac::{Hmac, Mac};
use sha2::Sha256;

// 키를 XOR 분산 저장 — strings 명령으로 평문 추출 차단
// "pb-save-integrity-2025-v1" (25 bytes)
// 각 파트는 서로 다른 마스크로 XOR된 채로 저장됨
const P0: [u8; 7]  = [0x6F, 0x58, 0x1C, 0x69, 0x5E, 0x65, 0x4D]; // ^ 0x1F
const P1: [u8; 5]  = [0x14, 0x36, 0x11, 0x03, 0x38];               // ^ 0x7A
const P2: [u8; 13] = [0x25, 0x62, 0x13, 0x10, 0x3C, 0x60, 0x00,    // ^ 0x47
                       0x77, 0x72, 0x79, 0x1C, 0x43, 0x16];

#[cold]
fn assemble_key() -> Vec<u8> {
    let mut k = Vec::with_capacity(25);
    k.extend(P0.iter().map(|&b| b ^ 0x1F_u8));
    k.extend(P1.iter().map(|&b| b ^ 0x7A_u8));
    k.extend(P2.iter().map(|&b| b ^ 0x47_u8));
    k
}

type HmacSha256 = Hmac<Sha256>;

pub fn compute_save_sig(snapshot: &str) -> String {
    let key = assemble_key();
    let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC init");
    mac.update(snapshot.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn verify_save_sig(snapshot: &str, sig: &str) -> bool {
    compute_save_sig(snapshot) == sig
}
