extends RefCounted
class_name Leaderboard

## 스탯 순위 — 부문 정의의 **단일 정본**.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/leaderboard.ts`
##
## ⚠ 원본의 리그 화면은 정렬이 하나뿐이었다 — 투수 ERA 오름차순, 타자 AVG
## 내림차순 **고정**. 그래서 세이브 34개를 던진 마무리가 화면 어디에도 안
## 나왔다. 컬럼만 늘려도 안 된다 — 20위 안에 못 들면 여전히 안 보인다.
##
## ⚠ **비율 부문과 누적 부문은 자격 조건이 다르다.** 10이닝만 던진 선수가
## ERA 0.00으로 1위가 되면 순위표가 의미를 잃는다. 반대로 세이브·홈런 같은
## 누적 부문에 자격을 걸면 **아무도 못 채운다** — 마무리는 규정이닝을 절대
## 못 채우기 때문이다. 실제 야구가 그렇게 나눈다.
##
## 부문 한 칸:
##   key    화면·저장이 쓰는 이름. 투타에 같은 칸이 있어 `bb_p`/`bb_b`로 가른다
##   field  기록 사전에서 읽을 칸 이름. **key와 다를 수 있다**
##   dir    "asc"면 낮을수록 위
##   kind   "rate"는 자격 필요 · "count"는 전원
##   card   표에 기본으로 뜨는 부문인가
##   fmt    표기 방식 — "two" · "int" · "rate3" · "ip"


const CATEGORIES: Array[Dictionary] = [
	# ── 투수 ──
	{"key": "era", "label": "평균자책점", "side": "pitcher", "dir": "asc", "kind": "rate", "card": true, "field": "era", "fmt": "two"},
	{"key": "w", "label": "다승", "side": "pitcher", "dir": "desc", "kind": "count", "card": true, "field": "w", "fmt": "int"},
	{"key": "k", "label": "탈삼진", "side": "pitcher", "dir": "desc", "kind": "count", "card": true, "field": "k", "fmt": "int"},
	{"key": "sv", "label": "세이브", "side": "pitcher", "dir": "desc", "kind": "count", "card": true, "field": "sv", "fmt": "int"},
	{"key": "hd", "label": "홀드", "side": "pitcher", "dir": "desc", "kind": "count", "card": true, "field": "hd", "fmt": "int"},
	{"key": "whip", "label": "WHIP", "side": "pitcher", "dir": "asc", "kind": "rate", "card": false, "field": "whip", "fmt": "two"},
	{"key": "ip", "label": "이닝", "side": "pitcher", "dir": "desc", "kind": "count", "card": false, "field": "ip", "fmt": "ip"},
	{"key": "g", "label": "경기", "side": "pitcher", "dir": "desc", "kind": "count", "card": false, "field": "g", "fmt": "int"},
	{"key": "l", "label": "패", "side": "pitcher", "dir": "desc", "kind": "count", "card": false, "field": "l", "fmt": "int"},
	{"key": "bb_p", "label": "볼넷", "side": "pitcher", "dir": "desc", "kind": "count", "card": false, "field": "bb", "fmt": "int"},

	# ── 타자 ──
	{"key": "avg", "label": "타율", "side": "batter", "dir": "desc", "kind": "rate", "card": true, "field": "avg", "fmt": "rate3"},
	{"key": "hr", "label": "홈런", "side": "batter", "dir": "desc", "kind": "count", "card": true, "field": "hr", "fmt": "int"},
	{"key": "rbi", "label": "타점", "side": "batter", "dir": "desc", "kind": "count", "card": true, "field": "rbi", "fmt": "int"},
	{"key": "sb", "label": "도루", "side": "batter", "dir": "desc", "kind": "count", "card": true, "field": "sb", "fmt": "int"},
	{"key": "ops", "label": "OPS", "side": "batter", "dir": "desc", "kind": "rate", "card": true, "field": "ops", "fmt": "rate3"},
	{"key": "obp", "label": "출루율", "side": "batter", "dir": "desc", "kind": "rate", "card": false, "field": "obp", "fmt": "rate3"},
	{"key": "slg", "label": "장타율", "side": "batter", "dir": "desc", "kind": "rate", "card": false, "field": "slg", "fmt": "rate3"},
	{"key": "h_b", "label": "안타", "side": "batter", "dir": "desc", "kind": "count", "card": false, "field": "h", "fmt": "int"},
	{"key": "ab", "label": "타수", "side": "batter", "dir": "desc", "kind": "count", "card": false, "field": "ab", "fmt": "int"},
	{"key": "bb_b", "label": "볼넷", "side": "batter", "dir": "desc", "kind": "count", "card": false, "field": "bb", "fmt": "int"},
]


static func categories_for(side: String) -> Array:
	var out: Array = []
	for c in CATEGORIES:
		if c["side"] == side:
			out.append(c)
	return out


static func card_categories_for(side: String) -> Array:
	var out: Array = []
	for c in CATEGORIES:
		if c["side"] == side and c["card"]:
			out.append(c)
	return out


## 없는 키면 빈 사전 — 호출측이 `is_empty()`로 본다
static func category_by_key(key: String) -> Dictionary:
	for c in CATEGORIES:
		if c["key"] == key:
			return c
	return {}


# ── 표기 ───────────────────────────────────────────────────────────

## ".213" — 앞의 0을 떼는 야구 관습. 1.000은 그대로 둔다
static func rate3(v: float) -> String:
	var s: String = "%.3f" % v
	return s.substr(1) if s.begins_with("0") else s


static func format_value(cat: Dictionary, v: float) -> String:
	match cat.get("fmt", "int"):
		"rate3":
			return rate3(v)
		"two":
			return "%.2f" % v
		# 이닝의 소수 첫자리는 3분의 몇이라 반올림하면 안 된다
		"ip":
			return "%.1f" % v
		_:
			return str(roundi(v))


# ── 자격 ───────────────────────────────────────────────────────────

## 규정이닝 · 규정타석.
##
## 실제 야구는 **팀 경기 수**에 비례한다 (KBO 기준 이닝 ×1.0 · 타석 ×3.1).
## 시즌 중에는 치른 경기 수만큼만 요구하므로 순위표가 초반부터 돈다.
##
## ⚠ **바닥값(10이닝 · 20타석)을 남겨 둔다.** 고교처럼 경기 수가 적은
## 리그에서 비례식만 쓰면 자격자가 **0명**이 되어 순위표가 통째로 빈다
static func qualification_of(games_played: int) -> Dictionary:
	return {
		"games": games_played,
		"ip": maxi(10, roundi(games_played * 1.0)),
		"pa": maxi(20, roundi(games_played * 3.1)),
	}


## 이 선수가 비율 부문에 낄 자격이 되는가
static func qualifies(stats: Dictionary, q: Dictionary) -> bool:
	if stats.get("type", "") == "pitcher":
		return float(stats.get("ip", 0.0)) >= float(q.get("ip", 0))
	return float(stats.get("pa", 0)) >= float(q.get("pa", 0))


# ── 순위 ───────────────────────────────────────────────────────────

## 한 부문의 순위. 비율 부문은 자격자만, 누적 부문은 전원.
##
## ⚠ **동률은 ID로 마지막 정렬한다.** 안 그러면 같은 값들의 순서가 렌더마다
## 바뀌어 화면이 흔들린다 — 정렬이 안정적이지 않은 엔진에서 실제로 그렇다.
##
## **원본 배열을 안 바꾼다** — 화면이 정렬해 보여주는데 그게 원본을 바꾸면
## 저장까지 흔들린다
static func rank_by(rows: Array, cat: Dictionary, limit: int = 0) -> Array:
	var pool: Array = []
	var rate_only: bool = cat.get("kind", "count") == "rate"
	for r in rows:
		if not rate_only or r.get("qualified", false):
			pool.append(r)

	var field: String = cat.get("field", "")
	var asc: bool = cat.get("dir", "desc") == "asc"
	pool.sort_custom(func(a, b) -> bool:
		var av: float = float(a["stats"].get(field, 0))
		var bv: float = float(b["stats"].get(field, 0))
		if not is_equal_approx(av, bv):
			return av < bv if asc else av > bv
		return String(a.get("id", "")) < String(b.get("id", ""))
	)
	return pool.slice(0, limit) if limit > 0 else pool
