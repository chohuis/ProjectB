extends RefCounted
class_name SaveGame

## 세이브 — M8-4.
##
## 원본: `slotdb.cjs` · `save.ts`
##
## ## 왜 통째로 저장하나
##
## `NpcStore`의 열 배열이 이미 있는데 안 쓴다. 실측이 근거다:
##
##   통째로 (사전 + zstd)   저장 74ms · 0.6MB · 로드 88ms
##   02 (Electron)          저장 1,100~1,650ms · 18MB
##
## **15배 빠르고 30배 작다.** 열 배열로 더 줄일 수는 있지만, 그러려면
## 사전 ↔ 열 변환 코드가 붙고 그게 **"열 하나를 빠뜨리면 조용히 틀린다"는
## 위험**을 부른다. 지금 값으로 충분하니 그 위험을 안 산다.
##
## 나중에 느려지면 그때 바꾼다 — `NpcStore`가 이미 있으므로 길은 열려 있다.
##
## ## 머리말을 따로 둔다
##
## ⚠ **슬롯 목록이 세이브를 통째로 읽으면 안 된다.** 슬롯마다 0.6MB를 풀면
## 목록 하나 여는 데 몇 초가 걸린다. 머리말(날짜·이름·팀)만 앞에 따로 적는다.
##
## ⚠ **깨진 파일에서 죽지 않는다.** 저장 중 전원이 나가면 잘린 파일이
## 남는다 — 조용히 빈 게임을 주면 세이브가 사라진 걸 모른 채 새로 시작한다.


const MAGIC: int = 0x4F50_5347  # "OPSG"
const VERSION: int = 1


## 머리말에 담는 것 — **목록 화면이 보여줄 만큼만**
static func _header_of(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	return {
		"day": int(s.get("day", 1)),
		"season_year": int(s.get("season_year", 0)),
		"seed": int(s.get("seed", 0)),
		"player_name": String(p.get("name", "")),
		"team_name": String(p.get("team_name", p.get("team_id", ""))),
	}


## ⚠ **부른 쪽 사전을 안 건드린다.** 저장이 상태를 바꾸면 저장할 때마다
## 게임이 조금씩 달라진다
static func write(path: String, state: Dictionary) -> Error:
	var fh := FileAccess.open(path, FileAccess.WRITE)
	if fh == null:
		return FileAccess.get_open_error()

	fh.store_32(MAGIC)
	fh.store_32(VERSION)
	fh.store_var(_header_of(state))

	var raw: PackedByteArray = var_to_bytes(state)
	var packed: PackedByteArray = raw.compress(FileAccess.COMPRESSION_ZSTD)
	fh.store_32(raw.size())
	fh.store_32(packed.size())
	fh.store_buffer(packed)
	fh.close()
	return OK


## 머리말만. **본문을 안 푼다** — 슬롯 목록이 이걸 쓴다
static func read_header(path: String) -> Dictionary:
	var fh := FileAccess.open(path, FileAccess.READ)
	if fh == null:
		return {"error": "열 수 없음: %s" % path}
	if fh.get_length() < 8 or fh.get_32() != MAGIC:
		fh.close()
		return {"error": "세이브 형식이 아니다"}
	var ver: int = fh.get_32()
	if ver > VERSION:
		fh.close()
		return {"error": "더 새로운 세이브 (v%d)" % ver}

	var h = fh.get_var()
	fh.close()
	if not (h is Dictionary):
		return {"error": "머리말이 깨졌다"}
	var out: Dictionary = h
	out["error"] = ""
	return out


static func read(path: String) -> Dictionary:
	var fh := FileAccess.open(path, FileAccess.READ)
	if fh == null:
		return {"error": "열 수 없음: %s" % path, "state": {}}
	if fh.get_length() < 8 or fh.get_32() != MAGIC:
		fh.close()
		return {"error": "세이브 형식이 아니다", "state": {}}
	var ver: int = fh.get_32()
	if ver > VERSION:
		fh.close()
		return {"error": "더 새로운 세이브 (v%d)" % ver, "state": {}}

	var h = fh.get_var()
	if not (h is Dictionary):
		fh.close()
		return {"error": "머리말이 깨졌다", "state": {}}

	var rawlen: int = fh.get_32()
	var plen: int = fh.get_32()
	var packed: PackedByteArray = fh.get_buffer(plen)
	fh.close()

	# ⚠ **푼 길이가 적힌 길이와 같아야 한다.** 이 한 줄이 잘림·손상·거짓
	# 길이를 다 잡는다 — 잘리면 `get_buffer`가 짧은 것을 주고 `decompress`가
	# 실패한다.
	#
	# 여기 앞에 "받은 바이트가 적힌 만큼인가"를 따로 뒀었는데 **이게 이미
	# 잡는 것이라 지웠다.** 겹친 가드는 둘 다 지워도 검사가 안 걸려서,
	# 어느 쪽이 진짜 막고 있는지 모르게 된다.
	#
	# 실패하면 `decompress`가 빈 배열을 준다 — 그대로 `bytes_to_var`에
	# 넣으면 `null`이 나와서 **빈 게임처럼 보인다**
	var raw: PackedByteArray = packed.decompress(rawlen, FileAccess.COMPRESSION_ZSTD)
	if raw.size() != rawlen:
		return {"error": "세이브가 깨졌다", "state": {}}

	# ⚠ **사전인지만 본다.** 빈 사전은 아래 `verify`가 "필수 키가 없다"로
	# 잡으므로 여기서 또 보지 않는다 — 겹쳐 두면 어느 쪽이 막는지 모른다.
	# 타입 검사는 남긴다: `bytes_to_var`가 `null`을 줄 수 있고 그걸
	# `verify`에 넘기면 터진다
	var st = bytes_to_var(raw)
	if not (st is Dictionary):
		return {"error": "세이브 내용이 깨졌다", "state": {}}

	var err: String = verify(st)
	if not err.is_empty():
		return {"error": err, "state": {}}

	var out: Dictionary = h
	out["error"] = ""
	out["state"] = st
	return out


## 열어도 되는 상태인가. **없으면 조용히 이상하게 도는 키들**을 본다
static func verify(s: Dictionary) -> String:
	for k in ["day", "season_year", "protagonist", "schedule"]:
		if not s.has(k):
			return "세이브에 '%s'가 없다" % k
	if int(s.get("day", 0)) < 1:
		return "시즌 일차가 %d다" % int(s.get("day", 0))
	return ""
