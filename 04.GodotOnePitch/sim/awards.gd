extends RefCounted
class_name Awards

## 시즌 개인 수상 — 부문 1위와 MVP. M5-1.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/usecases/seasonAwards.ts`
## 수치 정본: `generation_rules.json`의 `awardRules`
##
## ⚠ **화면과 경력기록의 유일한 계산 지점이다.** 원본에서 결산 모달이 같은
## 것을 따로 계산했고 자격선이 달라서 **모달에 뜬 수상자와 경력기록에 남는
## 수상자가 달랐다.** 정본이 둘이면 반드시 어긋난다.
##
## ⚠ **자격선·하한이 없으면 0이 1위가 된다.** 실측에서 도루왕(0)·세이브왕(0)·
## 방어율왕(8.45)이 나왔고 그 둘로 MVP까지 받았다.


## 투수 부문. `min_ip`은 **고교 시즌 길이에 맞춘 값**이다 — 고교는 대회가
## 넉아웃이라 팀 공식경기가 21~36으로 갈리고 커리어 이닝 중앙이 42.5였다.
## 예전 60·70이면 자격자가 구조적으로 안 나왔다.
## 방어율왕만 한 단계 위(45)다 — 규정이닝 성격이 강한 부문이다
const PITCHER_AWARDS: Array[Dictionary] = [
	{"id": "wins", "label": "다승왕", "stat": "w", "order": "desc",
		"min_ip": 40.0, "min_value": 5.0},
	{"id": "era", "label": "방어율왕", "stat": "era", "order": "asc",
		"min_ip": 45.0, "max_value": 4.5},
	{"id": "strikeouts", "label": "탈삼진왕", "stat": "k", "order": "desc",
		"min_ip": 40.0, "min_value": 30.0},
	{"id": "saves", "label": "세이브왕", "stat": "sv", "order": "desc",
		"min_ip": 15.0, "min_value": 3.0},
]

## 타자 부문. 규정타석은 절충값이다 — 250은 너무 높아 부문이 아예 안 나왔고
## 100은 너무 낮아 타율 .528 같은 소표본 1위가 나왔다
const BATTER_AWARDS: Array[Dictionary] = [
	{"id": "avg", "label": "타격왕", "stat": "avg", "order": "desc",
		"min_pa": 200.0, "min_value": 0.25},
	{"id": "hr", "label": "홈런왕", "stat": "hr", "order": "desc",
		"min_pa": 130.0, "min_value": 5.0},
	{"id": "rbi", "label": "타점왕", "stat": "rbi", "order": "desc",
		"min_pa": 130.0, "min_value": 20.0},
	{"id": "sb", "label": "도루왕", "stat": "sb", "order": "desc",
		"min_pa": 120.0, "min_value": 3.0},
]

## MVP는 **부문 1위를 몇 개 가져갔나**로 정한다. 별도 지표를 만들면 부문
## 수상과 어긋난다.
##
## ⚠ 1로 낮추면 한 해에 여덟 명이 MVP가 되어 의미가 없다
const MVP_MIN_TITLES: int = 2
const MVP_LABEL: String = "MVP"


static func _num(v) -> float:
	if v is float:
		return NAN if is_nan(v) else v
	if v is int:
		return float(v)
	return NAN


## 자격을 갖췄나 — 부문마다 최소 출전이 다르다
static func _qualifies(def: Dictionary, st: Dictionary) -> bool:
	if def.has("min_ip"):
		return st.get("type", "") == "pitcher" and _num(st.get("ip")) >= def["min_ip"]
	if def.has("min_pa"):
		return st.get("type", "") == "batter" and _num(st.get("pa")) >= def["min_pa"]
	return true


## 한 부문의 1위와 2위 값. 자격 미달은 후보에서 뺀다
static func _winner_of(def: Dictionary, stats: Dictionary) -> Dictionary:
	var desc: bool = def.get("order", "desc") == "desc"
	var best_id: String = ""
	var best: float = NAN
	var second: float = NAN

	# 순서를 고정한다 — 사전 순회 순서가 바뀌면 동점자 선택이 흔들린다
	var ids: Array = stats.keys()
	ids.sort()
	for id in ids:
		var st: Dictionary = stats[id]
		if not _qualifies(def, st):
			continue
		var v: float = _num(st.get(def["stat"]))
		if is_nan(v):
			continue
		if is_nan(best) or (v > best if desc else v < best):
			if not is_nan(best):
				second = best
			best_id = id
			best = v
		elif is_nan(second) or (v > second if desc else v < second):
			second = v

	if best_id.is_empty():
		return {}
	# ⚠ **하한이 없으면 0이 1위가 된다**
	if def.has("min_value") and best < def["min_value"]:
		return {}
	if def.has("max_value") and best > def["max_value"]:
		return {}
	return {"player_id": best_id, "value": best, "second": second}


## 부문별 표기. **화면과 경력기록이 같은 문자열을 쓴다**
static func format_value(stat: String, v: float) -> String:
	if stat == "era":
		return "%.2f" % v
	if stat == "avg":
		return Leaderboard.rate3(v)
	return str(roundi(v))


## 한 리그의 부문 수상자 전부.
##
## `[{def_id, label, player_id, value, value_text, title, dominance}]`
static func compute(stats: Dictionary) -> Array:
	var out: Array = []
	for def in PITCHER_AWARDS + BATTER_AWARDS:
		var w: Dictionary = _winner_of(def, stats)
		if w.is_empty():
			continue
		var value_text: String = format_value(def["stat"], w["value"])
		# ⚠ **압도성은 상대 격차다.** 부문마다 단위가 달라 절대값으로는
		# 비교가 안 된다(다승 20 vs 타율 .338). MVP 폴백의 기준이다.
		# 방어율은 낮을수록 좋으니 방향을 맞춰야 음수가 안 나온다
		var gap: float = 0.0
		if not is_nan(w["second"]):
			gap = (w["value"] - w["second"]) if def.get("order", "desc") == "desc" \
				else (w["second"] - w["value"])
		var base: float = absf(w["second"] if not is_nan(w["second"]) else w["value"])
		if is_zero_approx(base):
			base = 1.0
		out.append({
			"def_id": def["id"], "label": def["label"],
			"player_id": w["player_id"], "value": w["value"],
			"value_text": value_text,
			"title": "%s (%s)" % [def["label"], value_text],
			"dominance": maxf(gap / base, 0.0),
		})
	return out


## 그 리그의 MVP.
##
## ⚠ **리그별로 뽑는다.** 리그를 합치면 프로 MVP와 고교 MVP가 같은 저울에
## 올라간다.
##
## ⚠ **아무도 두 부문을 못 채우는 해가 있다.** 여덟 부문에 자격자 100명이면
## 석권이 매년 안 나온다 — 실측 격년꼴이었다. 실제 리그는 매년 MVP가 나오므로
## 그 해엔 **가장 압도적으로 1위한** 선수에게 준다
static func mvp_ids(stats: Dictionary) -> Array:
	var winners: Array = compute(stats)
	if winners.is_empty():
		return []

	var titles: Dictionary = {}
	for w in winners:
		titles[w["player_id"]] = int(titles.get(w["player_id"], 0)) + 1

	var multi: Array = []
	for id in titles:
		if titles[id] >= MVP_MIN_TITLES:
			multi.append(id)
	if not multi.is_empty():
		multi.sort()
		return multi

	var top: Dictionary = winners[0]
	for w in winners:
		if w["dominance"] > top["dominance"]:
			top = w
	return [top["player_id"]]
