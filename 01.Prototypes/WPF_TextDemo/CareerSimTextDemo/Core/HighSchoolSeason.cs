using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo.Core;

public sealed class HighSchoolYearManager
{
    private const int TotalDays = 360;
    private static readonly string[] FriendlyOpponents =
    {
        "서울 이노베이션 고", "인천 스카이 고", "수원 퓨전 고", "광주 파워 고"
    };

    private static readonly string[] TournamentOpponents =
    {
        "서울 프레스티지 고", "대구 스피릿 고", "강릉 웨이브 고", "부산 마린 고"
    };

    private readonly List<ScheduledEvent> _events = new();
    private readonly List<HighSchoolPlannedEvent> _plannedEvents = new();
    private readonly HighSchoolProfile _school;
    private readonly int _academicYear;
    private HighSchoolLeagueSchedule? _leagueSchedule;
    private string? _rivalTeamId;
    private HighSchoolTournamentBracket? _tournamentBracket;

    private bool _seasonCompletedLogged;
    private double _coachTrust = 35;
    private double _scoutInterest = 15;

    public bool MatchPending { get; private set; }
    public string? MatchType { get; private set; }
    public string? MatchOpponent { get; private set; }
    public string? MatchOpponentId { get; private set; }
    public bool MatchIsHome { get; private set; } = true;
    public bool MatchIsRivalry { get; private set; }
    public HighSchoolMatchKind MatchKind { get; private set; } = HighSchoolMatchKind.Friendly;
    public string? MatchStageLabel { get; private set; }
    public string? MatchTournamentMatchId { get; private set; }
    public HighSchoolLeagueSchedule? LeagueSchedule => _leagueSchedule;
    public HighSchoolTournamentBracket? TournamentBracket => _tournamentBracket;
    public string? RivalTeamId => _rivalTeamId;
    public double CoachTrust => _coachTrust;
    public double ScoutInterest => _scoutInterest;

    private HighSchoolYearManager(HighSchoolProfile school, int academicYear)
    {
        _school = school;
        _academicYear = Math.Clamp(academicYear, 1, 3);
        DayOfYear = 1;
    }

    public int DayOfYear { get; private set; }
    public int Month => ((DayOfYear - 1) / 30) + 1;
    public int DayOfMonth => ((DayOfYear - 1) % 30) + 1;
    public int WeekOfMonth => ((DayOfYear - 1) % 30) / 7 + 1;
    public int WeekOfYear => ((DayOfYear - 1) / 7) + 1;
    public int TotalWeeks => (TotalDays + 6) / 7;
    public bool SeasonCompleted => DayOfYear > TotalDays;
    public int AcademicYear => _academicYear;

    public static HighSchoolYearManager Create(PlayerProfile player, HighSchoolProfile school, int academicYear)
    {
        var manager = new HighSchoolYearManager(school, academicYear);
        manager.BuildSchedule(player);
        return manager;
    }

    public IReadOnlyList<string> AdvanceDay(PlayerProfile player, Random random)
    {
        var logs = new List<string>();
        foreach (var evt in _events)
        {
            evt.TryExecute(DayOfYear, player, random, this, logs);
        }

        DayOfYear++;
        if (SeasonCompleted && !_seasonCompletedLogged)
        {
            logs.Add($"[시즌 종료] {_academicYear}학년 커리어가 완료되었습니다.");
            _seasonCompletedLogged = true;
        }

        return logs;
    }

    public IReadOnlyList<HighSchoolPlannedEvent> GetPlannedEvents()
        => _plannedEvents
            .OrderBy(e => e.Day)
            .ThenBy(e => e.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public HighSchoolPlannedEvent? GetNextEvent()
        => _plannedEvents
            .Where(e => e.Day >= DayOfYear)
            .OrderBy(e => e.Day)
            .ThenBy(e => e.Title, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

    private void BuildSchedule(PlayerProfile player)
    {
        switch (_academicYear)
        {
            case 1:
                BuildYearOneSchedule(player);
                break;
            case 2:
                BuildYearTwoSchedule(player);
                break;
            case 3:
                BuildYearThreeSchedule(player);
                break;
            default:
                BuildYearOneSchedule(player);
                break;
        }
    }

    private void BuildYearOneSchedule(PlayerProfile player)
    {
        AddOneShotEvent(
            day: 1,
            category: "입학",
            title: "입학식 & 오리엔테이션",
            preview: $"{_school.Name} 감독단이 철학({ _school.Keywords })을 공유합니다.",
            (p, r, m) => new[]
            {
                $"[이벤트] {_school.Name} 입학식과 오리엔테이션이 진행되었습니다. 전통: {_school.Keywords}"
            });

        AddOneShotEvent(
            day: 5,
            category: "평가",
            title: "기초 체력·멘탈 테스트",
            preview: "체력/민첩 수치를 점검하여 훈련 방향을 설정합니다.",
            (p, r, m) =>
            {
                var stamina = p.GetStatValue("PHY_STAMINA");
                var mobility = p.GetStatValue("PHY_MOBILITY");
                var comment = stamina + mobility > 40 ? "상위권으로 평가" : "보완 과제가 부여";
                return new[] { $"[평가] 기초 테스트 결과: {comment}" };
            });

        AddOneShotEvent(
            day: 15,
            category: "스토리",
            title: "멘토·라이벌 지정",
            preview: "상급생 멘토와 라이벌이 배정됩니다.",
            (p, r, m) => new[]
            {
                "[이벤트] 상급생 멘토와 라이벌 후보가 정해졌습니다. 전용 로그가 열립니다."
            });

        AddOneShotEvent(
            day: 23,
            category: "루틴",
            title: "루틴 점검 미팅",
            preview: "코치와 첫 루틴 리뷰를 진행합니다.",
            (p, r, m) =>
            {
                p.ApplyDelta("SKL_COMMAND", 0.2);
                p.ApplyDelta("MNT_FOCUS", 0.2);
                return new[] { "[루틴] 코치와 루틴 점검을 마쳤습니다. 집중과 제구가 소폭 상승했습니다." };
            });

        AddRecurringEvent(
            startDay: 10,
            interval: 15,
            continueCondition: day => day <= 100,
            category: "청백전",
            title: "월간 청백전",
            preview: "연습 경기/청백전에 정기적으로 출전합니다.",
            (p, r, m) =>
            {
                var command = p.GetStatValue("SKL_COMMAND");
                var rating = command + r.NextDouble() * 8;
                var good = rating > 26;
                if (good) m.IncreaseCoachTrust(2);
                else m.IncreaseCoachTrust(-2);
                m.SetMatchOpportunity("청백전", r);
                return new[]
                {
                    good
                        ? "[청백전] 안정적인 제구로 장타를 억제했습니다. 감독 신뢰도 상승."
                        : "[청백전] 제구 난조로 조기 강판. 감독 신뢰도를 잃었습니다."
                };
            });

        AddRecurringEvent(
            startDay: 42,
            interval: 20,
            continueCondition: day => day <= 340,
            category: "학업",
            title: "수업/튜터링/과제 루틴",
            preview: "학업 루틴을 소화하며 집중력과 이해도를 관리합니다.",
            (p, r, m) =>
            {
                var roll = r.NextDouble();
                if (roll < 0.45)
                {
                    p.ApplyDelta("MNT_ACADEMIC", 0.2);
                    return new[] { "[학업] 수업 집중도가 높아 이해도가 상승했습니다." };
                }

                if (roll < 0.8)
                {
                    p.ApplyDelta("MNT_FOCUS", 0.2);
                    return new[] { "[학업] 튜터링으로 약점을 보완했습니다. 집중력이 개선됩니다." };
                }

                p.ApplyDelta("MNT_MORALE", 0.1);
                return new[] { "[학업] 피로 누적으로 휴식 시간을 확보했습니다." };
            });

        AddRecurringEvent(
            startDay: 30,
            interval: 15,
            continueCondition: day => day <= 60,
            category: "공식 경기",
            title: "공식 경기 출전",
            preview: "공식 경기 체험 기회가 주어집니다.",
            (p, r, m) =>
            {
                var threshold = 40;
                if (m._coachTrust < threshold)
                {
                    return new[] { "[공식 경기] 컨디션 조정으로 벤치 대기했습니다." };
                }

                var velo = p.GetStatValue("SKL_FOURSEAM");
                var outingScore = velo + r.NextDouble() * 10;
                m.IncreaseCoachTrust(1);
                m.IncreaseScoutInterest(outingScore > 30 ? 3 : 1);
                m.SetMatchOpportunity("공식 경기", r);
                return new[]
                {
                    outingScore > 42
                        ? "[공식 경기] 롱릴리프로 2이닝 무실점. 스카우트가 노트를 남겼습니다."
                        : "[공식 경기] 실점은 있었지만 경험치를 얻었습니다."
                };
            });

        AddOneShotEvent(
            day: 90,
            category: "멘토",
            title: "멘토 피드백 세션",
            preview: "멘토가 경기 리포트를 공유합니다.",
            (p, r, m) =>
            {
                p.ApplyDelta("MNT_MORALE", 0.3);
                p.ApplyDelta("SKL_COMMAND", 0.2);
                return new[] { "[멘토] 멘토가 제구 루틴을 정리해주었습니다. 멘탈이 안정됩니다." };
            });

        AddOneShotEvent(
            day: 95,
            category: "라이벌",
            title: "라이벌 도전전",
            preview: "라이벌과의 미니 대결이 잡혔습니다.",
            (p, r, m) =>
            {
                p.ApplyDelta("MNT_FOCUS", 0.3);
                return new[] { "[라이벌] 라이벌과의 경쟁으로 집중력이 올라갔습니다." };
            });

        AddOneShotEvent(
            day: 120,
            category: "학업",
            title: "1학기 중간고사",
            preview: "수업/휴식 선택이 반영된 첫 시험.",
            (p, r, m) =>
            {
                var knowledge = p.GetStatValue("MNT_ACADEMIC");
                var focus = p.GetStatValue("MNT_FOCUS");
                var score = knowledge * 0.7 + focus * 0.3;
                var tier = score > 55 ? "A" : score > 35 ? "B" : "C";
                return new[] { $"[학업] 1학기 중간고사 결과: {tier} 등급." };
            });

        AddOneShotEvent(
            day: 60,
            category: "스카우트",
            title: "주말 리그 관전",
            preview: "스카우트가 벤치에서 선수들을 체크합니다.",
            (p, r, m) =>
            {
                m.IncreaseScoutInterest(2);
                return new[] { "[스카우트] 주말 리그에서 스카우트가 성장을 체크했습니다." };
            });

        AddOneShotEvent(
            day: 180,
            category: "멘탈",
            title: "멘탈 컨디셔닝 세션",
            preview: "멘탈 코칭으로 부담을 정리합니다.",
            (p, r, m) =>
            {
                p.ApplyDelta("MNT_MORALE", 0.4);
                p.ApplyDelta("MNT_FOCUS", 0.2);
                return new[] { "[멘탈] 집중 루틴을 재정비했습니다. 자신감이 회복됩니다." };
            });

        AddOneShotEvent(
            day: 150,
            category: "합숙",
            title: "여름 합숙 캠프",
            preview: "체력 집중 합숙으로 체력/체인지업 상승.",
            (p, r, m) =>
            {
                p.ApplyDelta("PHY_STAMINA", 0.4);
                p.ApplyDelta("SKL_CHANGEUP", 0.3);
                return new[] { "[합숙] 체력과 체인지업 구사가 향상되었습니다." };
            });

        AddRecurringEvent(
            startDay: 200,
            interval: 35,
            continueCondition: day => day <= 320,
            category: "컨디션",
            title: "피로 관리 경고",
            preview: "혹사 시 작은 부상 이벤트.",
            (p, r, m) =>
            {
                if (r.NextDouble() < 0.2)
                {
                    p.ApplyDelta("PHY_ARM_HEALTH", -0.4);
                    return new[] { "[컨디션] 팔꿈치에 미세 통증이 감지되어 회복력이 소모되었습니다." };
                }

                return Array.Empty<string>();
            });

        AddOneShotEvent(
            day: 240,
            category: "학업",
            title: "기말고사",
            preview: "학업 이해도와 멘탈이 반영된 성적 산출.",
            (p, r, m) =>
            {
                var knowledge = p.GetStatValue("MNT_ACADEMIC");
                var focus = p.GetStatValue("MNT_FOCUS");
                var score = knowledge * 0.7 + focus * 0.3 + r.Next(0, 6);
                var tier = score > 60 ? "A+" : score > 45 ? "B+" : "C";
                return new[] { $"[학업] 기말고사 결과: {tier} 등급. 대학 진학 자료에 반영됩니다." };
            });

        AddOneShotEvent(
            day: 230,
            category: "합숙",
            title: "겨울 합숙 캠프",
            preview: "폼 안정성과 멘탈 루틴을 정비합니다.",
            (p, r, m) =>
            {
                p.ApplyDelta("SKL_COMMAND", 0.3);
                p.ApplyDelta("MNT_MORALE", 0.3);
                return new[] { "[합숙] 커맨드와 멘탈 루틴을 개선했습니다." };
            });

        AddOneShotEvent(
            day: 360,
            category: "시즌",
            title: "시즌 종료",
            preview: "1학년 로그 정리 및 2학년 준비.",
            (p, r, m) =>
            {
                m._seasonCompletedLogged = true;
                return new[] { "[시즌 종료] 1학년 기록이 정리되었습니다. 2학년 준비 단계가 열립니다." };
            });
    }

    private void BuildYearTwoSchedule(PlayerProfile player)
    {
        AddOneShotEvent(
            day: 1,
            category: "시즌",
            title: "2학년 스프링 캠프",
            preview: "주전 경쟁 선언 및 합숙 시작.",
            (p, r, m) =>
            {
                m.IncreaseCoachTrust(5);
                return new[]
                {
                    "[시즌] 2학년 캠프가 시작되었습니다. 감독이 주전 경쟁을 공식 선언했습니다."
                };
            });

        AddOneShotEvent(
            day: 12,
            category: "평가",
            title: "시즌 목표 설정",
            preview: "ERA/이닝/삼진 목표를 감독이 제시합니다.",
            (p, r, m) =>
            {
                var stamina = p.GetStatValue("PHY_STAMINA");
                var velo = p.GetStatValue("SKL_FOURSEAM");
                var inningsTarget = 35 + Math.Round(stamina / 2, 0);
                var strikeoutTarget = 40 + Math.Round(velo / 3, 0);
                return new[]
                {
                    $"[평가] 코칭스태프가 목표를 제시했습니다. 이닝 {inningsTarget} / 탈삼진 {strikeoutTarget}."
                };
            });

        _leagueSchedule = BuildWeekendLeagueSchedule();
        if (_leagueSchedule is not null)
        {
            ScheduleWeekendLeagueMatches();
        }

        AddOneShotEvent(
            day: 140,
            category: "스토리",
            title: "멘토·라이벌 심화",
            preview: "상급생과의 갈등/협력 이벤트 발생.",
            (p, r, m) =>
            {
                p.ApplyDelta("MNT_MORALE", 0.3);
                return new[]
                {
                    "[스토리] 멘토와 밤늦게까지 불펜 피드백을 진행했습니다. 멘탈이 단단해집니다."
                };
            });

        _tournamentBracket = BuildTournamentBracket(
            "year2_tournament",
            "전국대회",
            new[] { 150, 170, 185 },
            playerStartsInQualifier: true);
        if (_tournamentBracket is not null)
        {
            ScheduleTournamentMatches();
        }

        AddOneShotEvent(
            day: 190,
            category: "스킬",
            title: "스킬 브레이크스루",
            preview: "구종/스태미너 성장 이벤트.",
            (p, r, m) =>
            {
                p.ApplyDelta("SKL_FOURSEAM", 0.6);
                p.ApplyDelta("SKL_CHANGEUP", 0.4);
                p.ApplyDelta("PHY_STAMINA", 0.5);
                return new[] { "[스킬] 브레이크스루! 구속과 체인지업 완성도가 한 단계 상승했습니다." };
            });

        AddOneShotEvent(
            day: 205,
            category: "리더십",
            title: "주장/부주장 후보 평가",
            preview: "감독이 리더 후보를 지명하고 평가합니다.",
            (p, r, m) =>
            {
                var morale = p.GetStatValue("MNT_MORALE");
                var verdict = morale > 22 ? "주장 후보 명단에 올랐습니다." : "부주장 후보에 머물렀습니다.";
                return new[] { $"[리더십] 감독 평가 결과 {verdict}" };
            });

        AddOneShotEvent(
            day: 215,
            category: "스카우트",
            title: "스카우트 인터뷰",
            preview: "프로/대학 스카우트와 공식 인터뷰.",
            (p, r, m) =>
            {
                m.IncreaseScoutInterest(6);
                return new[] { "[스카우트] 인터뷰에서 성장 플랜을 공유했습니다." };
            });

        AddRecurringEvent(
            startDay: 180,
            interval: 30,
            continueCondition: day => day <= 310,
            category: "컨디션",
            title: "부상/휴식 딜레마",
            preview: "혹사 시 부상 위험, 휴식 선택 가능.",
            (p, r, m) =>
            {
                if (r.NextDouble() < 0.25)
                {
                    p.ApplyDelta("PHY_ARM_HEALTH", -0.8);
                    return new[]
                    {
                        "[컨디션] 팔꿈치 통증 경고가 떴습니다. 휴식을 취하지 않으면 부상 위험이 있습니다."
                    };
                }

                return Array.Empty<string>();
            });

        AddOneShotEvent(
            day: 120,
            category: "학업",
            title: "2학년 중간고사",
            preview: "학업/집중력 점검.",
            (p, r, m) =>
            {
                var score = p.GetStatValue("MNT_ACADEMIC") * 1.1 + p.GetStatValue("MNT_FOCUS");
                var tier = score > 60 ? "A" : score > 40 ? "B" : "C";
                return new[] { $"[학업] 중간고사 결과 {tier}. 대학 관심도에 반영됩니다." };
            });

        AddOneShotEvent(
            day: 240,
            category: "학업",
            title: "2학년 기말고사",
            preview: "누적 학점 유지 여부 확인.",
            (p, r, m) =>
            {
                var score = (p.GetStatValue("MNT_ACADEMIC") + p.GetStatValue("MNT_MORALE")) / 2 + r.Next(0, 12);
                var tier = score > 65 ? "A+" : score > 50 ? "B+" : "C";
                return new[] { $"[학업] 기말고사 성적 {tier}. 장학 유지 여부가 결정됩니다." };
            });

        AddOneShotEvent(
            day: 300,
            category: "진로",
            title: "진로 탐색 세션",
            preview: "대학/프로/독립 옵션을 상담.",
            (p, r, m) =>
            {
                return new[]
                {
                    "[진로] 코칭스태프와 진로 상담을 진행했습니다. 대학/프로/독립 리그 플랜이 정리됩니다."
                };
            });

        AddOneShotEvent(
            day: 360,
            category: "시즌",
            title: "시즌 종료",
            preview: "2학년 기록 정리 및 3학년 준비.",
            (p, r, m) =>
            {
                m._seasonCompletedLogged = true;
                return new[] { "[시즌 종료] 2학년 시즌이 종료되었습니다. 마지막 해 준비를 시작합니다." };
            });
    }

    private void BuildYearThreeSchedule(PlayerProfile player)
    {
        AddOneShotEvent(
            day: 1,
            category: "합숙",
            title: "마지막 시즌 준비 합숙",
            preview: "특화 훈련으로 폼 점검.",
            (p, r, m) =>
            {
                p.ApplyDelta("PHY_STAMINA", 0.6);
                p.ApplyDelta("SKL_COMMAND", 0.4);
                return new[] { "[합숙] 마지막 시즌을 위한 특화 훈련으로 컨디션을 끌어올렸습니다." };
            });

        AddOneShotEvent(
            day: 12,
            category: "시즌",
            title: "주전/롤 확정",
            preview: "감독이 에이스/불펜 등 역할 확정.",
            (p, r, m) =>
            {
                var role = p.GetStatValue("SKL_FOURSEAM") > 40 ? "에이스 로테이션" : "멀티 이닝 불펜";
                return new[] { $"[시즌] 감독이 당신을 '{role}'으로 확정했습니다." };
            });

        AddOneShotEvent(
            day: 30,
            category: "리더십",
            title: "주장/부주장 승격",
            preview: "2학년 후보 결과 반영, 계승 이벤트.",
            (p, r, m) =>
            {
                var morale = p.GetStatValue("MNT_MORALE");
                var log = morale > 24
                    ? "[리더십] 주장 완장을 받았습니다. 후배들을 이끌 책임이 생겼습니다."
                    : "[리더십] 부주장으로 팀을 지원합니다.";
                return new[] { log };
            });

        AddRecurringEvent(
            startDay: 70,
            interval: 21,
            continueCondition: day => day <= 220,
            category: "공식 경기",
            title: "정규 시즌 투입",
            preview: "주말리그와 전국대회 전초전.",
            (p, r, m) =>
            {
                m.SetMatchOpportunity("정규 시즌 경기", r);
                var quality = p.GetStatValue("SKL_COMMAND") + r.NextDouble() * 15;
                if (quality > 55)
                {
                    m.IncreaseCoachTrust(4);
                    m.IncreaseScoutInterest(4);
                    return new[] { "[공식 경기] 에이스다운 피칭! 스카우트가 강력히 메모했습니다." };
                }

                return new[] { "[공식 경기] 체력이 떨어져 고전했습니다. 회복 루틴이 필요합니다." };
            });

        AddOneShotEvent(
            day: 90,
            category: "쇼케이스",
            title: "스카우트 쇼케이스",
            preview: "프로/해외 스카우트 대상 쇼케이스.",
            (p, r, m) =>
            {
                m.SetMatchOpportunity("스카우트 쇼케이스", r);
                m.IncreaseScoutInterest(8);
                return new[] { "[쇼케이스] 모든 투구 데이터를 측정했습니다. 스카우트 관심도가 급상승합니다." };
            });

        _tournamentBracket = BuildTournamentBracket(
            "year3_tournament",
            "전국대회",
            new[] { 150 },
            playerStartsInQualifier: false);
        if (_tournamentBracket is not null)
        {
            ScheduleTournamentMatches();
        }

        AddOneShotEvent(
            day: 120,
            category: "학업",
            title: "3학년 중간고사",
            preview: "학업 마무리 1차 점검.",
            (p, r, m) =>
            {
                var score = p.GetStatValue("MNT_ACADEMIC") + r.Next(5, 15);
                return new[] { $"[학업] 중간고사 총점 {Math.Round(score, 1)}. 대학 합격선과 비교 중입니다." };
            });

        AddOneShotEvent(
            day: 210,
            category: "학업",
            title: "졸업 논문/기말고사",
            preview: "졸업 논문 및 기말고사 제출.",
            (p, r, m) =>
            {
                var score = (p.GetStatValue("MNT_ACADEMIC") + p.GetStatValue("MNT_FOCUS")) / 2 + r.Next(5, 18);
                var tier = score > 70 ? "A+" : score > 55 ? "B" : "C";
                return new[] { $"[학업] 졸업 논문 심사 결과 {tier}. 대학 진학 가능 여부가 확정됩니다." };
            });

        AddOneShotEvent(
            day: 220,
            category: "드래프트",
            title: "드래프트 신청",
            preview: "KBO 드래프트 신청·면담 시작.",
            (p, r, m) =>
            {
                m.IncreaseScoutInterest(10);
                return new[] { "[드래프트] 드래프트 참가 서류를 제출했습니다. 구단 면담 일정이 시작됩니다." };
            });

        AddOneShotEvent(
            day: 250,
            category: "진로",
            title: "대체 경로 준비",
            preview: "미지명 시 대비해 대학/독립/군 입대 플랜 작성.",
            (p, r, m) =>
            {
                return new[]
                {
                    "[진로] 미지명 대비 플랜을 수립했습니다. 대학 조건/독립 트라이아웃/군 입대 시나리오가 업데이트됩니다."
                };
            });

        AddRecurringEvent(
            startDay: 240,
            interval: 28,
            continueCondition: day => day <= 330,
            category: "멘탈",
            title: "압박 관리",
            preview: "드래프트/진로 압박으로 멘탈 이벤트 발생.",
            (p, r, m) =>
            {
                if (r.NextDouble() < 0.3)
                {
                    p.ApplyDelta("MNT_MORALE", -0.6);
                    return new[] { "[멘탈] 압박감으로 집중력이 흔들렸습니다. 휴식이나 멘탈 케어가 필요합니다." };
                }

                return Array.Empty<string>();
            });

        AddOneShotEvent(
            day: 310,
            category: "리더십",
            title: "주장 계승 준비",
            preview: "후배에게 주장/부주장 역할을 물려줍니다.",
            (p, r, m) =>
            {
                return new[]
                {
                    "[리더십] 후배들과 주장단 인수인계를 진행했습니다. 팀 히스토리에 메시지가 기록됩니다."
                };
            });

        AddOneShotEvent(
            day: 330,
            category: "드래프트",
            title: "드래프트 결과",
            preview: "실제 지명/미지명 결과 투입.",
            (p, r, m) =>
            {
                return new[]
                {
                    "[드래프트] 실제 지명 결과가 공개됩니다. 지명 여부는 다음 단계(프로/대학/독립) 결정에 사용됩니다."
                };
            });

        AddOneShotEvent(
            day: 360,
            category: "졸업",
            title: "졸업 & 히스토리 정리",
            preview: "진로 결정, 히스토리 로그 요약.",
            (p, r, m) =>
            {
                m._seasonCompletedLogged = true;
                return new[]
                {
                    "[졸업] 3년의 히스토리가 정리되었습니다. 감독/동료 메시지와 진로 결과가 기록됩니다."
                };
            });
    }

    private void ScheduleWeekendLeagueMatches()
    {
        if (_leagueSchedule is null)
        {
            return;
        }

        foreach (var match in _leagueSchedule.GetMatchesForTeam(_school.Id))
        {
            var isHome = match.HomeTeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase);
            var opponentName = isHome ? match.AwayTeamName : match.HomeTeamName;
            var opponentId = isHome ? match.AwayTeamId : match.HomeTeamId;
            var title = match.IsRivalry ? "주말리그 라이벌전" : "주말리그 등판";
            var preview = match.IsRivalry
                ? "라이벌과의 주말리그 맞대결이 예정되었습니다."
                : "주말리그 일정이 배정되었습니다.";

            AddOneShotEvent(
                day: match.Day,
                category: "주말리그",
                title: title,
                preview: preview,
                (p, r, m) =>
                {
                    m.SetMatchOpportunity(
                        "주말 리그",
                        r,
                        opponentName,
                        opponentId,
                        isHome,
                        match.IsRivalry,
                        HighSchoolMatchKind.WeekendLeague,
                        $"주말리그 {match.Round}R",
                        null);
                    return new[] { $"[주말리그] {opponentName}전 등판을 준비합니다." };
                });
        }
    }

    private HighSchoolLeagueSchedule BuildWeekendLeagueSchedule()
    {
        var teams = BuildLeagueTeamPool();
        if (teams.Count < 4)
        {
            return new HighSchoolLeagueSchedule(Array.Empty<HighSchoolLeagueMatch>());
        }

        var matchDays = BuildLeagueMatchDays(65, 21, 235);
        var matches = BuildRoundRobinMatches(teams, matchDays);
        return new HighSchoolLeagueSchedule(matches);
    }

    private List<HighSchoolTeamEntry> BuildLeagueTeamPool()
    {
        var teams = new List<HighSchoolTeamEntry>();
        var rosterDir = DataPathResolver.HighSchoolRosterDirectory;
        if (Directory.Exists(rosterDir))
        {
            var rosterFiles = Directory.GetFiles(rosterDir, "*.json", SearchOption.TopDirectoryOnly)
                .Where(path => !string.Equals(Path.GetFileNameWithoutExtension(path), "index", StringComparison.OrdinalIgnoreCase));

            foreach (var file in rosterFiles)
            {
                var teamId = Path.GetFileNameWithoutExtension(file);
                var roster = HighSchoolRosterRepository.Load(teamId);
                var name = roster?.TeamName ?? teamId;
                teams.Add(new HighSchoolTeamEntry(teamId, name));
            }
        }

        if (teams.All(t => !t.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase)))
        {
            teams.Add(new HighSchoolTeamEntry(_school.Id, _school.Name));
        }

        var playerTeam = teams.First(t => t.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase));
        var others = teams.Where(t => !t.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase)).ToList();
        if (others.Count == 0)
        {
            others.AddRange(new[]
            {
                new HighSchoolTeamEntry("NPC_A", "가온 고"),
                new HighSchoolTeamEntry("NPC_B", "해오름 고"),
                new HighSchoolTeamEntry("NPC_C", "가람 고"),
                new HighSchoolTeamEntry("NPC_D", "한빛 고"),
                new HighSchoolTeamEntry("NPC_E", "새움 고"),
                new HighSchoolTeamEntry("NPC_F", "드림 고"),
                new HighSchoolTeamEntry("NPC_G", "센트럴 고")
            });
        }

        var seed = Math.Abs(_school.Id.GetHashCode());
        var rng = new Random(seed);
        var selectedOthers = others.OrderBy(_ => rng.Next()).Take(7).ToList();
        var pool = new List<HighSchoolTeamEntry> { playerTeam };
        pool.AddRange(selectedOthers);

        _rivalTeamId ??= selectedOthers.FirstOrDefault()?.TeamId;
        return pool;
    }

    private static List<int> BuildLeagueMatchDays(int startDay, int interval, int endDay)
    {
        var days = new List<int>();
        for (var day = startDay; day <= endDay; day += interval)
        {
            days.Add(day);
        }

        return days;
    }

    private List<HighSchoolLeagueMatch> BuildRoundRobinMatches(IReadOnlyList<HighSchoolTeamEntry> teams, IReadOnlyList<int> matchDays)
    {
        var teamList = teams.ToList();
        if (teamList.Count % 2 == 1)
        {
            teamList.Add(new HighSchoolTeamEntry("BYE", "BYE"));
        }

        var rounds = teamList.Count - 1;
        var matches = new List<HighSchoolLeagueMatch>();
        var dayIndex = 0;

        for (var round = 0; round < rounds; round++)
        {
            var day = matchDays[Math.Min(dayIndex, matchDays.Count - 1)];
            for (var i = 0; i < teamList.Count / 2; i++)
            {
                var home = teamList[i];
                var away = teamList[teamList.Count - 1 - i];
                if (home.TeamId == "BYE" || away.TeamId == "BYE")
                {
                    continue;
                }

                var swap = round % 2 == 1;
                var homeTeam = swap ? away : home;
                var awayTeam = swap ? home : away;
                var isRivalry = _rivalTeamId is not null &&
                                ((homeTeam.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase) && awayTeam.TeamId.Equals(_rivalTeamId, StringComparison.OrdinalIgnoreCase)) ||
                                 (awayTeam.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase) && homeTeam.TeamId.Equals(_rivalTeamId, StringComparison.OrdinalIgnoreCase)));

                matches.Add(new HighSchoolLeagueMatch(
                    day,
                    round + 1,
                    homeTeam.TeamId,
                    homeTeam.TeamName,
                    awayTeam.TeamId,
                    awayTeam.TeamName,
                    isRivalry));
            }

            dayIndex++;
            RotateTeams(teamList);
        }

        if (matchDays.Count > rounds)
        {
            var extraRounds = matchDays.Count - rounds;
            var baseRounds = matches.GroupBy(m => m.Round).OrderBy(g => g.Key).ToList();
            for (var extra = 0; extra < extraRounds; extra++)
            {
                var day = matchDays[rounds + extra];
                var sourceRound = baseRounds[extra % baseRounds.Count].ToList();
                foreach (var match in sourceRound)
                {
                    matches.Add(new HighSchoolLeagueMatch(
                        day,
                        rounds + extra + 1,
                        match.AwayTeamId,
                        match.AwayTeamName,
                        match.HomeTeamId,
                        match.HomeTeamName,
                        match.IsRivalry));
                }
            }
        }

        return matches;
    }

    private static void RotateTeams(IList<HighSchoolTeamEntry> teams)
    {
        if (teams.Count <= 2)
        {
            return;
        }

        var last = teams[^1];
        for (var i = teams.Count - 1; i > 1; i--)
        {
            teams[i] = teams[i - 1];
        }

        teams[1] = last;
    }

    private sealed record HighSchoolTeamEntry(string TeamId, string TeamName);

    private void ScheduleTournamentMatches()
    {
        if (_tournamentBracket is null)
        {
            return;
        }

        foreach (var round in _tournamentBracket.Rounds)
        {
            AddOneShotEvent(
                day: round.Day,
                category: "대회",
                title: $"{_tournamentBracket.Name} {round.Label}",
                preview: $"{round.Label} 일정이 예정되었습니다.",
                (p, r, m) =>
                {
                    if (_tournamentBracket.IsTeamEliminated(_school.Id))
                    {
                        return new[] { "[대회] 탈락으로 대회 일정이 종료되었습니다." };
                    }

                    var match = _tournamentBracket.GetMatchForTeamOnDay(_school.Id, round.Day);
                    if (match is null)
                    {
                        return new[] { "[대회] 해당 라운드에 출전하지 않습니다." };
                    }

                    var opponent = match.GetOpponent(_school.Id);
                    var opponentName = opponent?.TeamName ?? "상대 미정";
                    var opponentId = opponent?.TeamId ?? "TBD";
                    var isHome = match.Home?.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase) ?? false;

                    m.SetMatchOpportunity(
                        $"{_tournamentBracket.Name} {round.Label}",
                        r,
                        opponentName,
                        opponentId,
                        isHome,
                        false,
                        HighSchoolMatchKind.Tournament,
                        round.Label,
                        match.MatchId);

                    return new[] { $"[대회] {round.Label} 상대: {opponentName}" };
                });
        }
    }

    private HighSchoolTournamentBracket BuildTournamentBracket(string id, string name, IReadOnlyList<int> roundDays, bool playerStartsInQualifier)
    {
        if (roundDays.Count == 0)
        {
            return new HighSchoolTournamentBracket(id, name, Array.Empty<HighSchoolTournamentRound>());
        }

        var teams = BuildTournamentTeamPool(Math.Max(4, playerStartsInQualifier ? 6 : 4));
        var playerTeam = teams.First(t => t.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase));
        var others = teams.Where(t => !t.TeamId.Equals(_school.Id, StringComparison.OrdinalIgnoreCase)).ToList();

        if (roundDays.Count == 1)
        {
            var opponent = others.FirstOrDefault() ?? new HighSchoolTeamEntry("NPC_T", "라이벌 고");
            var finalMatch = new HighSchoolTournamentMatch(
                "F1",
                roundDays[0],
                "결승",
                new HighSchoolTournamentTeam(playerTeam.TeamId, playerTeam.TeamName),
                new HighSchoolTournamentTeam(opponent.TeamId, opponent.TeamName),
                null,
                null);

            var finalRound = new HighSchoolTournamentRound("결승", roundDays[0], new[] { finalMatch });
            return new HighSchoolTournamentBracket(id, name, new[] { finalRound });
        }

        var roundLabels = new[] { "예선", "본선", "결승" };
        var days = roundDays.Count >= 3 ? roundDays.Take(3).ToArray() : new[] { roundDays[0], roundDays[^1], roundDays[^1] + 10 };

        var qualifierTeams = new List<HighSchoolTeamEntry>();
        var seededTeams = new List<HighSchoolTeamEntry>();

        if (playerStartsInQualifier)
        {
            qualifierTeams.Add(playerTeam);
            qualifierTeams.Add(others.ElementAtOrDefault(0) ?? new HighSchoolTeamEntry("NPC_Q1", "청명 고"));
            qualifierTeams.Add(others.ElementAtOrDefault(1) ?? new HighSchoolTeamEntry("NPC_Q2", "세원 고"));
            qualifierTeams.Add(others.ElementAtOrDefault(2) ?? new HighSchoolTeamEntry("NPC_Q3", "광명 고"));
            seededTeams.Add(others.ElementAtOrDefault(3) ?? new HighSchoolTeamEntry("NPC_S1", "동진 고"));
            seededTeams.Add(others.ElementAtOrDefault(4) ?? new HighSchoolTeamEntry("NPC_S2", "중앙 고"));
        }
        else
        {
            qualifierTeams.AddRange(others.Take(4));
            seededTeams.Add(playerTeam);
            seededTeams.Add(others.ElementAtOrDefault(4) ?? new HighSchoolTeamEntry("NPC_S1", "동진 고"));
        }

        var q1 = new HighSchoolTournamentMatch(
            "Q1",
            days[0],
            roundLabels[0],
            new HighSchoolTournamentTeam(qualifierTeams[0].TeamId, qualifierTeams[0].TeamName),
            new HighSchoolTournamentTeam(qualifierTeams[1].TeamId, qualifierTeams[1].TeamName),
            null,
            null);

        var q2 = new HighSchoolTournamentMatch(
            "Q2",
            days[0],
            roundLabels[0],
            new HighSchoolTournamentTeam(qualifierTeams[2].TeamId, qualifierTeams[2].TeamName),
            new HighSchoolTournamentTeam(qualifierTeams[3].TeamId, qualifierTeams[3].TeamName),
            null,
            null);

        var s1 = new HighSchoolTournamentMatch(
            "S1",
            days[1],
            roundLabels[1],
            new HighSchoolTournamentTeam(seededTeams[0].TeamId, seededTeams[0].TeamName),
            null,
            null,
            "Q1");

        var s2 = new HighSchoolTournamentMatch(
            "S2",
            days[1],
            roundLabels[1],
            new HighSchoolTournamentTeam(seededTeams[1].TeamId, seededTeams[1].TeamName),
            null,
            null,
            "Q2");

        var f1 = new HighSchoolTournamentMatch(
            "F1",
            days[2],
            roundLabels[2],
            null,
            null,
            "S1",
            "S2");

        var rounds = new[]
        {
            new HighSchoolTournamentRound(roundLabels[0], days[0], new[] { q1, q2 }),
            new HighSchoolTournamentRound(roundLabels[1], days[1], new[] { s1, s2 }),
            new HighSchoolTournamentRound(roundLabels[2], days[2], new[] { f1 })
        };

        return new HighSchoolTournamentBracket(id, name, rounds);
    }

    private List<HighSchoolTeamEntry> BuildTournamentTeamPool(int requiredTeams)
    {
        var teams = BuildLeagueTeamPool();
        if (teams.Count >= requiredTeams)
        {
            return teams.Take(requiredTeams).ToList();
        }

        var filler = new List<HighSchoolTeamEntry>();
        for (var i = teams.Count; i < requiredTeams; i++)
        {
            filler.Add(new HighSchoolTeamEntry($"NPC_T{i}", $"강호 {i} 고"));
        }

        teams.AddRange(filler);
        return teams;
    }

    private void AddOneShotEvent(int day, string category, string title, string preview, Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> resolver)
    {
        _events.Add(ScheduledEvent.OneShot(day, resolver));
        _plannedEvents.Add(new HighSchoolPlannedEvent(day, category, title, preview));
    }

    private void AddRecurringEvent(int startDay, int interval, Func<int, bool> continueCondition, string category, string title, string preview, Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> resolver)
    {
        _events.Add(ScheduledEvent.Recurring(startDay, interval, continueCondition, resolver));
        for (var day = startDay; continueCondition(day); day += interval)
        {
            _plannedEvents.Add(new HighSchoolPlannedEvent(day, category, title, preview));
        }
    }

    internal void IncreaseCoachTrust(double value) => _coachTrust = Math.Clamp(_coachTrust + value, 0, 100);
    internal void IncreaseScoutInterest(double value) => _scoutInterest = Math.Clamp(_scoutInterest + value, 0, 100);
    internal void SetMatchOpportunity(string type, Random random, string? opponent = null)
    {
        SetMatchOpportunity(
            type,
            random,
            opponent,
            null,
            true,
            false,
            ResolveMatchKind(type),
            null,
            null);
    }

    internal void SetMatchOpportunity(
        string type,
        Random random,
        string? opponent,
        string? opponentId,
        bool isHome,
        bool isRivalry,
        HighSchoolMatchKind kind,
        string? stageLabel,
        string? tournamentMatchId)
    {
        MatchPending = true;
        MatchType = type;
        MatchOpponent = opponent ?? BuildOpponentName(type, random);
        MatchOpponentId = opponentId ?? MatchOpponent;
        MatchIsHome = isHome;
        MatchIsRivalry = isRivalry;
        MatchKind = kind;
        MatchStageLabel = stageLabel;
        MatchTournamentMatchId = tournamentMatchId;
    }

    internal void CompleteMatchOpportunity()
    {
        MatchPending = false;
        MatchType = null;
        MatchOpponent = null;
        MatchOpponentId = null;
        MatchIsHome = true;
        MatchIsRivalry = false;
        MatchKind = HighSchoolMatchKind.Friendly;
        MatchStageLabel = null;
        MatchTournamentMatchId = null;
    }

    private static HighSchoolMatchKind ResolveMatchKind(string type)
    {
        if (type.Contains("청백전", StringComparison.Ordinal))
        {
            return HighSchoolMatchKind.Scrimmage;
        }

        if (type.Contains("주말", StringComparison.Ordinal))
        {
            return HighSchoolMatchKind.WeekendLeague;
        }

        if (type.Contains("대회", StringComparison.Ordinal))
        {
            return HighSchoolMatchKind.Tournament;
        }

        if (type.Contains("공식", StringComparison.Ordinal) || type.Contains("정규", StringComparison.Ordinal))
        {
            return HighSchoolMatchKind.Official;
        }

        return HighSchoolMatchKind.Friendly;
    }

    private string BuildOpponentName(string type, Random random)
    {
        if (type.Contains("청백전", StringComparison.Ordinal))
        {
            return $"{_school.Name} 청백전";
        }

        var targetPool =
            type.Contains("공식", StringComparison.Ordinal) ||
            type.Contains("대회", StringComparison.Ordinal) ||
            type.Contains("주말", StringComparison.Ordinal)
                ? TournamentOpponents
                : FriendlyOpponents;

        return targetPool[random.Next(targetPool.Length)];
    }

    private sealed class ScheduledEvent
    {
        private ScheduledEvent(int nextDay, bool repeat, int interval, Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> resolver, Func<int, bool>? continueCondition)
        {
            _nextDay = nextDay;
            _repeat = repeat;
            _interval = interval;
            _resolver = resolver;
            _continueCondition = continueCondition;
        }

        private int _nextDay;
        private readonly bool _repeat;
        private readonly int _interval;
        private readonly Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> _resolver;
        private readonly Func<int, bool>? _continueCondition;

        public static ScheduledEvent OneShot(int day, Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> resolver)
            => new(day, false, 0, resolver, null);

        public static ScheduledEvent Recurring(int startDay, int interval, Func<int, bool> continueCondition, Func<PlayerProfile, Random, HighSchoolYearManager, IEnumerable<string>> resolver)
            => new(startDay, true, interval, resolver, continueCondition);

        public void TryExecute(int currentDay, PlayerProfile player, Random random, HighSchoolYearManager manager, ICollection<string> log)
        {
            if (currentDay != _nextDay) return;
            var result = _resolver(player, random, manager);
            foreach (var entry in result)
            {
                if (!string.IsNullOrWhiteSpace(entry))
                {
                    log.Add(entry);
                }
            }

            if (_repeat)
            {
                var tentative = _nextDay + _interval;
                if (_continueCondition == null || _continueCondition(tentative))
                {
                    _nextDay = tentative;
                }
                else
                {
                    _nextDay = int.MaxValue;
                }
            }
            else
            {
                _nextDay = int.MaxValue;
            }
        }
    }
}

public sealed class HighSchoolPlannedEvent
{
    public HighSchoolPlannedEvent(int day, string category, string title, string description)
    {
        Day = day;
        Category = category;
        Title = title;
        Description = description;
    }

    public int Day { get; }
    public string Category { get; }
    public string Title { get; }
    public string Description { get; }

    public int Month => ((Day - 1) / 30) + 1;
    public int DayOfMonth => ((Day - 1) % 30) + 1;
    public int WeekOfYear => ((Day - 1) / 7) + 1;
    public int WeekOfMonth => ((Day - 1) % 30) / 7 + 1;

    public string DateLabel => $"{Month}월 {DayOfMonth}일 (W{WeekOfYear})";
}

