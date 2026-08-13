extends RefCounted
class_name CareerSummary

## 통산 기록 — 합산·커리어 하이·팀 이력·수상.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/careerSummary.ts`
##
## 시즌 기록 한 줄은 사전이다:
##   year · league_id · team_id · ovr · awards[] · ps_result · stats{}
##
## ⚠ **통산은 시즌 값의 평균이 아니다.** ERA는 자책 합 × 9 ÷ 이닝 합이고
## 장타율은 루타 합 ÷ 타수 합이다. 평균으로 내면 5이닝 시즌과 180이닝 시즌이
## 같은 무게를 갖는다 — 데뷔 시즌이나 부상 시즌 하나가 통산을 통째로 흔든다.
##
## ⚠ **이닝은 야구식 표기(0.1 = 1아웃)라 그냥 더하면 안 된다.** 아웃으로
## 환산해 더한 뒤 되돌린다 — `92.2 + 0.2`는 `92.4`가 아니라 `93.1`이다.


## 비율 지표는 표본이 충분한 시즌만 커리어 하이 후보로 본다. 안 그러면
## 3이닝 던지고 자책 0인 데뷔 시즌이 영원히 "최저 ERA 0.00"으로 박힌다
const MIN_IP_FOR_RATE: float = 30.0
const MIN_AB_FOR_RATE: int = 100


# ── 이닝 ↔ 아웃 ────────────────────────────────────────────────────

## 야구식 이닝(6.2 = 6과 2/3)을 아웃 수로
static func innings_to_outs(ip: float) -> int:
	var whole: int = int(floorf(ip))
	# 소수부는 0·1·2만 유효하다. 부동소수 오차를 반올림으로 흡수한다 —
	# 92와 2/3이 92.19999999로 저장돼 있을 수 있다
	var frac: int = roundi((ip - float(whole)) * 10.0)
	return whole * 3 + (frac if frac >= 1 and frac <= 2 else 0)


## 아웃 수를 야구식 이닝으로 되돌린다 (280아웃 → 93.1)
static func outs_to_innings(outs: int) -> float:
	return float(outs / 3) + float(outs % 3) / 10.0


## ".312" — 앞의 0을 떼는 야구 관습. **`Leaderboard`와 같은 것을 쓴다** —
## 표기 규칙을 두 벌로 만들면 같은 값이 화면마다 다르게 찍힌다
static func _fmt3(v: float) -> String:
	return Leaderboard.rate3(v)


static func _num(v) -> float:
	if v == null:
		return 0.0
	if v is float:
		return 0.0 if is_nan(v) else v
	if v is int:
		return float(v)
	return 0.0


# ── 통산 요약 (슬롯 목록 한 줄) ────────────────────────────────────

## 승·패·ERA·시즌 수. **투수 기록만 센다** — 슬롯 목록 한 줄이 쓴다.
## 이닝이 0이면 ERA는 빈 문자열이다
static func summary_of(records: Array) -> Dictionary:
	var w: int = 0
	var l: int = 0
	var outs: int = 0
	var er: float = 0.0
	var seasons: int = 0

	for r in records:
		var st: Dictionary = r.get("stats", {})
		if st.get("type", "") != "pitcher":
			continue
		seasons += 1
		w += int(_num(st.get("w")))
		l += int(_num(st.get("l")))
		er += _num(st.get("er"))
		outs += innings_to_outs(_num(st.get("ip")))

	var ip: float = float(outs) / 3.0
	return {
		"w": w, "l": l, "seasons": seasons,
		"era": ("%.2f" % (roundf(er * 9.0 / ip * 100.0) / 100.0)) if ip > 0.0 else "",
	}


# ── 은퇴 결산 ──────────────────────────────────────────────────────

## 통산 전체. 투수·타자 블록은 **기록이 없으면 빈 사전**이다 — 0으로 채우면
## "0승 0패 ERA 0.00"이 되어 안 뛴 것과 구분이 안 된다.
##
## 합산 규칙은 `summary_of`와 같은 것을 쓴다. 두 벌로 만들면 같은 커리어가
## 화면마다 다른 숫자를 낸다.
##
## `first_year`/`last_year`가 0이면 기록이 없다는 뜻이다
static func totals_of(records: Array) -> Dictionary:
	var first_year: int = 0
	var last_year: int = 0
	for r in records:
		var y: int = int(r.get("year", 0))
		if first_year == 0 or y < first_year:
			first_year = y
		if last_year == 0 or y > last_year:
			last_year = y

	var p: Dictionary = {"g": 0, "gs": 0, "w": 0, "l": 0, "sv": 0, "hd": 0,
		"outs": 0, "er": 0.0, "h": 0.0, "k": 0.0, "bb": 0.0}
	var b: Dictionary = {"g": 0, "pa": 0, "ab": 0, "h": 0, "hr": 0, "rbi": 0,
		"sb": 0, "bb": 0, "k": 0, "tb": 0}
	var any_p: bool = false
	var any_b: bool = false

	for r in records:
		var st: Dictionary = r.get("stats", {})
		if st.is_empty():
			continue
		if st.get("type", "") == "pitcher":
			any_p = true
			p["g"] += int(_num(st.get("g")))
			p["gs"] += int(_num(st.get("gs")))
			p["w"] += int(_num(st.get("w")))
			p["l"] += int(_num(st.get("l")))
			p["sv"] += int(_num(st.get("sv")))
			p["hd"] += int(_num(st.get("hd")))
			p["outs"] += innings_to_outs(_num(st.get("ip")))
			p["er"] += _num(st.get("er"))
			p["h"] += _num(st.get("h"))
			p["k"] += _num(st.get("k"))
			p["bb"] += _num(st.get("bb"))
		elif st.get("type", "") == "batter":
			any_b = true
			b["g"] += int(_num(st.get("g")))
			b["pa"] += int(_num(st.get("pa")))
			b["ab"] += int(_num(st.get("ab")))
			b["h"] += int(_num(st.get("h")))
			b["hr"] += int(_num(st.get("hr")))
			b["rbi"] += int(_num(st.get("rbi")))
			b["sb"] += int(_num(st.get("sb")))
			b["bb"] += int(_num(st.get("bb")))
			b["k"] += int(_num(st.get("k")))
			# ⚠ 시즌 장타율에서 루타를 되살린다. 통산 SLG를 시즌 SLG의
			# 평균으로 내면 타석 수가 무시된다 — 400타수 시즌과 20타수
			# 시즌이 같은 무게를 갖는다
			b["tb"] += roundi(_num(st.get("slg")) * _num(st.get("ab")))

	var ip_real: float = float(p["outs"]) / 3.0
	var pitching: Dictionary = {}
	if any_p:
		pitching = {
			"g": p["g"], "gs": p["gs"], "w": p["w"], "l": p["l"],
			"sv": p["sv"], "hd": p["hd"],
			"ip": outs_to_innings(p["outs"]),
			"er": p["er"], "h": p["h"], "k": p["k"], "bb": p["bb"],
			"era": ("%.2f" % (roundf(p["er"] * 9.0 / ip_real * 100.0) / 100.0)) if ip_real > 0.0 else "-",
			"whip": ("%.2f" % (roundf((p["bb"] + p["h"]) / ip_real * 100.0) / 100.0)) if ip_real > 0.0 else "-",
		}

	var batting: Dictionary = {}
	if any_b:
		var ab: int = b["ab"]
		var pa: int = b["pa"]
		batting = {
			"g": b["g"], "pa": pa, "ab": ab, "h": b["h"], "hr": b["hr"],
			"rbi": b["rbi"], "sb": b["sb"], "bb": b["bb"], "k": b["k"],
			"avg": _fmt3(float(b["h"]) / float(ab)) if ab > 0 else "-",
			"obp": _fmt3(float(b["h"] + b["bb"]) / float(pa)) if pa > 0 else "-",
			"slg": _fmt3(float(b["tb"]) / float(ab)) if ab > 0 else "-",
			"ops": _fmt3(float(b["h"] + b["bb"]) / float(pa) + float(b["tb"]) / float(ab)) if ab > 0 and pa > 0 else "-",
		}

	return {
		"seasons": records.size(),
		"first_year": first_year, "last_year": last_year,
		"pitching": pitching, "batting": batting,
	}


# ── 커리어 하이 ────────────────────────────────────────────────────
#
# **목록인 이유는 순서가 곧 화면 순서라서다.**
#
# 한 칸:
#   side   "pitcher" · "batter" · "record"(stats 밖)
#   field  읽을 칸 이름
#   floor  이 값 미만이면 자랑거리가 아니다 — 0승을 "최다 승"으로 안 내건다
#   lower  낮을수록 좋은 지표(ERA). 이쪽엔 하한을 안 건다 (뜻이 없다)
#   gate   {field, min} — 표본이 이만큼은 돼야 후보다

const HIGHS: Array[Dictionary] = [
	{"key": "w", "label": "최다 승", "side": "pitcher", "field": "w", "floor": 1, "fmt": "int", "suffix": "승"},
	{"key": "k", "label": "최다 탈삼진", "side": "pitcher", "field": "k", "floor": 1, "fmt": "int", "suffix": "K"},
	{"key": "sv", "label": "최다 세이브", "side": "pitcher", "field": "sv", "floor": 1, "fmt": "int", "suffix": "SV"},
	{"key": "ip", "label": "최다 이닝", "side": "pitcher", "field": "ip", "floor": 1, "fmt": "ip", "suffix": "이닝"},
	{"key": "era", "label": "최저 ERA", "side": "pitcher", "field": "era", "lower": true, "fmt": "two",
		"gate_field": "ip", "gate_min": MIN_IP_FOR_RATE},
	{"key": "hr", "label": "최다 홈런", "side": "batter", "field": "hr", "floor": 1, "fmt": "int", "suffix": "홈런"},
	{"key": "rbi", "label": "최다 타점", "side": "batter", "field": "rbi", "floor": 1, "fmt": "int", "suffix": "타점"},
	{"key": "avg", "label": "최고 타율", "side": "batter", "field": "avg", "fmt": "rate3",
		"gate_field": "ab", "gate_min": float(MIN_AB_FOR_RATE)},
	{"key": "ovr", "label": "최고 OVR", "side": "record", "field": "ovr", "floor": 1, "fmt": "int"},
]


## 그 시즌 레코드에서 값을 뽑는다. 해당 없으면 `null`
static func _pick(spec: Dictionary, r: Dictionary):
	# ⚠ OVR은 `stats` 안이 아니라 레코드에 직접 붙어 있다
	if spec["side"] == "record":
		var rv: float = _num(r.get(spec["field"]))
		return rv if rv > 0.0 else null

	var st: Dictionary = r.get("stats", {})
	if st.get("type", "") != spec["side"]:
		return null
	if spec.has("gate_field") and _num(st.get(spec["gate_field"])) < spec["gate_min"]:
		return null
	return _num(st.get(spec["field"]))


static func _format_high(spec: Dictionary, v: float) -> String:
	var body: String
	match spec.get("fmt", "int"):
		"rate3":
			body = _fmt3(v)
		"two":
			body = "%.2f" % v
		"ip":
			body = "%.1f" % v
		_:
			body = str(roundi(v))
	return body + String(spec.get("suffix", ""))


static func highs_of(records: Array) -> Array:
	var out: Array = []

	for spec in HIGHS:
		var best_v: float = 0.0
		var best_year: int = 0
		var found: bool = false
		var lower: bool = spec.get("lower", false)

		for r in records:
			var v = _pick(spec, r)
			if v == null:
				continue
			# 동률이면 **먼저 한 해**를 남긴다 — "처음 그랬던 해"가 이야기가 된다
			if not found or (v < best_v if lower else v > best_v):
				best_v = v
				best_year = int(r.get("year", 0))
				found = true

		if not found:
			continue
		# 하한은 낮을수록 좋은 지표엔 안 건다 (뜻이 없다)
		if not lower and spec.has("floor") and best_v < float(spec["floor"]):
			continue
		out.append({
			"key": spec["key"], "label": spec["label"],
			"value": _format_high(spec, best_v), "year": best_year,
		})

	return out


# ── 팀 이력 · 수상 · 우승 ──────────────────────────────────────────

static func _by_year(records: Array) -> Array:
	var sorted_records: Array = records.duplicate()
	sorted_records.sort_custom(func(a, b) -> bool:
		return int(a.get("year", 0)) < int(b.get("year", 0))
	)
	return sorted_records


## 소속 이력을 연속 구간으로 묶는다.
##
## ⚠ **같은 팀에 두 번 갔다 오면 구간도 둘이다** — 합쳐 버리면 사이에 있던
## 이적이 사라진다
static func team_stints_of(records: Array) -> Array:
	var out: Array = []
	for r in _by_year(records):
		var team: String = r.get("team_id", "")
		if team.is_empty():
			continue
		var year: int = int(r.get("year", 0))
		var last: Dictionary = out[out.size() - 1] if not out.is_empty() else {}

		if not last.is_empty() and last["team_id"] == team and year == last["to_year"] + 1:
			last["to_year"] = year
			last["seasons"] += 1
		elif not last.is_empty() and last["team_id"] == team and year == last["to_year"]:
			# 같은 해 레코드가 둘(승격 등) — 구간을 늘리지 않는다
			pass
		else:
			out.append({"team_id": team, "from_year": year, "to_year": year, "seasons": 1})
	return out


## 수상을 종류별로 묶는다. 같은 상을 여러 번 받은 게 커리어의 무게다
static func award_tally_of(records: Array) -> Array:
	var by_id: Dictionary = {}
	var order: Array = []
	for r in _by_year(records):
		for a in r.get("awards", []):
			var aid: String = a.get("id", "")
			if by_id.has(aid):
				by_id[aid]["count"] += 1
				by_id[aid]["years"].append(int(r.get("year", 0)))
			else:
				by_id[aid] = {"id": aid, "label": a.get("label", ""), "count": 1,
					"years": [int(r.get("year", 0))]}
				order.append(aid)

	var out: Array = []
	for aid in order:
		out.append(by_id[aid])
	out.sort_custom(func(x, y) -> bool:
		if x["count"] != y["count"]:
			return x["count"] > y["count"]
		return String(x["label"]) < String(y["label"])
	)
	return out


## 우승·준우승 횟수
static func title_count_of(records: Array) -> Dictionary:
	var champion: int = 0
	var runner_up: int = 0
	var champion_years: Array = []
	for r in _by_year(records):
		var res: String = r.get("ps_result", "")
		if res == "champion":
			champion += 1
			champion_years.append(int(r.get("year", 0)))
		elif res == "runner_up":
			runner_up += 1
	return {"champion": champion, "runner_up": runner_up, "champion_years": champion_years}
