extends RefCounted
class_name ProspectTop10

## 고교 유망주 월간 TOP 10 — 02 `top10Engine.ts`. **04엔 통째로 없었다.**
##
## 02는 고교 시절 **4주마다** 랭킹을 소식으로 보내고, 그 순위가 인기·스카우트
## 점수·사기에 **실제로 닿는다**(`rankEffect`). 04엔 그 소식도 그 효과도 없다.
##
## ⚠ **02는 본문에 아무것도 안 담는다** — `body: subject`이고 내용이 전부
## `metadata`에 있어 `ProspectTop10Panel`이 없으면 빈 소식이다.
## **04는 본문에 명단을 적는다** — 본문 상세가 생겼으니 그게 낫다.
##
## ⚠ **02의 id는 `Date.now()`를 쓴다.** 그대로 옮기면 같은 주에 두 번
## 굴릴 때 두 통이 되고, 04 규칙(`Rng`)에도 어긋난다 — 해·주차로 짓는다.

## 몇 주마다 오나 — 02 `advanceWeek.ts:597-599` (`weekInYear % 4 === 0`)
const EVERY_WEEKS: int = 4
## 4주차부터 — 개막 직후엔 표본이 없다
const FIRST_WEEK: int = 4
## 몇 명까지
const TOP_N: int = 10

## 02 `calcProspectScore` — 성적 표본이 없을 때의 무게
const OVR_W: float = 0.80
const SCOUT_W: float = 0.20
## 표본이 쌓일수록 성적이 무거워진다
const IP_SMALL: float = 10.0
const IP_MID: float = 30.0
const PA_SMALL: float = 20.0
const PA_MID: float = 60.0
const STAT_W_MID: float = 0.15
const STAT_W_FULL: float = 0.30


## 02 `rankEffect` 그대로 — **순위가 실제로 사람을 바꾼다**
static func rank_effect(rank: int) -> Dictionary:
	if rank == 1:
		return {"popularity": 10.0, "scout_score": 5.0, "morale": 5.0}
	if rank <= 3:
		return {"popularity": 7.0, "scout_score": 3.0, "morale": 3.0}
	if rank <= 5:
		return {"popularity": 5.0, "scout_score": 2.0, "morale": 2.0}
	if rank <= TOP_N:
		return {"popularity": 3.0, "scout_score": 1.0, "morale": 1.0}
	return {"popularity": 0.0, "scout_score": 0.0, "morale": 0.0}


## 성적 무게 — 02 `statW`. 표본이 적으면 0이다
static func _stat_weight(sample: float, small: float, mid: float) -> float:
	if sample < small:
		return 0.0
	return STAT_W_MID if sample < mid else STAT_W_FULL


## 투수 성적 점수 — 02 `eraScore * 0.6 + k9Score * 0.4`
static func pitcher_stat_score(era: float, k: float, ip: float) -> float:
	var era_score: float = clampf((9.0 - era) / 9.0 * 100.0, 0.0, 100.0)
	var k9: float = minf((k / ip) * 9.0 * 2.0, 100.0) if ip > 0.0 else 0.0
	return era_score * 0.6 + k9 * 0.4


## 타자 성적 점수 — 02 `avgScore * 0.5 + opsScore * 0.5`
static func batter_stat_score(avg: float, ops: float) -> float:
	return minf(avg * 250.0, 100.0) * 0.5 + minf(ops * 83.0, 100.0) * 0.5


## 주인공 유망주 점수 — 02 `calcProspectScore`.
##
## ⚠ **성적이 없으면 `ovr * 0.80 + 스카우트 * 0.20`이다.** 성적이 쌓이면
## OVR 쪽 무게를 그만큼 덜어 성적에 준다 — 무게 합은 늘 1이다
static func score_of(p: Dictionary, stats: Dictionary = {}) -> float:
	var is_pitcher: bool = String(p.get("player_type", "pitcher")) == "pitcher"
	var ovr: float = Contract.core_ovr(p)
	# ⚠ **없으면 0이 아니라 기본값이다.** 새 게임 주인공에겐 `scout_score`가
	# 없어서 0으로 읽혔고, 지어낸 점수를 가진 NPC들에게 통째로 밀렸다 —
	# 04의 다른 자리도 `CampusRunner.BASE_SCOUT_SCORE`를 기본으로 쓴다
	var sc: float = float(p.get("scout_score", CampusRunner.BASE_SCOUT_SCORE))
	if stats.is_empty():
		return ovr * OVR_W + sc * SCOUT_W

	if is_pitcher:
		var ip: float = float(stats.get("ip", 0.0))
		var w: float = _stat_weight(ip, IP_SMALL, IP_MID)
		return ovr * (OVR_W - w) + sc * SCOUT_W + pitcher_stat_score(
			float(stats.get("era", 9.0)), float(stats.get("k", 0.0)), ip) * w

	var pa: float = float(stats.get("pa", 0.0))
	var w2: float = _stat_weight(pa, PA_SMALL, PA_MID)
	return ovr * (OVR_W - w2) + sc * SCOUT_W + batter_stat_score(
		float(stats.get("avg", 0.0)), float(stats.get("ops", 0.0))) * w2


## NPC 스카우트 점수 범위 — 02 `simNpcScout`는 `10 + (seed/600)*60`이다
const NPC_SCOUT_MIN: float = 10.0
const NPC_SCOUT_SPAN: float = 60.0


## NPC 스카우트 점수 — 02 `simNpcScout`. **결정론적으로 지어낸다.**
##
## 🔴 **처음엔 `q.get("scout_score", 0.0)`으로 뒀다가 실측에서 걸렸다.**
## 04 고교 NPC에는 `scout_score`가 **없다** — 전원이 0이 되어 점수가
## `ovr * 0.8`뿐이었고, **상위 열 명이 전부 56.0으로 똑같이 나왔다.**
## 순위가 사실상 넣은 순서였다. **"04는 갖고 있다"고 확인 없이 적었다.**
##
## 02도 이 축이 없어서 **일부러 지어낸다** — 그래야 동점이 안 쌓인다.
##
## ⚠ **02 산식을 글자 그대로는 못 옮긴다.** 02는 `id.slice(-3)`을 정수로
## 읽는데 04 id는 숫자 꼬리가 아니다. **옮기는 것은 값이다** — 범위
## 10~70과 "id·주차·학년으로 결정된다"는 성질. `Rng`를 거친다
static func npc_scout(id: String, week: int, grade: int) -> float:
	var r := RandomNumberGenerator.new()
	r.seed = Rng.mix(["npc_scout", id, week, grade])
	return NPC_SCOUT_MIN + r.randf() * NPC_SCOUT_SPAN


## NPC 점수 — 02 `calcNpcScore`. **NPC는 성적을 안 본다**(02도 그렇다)
static func npc_score(q: Dictionary, week: int = 0) -> float:
	var sc: float = float(q.get("scout_score", -1.0))
	if sc < 0.0:
		sc = npc_scout(String(q.get("id", "")), week, int(q.get("grade", 0)))
	return Contract.core_ovr(q) * OVR_W + sc * SCOUT_W


## 이번 달 명단. `[{id, name, team_id, score, rank}, …]` 최대 열 명.
##
## ⚠ **같은 종류끼리만 겨룬다** — 02도 투수는 투수끼리다.
## ⚠ **주인공을 같이 세운다.** 안 세우면 내 순위가 안 나와 효과가 영영 0이다
## ⚠ **`week`가 NPC 점수에 들어간다** — 02도 그렇다. 달마다 명단이 흔들려야
## 랭킹을 볼 이유가 생긴다
static func ranking(state: Dictionary, stats: Dictionary = {},
		grade_filter: int = 0, week: int = 0) -> Array:
	var p: Dictionary = state.get("protagonist", {})
	var kind: String = String(p.get("player_type", "pitcher"))

	var pool: Array = []
	for tid in state.get("world", {}).get("rosters", {}):
		for q in state["world"]["rosters"][tid]:
			if bool(q.get("is_protagonist", false)):
				continue
			if String(q.get("league_id", "")) != "LEAGUE_HIGHSCHOOL":
				continue
			if String(q.get("player_type", "pitcher")) != kind:
				continue
			if grade_filter > 0 and int(q.get("grade", 0)) != grade_filter:
				continue
			pool.append({"id": String(q.get("id", "")), "name": q.get("name", ""),
				"team_id": String(tid), "score": npc_score(q, week),
				"grade": int(q.get("grade", 0))})

	if grade_filter == 0 or int(p.get("grade", 0)) == grade_filter:
		pool.append({"id": String(p.get("id", "")), "name": p.get("name", ""),
			"team_id": String(p.get("team_id", "")), "score": score_of(p, stats),
			"grade": int(p.get("grade", 0)), "is_me": true})

	pool.sort_custom(func(a, b) -> bool: return float(a["score"]) > float(b["score"]))
	var out: Array = pool.slice(0, TOP_N)
	for i in out.size():
		out[i]["rank"] = i + 1
	return out


## 내 순위. **못 들면 0** — 02는 그때 통합 순위를 따로 세지만 04는 명단 밖을
## 0으로 두고 효과도 0이다(`rank_effect`가 그렇게 갈린다)
static func my_rank(rows: Array) -> int:
	for r in rows:
		if bool(r.get("is_me", false)):
			return int(r.get("rank", 0))
	return 0
