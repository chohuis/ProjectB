/** 세이브 데이터 HMAC-SHA256 서명 반환 */
export declare function computeSaveSig(snapshot: string): string

/** 서명 검증 — 일치하면 true */
export declare function verifySaveSig(snapshot: string, sig: string): boolean
