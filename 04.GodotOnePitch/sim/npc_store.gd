extends RefCounted
class_name NpcStore

## NPC 상태 — **열 배열**로 둔다.
##
## 실측 근거 (`bench/save_bench.gd`, NPC 9,603명):
##   객체 배열 + store_var   저장 0.062초 · 7.3MB
##   열 배열 + zstd          저장 0.006초 · 1.1MB
##   현재 Electron           저장 1.1~1.65초 · 18MB
##
## 저장만이 아니다. 매주 9,603명을 순회하는 코드(성장·나이·계약)가 많은데
## 열 배열이면 그쪽도 같이 빨라진다.
##
## ⚠ **열 배열의 위험은 성능이 아니라 실수다.** 열 하나를 빠뜨리거나 길이가
## 어긋나도 오류가 안 나고 조용히 틀린 값을 준다. 그래서:
##
##   · 열 목록(`FLOAT_FIELDS`)이 **정본**이다. 저장·로드·resize가 전부 이걸 돈다
##   · 열을 추가할 땐 그 목록에만 넣는다 — 다른 곳을 고칠 일이 없어야 한다
##   · `verify()`가 길이 어긋남을 잡는다. 검사가 이걸 부른다
##
## ⚠ **문자열을 열에 넣지 않는다.** 팀·리그·포지션은 값이 반복되므로
## 사전(intern)에 번호를 매겨 int로 둔다. 비교가 빨라지고 파일이 작아진다.

# ── 실수 열 (정본) ────────────────────────────────────────────────
# 순서를 바꾸면 옛 세이브가 깨진다. **뒤에만 추가한다.**
const FLOAT_FIELDS: PackedStringArray = [
	"pit_ovr", "pit_stamina", "pit_velocity", "pit_command", "pit_control",
	"pit_movement", "pit_mentality", "pit_recovery", "pit_clutch", "pit_hold",
	"bat_ovr", "bat_contact", "bat_power", "bat_eye", "bat_discipline",
	"bat_speed", "bat_instinct", "bat_bunting", "bat_platoon", "bat_fielding",
	"bat_arm", "bat_clutch",
	"fame", "potential_hidden",
]

# 자주 쓰는 열은 상수로 — 루프에서 이름 조회를 하면 느리다
const PIT_OVR: int = 0
const PIT_STAMINA: int = 1
const PIT_VELOCITY: int = 2
const PIT_COMMAND: int = 3
const PIT_CONTROL: int = 4
const PIT_MOVEMENT: int = 5
const BAT_OVR: int = 10
const BAT_CONTACT: int = 11
const BAT_POWER: int = 12
const POTENTIAL: int = 23

# ── 정수 열 (정본) ────────────────────────────────────────────────
const INT_FIELDS: PackedStringArray = [
	"age", "grade", "dev_rate", "team", "league", "position", "player_type",
	"career_status", "military_status", "graduation_year", "salary", "contract_years",
]
const AGE: int = 0
const GRADE: int = 1
const DEV_RATE: int = 2
const TEAM: int = 3
const LEAGUE: int = 4
const POSITION: int = 5
const PLAYER_TYPE: int = 6

const SAVE_MAGIC: int = 0x4F50_4E53  # "OPNS"
const SAVE_VERSION: int = 1

var count: int = 0
var f: Array[PackedFloat32Array] = []
var i: Array[PackedInt32Array] = []
## 선수 고유 ID — 유일해야 하므로 intern 하지 않는다
var ids: PackedStringArray = PackedStringArray()
var names: PackedStringArray = PackedStringArray()

## 반복되는 문자열은 번호로 — 팀·리그·포지션 등
var _intern: PackedStringArray = PackedStringArray()
var _intern_map: Dictionary = {}


func _init(n: int = 0) -> void:
	resize(n)


## 열을 전부 같은 길이로 맞춘다. **열 추가는 FLOAT_FIELDS/INT_FIELDS만 고치면 된다**
func resize(n: int) -> void:
	count = n
	f.resize(FLOAT_FIELDS.size())
	for c in FLOAT_FIELDS.size():
		var col: PackedFloat32Array = f[c] if f[c] != null else PackedFloat32Array()
		col.resize(n)
		f[c] = col
	i.resize(INT_FIELDS.size())
	for c in INT_FIELDS.size():
		var col: PackedInt32Array = i[c] if i[c] != null else PackedInt32Array()
		col.resize(n)
		i[c] = col
	ids.resize(n)
	names.resize(n)


## 문자열 → 번호. 같은 문자열은 같은 번호를 받는다
func intern(s: String) -> int:
	if _intern_map.has(s):
		return _intern_map[s]
	var idx: int = _intern.size()
	_intern.append(s)
	_intern_map[s] = idx
	return idx


func text(idx: int) -> String:
	return _intern[idx] if idx >= 0 and idx < _intern.size() else ""


## 열 길이가 어긋나면 잡는다 — 조용히 틀린 값을 주는 걸 막는 유일한 장치
func verify() -> String:
	if f.size() != FLOAT_FIELDS.size():
		return "실수 열 개수 %d, 이름 %d" % [f.size(), FLOAT_FIELDS.size()]
	if i.size() != INT_FIELDS.size():
		return "정수 열 개수 %d, 이름 %d" % [i.size(), INT_FIELDS.size()]
	for c in f.size():
		if f[c].size() != count:
			return "실수 열 '%s' 길이 %d, count %d" % [FLOAT_FIELDS[c], f[c].size(), count]
	for c in i.size():
		if i[c].size() != count:
			return "정수 열 '%s' 길이 %d, count %d" % [INT_FIELDS[c], i[c].size(), count]
	if ids.size() != count:
		return "ids 길이 %d, count %d" % [ids.size(), count]
	if names.size() != count:
		return "names 길이 %d, count %d" % [names.size(), count]
	return ""


## 저장 — 열을 통째로 이어 붙여 한 번에 압축한다
##
## ⚠ 열 개수를 같이 적는다. 나중에 열이 늘면 옛 세이브를 읽을 때
## **몇 개까지 있는지 알아야** 나머지를 기본값으로 채울 수 있다
func save_to(path: String) -> Error:
	var fh := FileAccess.open(path, FileAccess.WRITE)
	if fh == null:
		return FileAccess.get_open_error()

	fh.store_32(SAVE_MAGIC)
	fh.store_32(SAVE_VERSION)
	fh.store_32(count)
	fh.store_32(f.size())
	fh.store_32(i.size())

	var raw := PackedByteArray()
	for c in f.size():
		raw.append_array(f[c].to_byte_array())
	for c in i.size():
		raw.append_array(i[c].to_byte_array())
	var packed := raw.compress(FileAccess.COMPRESSION_ZSTD)
	fh.store_32(raw.size())
	fh.store_32(packed.size())
	fh.store_buffer(packed)

	fh.store_var(ids)
	fh.store_var(names)
	fh.store_var(_intern)
	fh.close()
	return OK


func load_from(path: String) -> String:
	var fh := FileAccess.open(path, FileAccess.READ)
	if fh == null:
		return "열 수 없음: %s" % path
	if fh.get_32() != SAVE_MAGIC:
		return "형식이 아님"
	var ver: int = fh.get_32()
	if ver > SAVE_VERSION:
		return "더 새로운 세이브 (v%d)" % ver

	var n: int = fh.get_32()
	var nf: int = fh.get_32()
	var ni: int = fh.get_32()
	var rawlen: int = fh.get_32()
	var plen: int = fh.get_32()
	var raw := fh.get_buffer(plen).decompress(rawlen, FileAccess.COMPRESSION_ZSTD)

	resize(n)
	var off: int = 0
	var bytes: int = n * 4
	# ⚠ 저장 당시 열 개수만큼만 읽는다. 그 뒤에 늘어난 열은 resize가
	# 이미 0으로 채워 뒀다 — 옛 세이브가 그대로 열린다
	for c in mini(nf, f.size()):
		f[c] = raw.slice(off, off + bytes).to_float32_array()
		off += bytes
	for c in mini(ni, i.size()):
		i[c] = raw.slice(off, off + bytes).to_int32_array()
		off += bytes

	ids = fh.get_var()
	names = fh.get_var()
	_intern = fh.get_var()
	fh.close()

	_intern_map.clear()
	for k in _intern.size():
		_intern_map[_intern[k]] = k

	var err := verify()
	return err if err != "" else ""
