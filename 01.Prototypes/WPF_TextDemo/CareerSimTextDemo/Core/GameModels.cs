using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo.Core;

public enum ActionSlot
{
    Morning = 0,
    Afternoon = 1,
    Evening = 2
}

public sealed class StatEntry
{
    public StatEntry(string key, string label, string category, double value, double min, double max, bool isVisible)
    {
        Key = key;
        Label = label;
        Category = category;
        Min = min;
        Max = max;
        _value = Clamp(value);
        IsVisible = isVisible;
    }

    public string Key { get; }
    public string Label { get; }
    public string Category { get; }
    public double Min { get; }
    public double Max { get; }
    public bool IsVisible { get; }

    private double _value;
    public double Value => _value;

    public double ApplyDelta(double delta)
    {
        _value = Clamp(_value + delta);
        return _value;
    }

    private double Clamp(double value) => Math.Clamp(value, Min, Max);
}

public sealed class PlayerProfile
{
    private readonly Dictionary<string, StatEntry> _statLookup = new(StringComparer.OrdinalIgnoreCase);

    private PlayerProfile(string name, string position, string pitchStyle, IReadOnlyList<string> pitchArsenal)
    {
        Name = name;
        Position = position;
        PitchStyle = pitchStyle;
        PitchArsenal = pitchArsenal;
        School = string.Empty;
    }

    public string Name { get; }
    public string School { get; private set; }
    public string Position { get; }
    public string PitchStyle { get; }
    public IReadOnlyList<string> PitchArsenal { get; }
    public int AcademicYear { get; private set; } = 1;

    public void AssignSchool(string schoolName) => School = schoolName;
    public void PromoteAcademicYear() => AcademicYear = Math.Min(3, AcademicYear + 1);

    public IEnumerable<StatEntry> GetVisibleStats() => _statLookup.Values.Where(s => s.IsVisible).OrderBy(s => s.Category).ThenBy(s => s.Label);
    public IEnumerable<StatEntry> GetHiddenStats() => _statLookup.Values.Where(s => !s.IsVisible).OrderBy(s => s.Category).ThenBy(s => s.Label);

    public bool ApplyDelta(string statKey, double delta)
    {
        if (_statLookup.TryGetValue(statKey, out var stat))
        {
            stat.ApplyDelta(delta);
            return true;
        }

        return false;
    }

    public double GetStatValue(string statKey) => _statLookup.TryGetValue(statKey, out var stat) ? stat.Value : 0;

    private void RegisterStats(IEnumerable<StatEntry> stats)
    {
        foreach (var stat in stats)
        {
            _statLookup[stat.Key] = stat;
        }
    }

    public static PlayerProfile CreateDefault(string schoolName)
    {
        var profile = new PlayerProfile(
            name: "김윤성",
            position: "우완 선발",
            pitchStyle: "파워 + 위기 관리",
            pitchArsenal: new[] { "포심 패스트볼", "커터", "체인지업", "커브" }
        );
        profile.AssignSchool(schoolName);

        var physical = new[]
        {
            new StatEntry("PHY_POWER","근력","신체",26,0,30,true),
            new StatEntry("PHY_STAMINA","체력","신체",24,0,30,true),
            new StatEntry("PHY_RECOVERY","회복력","신체",22,0,30,true),
            new StatEntry("PHY_MOBILITY","민첩성","신체",19,0,30,true),
            new StatEntry("PHY_BALANCE","밸런스","신체",21,0,30,true),
            new StatEntry("PHY_FLEX","유연성","신체",15,0,30,true),
            new StatEntry("PHY_ARM_HEALTH","팔 내구성","신체",23,0,30,true),
            new StatEntry("PHY_LEG_DRIVE","하체 폭발력","신체",20,0,30,true)
        };

        var skills = new[]
        {
            new StatEntry("SKL_FOURSEAM","포심 구속","기술",32,0,50,true),
            new StatEntry("SKL_FOURSEAM_CMD","포심 제구","기술",28,0,50,true),
            new StatEntry("SKL_BREAKING_MOV","변화구 무브먼트","기술",24,0,50,true),
            new StatEntry("SKL_BREAKING_CMD","변화구 제구","기술",22,0,50,true),
            new StatEntry("SKL_CHANGEUP","체인지업 품질","기술",20,0,50,true),
            new StatEntry("SKL_COMMAND","커맨드","기술",21,0,50,true),
            new StatEntry("SKL_FIELDING","수비 필딩","기술",18,0,50,true),
            new StatEntry("SKL_HOLD","주자 견제","기술",17,0,50,true)
        };

        var mental = new[]
        {
            new StatEntry("MNT_FOCUS","집중력","멘탈",18,0,30,true),
            new StatEntry("MNT_MORALE","동기부여","멘탈",20,0,30,true),
            new StatEntry("MNT_ACADEMIC","학업 이해도","멘탈",17,0,30,true)
        };

        var hidden = new[]
        {
            new StatEntry("HID_BIG_GAME","대형 경기 집중력","히든",45,0,100,false),
            new StatEntry("HID_NERVES","강심장","히든",62,0,100,false),
            new StatEntry("HID_RESILIENCE","회복 탄력성","히든",58,0,100,false)
        };

        var privateStats = new[]
        {
            new StatEntry("PVT_TALENT","천재성","비공개",71,0,100,false),
            new StatEntry("PVT_GRIT","끈기","비공개",65,0,100,false),
            new StatEntry("PVT_CHARACTER","인성","비공개",78,0,100,false)
        };

        profile.RegisterStats(physical);
        profile.RegisterStats(skills);
        profile.RegisterStats(mental);
        profile.RegisterStats(hidden);
        profile.RegisterStats(privateStats);
        return profile;
    }
}

public sealed class DailyAction
{
    public DailyAction(
        string id,
        string name,
        string description,
        double fatigueImpact,
        double focusImpact,
        double growthImpact,
        Action<PlayerProfile, Random, ICollection<string>> resolver)
    {
        Id = id;
        Name = name;
        Description = description;
        FatigueImpact = fatigueImpact;
        FocusImpact = focusImpact;
        GrowthImpact = growthImpact;
        _resolver = resolver;
    }

    public string Id { get; }
    public string Name { get; }
    public string Description { get; }
    public double FatigueImpact { get; }
    public double FocusImpact { get; }
    public double GrowthImpact { get; }

    private readonly Action<PlayerProfile, Random, ICollection<string>> _resolver;

    public void Execute(PlayerProfile player, Random random, ICollection<string> log)
        => _resolver(player, random, log);
}


public sealed class WeeklyPlanAssignment
{
    public WeeklyPlanAssignment(int weekNumber, string sessionName, DailyAction morning, DailyAction afternoon, DailyAction evening)
    {
        WeekNumber = weekNumber;
        SessionName = sessionName;
        Morning = morning;
        Afternoon = afternoon;
        Evening = evening;
    }

    public int WeekNumber { get; }
    public string SessionName { get; }
    public DailyAction Morning { get; }
    public DailyAction Afternoon { get; }
    public DailyAction Evening { get; }
}

public enum CompetitionLevel
{
    HighSchool,
    University,
    Independent,
    ProKbo,
    ProMlb
}

public sealed class CoachProfile
{
    public CoachProfile(string name, double hookStrictness, double trustRookies, double patience)
    {
        Name = name;
        HookStrictness = hookStrictness;
        TrustRookies = trustRookies;
        Patience = patience;
    }

    public string Name { get; }
    public double HookStrictness { get; }
    public double TrustRookies { get; }
    public double Patience { get; }

    public static CoachProfile CreateDefaultForHighSchool(HighSchoolProfile school)
    {
        var hash = Math.Abs(school.Name.GetHashCode());
        var baseValue = (hash % 40) + 30;
        return new CoachProfile($"{school.Name} 감독", baseValue, 60, 55);
    }
}

public sealed class GameState
{
    private readonly Random _random = new();
    private readonly IReadOnlyList<DailyAction> _actions;
    private readonly Dictionary<string, DailyAction> _actionLookup;
    private readonly Dictionary<ActionSlot, DailyAction> _selected = new();
    private readonly Dictionary<int, WeeklyPlanAssignment> _weeklyPlans = new();
    private readonly HighSchoolYearManager _yearManager;
    private MatchSimulationState? _activeMatch;
    private bool _manualActionOverride;
    private readonly CompetitionLevel _competitionLevel;
    private readonly CoachProfile _coach;
    private double _coachTrust = 50;
    private double _fatigueLevel = 12;
    private double _focusLevel = 18;
    private double _trainingLoad;

    private GameState(PlayerProfile player, HighSchoolProfile school, IReadOnlyList<DailyAction> actions, HighSchoolYearManager yearManager, CompetitionLevel competitionLevel, CoachProfile coach)
    {
        Player = player;
        School = school;
        _actions = actions;
        _actionLookup = _actions.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        _yearManager = yearManager;
        _competitionLevel = competitionLevel;
        _coach = coach;

        foreach (ActionSlot slot in Enum.GetValues(typeof(ActionSlot)))
        {
            _selected[slot] = _actions.First();
        }
    }

    public PlayerProfile Player { get; }
    public HighSchoolProfile School { get; }
    public int DayIndex => _yearManager.DayOfYear;
    public int CurrentWeek => _yearManager.WeekOfYear;
    public int TotalWeeks => _yearManager.TotalWeeks;
    public bool MatchPending => _yearManager.MatchPending;
    public string MatchLabel => _yearManager.MatchType ?? "현재 경기 없음";
    public string MatchOpponent => _yearManager.MatchOpponent ?? "상대 미정";
    public ReadOnlyDictionary<ActionSlot, DailyAction> SelectedActions => new(_selected);
    public IReadOnlyList<DailyAction> AvailableActions => _actions;
    public ObservableCollection<string> LogEntries { get; } = new();

    public static GameState CreateHighSchoolSeason(HighSchoolProfile school, int academicYear = 1)
    {
        var player = PlayerProfile.CreateDefault(school.Name);
        if (academicYear > 1)
        {
            for (var year = 1; year < Math.Clamp(academicYear, 1, 3); year++)
            {
                player.PromoteAcademicYear();
            }
        }
        var actions = BuildDefaultActions();
        var yearManager = HighSchoolYearManager.Create(player, school, Math.Clamp(academicYear, 1, 3));
        var coach = CoachProfile.CreateDefaultForHighSchool(school);
        return new GameState(player, school, actions, yearManager, CompetitionLevel.HighSchool, coach);
    }

    public IReadOnlyList<HighSchoolPlannedEvent> GetPlannedEvents()
        => _yearManager.GetPlannedEvents();

    public IReadOnlyList<string> GetRecentMatchSummaries(int count = 5)
    {
        return LogEntries
            .Where(line => line.StartsWith("[", StringComparison.Ordinal) &&
                           line.Contains("경기 종료", StringComparison.Ordinal))
            .TakeLast(Math.Max(1, count))
            .ToList();
    }

    public HighSchoolLoopSnapshot BuildLoopSnapshot()
    {
        var morale = Player.GetStatValue("MNT_MORALE");
        var mood = morale switch
        {
            >= 24 => "컨디션 양호",
            >= 18 => "집중 필요",
            _ => "위기 경보"
        };

        var phase = MatchPending && !string.IsNullOrWhiteSpace(_yearManager.MatchType)
            ? $"{_yearManager.MatchType} 준비"
            : (_yearManager.MatchType ?? "정규 루틴");

        HighSchoolUpcomingEvent? upcoming = null;
        var next = _yearManager.GetNextEvent();
        if (next is not null)
        {
            var daysUntil = Math.Max(0, next.Day - DayIndex);
            upcoming = new HighSchoolUpcomingEvent(next.Category, next.Title, next.Description, next.Day, daysUntil);
        }

        return new HighSchoolLoopSnapshot(
            Player.AcademicYear,
            DayIndex,
            _yearManager.Month,
            _yearManager.DayOfMonth,
            _yearManager.WeekOfYear,
            _yearManager.WeekOfMonth,
            phase,
            mood,
            _fatigueLevel,
            _focusLevel,
            _trainingLoad,
            upcoming);
    }

    public WeeklyPlanAssignment? GetWeeklyPlan(int weekNumber)
        => _weeklyPlans.TryGetValue(weekNumber, out var plan) ? plan : null;

    public void AssignWeeklyPlan(WeeklyPlanAssignment assignment)
        => _weeklyPlans[assignment.WeekNumber] = assignment;

    public DailyAction? FindActionById(string id)
        => _actionLookup.TryGetValue(id, out var action) ? action : null;

    public MatchSnapshot PrepareMatchSnapshot()
    {
        if (!MatchPending)
        {
            throw new InvalidOperationException("현재 진행 가능한 경기가 없습니다.");
        }

        return EnsureMatchState().CreateSnapshot();
    }

    public MatchPitchResult ResolvePitch(string pitch, string zone, string intent)
    {
        if (!MatchPending)
        {
            throw new InvalidOperationException("경기 이벤트가 활성 상태가 아닙니다.");
        }

        var result = EnsureMatchState().ResolvePitch(pitch, zone, intent);
        if (result.Snapshot.Completed)
        {
            _yearManager.CompleteMatchOpportunity();
            _activeMatch = null;
            LogEntries.Add($"[{result.Snapshot.MatchLabel}] 경기 종료 - 실점 {result.Snapshot.RunsAllowed} / 투구수 {result.Snapshot.PitchCount}");
        }

        return result;
    }

    public CoachDecisionResult ResolveCoachDecision(bool acceptChange)
    {
        if (_activeMatch is null)
        {
            return CoachDecisionResult.None;
        }

        var decision = _activeMatch.ResolveCoachDecision(acceptChange);
        if (!decision.Resolved)
        {
            return decision;
        }

        _coachTrust = Math.Clamp(_coachTrust + (acceptChange ? 2 : -3), 0, 100);
        if (!string.IsNullOrWhiteSpace(decision.LogLine))
        {
            LogEntries.Add(decision.LogLine);
        }

        if (decision.MatchEnded && decision.Snapshot is { } snapshot)
        {
            _yearManager.CompleteMatchOpportunity();
            _activeMatch = null;
            LogEntries.Add($"[{snapshot.MatchLabel}] 경기 종료 - 실점 {snapshot.RunsAllowed} / 투구수 {snapshot.PitchCount}");
        }

        return decision;
    }

    public void SetAction(ActionSlot slot, DailyAction action)
    {
        _selected[slot] = action;
        _manualActionOverride = true;
    }

    public void AdvanceDay()
    {
        if (_yearManager.SeasonCompleted) return;

        var currentDay = DayIndex;
        var currentMonth = _yearManager.Month;
        var currentWeekOfMonth = _yearManager.WeekOfMonth;

        ApplyDailyRecovery();
        ApplyWeeklyPlanForToday();

        var dayLog = new List<string>();
        foreach (var slot in Enum.GetValues<ActionSlot>())
        {
            var action = _selected[slot];
            action.Execute(Player, _random, dayLog);
            dayLog.Add($"{SlotLabel(slot)}: {action.Name}");
            ApplyConditionImpact(action);
        }

        var storyLogs = _yearManager.AdvanceDay(Player, _random);
        dayLog.AddRange(storyLogs);
        dayLog.Add($"컨디션 | 피로 {_fatigueLevel:F1}, 집중 {_focusLevel:F1}, 훈련부담 {_trainingLoad:F1}");

        LogEntries.Add($"=== Day {currentDay} / Month {currentMonth} / Week {currentWeekOfMonth} ===");
        foreach (var entry in dayLog)
        {
            LogEntries.Add(entry);
        }
    }

    private void ApplyDailyRecovery()
    {
        _fatigueLevel = Math.Max(0, _fatigueLevel - 1.5);
        _focusLevel = Math.Max(0, _focusLevel - 0.5);
        _trainingLoad = Math.Max(0, _trainingLoad - 0.75);
    }

    private void ApplyConditionImpact(DailyAction action)
    {
        _fatigueLevel = Math.Clamp(_fatigueLevel + action.FatigueImpact, 0, 100);
        _focusLevel = Math.Clamp(_focusLevel + action.FocusImpact, 0, 100);
        _trainingLoad = Math.Clamp(_trainingLoad + action.GrowthImpact, 0, 100);
    }

    private void ApplyWeeklyPlanForToday()
    {
        if (_manualActionOverride)
        {
            _manualActionOverride = false;
            return;
        }

        var week = _yearManager.WeekOfYear;
        if (_weeklyPlans.TryGetValue(week, out var plan))
        {
            _selected[ActionSlot.Morning] = plan.Morning;
            _selected[ActionSlot.Afternoon] = plan.Afternoon;
            _selected[ActionSlot.Evening] = plan.Evening;
        }
    }

    private static string SlotLabel(ActionSlot slot) => slot switch
    {
        ActionSlot.Morning => "아침",
        ActionSlot.Afternoon => "점심",
        ActionSlot.Evening => "저녁",
        _ => string.Empty
    };

    private MatchSimulationState EnsureMatchState()
    {
        _activeMatch ??= new MatchSimulationState(Player, MatchLabel, MatchOpponent, _competitionLevel, _coach, _coachTrust, _random);
        return _activeMatch;
    }

    private static IReadOnlyList<DailyAction> BuildDefaultActions()
    {
        return new List<DailyAction>
        {
            new("train_strength","근력 강화 프로그램","하체와 전신 근력을 단계적으로 끌어올립니다.", 6.0,-0.5,3.0, (p,r,log) =>
            {
                p.ApplyDelta("PHY_POWER",0.35);
                p.ApplyDelta("PHY_LEG_DRIVE",0.3);
                p.ApplyDelta("PHY_RECOVERY",-0.15);
                log.Add("근력 강화: 근력/하체 +, 회복 -");
            }),
            new("command_bullpen","제구 집중 불펜","포수 사인에 맞춰 반복 제구 패턴을 연습합니다.", 5.0,0.2,2.5, (p,r,log) =>
            {
                p.ApplyDelta("SKL_FOURSEAM_CMD",0.35);
                p.ApplyDelta("SKL_BREAKING_CMD",0.35);
                p.ApplyDelta("PHY_STAMINA",-0.1);
                log.Add("제구 불펜: 제구 +, 체력 -");
            }),
            new("changeup_lab","체인지업 연구","그립과 릴리스를 조정해 체인지업 완성도를 높입니다.", 4.0,0.5,2.0, (p,r,log) =>
            {
                p.ApplyDelta("SKL_CHANGEUP",0.4);
                p.ApplyDelta("SKL_COMMAND",0.1);
                p.ApplyDelta("PHY_MOBILITY",-0.1);
                log.Add("체인지업 연구: 체인지업 +, 민첩 -");
            }),
            new("class_focus","수업 집중","수업과 과제로 지식·집중력을 확보합니다.", 1.0,3.0,1.0, (p,r,log) =>
            {
                p.ApplyDelta("MNT_ACADEMIC",0.35);
                p.ApplyDelta("MNT_FOCUS",0.25);
                p.ApplyDelta("PHY_MOBILITY",-0.1);
                log.Add("수업 집중: 학업/집중 +, 민첩 -");
            }),
            new("active_rest","능동 휴식","스트레칭과 케어로 피로를 낮춥니다.", -8.0,1.0,0.0, (p,r,log) =>
            {
                p.ApplyDelta("PHY_RECOVERY",0.45);
                p.ApplyDelta("PHY_ARM_HEALTH",0.2);
                p.ApplyDelta("PHY_POWER",-0.05);
                log.Add("능동 휴식: 회복/팔 내구 +, 근력 약간 -");
            }),
            new("team_scrimmage","팀 청백전","실전 감각을 유지하기 위한 팀 내 청백전입니다.", 7.0,1.0,3.5, (p,r,log) =>
            {
                p.ApplyDelta("SKL_COMMAND",0.2);
                p.ApplyDelta("SKL_FOURSEAM",0.25);
                p.ApplyDelta("SKL_BREAKING_MOV",0.2);
                p.ApplyDelta("PHY_STAMINA",-0.2);
                log.Add("팀 청백전: 구위/제구 +, 체력 -");
            }),
            new("mental_care","멘탈 케어","멘탈 코치와 루틴을 점검합니다.", -3.0,4.0,0.5, (p,r,log) =>
            {
                p.ApplyDelta("MNT_MORALE",0.4);
                p.ApplyDelta("HID_RESILIENCE",0.3);
                log.Add("멘탈 케어: 동기/회복탄력 +");
            })
        };
    }
}

public sealed record MatchSnapshot(
    string MatchLabel,
    string Opponent,
    string InningText,
    string CountText,
    string SituationText,
    int PitchCount,
    int RunsAllowed,
    bool Completed,
    string PitcherName,
    double PitcherStamina,
    double PitcherCommand,
    double PitcherFocus,
    string BatterName,
    string BatterHandedness,
    string BatterArchetype,
    double BatterContact,
    double BatterPower,
    double BatterEye,
    string BatterThreatLabel,
    int PlayerRuns,
    int OpponentRuns,
    int OutsRecorded,
    int OutsTarget);

public enum PitchEventType
{
    Unknown,
    CalledStrike,
    SwingingStrike,
    Strikeout,
    Ball,
    Walk,
    BallInPlayOut,
    BallInPlayHit
}

public sealed record MatchPitchResult(string LogLine, MatchSnapshot Snapshot, CoachHookPrompt? HookPrompt = null, string ZoneKey = "", PitchEventType EventType = PitchEventType.Unknown);

public sealed record CoachHookPrompt(string CoachName, string Message);

public readonly struct CoachDecisionResult
{
    public CoachDecisionResult(bool resolved, bool matchEnded, MatchSnapshot? snapshot, string logLine)
    {
        Resolved = resolved;
        MatchEnded = matchEnded;
        Snapshot = snapshot;
        LogLine = logLine;
    }

    public bool Resolved { get; }
    public bool MatchEnded { get; }
    public MatchSnapshot? Snapshot { get; }
    public string LogLine { get; }

    public static CoachDecisionResult None => new(false, false, null, string.Empty);
}

internal sealed class MatchSimulationState
{
    private enum HalfInning
    {
        Top,
        Bottom
    }

    private readonly PlayerProfile _player;
    private readonly string _pitcherName;
    private readonly string _matchLabel;
    private readonly string _opponent;
    private readonly int _targetOuts;
    private readonly bool[] _bases = new bool[3];
    private readonly double _staminaMax;
    private readonly double _pitcherCommand;
    private readonly double _pitcherFocus;
    private readonly Random _random;
    private readonly MatchBalanceProfile _balance;
    private readonly CoachProfile _coach;
    private double _coachTrust;

    private int _inning = 1;
    private HalfInning _half = HalfInning.Top;
    private int _outsInHalf;
    private int _totalOuts;
    private int _balls;
    private int _strikes;
    private int _runsAllowed;
    private int _pitchCount;
    private double _staminaMeter;
    private BatterProfile? _currentBatter;
    private int _playerRuns;
    private int _walksAllowed;
    private bool _awaitingHookDecision;
    private string? _pendingHookReason;

    public MatchSimulationState(PlayerProfile player, string matchLabel, string opponent, CompetitionLevel level, CoachProfile coach, double coachTrust, Random random)
    {
        _player = player;
        _pitcherName = player.Name;
        _matchLabel = matchLabel;
        _opponent = opponent;
        _targetOuts = 3;
        _staminaMax = Math.Max(20, player.GetStatValue("PHY_STAMINA"));
        _staminaMeter = _staminaMax;
        _pitcherCommand = player.GetStatValue("SKL_COMMAND");
        _pitcherFocus = player.GetStatValue("MNT_FOCUS");
        _random = random;
        _balance = MatchBalanceProfile.For(level);
        _coach = coach;
        _coachTrust = coachTrust;
    }

    public MatchSnapshot CreateSnapshot()
    {
        EnsureBatter();
        var batter = _currentBatter!;
        var staminaPercent = Math.Max(0, Math.Round(_staminaMeter / Math.Max(1, _staminaMax) * 100, 1));
        var halfLabel = _half == HalfInning.Top ? "초" : "말";
        return new MatchSnapshot(
            _matchLabel,
            _opponent,
            $"{_inning}회 {halfLabel}",
            $"B{_balls}-S{_strikes} / {_outsInHalf}아웃",
            BuildSituationText(),
            _pitchCount,
            _runsAllowed,
            _totalOuts >= _targetOuts,
            _pitcherName,
            staminaPercent,
            Math.Round(_pitcherCommand, 1),
            Math.Round(_pitcherFocus, 1),
            batter.Name,
            batter.Handedness,
            batter.Archetype,
            Math.Round(batter.Contact, 1),
            Math.Round(batter.Power, 1),
            Math.Round(batter.Eye, 1),
            batter.ThreatLabel,
            _playerRuns,
            _runsAllowed,
            _totalOuts,
            _targetOuts);
    }

    public MatchPitchResult ResolvePitch(string pitch, string zone, string intent)
    {
        if (_totalOuts >= _targetOuts)
        {
            return new MatchPitchResult("경기가 이미 종료되었습니다.", CreateSnapshot(), null, zone, PitchEventType.Unknown);
        }

        EnsureBatter();
        _pitchCount++;

        var quality = EvaluateQuality(pitch, zone, intent);
        var outcome = ApplyOutcome(quality, pitch, zone, intent);
        _staminaMeter = Math.Max(0, _staminaMeter - (0.4 + (quality < 45 ? 0.2 : 0)));

        if (outcome.BatterCompleted)
        {
            NextBatter();
        }

        var prompt = EvaluateHookRequest();

        return new MatchPitchResult(outcome.Log, CreateSnapshot(), prompt, zone, outcome.EventType);
    }

    private double EvaluateQuality(string pitch, string zone, string intent)
    {
        double baseSkill = pitch switch
        {
            var p when p.Contains("직구", StringComparison.Ordinal) => _player.GetStatValue("SKL_FOURSEAM"),
            var p when p.Contains("패스트", StringComparison.Ordinal) => _player.GetStatValue("SKL_FOURSEAM"),
            var p when p.Contains("커브", StringComparison.Ordinal) || p.Contains("슬라이더", StringComparison.Ordinal)
                => _player.GetStatValue("SKL_BREAKING_MOV"),
            var p when p.Contains("포크", StringComparison.Ordinal) || p.Contains("체인지", StringComparison.Ordinal)
                => _player.GetStatValue("SKL_CHANGEUP"),
            _
                => Math.Max(_player.GetStatValue("SKL_FOURSEAM"), _player.GetStatValue("SKL_BREAKING_MOV"))
        };

        var nerves = _player.GetStatValue("HID_BIG_GAME");
        double zoneMod = 0;
        if (!string.IsNullOrWhiteSpace(zone))
        {
            if (zone.Contains("코너", StringComparison.Ordinal) || zone.Contains("내각", StringComparison.Ordinal))
            {
                zoneMod += 4;
            }
            else if (zone.Contains("상단", StringComparison.Ordinal))
            {
                zoneMod += 1.5;
            }
            else if (zone.Contains("하단", StringComparison.Ordinal))
            {
                zoneMod += 0.5;
            }
        }

        double intentMod = 0;
        if (!string.IsNullOrWhiteSpace(intent))
        {
            if (intent.Contains("승부", StringComparison.Ordinal))
            {
                intentMod += 3;
            }
            else if (intent.Contains("유인", StringComparison.Ordinal))
            {
                intentMod -= 1.5;
            }
        }

        var fatigueRatio = _staminaMeter / Math.Max(1, _staminaMax);
        var fatiguePenalty = (1 - fatigueRatio) * 12;
        var randomSwing = (_random.NextDouble() - 0.5) * _balance.RandomSwingRange;
        return baseSkill * 0.5 + _pitcherCommand * 0.25 + _staminaMax * 0.05 + nerves * 0.1 + zoneMod + intentMod - fatiguePenalty + randomSwing + _balance.QualityBonus;
    }

    private PitchOutcome ApplyOutcome(double quality, string pitch, string zone, string intent)
    {
        string prefix = $"[{pitch}/{zone}/{intent}]";
        var bands = _balance.Bands;
        if (quality >= bands.StrikeoutBand)
        {
            RegisterStrikeout();
            return new PitchOutcome($"{prefix} 루킹 삼진! 완벽한 결정구입니다.", true);
        }

        if (quality >= bands.StrikeBand)
        {
            RegisterStrike();
            return new PitchOutcome($"{prefix} 스트라이크로 카운트를 선점합니다.", false);
        }

        if (quality >= bands.WeakContactBand)
        {
            RegisterBallInPlay(outIsRecorded: true);
            return new PitchOutcome($"{prefix} 땅볼 처리로 아웃 하나 추가.", true);
        }

        if (quality >= bands.SingleBand)
        {
            RegisterBallInPlay(outIsRecorded: false);
            AdvanceRunners(1);
            ResetCount();
            return new PitchOutcome($"{prefix} 내야 안타 허용. 주자가 출루합니다.", true);
        }

        if (quality >= bands.DoubleBand)
        {
            AdvanceRunners(2);
            ResetCount();
            return new PitchOutcome($"{prefix} 2루타 허용! 장타로 위기가 커집니다.", true);
        }

        if (quality >= bands.TripleBand)
        {
            AdvanceRunners(3);
            ResetCount();
            return new PitchOutcome($"{prefix} 3루타. 결정타를 맞았습니다.", true);
        }

        if (quality >= bands.BallBand)
        {
            RegisterBall();
            return new PitchOutcome($"{prefix} 볼 판정. 카운트가 불리해집니다.", false);
        }

        RegisterWalk();
        return new PitchOutcome($"{prefix} 볼넷 허용, 주자가 밀려 나갑니다.", true);
    }

    private void RegisterStrike()
    {
        _strikes++;
        if (_strikes >= 3)
        {
            RegisterStrikeout();
        }
    }

    private void RegisterStrikeout()
    {
        _balls = 0;
        _strikes = 0;
        RegisterOut();
    }

    private void RegisterBall()
    {
        _balls++;
    }

    private CoachHookPrompt? EvaluateHookRequest()
    {
        if (_awaitingHookDecision)
        {
            return null;
        }

        var runThreshold = Math.Max(1, _balance.BaseHookRuns + (int)Math.Round((55 - _coach.HookStrictness) / 20.0));
        var walkThreshold = Math.Max(2, _balance.BaseHookWalks + (int)Math.Round((55 - _coach.Patience) / 25.0));
        var pitchThreshold = Math.Max(30, _balance.BaseHookPitchCount + (int)Math.Round((_coachTrust - 50) / 4.0));

        string? reason = null;
        if (_runsAllowed >= runThreshold)
        {
            reason = "실점이 많아 교체가 필요합니다.";
        }
        else if (_walksAllowed >= walkThreshold)
        {
            reason = "볼넷이 많아 제구가 흔들리고 있습니다.";
        }
        else if (_pitchCount >= pitchThreshold)
        {
            reason = "투구수가 많아 체력이 떨어지고 있습니다.";
        }

        if (reason is null)
        {
            return null;
        }

        _awaitingHookDecision = true;
        _pendingHookReason = reason;
        return new CoachHookPrompt(_coach.Name, reason);
    }

    public CoachDecisionResult ResolveCoachDecision(bool accept)
    {
        if (!_awaitingHookDecision)
        {
            return CoachDecisionResult.None;
        }

        _awaitingHookDecision = false;
        string log = accept
            ? $"{_coach.Name}이(가) 교체를 단행합니다. \"{_pendingHookReason}\""
            : $"{_coach.Name}: \"한 타자만 더 보자.\"";
        MatchSnapshot? snapshot = null;

        if (accept)
        {
            _totalOuts = _targetOuts;
            snapshot = CreateSnapshot();
        }

        _pendingHookReason = null;
        return new CoachDecisionResult(true, accept, snapshot, log);
    }

    private void RegisterWalk()
    {
        _walksAllowed++;
        AdvanceRunners(1);
        ResetCount();
    }

    private void RegisterBallInPlay(bool outIsRecorded)
    {
        ResetCount();
        if (outIsRecorded)
        {
            RegisterOut();
        }
    }

    private void RegisterOut()
    {
        _outsInHalf++;
        _totalOuts++;
        if (_outsInHalf >= 3)
        {
            _outsInHalf = 0;
            Array.Clear(_bases, 0, _bases.Length);
            _half = _half == HalfInning.Top ? HalfInning.Bottom : HalfInning.Top;
            if (_half == HalfInning.Top)
            {
                SimulateTeamOffense();
                _inning++;
            }
        }
    }

    private void AdvanceRunners(int bases)
    {
        for (var i = _bases.Length - 1; i >= 0; i--)
        {
            if (!_bases[i]) continue;
            var next = i + bases;
            _bases[i] = false;
            if (next >= _bases.Length)
            {
                _runsAllowed++;
            }
            else
            {
                _bases[next] = true;
            }
        }

        var batterIndex = bases - 1;
        if (batterIndex >= _bases.Length)
        {
            _runsAllowed++;
        }
        else if (batterIndex >= 0)
        {
            _bases[batterIndex] = true;
        }
    }

    private void ResetCount()
    {
        _balls = 0;
        _strikes = 0;
    }

    private void SimulateTeamOffense()
    {
        var morale = _player.GetStatValue("MNT_MORALE");
        var baseChance = 0.18 + morale / 250.0;
        var runs = 0;
        if (_random.NextDouble() < baseChance)
        {
            runs++;
        }
        if (_random.NextDouble() < Math.Max(0.05, baseChance - 0.08))
        {
            runs++;
        }
        _playerRuns += runs;
    }

    private string BuildSituationText()
    {
        var runners = new List<string>();
        if (_bases[0]) runners.Add("1루 주자");
        if (_bases[1]) runners.Add("2루 주자");
        if (_bases[2]) runners.Add("3루 주자");
        var baseText = runners.Count > 0 ? string.Join(", ", runners) : "주자 없음";
        return $"{baseText} | 실점 {_runsAllowed} | 투구수 {_pitchCount}";
    }

    private void EnsureBatter()
    {
        _currentBatter ??= CreateRandomBatter();
    }

    private void NextBatter()
    {
        _currentBatter = CreateRandomBatter();
    }

    private BatterProfile CreateRandomBatter()
    {
        var namePool = new[] { "김현수", "박진우", "최강민", "이도윤", "정태민", "한기현", "유진호", "문승호" };
        var hand = _random.NextDouble() < 0.35 ? "좌타" : "우타";
        var archetypes = new[] { "교타자", "거포", "콘택트", "스피드" };
        var archetype = archetypes[_random.Next(archetypes.Length)];
        var contact = 45 + _random.NextDouble() * 35;
        var power = 35 + _random.NextDouble() * 40;
        var eye = 40 + _random.NextDouble() * 30;
        var threatScore = contact * 0.4 + power * 0.4 + eye * 0.2;
        var threatLabel = threatScore switch
        {
            > 65 => "위험",
            > 50 => "주의",
            _ => "보통"
        };
        var opponentTag = _opponent.Split(' ').FirstOrDefault() ?? _opponent;
        var name = $"{opponentTag} {namePool[_random.Next(namePool.Length)]}";
        return new BatterProfile(name, hand, archetype, contact, power, eye, threatLabel);
    }

    private sealed record BatterProfile(
        string Name,
        string Handedness,
        string Archetype,
        double Contact,
        double Power,
        double Eye,
        string ThreatLabel);

    private readonly struct MatchBalanceProfile
    {
        public MatchBalanceProfile(
            double qualityBonus,
            double randomSwingRange,
            int baseHookRuns,
            int baseHookWalks,
            int baseHookPitchCount,
            PitchOutcomeBands bands)
        {
            QualityBonus = qualityBonus;
            RandomSwingRange = randomSwingRange;
            BaseHookRuns = baseHookRuns;
            BaseHookWalks = baseHookWalks;
            BaseHookPitchCount = baseHookPitchCount;
            Bands = bands;
        }

        public double QualityBonus { get; }
        public double RandomSwingRange { get; }
        public int BaseHookRuns { get; }
        public int BaseHookWalks { get; }
        public int BaseHookPitchCount { get; }
        public PitchOutcomeBands Bands { get; }

        public static MatchBalanceProfile For(CompetitionLevel level) => level switch
        {
            CompetitionLevel.HighSchool => new MatchBalanceProfile(10, 18, 2, 3, 55, PitchOutcomeBands.HighSchool),
            CompetitionLevel.University => new MatchBalanceProfile(7, 15, 3, 3, 70, PitchOutcomeBands.University),
            CompetitionLevel.Independent => new MatchBalanceProfile(4, 13, 3, 4, 80, PitchOutcomeBands.Independent),
            CompetitionLevel.ProKbo => new MatchBalanceProfile(2, 11, 4, 4, 95, PitchOutcomeBands.ProKbo),
            CompetitionLevel.ProMlb => new MatchBalanceProfile(0, 9, 4, 4, 105, PitchOutcomeBands.ProMlb),
            _ => new MatchBalanceProfile(0, 12, 3, 3, 80, PitchOutcomeBands.University)
        };
    }

    private readonly struct PitchOutcomeBands
    {
        public PitchOutcomeBands(double strikeoutBand, double strikeBand, double weakContactBand, double singleBand, double doubleBand, double tripleBand, double ballBand)
        {
            StrikeoutBand = strikeoutBand;
            StrikeBand = strikeBand;
            WeakContactBand = weakContactBand;
            SingleBand = singleBand;
            DoubleBand = doubleBand;
            TripleBand = tripleBand;
            BallBand = ballBand;
        }

        public double StrikeoutBand { get; }
        public double StrikeBand { get; }
        public double WeakContactBand { get; }
        public double SingleBand { get; }
        public double DoubleBand { get; }
        public double TripleBand { get; }
        public double BallBand { get; }

        public static PitchOutcomeBands HighSchool => new(72, 60, 52, 45, 38, 32, 26);
        public static PitchOutcomeBands University => new(74, 62, 54, 47, 40, 34, 27);
        public static PitchOutcomeBands Independent => new(76, 64, 55, 48, 41, 35, 28);
        public static PitchOutcomeBands ProKbo => new(78, 66, 57, 50, 43, 37, 30);
        public static PitchOutcomeBands ProMlb => new(80, 68, 58, 51, 44, 38, 32);
    }

    private readonly struct PitchOutcome
    {
        public PitchOutcome(string log, bool batterCompleted)
            : this(log, batterCompleted, PitchEventType.Unknown)
        {
        }

        public PitchOutcome(string log, bool batterCompleted, PitchEventType eventType)
        {
            Log = log;
            BatterCompleted = batterCompleted;
            EventType = eventType;
        }

        public string Log { get; }
        public bool BatterCompleted { get; }
        public PitchEventType EventType { get; }
    }
}
