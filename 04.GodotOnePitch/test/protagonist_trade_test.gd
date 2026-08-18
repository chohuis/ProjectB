extends GdUnitTestSuite

## 주인공이 트레이드 대상이 되나 — 🔴 **04에선 절대 안 됐다.**
##
## `TradeRunner.assets_of`가 주인공을 **명시적으로 뺀다**
## (`if p.get("is_protagonist", false): continue`). 그래서 제안에 실릴 수가
## 없고, `trade` 결정 갈래가 **도달 불가**였다 — 화면(`_trade`)도
## 받는 코드(`accept_trade`/`reject_trade`)도 `AutoAdvance` 항목도 다 있는데
## 게임에 한 번도 안 나타난다.
##
## **02는 주인공을 자산으로 넣는다**(`market.ts:351-368` `protagonistAsset`)
## 그리고 걸리면 `pushPendingAction({type: "trade"})`로 **묻는다**
## (`market.ts:550-560`) — 받아오는 선수의 이름·OVR·포지션·연봉까지 실어서.
##
## ⚠ **체육부대와 똑같은 모양이었다**(열여덟 번째 죽은 배선).


func _pro(id: String, ovr: float, team: String, mine: bool = false) -> Dictionary:
	var d: Dictionary = {"id": id, "name": "선수%s" % id, "team_id": team,
		"league_id": "LEAGUE_KBL", "career_stage": "pro_kbl",
		"position": "SP", "age": 27, "player_type": "pitcher",
		"pitching": {"ovr": ovr}, "salary": 10000,
		"contract_years": 2, "pro_service_years": 5,
		"career_status": "active", "injury": null}
	if mine:
		d["is_protagonist"] = true
	return d


# ── 자산에 실리나 ─────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 자산에 안 실리면 제안에 못 들어간다
func test_주인공이_자산에_실린다() -> void:
	var roster: Array = [_pro("ME", 70.0, "T1", true), _pro("N1", 60.0, "T1")]
	var ids: Array = []
	for a in TradeRunner.assets_of(roster):
		ids.append(String(a["id"]))
	assert_bool(ids.has("ME")).override_failure_message(
		"주인공이 트레이드 자산에 없다 — 제안에 실릴 수가 없다: %s" % str(ids)) \
		.is_true()


## ⚠ **노트레이드 조항이 있으면 안 실린다.** 02도 `noTrade`를 본다 —
## 조항을 따 놓고 여전히 팔려 가면 협상 화면의 그 토글이 장식이 된다
func test_노트레이드면_자산에서_뺀다() -> void:
	var me: Dictionary = _pro("ME", 70.0, "T1", true)
	me["no_trade"] = true
	var ids: Array = []
	for a in TradeRunner.assets_of([me, _pro("N1", 60.0, "T1")]):
		ids.append(String(a["id"]))
	assert_bool(ids.has("ME")).override_failure_message(
		"노트레이드 조항이 있는데 자산에 실렸다").is_false()


## 자산 한 줄이 값 있는 칸을 갖는다 — 상대 팀이 판단할 재료다
func test_주인공_자산이_값을_갖는다() -> void:
	var a: Dictionary = {}
	for x in TradeRunner.assets_of([_pro("ME", 70.0, "T1", true)]):
		a = x
	assert_float(float(a.get("ovr", 0.0))).is_equal_approx(70.0, 0.1)
	assert_int(int(a.get("salary", 0))).is_equal(10000)
	assert_str(String(a.get("position", ""))).is_equal("SP")


# ── 걸리면 묻나 ───────────────────────────────────────────────────

func _state() -> Dictionary:
	var me: Dictionary = _pro("ME", 70.0, "T1", true)
	return {
		"day": 300, "season_year": 2031, "seed": 7,
		"protagonist": me, "pending": [], "mailbox": [],
		"world": {"rosters": {"T1": [me], "T2": [_pro("N2", 68.0, "T2")]}},
	}


## 🔴 **조용히 옮기지 않는다 — 묻는다.** 02도 `pushPendingAction`으로 띄운다
func test_주인공이_끼면_묻는다() -> void:
	var s: Dictionary = _state()
	var moved: bool = TradeRunner.offer_protagonist(s, "T2", "N2",
		"전력 보강", 2031)
	assert_bool(moved).override_failure_message("제안이 안 올라갔다").is_true()
	assert_bool(Pending.has(s, "trade")).override_failure_message(
		"주인공이 낀 거래인데 안 물었다 — 조용히 팔려 간다").is_true()


## ⚠ **답하기 전에는 안 옮긴다.** 미리 옮기면 물음이 장식이 된다
func test_답하기_전에는_안_옮긴다() -> void:
	var s: Dictionary = _state()
	TradeRunner.offer_protagonist(s, "T2", "N2", "전력 보강", 2031)
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"묻기만 했는데 벌써 팀이 바뀌었다").is_equal("T1")


## 받아들이면 옮긴다 — `ContractDecision.accept_trade`가 정본이다
func test_받아들이면_옮긴다() -> void:
	var s: Dictionary = _state()
	TradeRunner.offer_protagonist(s, "T2", "N2", "전력 보강", 2031)
	assert_bool(ContractDecision.accept_trade(s, DecisionVm.blocking(s))).is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"받아들였는데 팀이 안 바뀐다").is_equal("T2")


## ⚠ **화면이 받아오는 선수를 보여줘야 한다.** 02는 이름·OVR·포지션·연봉을
## 싣는다 — 뭘 받는지 모르면 받아들일지 정할 수가 없다
func test_화면이_받아오는_선수를_보여준다() -> void:
	var s: Dictionary = _state()
	TradeRunner.offer_protagonist(s, "T2", "N2", "전력 보강", 2031)
	var body: String = String(DecisionVm.build(s).get("body", ""))
	assert_int(body.find("선수N2")).override_failure_message(
		"받아오는 선수가 화면에 없다 — 뭘 받는지 모른다: %s" % body) \
		.is_greater(-1)
	assert_int(body.find("68")).override_failure_message(
		"상대 OVR이 없다: %s" % body).is_greater(-1)
	assert_int(body.find("전력 보강")).override_failure_message(
		"거래 이유가 없다: %s" % body).is_greater(-1)


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	var s: Dictionary = _state()
	TradeRunner.offer_protagonist(s, "T2", "N2", "전력 보강", 2031)
	assert_int(String(DecisionVm.build(s).get("body", "")).find("**")).is_equal(-1)


# ── 도달 가능해졌나 ───────────────────────────────────────────────

## 🔴 **입구가 생겼다.** `decision_reachable_test.gd`가 세는 목록에서 빠져야 한다
func test_대기줄에_올리는_곳이_생겼다() -> void:
	var src := CodeText.of("res://sim/trade_runner.gd")
	assert_int(src.find("\"type\": \"trade\"")).override_failure_message(
		"트레이드를 대기줄에 올리는 곳이 없다").is_greater(-1)


# ── 변이가 살아남은 자리 ──────────────────────────────────────────

## ⚠ **노트레이드면 물음 자체가 안 뜬다.** 자산에서 빼는 것만으론 부족하다 —
## 다른 경로가 `offer_protagonist`를 부를 수 있다
func test_노트레이드면_묻지도_않는다() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["no_trade"] = true
	assert_bool(TradeRunner.offer_protagonist(s, "T2", "N2", "보강", 2031)) \
		.override_failure_message("노트레이드인데 제안이 올라갔다").is_false()
	assert_bool(Pending.has(s, "trade")).override_failure_message(
		"노트레이드 조항이 있는데 물었다 — 협상의 그 토글이 장식이 된다") \
		.is_false()


## 🔴 **`run`이 주인공을 만나면 묻고 멈춘다.** 조용히 옮기면 안 된다.
##
## ⚠ **`run`을 끝까지 굴려야 잡힌다** — `offer_protagonist`만 부르는
## 검사로는 `run` 안의 갈래를 못 본다(변이가 살아남았다)
## ⬜ **`run` 안의 주인공 갈래를 아직 검사가 못 탄다.**
##
## `offer_protagonist`는 직접 불러 다 확인했지만, `TradeRunner.run`이
## **주인공이 낀 제안을 실제로 만드는** 픽스처를 못 세웠다. 시도한 것:
##  · 계약 만료 선점 조건(계약 1년 + 상대 유망주 OVR≥55)을 맞춤 → 안 섬
##  · 가짜 팀 id → `run_league`가 진짜 팀 목록을 봐서 안 돎
##  · 진짜 KBL 팀 id로 바꿔도 안 섬 (순위표·`TeamProfile`·payroll이 더 걸린다)
##
## 그래서 **변이 "안 묻고 조용히 옮긴다"가 살아남는다**(6/7).
## ⚠ **실측에서도 드물다** — 리그 전체 성사가 한 해 15건뿐이라
## 여덟 시드에서 0번 걸렸다. 드문 게 결함은 아니지만 **검사가 못 보는
## 것은 결함이다.** `Trade.propose`를 직접 불러 제안을 만든 뒤
## 그 제안으로 `run`의 안쪽을 타는 검사를 다음에 세운다.


## 🔴 **`run` 안의 주인공 갈래** — P-24b에서 못 타던 자리.
##
## ⚠ **앞서 세 번 빗나간 이유는 상대 팀이 `..._WAVES_2`였기 때문이다.**
## 04는 2군을 `LEAGUE_*_FARM`으로 파생하므로 `World.teams_of("LEAGUE_KBL")`에
## `_2`가 **아예 없다** — 짝이 서지 않았다. **다른 구단의 1군**을 쓰면 선다.
##
## ⚠ **흉내 내지 말고 `run_league` 안에서 찍어서 알아냈다** —
## 손으로 짝 루프를 흉내 낸 계측이 세 번 다 틀렸다.
func test_run_league가_주인공_갈래를_탄다() -> void:
	var A: String = "TEAM_KBL_BUSAN_WAVES_1"
	var B: String = "TEAM_KBL_CHANGWON_STARS_1"
	var me: Dictionary = _pro("ME", 80.0, A, true)
	me["contract_years"] = Trade.EXPIRING_YEARS

	var mate: Dictionary = _pro("A1", 50.0, A)
	mate["contract_years"] = 3
	var prospect: Dictionary = _pro("B1", 66.0, B)
	prospect["pro_service_years"] = Trade.PROSPECT_SERVICE
	prospect["contract_years"] = 4
	var mate2: Dictionary = _pro("B2", 52.0, B)

	var s: Dictionary = {
		"day": 300, "season_year": 2031, "seed": 7,
		"protagonist": me, "pending": [], "mailbox": [], "schedule": [],
		"world": {"rosters": {A: [me, mate], B: [prospect, mate2]}},
	}
	var r: Dictionary = TradeRunner.run_league(s, "LEAGUE_KBL")
	assert_int(int(r["proposed"])).override_failure_message(
		"제안이 안 섰다 — 계약 만료 선점 조건을 다시 본다").is_greater(0)
	assert_bool(Pending.has(s, "trade")).override_failure_message(
		"주인공이 낀 거래인데 안 물었다 — 조용히 팔려 간다").is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"묻고서 벌써 옮겼다").is_equal(A)
	assert_int(int(r["moved"])).override_failure_message(
		"물었는데 사람이 움직였다").is_equal(0)


## 받아오는 선수가 실제로 실린다 — `run` 경로에서도
func test_run_league가_받는_선수를_싣는다() -> void:
	var A: String = "TEAM_KBL_BUSAN_WAVES_1"
	var B: String = "TEAM_KBL_CHANGWON_STARS_1"
	var me: Dictionary = _pro("ME", 80.0, A, true)
	me["contract_years"] = Trade.EXPIRING_YEARS
	var prospect: Dictionary = _pro("B1", 66.0, B)
	prospect["pro_service_years"] = Trade.PROSPECT_SERVICE
	prospect["contract_years"] = 4

	var s: Dictionary = {
		"day": 300, "season_year": 2031, "seed": 7,
		"protagonist": me, "pending": [], "mailbox": [], "schedule": [],
		"world": {"rosters": {
			A: [me, _pro("A1", 50.0, A)],
			B: [prospect, _pro("B2", 52.0, B)]}},
	}
	TradeRunner.run_league(s, "LEAGUE_KBL")
	var body: String = String(DecisionVm.build(s).get("body", ""))
	assert_int(body.find("선수B1")).override_failure_message(
		"받아오는 선수가 화면에 없다: %s" % body).is_greater(-1)
