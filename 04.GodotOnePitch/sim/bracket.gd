extends RefCounted
class_name Bracket

## 포스트시즌 대진 — 라운드 열로 푼다.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/bracket.ts`
##
## 시리즈 한 칸은 사전이다:
##   id · league_id · round · home_team_id · away_team_id · best_of
##   home_wins · away_wins · winner · home_from · away_from
##   next_series_id · next_series_slot
##
## ⚠ **라운드 순서를 `round` 이름으로 정하면 안 된다.** "와일드카드"·
## "준플레이오프" 같은 이름은 리그마다 다르고 KBL/ABL/JBL이 서로 다른 말을
## 쓴다. **결승에서 거꾸로 세는 깊이**가 유일하게 리그와 무관한 기준이다.


## 대진의 한 칸이 지금 어떤 상태인가 — "waiting" · "live" · "done"
static func series_state(s: Dictionary) -> String:
	if not String(s.get("winner", "")).is_empty():
		return "done"
	# 양쪽이 다 정해져야 시작한다. 한쪽이라도 비면 앞 시리즈 대기다
	if String(s.get("home_team_id", "")).is_empty() or String(s.get("away_team_id", "")).is_empty():
		return "waiting"
	return "live"


## 이기려면 몇 승이 필요한가 — 5전 3선승
static func wins_needed(best_of: int) -> int:
	return best_of / 2 + 1


static func best_of_label(best_of: int) -> String:
	return "단판" if best_of == 1 else "%d전 %d선승" % [best_of, wins_needed(best_of)]


## 결승에서 거꾸로 센 깊이.
##
## ⚠ **순환 참조가 있어도 멈춘다.** 데이터가 깨져도 화면이 무한 루프에
## 빠지면 안 된다 — 세이브 하나 때문에 게임이 멈춘다
static func _depth_of(s: Dictionary, by_id: Dictionary) -> int:
	var d: int = 0
	var cur: Dictionary = s
	var seen: Dictionary = {s.get("id", ""): true}
	while not String(cur.get("next_series_id", "")).is_empty():
		var nid: String = cur["next_series_id"]
		# 뒤 시리즈가 지워진 세이브도 있다 — 없으면 거기서 끝이다
		if not by_id.has(nid) or seen.has(nid):
			break
		seen[nid] = true
		cur = by_id[nid]
		d += 1
	return d


## 라운드를 **첫 경기부터 결승 순으로** 돌려준다.
##
## 같은 깊이에 이름이 여러 개면(데이터 결함) 깊이로 묶고 이름은 첫 시리즈
## 것을 쓴다 — 조용히 버리는 것보다 낫다
static func to_rounds(series: Array) -> Array:
	if series.is_empty():
		return []

	var by_id: Dictionary = {}
	for s in series:
		by_id[s.get("id", "")] = s

	var groups: Dictionary = {}
	for s in series:
		var d: int = _depth_of(s, by_id)
		if not groups.has(d):
			groups[d] = []
		groups[d].append(s)

	var depths: Array = groups.keys()
	depths.sort()
	depths.reverse()  # 깊은 쪽(=먼저 하는 경기)이 앞이다

	var out: Array = []
	for d in depths:
		out.append({"depth": d, "label": groups[d][0].get("round", ""), "series": groups[d]})
	return out


static func _final_of(series: Array) -> Dictionary:
	var by_id: Dictionary = {}
	for s in series:
		by_id[s.get("id", "")] = s
	for s in series:
		if _depth_of(s, by_id) == 0:
			return s
	return {}


## 대진 전체가 끝났는가 — 결승(깊이 0)에 승자가 있으면 그 팀. 아직이면 ""
static func champion(series: Array) -> String:
	return _final_of(series).get("winner", "")


## 결승 두 팀 — 우승·준우승. 아직 안 끝났으면 빈 사전.
##
## ⚠ **정본은 대진이다.** 시즌 롤오버가 배경 리그의 우승팀을 `standings[0]`,
## 즉 **정규시즌 1위**로 적고 있었다. 브래킷이 바로 옆에 있는데 안 썼고
## 준우승은 빈칸이었다 — 그래서 과거 기록의 "우승"과 그 아래 대진표의 승자가
## 서로 다를 수 있었다. **우승팀을 두 군데서 각자 정하면 반드시 어긋난다.**
static func finalists(series: Array) -> Dictionary:
	var final_series: Dictionary = _final_of(series)
	var winner: String = final_series.get("winner", "")
	if winner.is_empty():
		return {}
	var home: String = final_series.get("home_team_id", "")
	var away: String = final_series.get("away_team_id", "")
	return {"champion": winner, "runner_up": away if winner == home else home}
