extends RefCounted
class_name Achievements

## 업적 — C-5.
##
## 원본: `utils/achievementEngine.ts` + `master/achievements/achievements.json`
##
## ⚠ **04엔 아무것도 없었다.** 엔진도 규칙 파일도 상태도 없어서 업적이
## 통째로 빠져 있었다 — C의 다른 항목들과 달리 화면만의 문제가 아니다.
##
## ⚠ **통산을 따로 세지 않는다.** 02는 `achievementMetrics`라는 계수기
## 주머니를 따로 들고 있었는데, `season_stats`와 정본이 둘이 된다. 여기서는
## **연도 기록의 숫자를 합친다** — 그래서 `career_history`가 문자열
## 요약(`stat_line`)만이 아니라 숫자(`stats`)도 갖고 있어야 한다.
##
## ⚠ **보상(`reward`)은 표시만 한다.** 02도 그랬다 — 화면이 태그로 찍을 뿐
## 어디에도 안 걸린다. 이주 중에 새로 걸지 않는다.


const RULES_PATH: String = "res://data/achievements.json"

## 달성 상태가 사는 자리. `{id: {progress, unlocked_at}}`
const STATE_KEY: String = "achievements"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("업적 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func defs() -> Array:
	return rules().get("achievements", [])


## 지금 켜져 있는 것만. **`blocked`는 아직 만들 데가 없는 업적이다** —
## 목록에 두되 판정에서 뺀다
static func active_defs() -> Array:
	var out: Array = []
	for d in defs():
		if String(d.get("status", "")) == "active":
			out.append(d)
	return out


static func of(state: Dictionary) -> Dictionary:
	var d = state.get(STATE_KEY, {})
	return d if d is Dictionary else {}


# ── 재는 값 ───────────────────────────────────────────────────

## 커리어 통산 성적. **연도별 기록을 해로 묶어 합친다.**
##
## ⚠ **올해는 살아 있는 값이 이긴다.** 시즌이 끝나면 같은 해가 연도 기록에도
## 들어가는데, 해로 묶지 않고 그냥 더하면 그 시즌이 **두 번 세어진다**
static func career_totals(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var by_year: Dictionary = {}
	for h in p.get("career_history", []):
		var st = h.get("stats", null)
		if st is Dictionary and not (st as Dictionary).is_empty():
			by_year[int(h.get("year", 0))] = st

	var live: Dictionary = state.get("season_stats", {}).get(
		String(p.get("id", "")), {})
	if not live.is_empty():
		by_year[int(state.get("season_year", 0))] = live

	var out: Dictionary = {"w": 0, "sv": 0, "k": 0, "g": 0}
	for y in by_year:
		var st: Dictionary = by_year[y]
		for key in out:
			out[key] = int(out[key]) + int(roundf(float(st.get(key, 0))))
	return out


## 내 팀의 그 시즌 승수.
##
## ⚠ **02는 이걸 `winsTotal`이라 부르고 "20승 달성" 업적에 썼다.** 제목은
## 개인 승처럼 읽히지만 실제로는 팀 순위표의 승수다 — 밸런스 동결이라
## 그대로 옮기고 여기 적어 둔다
## ⚠ **순위표는 상태에 없다.** 04는 일정에서 파생한다 — `state["standings"]`를
## 읽으면 영영 0이고, 그러면 "N승 달성" 여섯 개가 통째로 안 열린다.
## 실제로 그렇게 만들었다가 진짜 경기를 치르는 검사에 걸렸다
static func team_wins(state: Dictionary) -> int:
	var p: Dictionary = state.get("protagonist", {})
	var team: String = String(p.get("team_id", ""))
	if team.is_empty():
		return 0
	for row in Standings.from_schedule(state.get("schedule", []),
			String(p.get("league_id", ""))):
		if String(row.get("team_id", "")) == team:
			return int(row.get("wins", 0))
	return 0


## ⚠ **소식함은 `mailbox`다.** `news`를 읽었다가 늘 0이었다 — 메시지
## 업적 셋이 통째로 안 열렸다. 이름이 비슷한 키를 잘못 짚으면 오류도
## 로그도 없이 "아무 일도 안 일어남"으로 나타난다
static func messages_read(state: Dictionary) -> int:
	var n: int = 0
	for m in state.get("mailbox", []):
		if bool(m.get("read", false)):
			n += 1
	return n


## 화면·판정이 같이 읽는 값 한 묶음
static func metrics(state: Dictionary) -> Dictionary:
	var totals: Dictionary = career_totals(state)
	return {
		"team_wins": team_wins(state),
		"career_wins": int(totals["w"]),
		"career_saves": int(totals["sv"]),
		"career_strikeouts": int(totals["k"]),
		"career_games": int(totals["g"]),
		# ⚠ **`training_log`로는 못 센다.** 그건 "뭔가 오른 주"만 남는다 —
		# 능력치가 안 오른 주는 줄이 없어서, 열한 주를 훈련해도 열 주가
		# 안 된다. 실제로 그렇게 만들었다가 검사에 걸렸다
		"training_weeks": int(state.get("protagonist", {}).get(
			"training_weeks", 0)),
		"messages_read": messages_read(state),
	}


# ── 판정 ──────────────────────────────────────────────────────

## 언제 땄는지를 적는 문구. **루트가 주차를 자기 손으로 세지 않게 한다** —
## 세는 곳은 `Calendar` 하나다
static func label_of(state: Dictionary, at_day: int) -> String:
	return "%d년 %d주" % [int(state.get("season_year", 0)),
		Calendar.week_of(at_day)]


## 달성한 것을 상태에 적고 **이번에 새로 달성한 id**를 돌려준다.
##
## ⚠ **한 번 달성하면 안 풀린다.** 진행도만 최신으로 둔다 — 통산이
## 줄어들 일은 없지만, 팀 승수는 시즌마다 0으로 돌아간다
static func check(state: Dictionary, at_day: int) -> Array:
	var label: String = label_of(state, at_day)
	var m: Dictionary = metrics(state)
	var runtime: Dictionary = of(state)
	var fresh: Array = []

	for d in active_defs():
		var id: String = String(d["id"])
		var current: int = int(m.get(String(d["metric"]), 0))
		var row: Dictionary = runtime.get(id, {})

		if not String(row.get("unlocked_at", "")).is_empty():
			row["progress"] = maxi(int(row.get("progress", 0)), current)
			runtime[id] = row
			continue

		if current >= int(d["target"]):
			fresh.append(id)
			runtime[id] = {"progress": current, "unlocked_at": label}
		else:
			runtime[id] = {"progress": current, "unlocked_at": ""}

	state[STATE_KEY] = runtime
	return fresh


static func is_unlocked(state: Dictionary, id: String) -> bool:
	return not String(of(state).get(id, {}).get("unlocked_at", "")).is_empty()
