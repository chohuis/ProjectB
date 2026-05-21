use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

// 32-byte 암호화 키 — 4개 파트로 XOR 분산 저장
// "pb-save-encrypt-key2025-projectb" (32 bytes)
const K0: [u8; 8]  = [0x77, 0x64, 0x10, 0x5D, 0x43, 0x46, 0x4C, 0x7E]; // ^ 0x1B
const K1: [u8; 8]  = [0x6E, 0x1C, 0x3C, 0x53, 0x1B, 0x5E, 0x48, 0x5F]; // ^ 0x29
const K2: [u8; 8]  = [0x6C, 0x58, 0x69, 0x51, 0x68, 0x4F, 0x47, 0x58]; // ^ 0x3D
const K3: [u8; 8]  = [0x6A, 0x54, 0x5B, 0x4B, 0x5A, 0x55, 0x73, 0x53]; // ^ 0x16

#[cold]
fn assemble_enc_key() -> [u8; 32] {
    let mut k = [0u8; 32];
    for (i, &b) in K0.iter().enumerate() { k[i]      = b ^ 0x1B; }
    for (i, &b) in K1.iter().enumerate() { k[i + 8]  = b ^ 0x29; }
    for (i, &b) in K2.iter().enumerate() { k[i + 16] = b ^ 0x3D; }
    for (i, &b) in K3.iter().enumerate() { k[i + 24] = b ^ 0x16; }
    k
}

/// 세이브 데이터 암호화 → base64(nonce[12] || ciphertext)
pub fn encrypt_save(plaintext: &str) -> String {
    let key_bytes = assemble_enc_key();
    let cipher = ChaCha20Poly1305::new((&key_bytes).into());
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_bytes())
        .expect("encryption failed");
    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);
    B64.encode(&combined)
}

/// 세이브 데이터 복호화 — 평문 JSON 폴백(구 포맷) 지원
pub fn decrypt_save(ciphertext: &str) -> Result<String, String> {
    // 구 포맷 감지: 평문 JSON이면 그대로 반환
    let trimmed = ciphertext.trim();
    if trimmed.starts_with('{') {
        return Ok(trimmed.to_string());
    }
    let combined = B64.decode(ciphertext.trim())
        .map_err(|e| format!("base64 decode: {e}"))?;
    if combined.len() < 12 {
        return Err("ciphertext too short".into());
    }
    let (nonce_bytes, data) = combined.split_at(12);
    let nonce = chacha20poly1305::Nonce::from_slice(nonce_bytes);
    let key_bytes = assemble_enc_key();
    let cipher = ChaCha20Poly1305::new((&key_bytes).into());
    let plaintext = cipher.decrypt(nonce, data)
        .map_err(|_| "decryption failed".to_string())?;
    String::from_utf8(plaintext).map_err(|e| format!("utf8: {e}"))
}
