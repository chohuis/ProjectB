extends RefCounted
class_name EventLog

## 자동 진행이 무엇을 했는지 — G-6.
##
## 원본: `shared/stores/autoAdvance.ts`의 `eventHistory` · `logEvent` ·
##       `PlayerEvent` · `PlayerEventEntry`
##
## ⚠ **04엔 이 장치가 통째로 없었다.** 02는 NPC가 움직일 때마다 열세 곳에서
## `logEvent()`를 부르는데(`weekPhases/market.ts` 여덟 · `stores/game.ts`
## 다섯) 04는 runner가 **개수만 반환한다**(`{"callups": 0, "calldowns": 0}`).
## 그래서 자동 진행을 돌려도 **누가 어디로 갔는지 볼 방법이 없었다.**
##
## ## 02에서 안 옮긴 것 둘
##
## | 02 필드 | 왜 안 옮기나 |
## |---|---|
## | `dbOk` | sqlite 저장 성공 여부다. **04엔 DB가 없다** — 늘 참인 죽은 값이 된다 |
## | `counts.saved` | 같은 이유(DB에 쓴 행 수). 02에서도 `processed`와 거의 같다 |
##
## ⚠ **세이브에 안 들어간다.** 02도 세션 스토어다(`writable`) — 이번 판에
## 무슨 일이 있었나를 보는 것이지 기록물이 아니다.

## 02 `PlayerEventType` 열둘 — **순서까지 그대로다**
const TYPES: Array[String] = [
	"trade", "fa_apply", "fa_result",
	"draft", "enlist_sports", "enlist_general", "discharge",
	"callup", "calldown", "renewal", "adjustment", "retire",
]

## 02 `EVENT_LABEL` 그대로.
## ⚠ 패널의 필터는 `fa_result`를 "FA이동"이라 부르는데(`AutoAdvancePanel`의
## `FILTER_OPTS`) 로그 쪽은 "FA결과"다. **로그가 정본이다** — 화면이 다른
## 이름을 쓰고 싶으면 화면에서 고른다
const LABELS: Dictionary = {
	"trade": "트레이드",
	"fa_apply": "FA신청",
	"fa_result": "FA결과",
	"draft": "드래프트",
	"enlist_sports": "체육부대입대",
	"enlist_general": "일반병입대",
	"discharge": "전역",
	"callup": "콜업",
	"calldown": "콜다운",
	"renewal": "재계약",
	"adjustment": "계약조정",
	"retire": "은퇴",
}

## 02 `eventHistory.push`가 `slice(-499)`로 자른다 — 새 것까지 500개
const MAX_KEPT: int = 500

## 세션 로그. **세이브에 안 들어간다**(02도 그렇다)
static var _events: Array = []


static func clear() -> void:
	_events.clear()


static func all() -> Array:
	return _events


static func label_of(type: String) -> String:
	return String(LABELS.get(type, type))


## 사람 한 줄. 02 `PlayerEventEntry` 그대로다.
##
## `detail`은 02가 "OVR:75 SP 28세 → 3500만/2년" 꼴로 적는다 — **무슨 일이
## 있었는지 한 줄로 읽히게 하는 자리**라 종류마다 다르다
static func entry(npc_id: String, name: String, detail: String,
		from_team: String = "", to_team: String = "",
		from_league: String = "", to_league: String = "") -> Dictionary:
	return {
		"npc_id": npc_id, "name": name, "detail": detail,
		"from_team": from_team, "to_team": to_team,
		"from_league": from_league, "to_league": to_league,
	}


## 한 건 적는다.
##
## ⚠ **빈 건 안 적는다** — 02도 `if (_entries.length > 0)`로 감싼다.
## 아무 일도 안 일어난 주가 목록을 채우면 정작 일어난 일이 안 보인다.
##
## `counts.input`은 **후보가 몇이었나**다(처리된 수가 아니라). 그래야
## "예순 명 중 셋이 움직였다"를 읽을 수 있다
static func push(type: String, season_year: int, players: Array,
		input_count: int = 0, week: int = 0, league_id: String = "",
		extra: String = "") -> Dictionary:
	if players.is_empty():
		return {}
	if not TYPES.has(type):
		push_error("모르는 이벤트 종류: %s" % type)
		return {}

	var ev: Dictionary = {
		# 02는 `callup-W12` 꼴로 짓는다 — 같은 주에 같은 종류가 두 번
		# 안 나오게 하려는 것이다
		"id": "%s-Y%d-W%d" % [type, season_year, week],
		"type": type,
		"season_year": season_year,
		"week": week,
		"league_id": league_id,
		"players": players,
		"counts": {
			"input": input_count if input_count > 0 else players.size(),
			"processed": players.size(),
		},
		"extra": extra,
	}
	_events.append(ev)
	# 02 `slice(-499)`와 같다 — 새 것을 넣은 뒤 앞에서 자른다
	if _events.size() > MAX_KEPT:
		_events = _events.slice(_events.size() - MAX_KEPT)
	return ev


## 종류별 개수 — 02 `countByType`
static func count_of(type: String) -> int:
	var n: int = 0
	for e in _events:
		if String(e["type"]) == type:
			n += 1
	return n


## 종류별 개수 전부. 화면이 열두 번 세지 않게 한 번에 준다
static func counts() -> Dictionary:
	var out: Dictionary = {}
	for t in TYPES:
		out[t] = 0
	for e in _events:
		var t: String = String(e["type"])
		if out.has(t):
			out[t] += 1
	return out


## 사람이 읽는 여러 줄. 02 `logEvent`가 만드는 블록과 같은 차례다 —
## 머리줄 하나에 사람 줄 여럿, 그리고 `extra`.
##
## 내보내기(.txt)와 화면이 **같은 함수를 쓴다** — 두 벌이면 어긋난다
static func lines_of(ev: Dictionary) -> Array:
	if ev.is_empty():
		return []
	var counts: Dictionary = ev.get("counts", {})
	var head: String = "[%s] Y%d" % [label_of(String(ev["type"])),
		int(ev.get("season_year", 0))]
	var league: String = String(ev.get("league_id", ""))
	if not league.is_empty():
		head += " %s" % league.replace("LEAGUE_", "")
	if int(ev.get("week", 0)) > 0:
		head += " W%d" % int(ev["week"])
	head += " 투입:%d 처리:%d" % [int(counts.get("input", 0)),
		int(counts.get("processed", 0))]

	var out: Array = [head]
	for p in ev.get("players", []):
		out.append("  %s | %s→%s | %s" % [p.get("name", ""),
			_short_team(String(p.get("from_team", ""))),
			_short_team(String(p.get("to_team", ""))),
			p.get("detail", "")])
	var extra: String = String(ev.get("extra", ""))
	if not extra.is_empty():
		out.append("  %s" % extra)
	return out


## 팀 id를 짧게 — 02 `shortTeam`.
## `TEAM_KBL_BUSAN_WAVES_1` → `BUSAN_WAVES·1`
static func _short_team(team_id: String) -> String:
	if team_id.is_empty():
		return "-"
	var s: String = team_id
	# 02: `.replace(/^TEAM_[A-Z]+_/, "")`
	var parts: PackedStringArray = s.split("_")
	if parts.size() > 2 and parts[0] == "TEAM":
		s = "_".join(parts.slice(2))
	# 02: `.replace(/_(\d)$/, "·$1")`
	var tail: int = s.rfind("_")
	if tail > 0 and s.substr(tail + 1).is_valid_int():
		s = "%s·%s" % [s.substr(0, tail), s.substr(tail + 1)]
	if s.length() > 16:
		s = s.substr(0, 14) + "…"
	return s
