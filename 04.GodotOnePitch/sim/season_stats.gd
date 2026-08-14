extends RefCounted
class_name SeasonStats

## 시즌 누적 기록 — 경기 라인을 선수별 시즌 성적으로 쌓는다.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/season-helpers.ts`
##
## 기록 한 줄은 사전이고 `type`이 "pitcher"인지 "batter"인지로 갈린다:
##   투수  g gs w l sv hd ip er h k bb era whip risp_ab risp_h
##   타자  g pa ab h hr rbi sb bb k avg obp slg ops risp_ab risp_h
##
## ⚠ **파생값(era·avg·obp·ops…)은 저장된 값을 믿지 않는다.** 누적 counter에서
## 매번 다시 만든다. 그래야 한 번 어긋난 세이브도 다음 경기에 저절로 낫는다.


const PITCHER_ZERO: Dictionary = {
	"type": "pitcher", "g": 0, "gs": 0, "w": 0, "l": 0, "sv": 0, "hd": 0,
	"ip": 0.0, "er": 0.0, "h": 0.0, "k": 0.0, "bb": 0.0, "era": 0.0, "whip": 0.0,
	"risp_ab": 0, "risp_h": 0,
}

const BATTER_ZERO: Dictionary = {
	"type": "batter", "g": 0, "pa": 0, "ab": 0, "h": 0, "hr": 0, "rbi": 0,
	"sb": 0, "bb": 0, "k": 0, "avg": 0.0, "obp": 0.0, "slg": 0.0, "ops": 0.0,
	"risp_ab": 0, "risp_h": 0,
}


# ── 파생 수치 ──────────────────────────────────────────────────────
#
# ⚠ **분모가 0이면 0을 돌려준다.** 나누면 inf/NaN이 나오고, 그게 순위표·수상
# 판정까지 흘러가서 원인 지점에서 한참 떨어진 곳에서 터진다.

static func calc_era(er: float, ip: float) -> float:
	if ip == 0.0 or is_nan(ip):
		return 0.0
	return roundf(er * 9.0 / ip * 100.0) / 100.0


static func calc_whip(bb: float, h: float, ip: float) -> float:
	if ip == 0.0 or is_nan(ip):
		return 0.0
	return roundf((bb + h) / ip * 100.0) / 100.0


static func calc_avg(h: float, ab: float) -> float:
	if ab == 0.0:
		return 0.0
	return roundf(h / ab * 1000.0) / 1000.0


static func calc_ops(obp: float, slg: float) -> float:
	return roundf((obp + slg) * 1000.0) / 1000.0


## NaN·빠진 값을 0으로 본다. NaN은 더하면 전염돼서 한 번 들어가면 그 선수
## 기록이 영영 NaN이다
static func _num(v) -> float:
	if v == null:
		return 0.0
	if v is float:
		return 0.0 if is_nan(v) else v
	if v is int:
		return float(v)
	return 0.0


# ── 누적 ───────────────────────────────────────────────────────────

## 경기 라인들을 시즌 기록에 더한다. **원본 사전을 안 바꾸고 새 사전을 준다** —
## 호출측이 옛 사전을 아직 쥐고 있다
static func accumulate(stats: Dictionary, lines: Array) -> Dictionary:
	var next: Dictionary = stats.duplicate()
	for line in lines:
		var pid: String = line.get("player_id", "")
		if line.get("role", "") == "pitcher":
			next[pid] = _accumulate_pitcher(next.get(pid, PITCHER_ZERO), line)
		else:
			next[pid] = _accumulate_batter(next.get(pid, BATTER_ZERO), line)
	return next


## 같은 일을 **제자리에서** 한다. 시즌 전체를 돌릴 때 쓴다.
##
## ⚠ **매 경기 사전을 통째로 복사하면 안 된다.** 선수 7,000명이면 하루
## 83경기에 58만 키를 복사한다 — 성능 여유가 하루 1.41배뿐이라 그것만으로
## 게이트를 넘는다. 새 사전이 필요한 자리는 `accumulate`를 쓴다
static func accumulate_into(stats: Dictionary, lines: Array) -> void:
	for line in lines:
		var pid: String = line.get("player_id", "")
		if line.get("role", "") == "pitcher":
			stats[pid] = _accumulate_pitcher(stats.get(pid, PITCHER_ZERO), line)
		else:
			stats[pid] = _accumulate_batter(stats.get(pid, BATTER_ZERO), line)


static func _accumulate_pitcher(prev: Dictionary, line: Dictionary) -> Dictionary:
	var ip: float = _num(prev.get("ip")) + _num(line.get("ip"))
	var er: float = _num(prev.get("er")) + _num(line.get("er"))
	var h: float = _num(prev.get("h")) + _num(line.get("h"))
	var k: float = _num(prev.get("k")) + _num(line.get("k"))
	var bb: float = _num(prev.get("bb")) + _num(line.get("bb"))
	var dec: String = line.get("decision", "ND")
	return {
		"type": "pitcher",
		"g": int(_num(prev.get("g"))) + 1,
		# 선발 여부는 라인이 안 들고 온다 — 로스터 쪽이 채운다
		"gs": int(_num(prev.get("gs"))),
		"w": int(_num(prev.get("w"))) + (1 if dec == "W" else 0),
		"l": int(_num(prev.get("l"))) + (1 if dec == "L" else 0),
		"sv": int(_num(prev.get("sv"))) + (1 if dec == "SV" else 0),
		"hd": int(_num(prev.get("hd"))) + (1 if dec == "HD" else 0),
		"ip": ip, "er": er, "h": h, "k": k, "bb": bb,
		"era": calc_era(er, ip),
		"whip": calc_whip(bb, h, ip),
		# 득점권 스플릿 — 엔진이 안 넘기던 시절 세이브도 열려야 하므로 없으면 0
		"risp_ab": int(_num(prev.get("risp_ab")) + _num(line.get("risp_ab"))),
		"risp_h": int(_num(prev.get("risp_h")) + _num(line.get("risp_h"))),
	}


static func _accumulate_batter(prev: Dictionary, line: Dictionary) -> Dictionary:
	var ab: int = int(_num(prev.get("ab")) + _num(line.get("ab")))
	var h: int = int(_num(prev.get("h")) + _num(line.get("h")))
	var hr: int = int(_num(prev.get("hr")) + _num(line.get("hr")))
	var bb: int = int(_num(prev.get("bb")) + _num(line.get("bb")))

	# ⚠ **타석은 누적하지 않고 파생한다.**
	#
	# 예전엔 `prev.pa + ab + bb`였는데 ab·bb가 **이미 누적 합계**라 매 경기
	# 누적값을 또 더했다 — pa가 경기 수의 제곱으로 늘었다. 100경기·경기당
	# 4타수면 실제 ~450인데 계산값이 ~20,200(45배)이다.
	#
	# 그 값이 두 곳을 망가뜨렸다:
	#  · 수상 자격선 minPa 200이 실질 4~5타석이 되어 12타수 7안타(.583)가 타격왕
	#  · obp가 45배 작아지고 ops도 붕괴 — 승강 판정·국가대표·트레이드 가치가
	#    전부 이 값 위에 서 있다
	#
	# 희생타·사구를 안 세는 모델이라 타석 = 타수 + 볼넷이다. 누적 counter에서
	# 파생하면 애초에 어긋날 수가 없다
	var pa: int = ab + bb
	var obp: float = roundf(float(h + bb) / float(pa) * 1000.0) / 1000.0 if pa > 0 else 0.0
	# 2·3루타를 안 세는 모델이라 홈런만 장타로 가산한다
	var slg: float = roundf(float(h + hr * 3) / float(ab) * 1000.0) / 1000.0 if ab > 0 else 0.0

	return {
		"type": "batter",
		"g": int(_num(prev.get("g"))) + 1,
		"pa": pa, "ab": ab, "h": h, "hr": hr,
		"rbi": int(_num(prev.get("rbi")) + _num(line.get("rbi"))),
		"sb": int(_num(prev.get("sb")) + _num(line.get("sb"))),
		"bb": bb,
		"k": int(_num(prev.get("k")) + _num(line.get("k"))),
		"avg": calc_avg(float(h), float(ab)),
		"obp": obp, "slg": slg, "ops": calc_ops(obp, slg),
		"risp_ab": int(_num(prev.get("risp_ab")) + _num(line.get("risp_ab"))),
		"risp_h": int(_num(prev.get("risp_h")) + _num(line.get("risp_h"))),
	}


# ── 세이브를 열 때 ─────────────────────────────────────────────────

## NaN을 걷어내고 파생값을 누적 counter에서 다시 만든다.
##
## ⚠ **원본은 타자 쪽이 통째로 비어 있었다.** 투수만 손보고 타자는 그대로
## 통과시켜서, 한 번 어긋난 pa·obp·ops가 세이브를 왕복해도 영영 안 고쳐졌다.
static func sanitize(stats: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for pid in stats:
		var s: Dictionary = stats[pid]
		if s.get("type", "") == "pitcher":
			var ip: float = _num(s.get("ip"))
			var er: float = _num(s.get("er"))
			var h: float = _num(s.get("h"))
			var bb: float = _num(s.get("bb"))
			var n: Dictionary = s.duplicate()
			n["g"] = int(_num(s.get("g")))
			n["gs"] = int(_num(s.get("gs")))
			n["w"] = int(_num(s.get("w")))
			n["l"] = int(_num(s.get("l")))
			n["sv"] = int(_num(s.get("sv")))
			n["hd"] = int(_num(s.get("hd")))
			n["ip"] = ip
			n["er"] = er
			n["h"] = h
			n["k"] = _num(s.get("k"))
			n["bb"] = bb
			n["era"] = calc_era(er, ip)
			n["whip"] = calc_whip(bb, h, ip)
			out[pid] = n
		else:
			var ab: int = int(_num(s.get("ab")))
			var bh: int = int(_num(s.get("h")))
			var bbb: int = int(_num(s.get("bb")))
			var hr: int = int(_num(s.get("hr")))
			var pa: int = ab + bbb
			var obp: float = roundf(float(bh + bbb) / float(pa) * 1000.0) / 1000.0 if pa > 0 else 0.0
			var slg: float = roundf(float(bh + hr * 3) / float(ab) * 1000.0) / 1000.0 if ab > 0 else 0.0
			var b: Dictionary = s.duplicate()
			b["g"] = int(_num(s.get("g")))
			b["pa"] = pa
			b["ab"] = ab
			b["h"] = bh
			b["hr"] = hr
			b["rbi"] = int(_num(s.get("rbi")))
			b["sb"] = int(_num(s.get("sb")))
			b["bb"] = bbb
			b["k"] = int(_num(s.get("k")))
			b["avg"] = calc_avg(float(bh), float(ab))
			b["obp"] = obp
			b["slg"] = slg
			b["ops"] = calc_ops(obp, slg)
			out[pid] = b
	return out
