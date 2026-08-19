extends RefCounted
class_name TradeRunner

## 트레이드를 세계에 적용한다 — M9-15.
##
## `Trade`는 순수 계산이고, 여기가 선수를 실제로 옮긴다.
##
## ⚠ **02는 이 자리가 `weekPhases/market.ts` 1,566줄 안에 섞여 있었다.**


## 한 리그가 한 번에 성사시킬 수 있는 거래 수. **없으면 하루에 리그가
## 통째로 갈린다**
const MAX_PER_LEAGUE: int = 5
## 한 선수는 한 해에 한 번만 — 같은 사람이 팀을 세 번 옮기면 안 된다
const ONE_MOVE_PER_YEAR: bool = true


## 로스터를 트레이드 자산으로. **주인공은 빼지 않는다** — 02도 자산 풀에
## 넣는데, 실제로 옮길 때만 막는다(진로는 사용자가 정한다)
## 🔴 **주인공을 빼고 있었다.** 그래서 제안에 실릴 수가 없었고 `trade`
## 결정 갈래가 **도달 불가**였다 — 화면도 받는 코드도 `AutoAdvance` 항목도
## 다 있는데 게임에 한 번도 안 나타났다(체육부대와 같은 모양).
##
## **02는 주인공을 자산으로 넣는다** — `market.ts:351-368` `protagonistAsset`.
##
## ⚠ **노트레이드 조항이 있으면 뺀다.** 02도 `noTrade`를 본다 — 조항을
## 따 놓고 여전히 팔려 가면 협상 화면의 그 토글이 장식이 된다
static func assets_of(roster: Array) -> Array:
	var out: Array = []
	for p in roster:
		if p.get("is_protagonist", false) and bool(p.get("no_trade", false)):
			continue
		out.append({
			"id": String(p.get("id", "")),
			"position": String(p.get("position", "")),
			"age": int(p.get("age", 27)),
			"ovr": Contract.core_ovr(p),
			"salary": int(p.get("salary", 0)),
			"contract_years": int(p.get("contract_years", 0)),
			"service_years": int(p.get("pro_service_years", 0)),
		})
	return out


static func payroll_of(roster: Array) -> int:
	var n: int = 0
	for p in roster:
		n += int(p.get("salary", 0))
	return n


## 그 팀이 모자란 자리 — 트레이드 가치에 얹힌다
static func needs_of(assets: Array) -> Array:
	var out: Array = []
	for pos in Trade.POSITIONS:
		var n: int = 0
		for a in assets:
			if String(a["position"]) == pos and not Trade.is_prospect(a):
				n += 1
		if n <= Trade.DEFICIT_COUNT:
			out.append(pos)
	return out


## 팀 하나의 모드. `TeamProfile`이 정한다
static func mode_of(world: Dictionary, team_id: String, rank: int,
		total: int) -> String:
	if TeamProfile.is_buyer(world, team_id, rank, total):
		return "buyer"
	if TeamProfile.is_seller(world, team_id, rank, total):
		return "seller"
	return "neutral"


static func _find(roster: Array, id: String) -> Dictionary:
	for p in roster:
		if String(p.get("id", "")) == id:
			return p
	return {}


static func _asset(assets: Array, id: String) -> Dictionary:
	for a in assets:
		if String(a["id"]) == id:
			return a
	return {}


## 한 리그의 트레이드. `{proposed, done, moved}`
##
## ⚠ **성사 순서가 결과를 정한다.** 이득이 큰 제안부터 본다 — 그래야
## 같은 선수가 여러 제안에 걸려도 제일 나은 거래가 남는다
static func run_league(state: Dictionary, league_id: String) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	var rows: Array = Standings.from_schedule(state.get("schedule", []), league_id)
	# 팀 수를 따로 막지 않는다 — 아래 짝짓기 루프가 한 팀이면 안 돈다
	var teams: Array = World.teams_of(league_id)
	var rank_of: Dictionary = {}
	for r in rows:
		rank_of[String(r["team_id"])] = int(r["rank"])

	var ctx: Dictionary = {}
	for t in teams:
		var tid: String = String(t["id"])
		var roster: Array = World.roster_of(world, tid)
		var assets: Array = assets_of(roster)
		ctx[tid] = {
			"team_id": tid,
			"win_now_pressure": float(TeamProfile.of(world, tid)["win_now_pressure"]),
			"assets": assets,
			"mode": mode_of(world, tid, int(rank_of.get(tid, teams.size())), teams.size()),
			"needs": needs_of(assets),
			"payroll": payroll_of(roster),
		}

	# 모든 짝을 본다. **팀 목록 순서로 고정한다** — 사전 순회에 기대면
	# 같은 세계가 다른 거래를 만든다
	var proposals: Array = []
	for i in teams.size():
		for j in range(i + 1, teams.size()):
			var a: Dictionary = ctx[String(teams[i]["id"])]
			var b: Dictionary = ctx[String(teams[j]["id"])]
			proposals.append_array(Trade.between(a, b, a["assets"], b["assets"],
				String(a["mode"]), String(b["mode"])))

	proposals.sort_custom(func(x, y) -> bool:
		if not is_equal_approx(x["score"], y["score"]):
			return x["score"] > y["score"]
		# 동점 갈래 — 없으면 재현이 무너진다
		return String(x["offering_ids"][0]) < String(y["offering_ids"][0]))

	var moved_ids: Dictionary = state.get("traded_this_year", {})
	var done: int = 0
	var moved: int = 0
	# 🔴 **누가 어디로 갔는지 남긴다** (G-6). 개수만 반환하면 자동 진행을
	# 돌려도 "이적 3건"까지만 보이고 누구인지 알 길이 없다
	var moved_log: Array = []
	for p in proposals:
		if done >= MAX_PER_LEAGUE:
			break
		var ids: Array = p["offering_ids"] + p["requesting_ids"]
		var already: bool = false
		for id in ids:
			if moved_ids.has(id):
				already = true
		if already:
			continue

		var from_id: String = String(p["from_team_id"])
		var to_id: String = String(p["to_team_id"])
		var giving: Array = []
		for id in p["requesting_ids"]:
			giving.append(_asset(ctx[to_id]["assets"], String(id)))
		var receiving: Array = []
		for id in p["offering_ids"]:
			receiving.append(_asset(ctx[from_id]["assets"], String(id)))
		if giving.has({}) or receiving.has({}):
			continue

		# ⚠ **정원을 넘기면 안 된다.** 번들 거래(하나 주고 둘 받기)가
		# 로스터를 밀어 올린다 — 막지 않으면 1군이 상한 위로 새고, 그걸
		# 다음 해 로스터 정리가 방출로 되돌린다
		if not _fits(world, from_id, to_id, league_id,
				p["requesting_ids"].size() - p["offering_ids"].size()):
			continue

		# **받는 쪽이 판단한다** — 제안한 쪽은 이미 하고 싶은 것이다
		if not Trade.accepts(giving, receiving, TeamProfile.of(world, to_id),
				int(ctx[to_id]["payroll"]), ctx[to_id]["needs"]):
			continue

		# 옮기기 전에 양쪽을 따로 확인하지 않는다 — **`moved_ids`가 이미
		# 막는다.** 한 번 옮긴 사람은 다음 제안에서 걸러지므로 여기서
		# "못 찾는" 경우가 안 생긴다. 가드를 두면 죽은 코드가 된다
		# 🔴 **주인공이 끼면 조용히 옮기지 않고 묻는다.** 02도 그렇다.
		# 자산에서 빼 두던 시절엔 여기까지 올 수 없어 가드가 필요 없었는데,
		# 이제 실리므로 갈라야 한다
		var me_id: String = String(state.get("protagonist", {}).get("id", ""))
		if not me_id.is_empty() and (p["offering_ids"].has(me_id) \
				or p["requesting_ids"].has(me_id)):
			var mine_offered: bool = p["offering_ids"].has(me_id)
			var dest: String = to_id if mine_offered else from_id
			# 주고받는 상대 하나를 고른다 — 02도 한 명을 대표로 보여준다
			var back: Array = p["requesting_ids"] if mine_offered \
				else p["offering_ids"]
			if not back.is_empty():
				offer_protagonist(state, dest, String(back[0]),
					String(p.get("reason", "")),
					int(state.get("season_year", 0)))
				moved_ids[me_id] = true
				done += 1
			continue

		for id in p["offering_ids"]:
			if _move(world, String(id), from_id, to_id, league_id,
					int(state.get("season_year", 0)), moved_log):
				moved += 1
				moved_ids[String(id)] = true
		for id in p["requesting_ids"]:
			if _move(world, String(id), to_id, from_id, league_id,
					int(state.get("season_year", 0)), moved_log):
				moved += 1
				moved_ids[String(id)] = true
		done += 1

	state["traded_this_year"] = moved_ids
	return {"proposed": proposals.size(), "done": done, "moved": moved,
		"moved_log": moved_log}


## 이 거래를 하면 양쪽 로스터가 정원 안에 남나.
##
## `delta`는 **제안한 팀이 늘어나는 인원**이다 — 받는 팀은 그 반대로 움직인다
static func _fits(world: Dictionary, from_id: String, to_id: String,
		league_id: String, delta: int) -> bool:
	var limit: int = RosterMaintenance.roster_max_of(league_id)
	if World.roster_of(world, from_id).size() + delta > limit:
		return false
	if World.roster_of(world, to_id).size() - delta > limit:
		return false
	return true


## 주인공이 낀 거래를 **묻는다**. 02 `market.ts:543-560`.
##
## 🔴 **조용히 옮기지 않는다.** 02는 `pushPendingAction({type: "trade"})`로
## 띄우고 **받아오는 선수의 이름·OVR·포지션·연봉**을 같이 싣는다 —
## 뭘 받는지 모르면 받아들일지 정할 수가 없다.
##
## ⚠ **답하기 전에는 안 옮긴다.** 미리 옮기면 물음이 장식이 된다
static func offer_protagonist(state: Dictionary, to_team: String,
		receiving_id: String, reason: String, year: int) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty() or bool(p.get("no_trade", false)):
		return false

	var world: Dictionary = state.get("world", {})
	var got: Dictionary = {}
	for q in World.roster_of(world, to_team):
		if String(q.get("id", "")) == receiving_id:
			got = q
			break

	Pending.push_once(state, {
		"type": "trade",
		"from_team_id": String(p.get("team_id", "")),
		"to_team_id": to_team,
		"to_league_id": String(World.team_field(world, to_team, "league_id",
			String(p.get("league_id", "")))),
		"reason": reason,
		"year": year,
		# ⚠ **받아오는 선수를 같이 싣는다** — 02가 그렇게 한다
		"received_id": receiving_id,
		"received_name": String(got.get("name", receiving_id)),
		"received_ovr": int(roundf(Contract.core_ovr(got))),
		"received_position": String(got.get("position", "")),
		"received_salary": int(got.get("salary", 0)),
	})
	return true


## 선수를 옮긴다. **양쪽 배열을 같이 고쳐야 한다**
## 사람 한 줄에 붙일 요약 — 02가 "OVR:75 SP 28세" 꼴로 적는다 (G-6).
## **누가 어디로 갔는지만으로는 그게 큰 이적인지 모른다**
static func _detail_of(pl: Dictionary) -> String:
	var ovr: float = maxf(
		float(pl.get("pitching", {}).get("ovr", 0.0)),
		float(pl.get("batting", {}).get("ovr", 0.0)))
	if ovr <= 0.0:
		ovr = float(pl.get("ovr", 0.0))
	var out: String = "OVR:%d" % int(roundf(ovr))
	var pos: String = String(pl.get("position", ""))
	if not pos.is_empty():
		out += " %s" % pos
	var age: int = int(pl.get("age", 0))
	if age > 0:
		out += " %d세" % age
	return out


## `log_into`를 주면 **옮긴 사람 한 줄**을 담는다 (G-6).
## ⚠ **이름·능력을 아는 곳이 여기뿐이다** — 부르는 쪽은 id만 들고 있다
static func _move(world: Dictionary, player_id: String, from_team: String,
		to_team: String, league_id: String, year: int,
		log_into: Array = []) -> bool:
	var roster: Array = World.roster_of(world, from_team)
	for i in roster.size():
		if String(roster[i].get("id", "")) != player_id:
			continue
		# 주인공을 여기서 다시 막지 않는다 — **`assets_of`가 이미 뺐다.**
		# 제안에 안 실리므로 여기까지 올 수 없고, 가드를 두면 죽은 코드가 된다
		var p: Dictionary = roster[i]
		roster.remove_at(i)
		# ⚠ **덮어쓰기 전에 담는다** — 뒤에서 읽으면 from과 to가 같아진다
		log_into.append(EventLog.entry(player_id,
			String(p.get("name", player_id)), _detail_of(p),
			from_team, to_team, String(p.get("league_id", "")), league_id))
		p["team_id"] = to_team
		p["league_id"] = league_id
		var events: Array = p.get("career_events", [])
		events.append({"year": year, "type": "trade",
			"from_team_id": from_team, "to_team_id": to_team,
			"to_league_id": league_id, "detail": "트레이드"})
		p["career_events"] = events
		if not world["rosters"].has(to_team):
			world["rosters"][to_team] = []
		world["rosters"][to_team].append(p)
		return true
	return false


## 프로 리그 전부. 시즌 종료가 부른다
static func run(state: Dictionary) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		return {"proposed": 0, "done": 0, "moved": 0, "moved_log": []}
	# 해가 바뀌면 "올해 옮긴 사람" 목록을 비운다
	state["traded_this_year"] = {}

	var total: Dictionary = {"proposed": 0, "done": 0, "moved": 0}
	# 🔴 **리그마다 따로 적는다** (G-6) — 02도 `leagueId`를 실어 어느 리그의
	# 일인지 남긴다. 트레이드는 **시즌 롤오버**에 돌아서 주차가 없다
	var year: int = int(state.get("season_year", 0))
	for lid in TeamProfile.PRO_LEAGUES:
		var r: Dictionary = run_league(state, lid)
		EventLog.push("trade", year, r.get("moved_log", []),
			int(r.get("proposed", 0)), 0, lid)
		for k in total:
			total[k] = int(total[k]) + int(r[k])
	return total
