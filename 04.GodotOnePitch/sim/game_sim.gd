extends RefCounted
class_name GameSim

## 경기 하나를 돌려 결과와 성적을 남긴다. P-7.
##
## ⚠ **이건 원래 `app_root._play_game`에 있었다.** 화면 안에 있어서
## **헤드리스가 경기를 못 돌렸다** — 계측이 관계를 재려 하면 동료·라이벌이
## 0으로 나왔다(`team_played`·`won`이 경기 결과에서 온다).
##
## ⚠ **화면이 부르는 것과 계측이 부르는 것이 같은 함수여야 한다.**
## 계측이 `MatchDay.play` 호출을 베끼면 그건 두 번째 정본이다.


## 한 경기. `g`에 `result`를 넣고 `state`에 성적을 쌓는다
static func play(g: Dictionary, state: Dictionary) -> void:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		# 세계가 없는 상태(검사·부분 이주)에서는 자리만 채운다
		g["result"] = {"home_score": 0, "away_score": 0, "placeholder": true}
		return

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix([state.get("seed", 0), "game", g.get("id", "")])
	# ⚠ **오늘 등판하기로 한 주인공을 불펜 앞에 세운다.** 안 넘기면
	# "오늘 등판"이 화면에만 뜨고 실제로는 안 나온다
	var relief: String = ""
	if g.get("is_protagonist_game", false):
		relief = String(state.get("protagonist", {}).get("id", ""))
	var my_team: String = String(state.get("protagonist", {}).get("team_id", ""))
	var out: Dictionary = MatchDay.play(world, g.get("home", ""),
		g.get("away", ""), rng, {
			"league_id": g.get("league_id", ""),
			"home_relief": relief if g.get("home", "") == my_team else "",
			"away_relief": relief if g.get("away", "") == my_team else "",
		})
	if not out["ok"]:
		g["result"] = {"home_score": 0, "away_score": 0, "error": out["error"]}
		return
	g["result"] = out["result"]

	# ⚠ **여기서 안 쌓으면 시즌 성적이 영영 안 생긴다.** "나" 탭도 수상도
	# 이 사전을 읽는데 채우는 자리가 없었다 — 화면은 늘 빈칸이었다.
	#
	# ⚠ **제자리로 쌓는다.** 매 경기 7,000키 사전을 복사하면 하루 83경기에
	# 58만 키다 — 성능 여유가 1.41배뿐이라 그것만으로 게이트를 넘는다
	if not state.has("season_stats"):
		state["season_stats"] = {}
	SeasonStats.accumulate_into(state["season_stats"],
		out["result"].get("player_lines", []))
