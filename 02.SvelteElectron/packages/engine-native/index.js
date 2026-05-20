'use strict'

const path = require('node:path')
const { createHmac } = require('node:crypto')

// dev fallback — Rust .node 없을 때 JS로 동작 (키 노출은 dev 전용이므로 허용)
function makeFallback() {
  const _K = ['pb-save', '-integ', 'rity-20', '25-v1'].join('')
  return {
    computeSaveSig: (snapshot) =>
      createHmac('sha256', _K).update(snapshot).digest('hex'),
    verifySaveSig: (snapshot, sig) =>
      createHmac('sha256', _K).update(snapshot).digest('hex') === sig,
  }
}

let binding

try {
  binding = require(path.join(__dirname, 'engine-native.win32-x64-msvc.node'))
} catch {
  binding = makeFallback()
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[engine-native] .node 바이너리 없음 — JS fallback 사용 중 (dev 전용)',
    )
  }
}

module.exports = binding
