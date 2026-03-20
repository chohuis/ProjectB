using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.IO;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo.Core;

public enum ActionSlot
{
    Morning = 0,
    Afternoon = 1,
    Evening = 2
}

public enum AcademicSlot
{
    Lecture = 0,
    Support = 1,
    Study = 2
}

public sealed class EducationAction
{
    public EducationAction(
        string id,
        string title,
        string description,
        AcademicSlot slot,
        double knowledgeImpact,
        double focusImpact,
        double fatigueImpact,
        double moraleImpact)
    {
        Id = id;
        Title = title;
        Description = description;
        Slot = slot;
        KnowledgeImpact = knowledgeImpact;
        FocusImpact = focusImpact;
        FatigueImpact = fatigueImpact;
        MoraleImpact = moraleImpact;
    }

    public string Id { get; }
    public string Title { get; }
    public string Description { get; }
    public AcademicSlot Slot { get; }
    public double KnowledgeImpact { get; }
    public double FocusImpact { get; }
    public double FatigueImpact { get; }
    public double MoraleImpact { get; }
}

public sealed class AcademicOption
{
    public AcademicOption(EducationAction action)
    {
        Action = action;
    }

    public EducationAction Action { get; }
    public string Title => Action.Title;
    public string Description => Action.Description;
}

public sealed record AcademicSnapshot(
    double Knowledge,
    double Focus,
    double AverageGrade,
    double Scholarship,
    double Warning,
    int CompletedTerms);

public sealed class DailyChoiceOption
{
    internal DailyChoiceOption(
        string id,
        string title,
        string description,
        Action<GameState, Random, IList<string>>? apply)
    {
        Id = id;
        Title = title;
        Description = description;
        Apply = apply;
    }

    public string Id { get; }
    public string Title { get; }
    public string Description { get; }

    internal Action<GameState, Random, IList<string>>? Apply { get; }
}

public sealed class DailyChoiceCard
{
    public DailyChoiceCard(
        string id,
        string title,
        string description,
        IReadOnlyList<DailyChoiceOption> options,
        string? defaultOptionId = null)
    {
        Id = id;
        Title = title;
        Description = description;
        Options = options;
        DefaultOptionId = defaultOptionId;
    }

    public string Id { get; }
    public string Title { get; }
    public string Description { get; }
    public IReadOnlyList<DailyChoiceOption> Options { get; }
    public string? DefaultOptionId { get; }
}

public sealed class PendingChoiceMessage
{
    public PendingChoiceMessage(string id, DailyChoiceCard card)
    {
        Id = id;
        CardId = card.Id;
        Title = card.Title;
        Description = card.Description;
        Options = card.Options;
        DefaultOptionId = card.DefaultOptionId;
    }

    public string Id { get; }
    public string CardId { get; }
    public string Title { get; }
    public string Description { get; }
    public IReadOnlyList<DailyChoiceOption> Options { get; }
    public string? DefaultOptionId { get; }
}

public sealed class DraftOutcome
{
    public DraftOutcome(bool drafted, int? round, string? teamName, double score)
    {
        Drafted = drafted;
        Round = round;
        TeamName = teamName;
        Score = score;
    }

    public bool Drafted { get; }
    public int? Round { get; }
    public string? TeamName { get; }
    public double Score { get; }
}

public sealed class DraftCandidate
{
    public DraftCandidate(string id, string name, string position, string source, double score)
    {
        Id = id;
        Name = name;
        Position = position;
        Source = source;
        Score = score;
    }

    public string Id { get; }
    public string Name { get; }
    public string Position { get; }
    public string Source { get; }
    public double Score { get; }
}

public sealed class DraftTeamNeed
{
    public DraftTeamNeed(string teamName, string need)
    {
        TeamName = teamName;
        Need = need;
    }

    public string TeamName { get; }
    public string Need { get; }
}

public sealed class DraftMockPick
{
    public DraftMockPick(int round, string teamName, string candidateId, string candidateName)
    {
        Round = round;
        TeamName = teamName;
        CandidateId = candidateId;
        CandidateName = candidateName;
    }

    public int Round { get; }
    public string TeamName { get; }
    public string CandidateId { get; }
    public string CandidateName { get; }
}

public sealed class DraftContractOffer
{
    public DraftContractOffer(string teamName, int round, double bonus, double salary, int years)
    {
        TeamName = teamName;
        Round = round;
        Bonus = bonus;
        Salary = salary;
        Years = years;
    }

    public string TeamName { get; }
    public int Round { get; }
    public double Bonus { get; }
    public double Salary { get; }
    public int Years { get; }
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
    public string PreferredRole { get; private set; } = "선발";
    public string SecondaryRole { get; private set; } = "불펜";

    public void AssignSchool(string schoolName) => School = schoolName;
    public void PromoteAcademicYear() => AcademicYear = Math.Min(3, AcademicYear + 1);
    public void SetRoles(string preferredRole, string secondaryRole)
    {
        if (!string.IsNullOrWhiteSpace(preferredRole))
        {
            PreferredRole = preferredRole.Trim();
        }

        if (!string.IsNullOrWhiteSpace(secondaryRole))
        {
            SecondaryRole = secondaryRole.Trim();
        }
    }

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

public sealed class TrainingRoutineTemplate
{
    public TrainingRoutineTemplate(
        string id,
        string name,
        string subtitle,
        string focus,
        string description,
        DailyAction morning,
        DailyAction afternoon,
        DailyAction evening,
        bool isCustom)
    {
        Id = id;
        Name = name;
        Subtitle = subtitle;
        Focus = focus;
        Description = description;
        Morning = morning;
        Afternoon = afternoon;
        Evening = evening;
        IsCustom = isCustom;

        _baseMorning = morning;
        _baseAfternoon = afternoon;
        _baseEvening = evening;
    }

    public string Id { get; }
    public string Name { get; private set; }
    public string Subtitle { get; private set; }
    public string Focus { get; private set; }
    public string Description { get; private set; }
    public DailyAction Morning { get; private set; }
    public DailyAction Afternoon { get; private set; }
    public DailyAction Evening { get; private set; }
    public bool IsCustom { get; }
    public bool IsModified { get; private set; }

    private readonly DailyAction _baseMorning;
    private readonly DailyAction _baseAfternoon;
    private readonly DailyAction _baseEvening;

    public void Update(string name, DailyAction morning, DailyAction afternoon, DailyAction evening)
    {
        Name = name;
        Morning = morning;
        Afternoon = afternoon;
        Evening = evening;
        IsModified = !IsCustom && (Morning != _baseMorning || Afternoon != _baseAfternoon || Evening != _baseEvening);
    }

    public bool ResetToBase()
    {
        if (IsCustom) return false;
        Morning = _baseMorning;
        Afternoon = _baseAfternoon;
        Evening = _baseEvening;
        IsModified = false;
        return true;
    }
}

public sealed class RoutineState
{
    public RoutineState(TrainingRoutineTemplate template, double mastery)
    {
        Template = template;
        Mastery = mastery;
    }

    public TrainingRoutineTemplate Template { get; }
    public double Mastery { get; set; }
}

public sealed class RoutineDayBlock
{
    public RoutineDayBlock(int dayIndex, string label, string routineId, bool isLocked, string? lockReason)
    {
        DayIndex = dayIndex;
        Label = label;
        RoutineId = routineId;
        IsLocked = isLocked;
        LockReason = lockReason;
    }

    public int DayIndex { get; }
    public string Label { get; }
    public string RoutineId { get; }
    public bool IsLocked { get; }
    public string? LockReason { get; }
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
    private readonly Dictionary<AcademicSlot, EducationAction> _academicPlans = new();
    private readonly Dictionary<AcademicSlot, List<EducationAction>> _academicOptions = new();
    private double _academicGradeSum;
    private int _academicCompletedTerms;
    private double _academicScholarship;
    private double _academicWarning;
    private string _mentorName = "미정";
    private string _rivalName = "미정";
    private double _mentorTrust;
    private double _rivalryLevel = 0;
    private bool _draftApplied;
    private DraftOutcome? _draftOutcome;
    private string? _postDraftRoute;
    private List<DraftCandidate>? _draftPool;
    private int _draftPoolGeneratedDay = -1;
    private List<DraftTeamNeed>? _draftTeamNeeds;
    private List<DraftMockPick>? _draftMockPicks;
    private DraftContractOffer? _draftContractOffer;
    private string? _draftPlayerCandidateId;
    private List<string>? _draftSummaryLines;
    private int _draftSummaryDay = -1;
    private readonly HashSet<string> _resolvedChoiceIds = new(StringComparer.OrdinalIgnoreCase);
    private static readonly string[] MentorNames = { "강도현", "윤태호", "이시우", "박지훈", "조민성" };
    private static readonly string[] RivalNames = { "최준혁", "정우빈", "김도현", "한지성", "오세찬" };
    private static readonly string[] DraftTeams =
    {
        "서울 베어즈", "서울 피닉스", "수원 아크폭스", "대전 소어링스",
        "대구 로열스", "광주 엠버스", "인천 스카이즈", "부산 마리너스",
        "강릉 웨이브스", "제주 오션스"
    };
    private static readonly string[] DraftNeeds =
    {
        "투수", "좌완", "우완", "타자", "포수", "내야", "외야"
    };
    private static readonly string[] DraftSources =
    {
        "고교", "대학", "독립", "재수", "해외파"
    };
    private readonly List<TrainingRoutineTemplate> _routineTemplates = new();
    private readonly List<RoutineState> _routineStates = new();
    private readonly Dictionary<int, string> _routineAssignments = new();
    private readonly HighSchoolSeasonTracker _seasonTracker;

    private GameState(PlayerProfile player, HighSchoolProfile school, IReadOnlyList<DailyAction> actions, HighSchoolYearManager yearManager, CompetitionLevel competitionLevel, CoachProfile coach)
    {
        Player = player;
        School = school;
        _actions = actions;
        _actionLookup = _actions.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        _yearManager = yearManager;
        _competitionLevel = competitionLevel;
        _coach = coach;
        _seasonTracker = new HighSchoolSeasonTracker(school, player.AcademicYear);

        foreach (ActionSlot slot in Enum.GetValues(typeof(ActionSlot)))
        {
            _selected[slot] = _actions.First();
        }

        InitializeAcademicSystem();
        InitializeRoutineSystem();
    }

    public PlayerProfile Player { get; }
    public HighSchoolProfile School { get; }
    public int DayIndex => _yearManager.DayOfYear;
    public int CurrentWeek => _yearManager.WeekOfYear;
    public int TotalWeeks => _yearManager.TotalWeeks;
    public bool MatchPending => _yearManager.MatchPending;
    public string MatchLabel => _yearManager.MatchType ?? "현재 경기 없음";
    public string MatchOpponent => _yearManager.MatchOpponent ?? "상대 미정";
    public string? MatchOpponentId => _yearManager.MatchOpponentId;
    public bool MatchIsHome => _yearManager.MatchIsHome;
    public bool MatchIsRivalry => _yearManager.MatchIsRivalry;
    public HighSchoolMatchKind MatchKind => _yearManager.MatchKind;
    public string? MatchStageLabel => _yearManager.MatchStageLabel;
    public string? MatchTournamentMatchId => _yearManager.MatchTournamentMatchId;
    public ReadOnlyDictionary<ActionSlot, DailyAction> SelectedActions => new(_selected);
    public IReadOnlyList<DailyAction> AvailableActions => _actions;
    public ObservableCollection<string> LogEntries { get; } = new();
    public ObservableCollection<PendingChoiceMessage> PendingMessages { get; } = new();
    public string MentorName => _mentorName;
    public string RivalName => _rivalName;
    public double MentorTrust => _mentorTrust;
    public double RivalryLevel => _rivalryLevel;
    public IReadOnlyList<TrainingRoutineTemplate> RoutineTemplates => _routineTemplates;
    public IReadOnlyList<RoutineState> RoutineStates => _routineStates;
    public HighSchoolSeasonTracker SeasonTracker => _seasonTracker;
    public HighSchoolLeagueSchedule? LeagueSchedule => _yearManager.LeagueSchedule;
    public HighSchoolTournamentBracket? TournamentBracket => _yearManager.TournamentBracket;

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

    public AcademicSnapshot BuildAcademicSnapshot()
    {
        var knowledge = Player.GetStatValue("MNT_ACADEMIC");
        var focus = Player.GetStatValue("MNT_FOCUS");
        var average = _academicCompletedTerms > 0 ? _academicGradeSum / _academicCompletedTerms : 0;
        return new AcademicSnapshot(
            knowledge,
            focus,
            average,
            _academicScholarship,
            _academicWarning,
            _academicCompletedTerms);
    }

    public IReadOnlyList<AcademicOption> GetAcademicOptions(AcademicSlot slot)
        => _academicOptions.TryGetValue(slot, out var list)
            ? list.Select(option => new AcademicOption(option)).ToList()
            : Array.Empty<AcademicOption>();

    public EducationAction? GetAcademicPlan(AcademicSlot slot)
        => _academicPlans.TryGetValue(slot, out var action) ? action : null;

    public void SetAcademicAction(AcademicSlot slot, EducationAction action)
    {
        if (action.Slot != slot) return;
        _academicPlans[slot] = action;
    }

    public TrainingRoutineTemplate? GetRoutineTemplate(string id)
        => _routineTemplates.FirstOrDefault(t => t.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    public bool CreateCustomRoutine(string name, DailyAction morning, DailyAction afternoon, DailyAction evening)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        var id = $"custom_{Guid.NewGuid():N}";
        var template = new TrainingRoutineTemplate(
            id,
            name.Trim(),
            "커스텀 루틴",
            "맞춤형",
            "직접 구성한 커스텀 루틴입니다.",
            morning,
            afternoon,
            evening,
            true);
        _routineTemplates.Add(template);
        _routineStates.Add(new RoutineState(template, 0));
        return true;
    }

    public bool UpdateRoutineTemplate(string id, string name, DailyAction morning, DailyAction afternoon, DailyAction evening)
    {
        var template = GetRoutineTemplate(id);
        if (template is null) return false;
        template.Update(string.IsNullOrWhiteSpace(name) ? template.Name : name.Trim(), morning, afternoon, evening);
        return true;
    }

    public bool ResetRoutineTemplate(string id)
    {
        var template = GetRoutineTemplate(id);
        return template is not null && template.ResetToBase();
    }

    public bool RemoveRoutineTemplate(string id)
    {
        var template = GetRoutineTemplate(id);
        if (template is null || !template.IsCustom) return false;

        _routineTemplates.Remove(template);
        var state = _routineStates.FirstOrDefault(s => s.Template == template);
        if (state is not null)
        {
            _routineStates.Remove(state);
        }

        foreach (var day in _routineAssignments.Where(kv => kv.Value.Equals(id, StringComparison.OrdinalIgnoreCase)).Select(kv => kv.Key).ToList())
        {
            _routineAssignments.Remove(day);
        }

        return true;
    }

    public IReadOnlyList<RoutineDayBlock> GetWeekRoutineBlocks(int weekNumber)
    {
        var startDay = (Math.Max(1, weekNumber) - 1) * 7 + 1;
        var maxDays = _yearManager.TotalWeeks * 7;
        var blocks = new List<RoutineDayBlock>();

        for (var offset = 0; offset < 7; offset++)
        {
            var day = startDay + offset;
            if (day > maxDays) break;

            var routineId = GetRoutineAssignment(day);
            var isLocked = day < DayIndex;
            var label = $"Day {day}";
            blocks.Add(new RoutineDayBlock(day, label, routineId, isLocked, isLocked ? "이미 지난 날짜입니다." : null));
        }

        return blocks;
    }

    public bool TryAssignRoutineToDay(int day, string routineId, out string message)
    {
        message = string.Empty;
        if (day < DayIndex)
        {
            message = "이미 지난 날짜는 변경할 수 없습니다.";
            return false;
        }

        if (!_routineTemplates.Any(t => t.Id.Equals(routineId, StringComparison.OrdinalIgnoreCase)))
        {
            message = "루틴을 찾을 수 없습니다.";
            return false;
        }

        _routineAssignments[day] = routineId;
        message = "루틴이 적용되었습니다.";
        return true;
    }

    public void ApplyCoachRecommendation(string tag)
    {
        var routineId = tag switch
        {
            "balanced" => "routine_balanced",
            "match" => "routine_command",
            "academic" => "routine_balanced",
            _ => "routine_balanced"
        };

        AssignRoutineToWeek(CurrentWeek, routineId);

        if (tag.Equals("academic", StringComparison.OrdinalIgnoreCase))
        {
            ApplyAcademicRecommendation();
        }
    }

    public IReadOnlyList<string> GetRecentMatchSummaries(int count = 5)
    {
        return LogEntries
            .Where(line => line.StartsWith("[", StringComparison.Ordinal) &&
                           line.Contains("경기 종료", StringComparison.Ordinal))
            .TakeLast(Math.Max(1, count))
            .ToList();
    }

    public DailyChoiceCard? PrepareTodayChoiceCard()
    {
        if (_yearManager.SeasonCompleted) return null;

        var day = DayIndex;
        var year = Player.AcademicYear;
        var card = BuildChoiceForDay(year, day);
        if (card is null) return null;
        if (_resolvedChoiceIds.Contains(card.Id)) return null;
        if (PendingMessages.Any(m => m.CardId.Equals(card.Id, StringComparison.OrdinalIgnoreCase))) return null;
        return card;
    }

    public void ResolveMessageChoice(string messageId, string? optionId)
    {
        var message = PendingMessages.FirstOrDefault(m => m.Id.Equals(messageId, StringComparison.OrdinalIgnoreCase));
        if (message is null) return;

        var option = message.Options.FirstOrDefault(o => o.Id.Equals(optionId ?? string.Empty, StringComparison.OrdinalIgnoreCase))
                     ?? message.Options.FirstOrDefault(o => o.Id.Equals(message.DefaultOptionId ?? string.Empty, StringComparison.OrdinalIgnoreCase))
                     ?? message.Options.FirstOrDefault();

        var logs = new List<string>();
        if (option?.Apply is not null)
        {
            option.Apply(this, _random, logs);
        }

        LogEntries.Add($"[메시지] {message.Title} - {(option?.Title ?? "기본값")}");
        foreach (var entry in logs)
        {
            LogEntries.Add(entry);
        }

        _resolvedChoiceIds.Add(message.CardId);
        PendingMessages.Remove(message);
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

    public MatchScoreboardSnapshot? GetMatchScoreboardSnapshot()
        => _activeMatch?.BuildScoreboardSnapshot();

    public MatchLineupSnapshot? GetMatchLineupSnapshot()
        => _activeMatch?.BuildLineupSnapshot();

    public MatchRosterSnapshot? GetMatchRosterSnapshot()
        => _activeMatch?.BuildRosterSnapshot();

    public MatchPitchResult ResolvePitch(string pitch, string zone, string intent)
    {
        if (!MatchPending)
        {
            throw new InvalidOperationException("경기 이벤트가 활성 상태가 아닙니다.");
        }

        var result = EnsureMatchState().ResolvePitch(pitch, zone, intent);
        if (result.Snapshot.Completed)
        {
            FinalizeMatch(result.Snapshot, playerPulled: false);
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
            FinalizeMatch(snapshot, decision.PlayerPulled);
            _yearManager.CompleteMatchOpportunity();
            _activeMatch = null;
            if (decision.PlayerPulled)
            {
                LogEntries.Add($"[{snapshot.MatchLabel}] 등판 종료 - 교체로 마운드에서 내려왔습니다. (실점 {snapshot.RunsAllowed} / 투구수 {snapshot.PitchCount})");
            }
            else
            {
                LogEntries.Add($"[{snapshot.MatchLabel}] 경기 종료 - 실점 {snapshot.RunsAllowed} / 투구수 {snapshot.PitchCount}");
            }
        }

        return decision;
    }

    private void FinalizeMatch(MatchSnapshot snapshot, bool playerPulled)
    {
        if (_activeMatch is null)
        {
            return;
        }

        var scoreboard = _activeMatch.BuildScoreboardSnapshot();
        if (scoreboard is null)
        {
            return;
        }

        var opponentId = MatchOpponentId ?? MatchOpponent;
        var homeTeamId = MatchIsHome ? School.Id : opponentId;
        var awayTeamId = MatchIsHome ? opponentId : School.Id;
        var homeTeamName = MatchIsHome ? School.Name : MatchOpponent;
        var awayTeamName = MatchIsHome ? MatchOpponent : School.Name;

        if (MatchKind == HighSchoolMatchKind.Scrimmage)
        {
            homeTeamId = $"{School.Id}_HOME";
            awayTeamId = $"{School.Id}_AWAY";
            homeTeamName = scoreboard.HomeLabel;
            awayTeamName = scoreboard.GuestLabel;
        }

        var homeRuns = scoreboard.HomeRuns;
        var guestRuns = scoreboard.GuestRuns;
        var homeHits = scoreboard.HomeHits;
        var guestHits = scoreboard.GuestHits;
        var homeErrors = scoreboard.HomeErrors;
        var guestErrors = scoreboard.GuestErrors;

        var homeWin = homeRuns > guestRuns;
        if (homeRuns == guestRuns)
        {
            homeWin = _random.NextDouble() >= 0.5;
            if (homeWin)
            {
                homeRuns += 1;
            }
            else
            {
                guestRuns += 1;
            }
            LogEntries.Add($"[{snapshot.MatchLabel}] 연장 승부로 {(homeWin ? scoreboard.HomeLabel : scoreboard.GuestLabel)}이(가) 승리했습니다.");
        }

        var playerWin = MatchIsHome ? homeWin : !homeWin;

        _seasonTracker.RecordMatch(new HighSchoolMatchRecord(
            DayIndex,
            MatchKind,
            homeTeamId,
            homeTeamName,
            awayTeamId,
            awayTeamName,
            homeRuns,
            guestRuns,
            homeHits,
            guestHits,
            homeErrors,
            guestErrors,
            MatchIsRivalry,
            MatchStageLabel ?? string.Empty));

        if (MatchKind is HighSchoolMatchKind.WeekendLeague or HighSchoolMatchKind.Official or HighSchoolMatchKind.Tournament)
        {
            var homeRecord = _seasonTracker.EnsureTeam(homeTeamId, homeTeamName);
            var awayRecord = _seasonTracker.EnsureTeam(awayTeamId, awayTeamName);
            homeRecord.RecordGame(true, homeRuns, guestRuns, homeHits, guestHits, homeErrors, guestErrors);
            awayRecord.RecordGame(false, guestRuns, homeRuns, guestHits, homeHits, guestErrors, homeErrors);

            var line = _activeMatch.BuildPitchingLine();
            _seasonTracker.PlayerPitching.RecordGame(
                line.OutsRecorded,
                line.RunsAllowed,
                line.HitsAllowed,
                line.WalksAllowed,
                line.Strikeouts,
                line.Pitches,
                playerWin);
        }

        if (MatchKind == HighSchoolMatchKind.Tournament &&
            !string.IsNullOrWhiteSpace(MatchTournamentMatchId) &&
            TournamentBracket is not null)
        {
            var winnerId = homeWin ? homeTeamId : awayTeamId;
            var winnerName = homeWin ? homeTeamName : awayTeamName;
            TournamentBracket.RecordResult(MatchTournamentMatchId!, new HighSchoolTournamentTeam(winnerId, winnerName));
        }

        ApplyMatchOutcomeAdjustments(playerWin, playerPulled, homeRuns, guestRuns);
    }

    private void ApplyMatchOutcomeAdjustments(bool playerWin, bool playerPulled, int homeRuns, int guestRuns)
    {
        var runDiff = MatchIsHome ? homeRuns - guestRuns : guestRuns - homeRuns;
        var coachBase = MatchKind switch
        {
            HighSchoolMatchKind.Tournament => 3.0,
            HighSchoolMatchKind.WeekendLeague => 2.0,
            HighSchoolMatchKind.Official => 2.0,
            HighSchoolMatchKind.Friendly => 1.0,
            HighSchoolMatchKind.Scrimmage => 0.5,
            _ => 1.0
        };

        var scoutBase = MatchKind switch
        {
            HighSchoolMatchKind.Tournament => 3.0,
            HighSchoolMatchKind.WeekendLeague => 2.0,
            HighSchoolMatchKind.Official => 2.0,
            _ => 0.0
        };

        if (!playerWin)
        {
            coachBase *= -1;
            scoutBase = scoutBase <= 0 ? 0 : -Math.Max(1, scoutBase - 1);
        }

        if (MatchIsRivalry)
        {
            coachBase += playerWin ? 0.8 : -0.8;
        }

        if (Math.Abs(runDiff) >= 4)
        {
            coachBase += Math.Sign(runDiff) * 0.6;
            scoutBase += Math.Sign(runDiff) * 0.5;
        }

        if (playerPulled)
        {
            coachBase -= 0.6;
        }

        if (Math.Abs(coachBase) > 0.01)
        {
            AdjustCoachTrust(coachBase);
        }

        if (Math.Abs(scoutBase) > 0.01)
        {
            AdjustScoutInterest(scoutBase);
        }
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

        ApplyAcademicSession(dayLog);

        var storyLogs = _yearManager.AdvanceDay(Player, _random);
        dayLog.AddRange(storyLogs);
        UpdateAcademicTermIfNeeded(storyLogs);
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
            return;
        }

        ApplyRoutineForDay(DayIndex);
    }

    private void InitializeRoutineSystem()
    {
        var templates = BuildRoutineTemplates(_actions);
        _routineTemplates.AddRange(templates);
        foreach (var template in _routineTemplates)
        {
            _routineStates.Add(new RoutineState(template, 0));
        }
    }

    private void ApplyRoutineForDay(int day)
    {
        if (_routineTemplates.Count == 0) return;
        var routineId = GetRoutineAssignment(day);
        var template = GetRoutineTemplate(routineId) ?? _routineTemplates[0];
        _selected[ActionSlot.Morning] = template.Morning;
        _selected[ActionSlot.Afternoon] = template.Afternoon;
        _selected[ActionSlot.Evening] = template.Evening;
    }

    private string GetRoutineAssignment(int day)
    {
        if (_routineAssignments.TryGetValue(day, out var routineId))
        {
            return routineId;
        }

        var defaultRoutine = _routineTemplates.Count > 0 ? _routineTemplates[0].Id : "default";
        _routineAssignments[day] = defaultRoutine;
        return defaultRoutine;
    }

    private void AssignRoutineToWeek(int weekNumber, string routineId)
    {
        var startDay = (Math.Max(1, weekNumber) - 1) * 7 + 1;
        for (var offset = 0; offset < 7; offset++)
        {
            var day = startDay + offset;
            if (day < DayIndex) continue;
            _routineAssignments[day] = routineId;
        }
    }

    private void ApplyAcademicRecommendation()
    {
        if (_academicOptions.TryGetValue(AcademicSlot.Lecture, out var lecture))
        {
            _academicPlans[AcademicSlot.Lecture] = lecture.FirstOrDefault(a => a.Id == "lecture_listen") ?? lecture.First();
        }
        if (_academicOptions.TryGetValue(AcademicSlot.Support, out var support))
        {
            _academicPlans[AcademicSlot.Support] = support.FirstOrDefault(a => a.Id == "support_extra") ?? support.First();
        }
        if (_academicOptions.TryGetValue(AcademicSlot.Study, out var study))
        {
            _academicPlans[AcademicSlot.Study] = study.FirstOrDefault(a => a.Id == "study_homework") ?? study.First();
        }
    }

    private void InitializeAcademicSystem()
    {
        var actions = BuildAcademicActions();
        foreach (AcademicSlot slot in Enum.GetValues(typeof(AcademicSlot)))
        {
            _academicOptions[slot] = actions.Where(a => a.Slot == slot).ToList();
            if (_academicOptions[slot].Count > 0)
            {
                _academicPlans[slot] = _academicOptions[slot][0];
            }
        }
    }

    private void ApplyAcademicSession(ICollection<string> dayLog)
    {
        foreach (AcademicSlot slot in Enum.GetValues(typeof(AcademicSlot)))
        {
            if (!_academicPlans.TryGetValue(slot, out var plan))
            {
                continue;
            }

            Player.ApplyDelta("MNT_ACADEMIC", plan.KnowledgeImpact);
            Player.ApplyDelta("MNT_FOCUS", plan.FocusImpact);
            Player.ApplyDelta("MNT_MORALE", plan.MoraleImpact);
            _fatigueLevel = Math.Clamp(_fatigueLevel + plan.FatigueImpact, 0, 100);
            dayLog.Add($"[학업] {plan.Title}");
        }
    }

    private void UpdateAcademicTermIfNeeded(IReadOnlyList<string> storyLogs)
    {
        if (!storyLogs.Any(line => line.Contains("중간고사", StringComparison.Ordinal) || line.Contains("기말고사", StringComparison.Ordinal)))
        {
            return;
        }

        var knowledge = Player.GetStatValue("MNT_ACADEMIC");
        var focus = Player.GetStatValue("MNT_FOCUS");
        var score = knowledge * 0.7 + focus * 0.3;
        var grade = score switch
        {
            >= 24 => 1.5,
            >= 20 => 2.5,
            >= 16 => 3.5,
            _ => 4.5
        };

        _academicGradeSum += grade;
        _academicCompletedTerms++;

        if (grade <= 2.0)
        {
            _academicScholarship = Math.Clamp(_academicScholarship + 1.0, 0, 10);
        }
        else if (grade >= 4.0)
        {
            _academicWarning = Math.Clamp(_academicWarning + 1.0, 0, 10);
        }
    }

    private static string SlotLabel(ActionSlot slot) => slot switch
    {
        ActionSlot.Morning => "아침",
        ActionSlot.Afternoon => "점심",
        ActionSlot.Evening => "저녁",
        _ => string.Empty
    };

    private void EnsureMentorName()
    {
        if (!string.Equals(_mentorName, "미정", StringComparison.OrdinalIgnoreCase)) return;
        _mentorName = MentorNames[_random.Next(MentorNames.Length)];
    }

    private void EnsureRivalName()
    {
        if (!string.Equals(_rivalName, "미정", StringComparison.OrdinalIgnoreCase)) return;
        _rivalName = RivalNames[_random.Next(RivalNames.Length)];
    }

    private void AdjustCoachTrust(double delta)
    {
        _coachTrust = Math.Clamp(_coachTrust + delta, 0, 100);
        _yearManager.IncreaseCoachTrust(delta);
    }

    private void AdjustScoutInterest(double delta)
        => _yearManager.IncreaseScoutInterest(delta);

    private DailyChoiceCard? BuildChoiceForDay(int academicYear, int day)
    {
        return academicYear switch
        {
            1 => BuildYearOneChoice(day),
            3 => BuildYearThreeChoice(day),
            _ => null
        };
    }

    private DailyChoiceCard? BuildYearOneChoice(int day)
    {

        if (day == 1)
        {
            return new DailyChoiceCard(
                "year1_orientation",
                "입학 오리엔테이션",
                "첫 인상과 루틴 방향을 결정할 선택입니다.",
                new List<DailyChoiceOption>
                {
                    new("orientation_coach","코치 질문","코치진 질문에 적극적으로 답합니다.", (s, r, logs) =>
                    {
                        s.Player.SetRoles("선발", "불펜");
                        s.AdjustCoachTrust(3);
                        s.ApplyCoachRecommendation("balanced");
                        logs.Add("[선택] 코치 질문에 적극적으로 답했습니다. 기본 루틴이 추천됩니다.");
                    }),
                    new("orientation_senior","선배 교류","선배들과 교류하며 정보를 얻습니다.", (s, r, logs) =>
                    {
                        s.Player.SetRoles("선발", "불펜");
                        s.Player.ApplyDelta("MNT_MORALE", 0.3);
                        s.EnsureRivalName();
                        logs.Add($"[선택] 선배들과 교류하며 라이벌 후보 {s._rivalName}를 의식하게 되었습니다.");
                    })
                    ,
                    new("orientation_pledge","포부 선언","전원 앞에서 각오를 밝힙니다.", (s, r, logs) =>
                    {
                        s.Player.SetRoles("선발", "불펜");
                        s.Player.ApplyDelta("MNT_MORALE", 0.4);
                        s.ApplyCoachRecommendation("match");
                        logs.Add("[선택] 포부 선언으로 멘탈이 상승하고 경쟁 루틴이 추천됩니다.");
                    })
                },
                "orientation_coach");
        }

        if (day == 5)
        {
            return new DailyChoiceCard(
                "year1_baseline_test",
                "기초 체력·멘탈 테스트",
                "테스트 결과에 따라 루틴 방향을 잡습니다.",
                new List<DailyChoiceOption>
                {
                    new("baseline_push", "적극 대응", "공격적으로 테스트에 임합니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("PHY_STAMINA", 0.3);
                        s.Player.ApplyDelta("MNT_MORALE", 0.2);
                        logs.Add("[선택] 적극적으로 테스트에 임해 컨디션과 멘탈이 상승했습니다.");
                    }),
                    new("baseline_balance", "밸런스 유지", "무리하지 않고 균형을 맞춥니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("MNT_FOCUS", 0.2);
                        s._fatigueLevel = Math.Clamp(s._fatigueLevel - 0.6, 0, 100);
                        logs.Add("[선택] 밸런스를 유지하며 컨디션을 관리했습니다.");
                    }),
                    new("baseline_safe", "안전하게 진행", "부상 위험을 최소화합니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("PHY_ARM_HEALTH", 0.2);
                        logs.Add("[선택] 안전하게 진행해 팔 컨디션을 보호했습니다.");
                    })
                },
                "baseline_balance");
        }

        if (day == 15)
        {
            return new DailyChoiceCard(
                "year1_mentor_pick",
                "멘토 지정",
                "멘토 또는 라이벌을 중심으로 시즌 방향을 정합니다.",
                new List<DailyChoiceOption>
                {
                    new("mentor_pick_1", MentorNames[0], "루틴 피드백을 요청합니다.", (s, r, logs) =>
                    {
                        s._mentorName = MentorNames[0];
                        s._mentorTrust = Math.Clamp(s._mentorTrust + 6, 0, 100);
                        s.Player.ApplyDelta("MNT_FOCUS", 0.4);
                        logs.Add($"[선택] 멘토 {s._mentorName}를 선택했습니다.");
                    }),
                    new("mentor_pick_2", MentorNames[1], "불펜 피드백을 집중적으로 받습니다.", (s, r, logs) =>
                    {
                        s._mentorName = MentorNames[1];
                        s._mentorTrust = Math.Clamp(s._mentorTrust + 6, 0, 100);
                        s.Player.ApplyDelta("SKL_COMMAND", 0.2);
                        logs.Add($"[선택] 멘토 {s._mentorName}를 선택했습니다.");
                    }),
                    new("mentor_pick_3", MentorNames[2], "멘탈 루틴을 함께 정비합니다.", (s, r, logs) =>
                    {
                        s._mentorName = MentorNames[2];
                        s._mentorTrust = Math.Clamp(s._mentorTrust + 6, 0, 100);
                        s.Player.ApplyDelta("MNT_MORALE", 0.3);
                        logs.Add($"[선택] 멘토 {s._mentorName}를 선택했습니다.");
                    }),
                    new("rival_provoke", "라이벌 도발", "라이벌을 자극해 경쟁심을 끌어올립니다.", (s, r, logs) =>
                    {
                        s.EnsureRivalName();
                        s._rivalryLevel = Math.Clamp(s._rivalryLevel + 6, 0, 100);
                        s.Player.ApplyDelta("MNT_MORALE", 0.2);
                        s.AdjustCoachTrust(-2);
                        logs.Add($"[선택] 라이벌 {s._rivalName}에게 도발을 던졌습니다. 코치 신뢰가 감소했습니다.");
                    })
                },
                "mentor_pick_1");
        }

        if (day == 23)
        {
            return BuildRoutineReviewCard();
        }

        if (day == 30)
        {
            return new DailyChoiceCard(
                "year1_official_debut",
                "공식 경기 체험",
                "공식 경기 출전에 맞춰 어떤 태도로 임할지 선택합니다.",
                new List<DailyChoiceOption>
                {
                    new("official_interview", "인터뷰 응답", "짧은 인터뷰로 각오를 전합니다.", (s, r, logs) =>
                    {
                        s.AdjustScoutInterest(2);
                        s.Player.ApplyDelta("MNT_MORALE", 0.3);
                        logs.Add("[선택] 인터뷰로 스카우트 주목도가 상승했습니다.");
                    }),
                    new("official_analysis", "경기 분석 집중", "경기 분석에 집중합니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                        logs.Add("[선택] 경기 분석에 집중해 준비도를 높였습니다.");
                    }),
                    new("official_rest", "컨디션 관리", "루틴을 단순화해 컨디션을 유지합니다.", (s, r, logs) =>
                    {
                        s._fatigueLevel = Math.Clamp(s._fatigueLevel - 1.0, 0, 100);
                        logs.Add("[선택] 컨디션 관리에 집중했습니다.");
                    })
                },
                "official_analysis");
        }

        if (day == 60)
        {
            return new DailyChoiceCard(
                "year1_scout_observe",
                "스카우트 관전",
                "스카우트가 지켜보는 날. 어떤 액션을 취할까요?",
                new List<DailyChoiceOption>
                {
                    new("scout_note","경기 분석 메모","경기 노트에 집중해 준비합니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("MNT_FOCUS", 0.5);
                        s.AdjustScoutInterest(2);
                        logs.Add("[선택] 분석 메모에 집중해 경기 준비도를 높였습니다.");
                    }),
                    new("scout_pr","홍보 PR","스카우트와 인터뷰를 진행합니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("MNT_MORALE", 0.4);
                        s.AdjustScoutInterest(3);
                        logs.Add("[선택] 홍보 PR로 스카우트 관심도가 상승했습니다.");
                    })
                },
                "scout_note");
        }

        if (day == 90)
        {
            return BuildMentorFeedbackCard();
        }

        if (day == 95)
        {
            return BuildRivalChallengeCard();
        }

        if (day == 150)
        {
            return BuildCampCard("year1_camp_summer", "여름 합숙 캠프");
        }

        if (day == 180)
        {
            return BuildMentalSessionCard();
        }

        if (day == 230)
        {
            return BuildCampCard("year1_camp_winter", "방학 합숙 캠프");
        }

        if (day == 110)
        {
            return BuildExamPrepCard("year1_exam_mid", "중간고사 대비");
        }

        if (day == 220)
        {
            return BuildExamPrepCard("year1_exam_final", "기말고사 대비");
        }

        if (day >= 10 && (day - 10) % 15 == 0 && day <= 100)
        {
            return BuildScrimmageChoiceCard(day);
        }

        if (day >= 42 && (day - 42) % 20 == 0 && day <= 340)
        {
            return BuildAcademicLoopCard(day);
        }

        if (day >= 120 && _fatigueLevel >= 40 && _random.NextDouble() < 0.12)
        {
            return BuildInjuryChoiceCard(day);
        }

        return null;
    }

    private DailyChoiceCard? BuildYearThreeChoice(int day)
    {
        if (day == 215)
        {
            return new DailyChoiceCard(
                "year3_draft_preview",
                "드래프트 프리뷰 주간",
                "스카우트 리포트와 팀 Needs를 확인합니다.",
                new List<DailyChoiceOption>
                {
                    new("draft_preview_review", "리포트 확인", "모의 드래프트와 팀 Needs를 확인합니다.", (s, r, logs) =>
                    {
                        foreach (var line in s.BuildDraftPreview())
                        {
                            logs.Add(line);
                        }
                    }),
                    new("draft_preview_focus", "개인 루틴 집중", "개인 루틴에 집중해 지명 확률을 올립니다.", (s, r, logs) =>
                    {
                        s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                        logs.Add("[드래프트] 루틴 집중으로 집중력이 상승했습니다.");
                    })
                },
                "draft_preview_review");
        }

        if (day == 220)
        {
            return new DailyChoiceCard(
                "year3_draft_apply",
                "드래프트 신청",
                "드래프트에 참가할지 결정합니다.",
                new List<DailyChoiceOption>
                {
                    new("draft_apply_now", "즉시 신청", "드래프트 참가 서류를 접수합니다.", (s, r, logs) =>
                    {
                        s._draftApplied = true;
                        s.AdjustScoutInterest(4);
                        logs.Add("[드래프트] 신청서가 접수되었습니다. 스카우트 면담이 시작됩니다.");
                    }),
                    new("draft_apply_delay", "보류", "진로를 조금 더 고민합니다.", (s, r, logs) =>
                    {
                        s._draftApplied = false;
                        logs.Add("[드래프트] 신청을 보류했습니다. 진로 상담 로그가 남습니다.");
                    })
                },
                "draft_apply_now");
        }

        if (day == 330)
        {
            var outcome = EnsureDraftOutcome();
            if (!outcome.Drafted)
            {
                return new DailyChoiceCard(
                    "year3_draft_result_undrafted",
                    "드래프트 결과: 미지명",
                    "미지명 처리되었습니다. 다음 진로를 선택하세요.",
                    new List<DailyChoiceOption>
                    {
                        new("draft_route_university", "대학 진학", "대학 루트를 준비합니다.", (s, r, logs) =>
                        {
                            s._postDraftRoute = "대학";
                            logs.Add("[진로] 대학 진학 루트를 선택했습니다.");
                        }),
                        new("draft_route_independent", "독립리그", "독립리그 트라이아웃을 준비합니다.", (s, r, logs) =>
                        {
                            s._postDraftRoute = "독립리그";
                            logs.Add("[진로] 독립리그 트라이아웃을 준비합니다.");
                        }),
                        new("draft_route_military", "군 복무", "군 복무 후 재도전을 준비합니다.", (s, r, logs) =>
                        {
                            s._postDraftRoute = "군 복무";
                            logs.Add("[진로] 군 복무 루트를 선택했습니다.");
                        })
                    },
                    "draft_route_university");
            }

            return new DailyChoiceCard(
                "year3_draft_result_selected",
                "드래프트 결과: 지명",
                $"지명 라운드 {outcome.Round}R / {outcome.TeamName} 지명",
                new List<DailyChoiceOption>
                {
                    new("draft_accept", "계약 수락", "프로 계약을 수락합니다.", (s, r, logs) =>
                    {
                        var offer = s.CreateDraftContractOffer(outcome.TeamName!, outcome.Round ?? 1);
                        logs.Add($"[계약] 보너스 {offer.Bonus:0.0} / 연봉 {offer.Salary:0.0} ({offer.Years}년) 제안을 수락했습니다.");
                        s._postDraftRoute = "프로";
                        logs.Add($"[드래프트] {outcome.TeamName} 입단을 확정했습니다.");
                    }),
                    new("draft_negotiation", "조건 조정", "계약 조건을 조정합니다.", (s, r, logs) =>
                    {
                        var negotiation = s.NegotiateDraftContract();
                        foreach (var line in negotiation)
                        {
                            logs.Add(line);
                        }
                    }),
                    new("draft_decline_university", "대학 진학", "드래프트를 거절하고 대학 진학을 선택합니다.", (s, r, logs) =>
                    {
                        s._postDraftRoute = "대학";
                        logs.Add("[드래프트] 지명을 거절하고 대학 진학을 선택했습니다.");
                    }),
                    new("draft_decline_independent", "독립리그", "독립리그 트라이아웃으로 전환합니다.", (s, r, logs) =>
                    {
                        s._postDraftRoute = "독립리그";
                        logs.Add("[드래프트] 독립리그 루트로 전환했습니다.");
                    })
                },
                "draft_accept");
        }

        return null;
    }

    private DraftOutcome EnsureDraftOutcome()
    {
        if (_draftOutcome is not null)
        {
            return _draftOutcome;
        }

        var pool = EnsureDraftPool();
        EnsureDraftMock(pool);

        var playerCandidateId = _draftPlayerCandidateId;
        var playerCandidate = pool.FirstOrDefault(c => c.Id.Equals(playerCandidateId ?? string.Empty, StringComparison.OrdinalIgnoreCase));
        var score = playerCandidate?.Score ?? 0;

        if (!_draftApplied || playerCandidateId is null)
        {
            _draftOutcome = new DraftOutcome(false, null, null, score);
            return _draftOutcome;
        }

        var pick = _draftMockPicks?.FirstOrDefault(p => p.CandidateId.Equals(playerCandidateId, StringComparison.OrdinalIgnoreCase));
        if (pick is null)
        {
            _draftOutcome = new DraftOutcome(false, null, null, score);
            return _draftOutcome;
        }

        _draftOutcome = new DraftOutcome(true, pick.Round, pick.TeamName, score);
        return _draftOutcome;
    }

    private List<DraftCandidate> EnsureDraftPool()
    {
        if (_draftPool is not null && _draftPoolGeneratedDay == DayIndex)
        {
            return _draftPool;
        }

        var pool = new List<DraftCandidate>();
        var rosterCandidates = BuildDraftCandidatesFromHighSchoolRosters();

        foreach (var candidate in rosterCandidates)
        {
            pool.Add(candidate);
        }

        if (pool.Count == 0)
        {
            pool.Add(new DraftCandidate("draft_fallback_00", "임시 선수", "투수", "고교", 40));
        }

        var playerScore = CalculateDraftScore();
        _draftPlayerCandidateId = "draft_player";
        pool.Add(new DraftCandidate(_draftPlayerCandidateId, Player.Name, "투수", "고교", playerScore));

        _draftPool = pool.OrderByDescending(c => c.Score).ToList();
        _draftPoolGeneratedDay = DayIndex;
        _draftTeamNeeds = null;
        _draftMockPicks = null;
        return _draftPool;
    }

    private List<DraftCandidate> BuildDraftCandidatesFromHighSchoolRosters()
    {
        var candidates = new List<DraftCandidate>();
        var rosterDir = DataPathResolver.HighSchoolRosterDirectory;
        if (!Directory.Exists(rosterDir))
        {
            return candidates;
        }

        var files = Directory.GetFiles(rosterDir, "*.json");
        foreach (var file in files)
        {
            var teamId = Path.GetFileNameWithoutExtension(file);
            var roster = HighSchoolRosterRepository.Load(teamId);
            if (roster is null) continue;

            var allPlayers = roster.Varsity.Concat(roster.Junior).ToList();
            foreach (var player in allPlayers)
            {
                if (player.AcademicYear != 3)
                {
                    continue;
                }

                if (player.Name.Equals(Player.Name, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var position = ResolveDraftPosition(player.Position);
                var score = EstimateRosterPlayerScore(player, position);
                var id = $"draft_{teamId}_{player.Name}";
                var source = _random.NextDouble() < 0.08 ? "재수생" : "고교";
                candidates.Add(new DraftCandidate(id, player.Name, position, source, score));
            }
        }

        return candidates;
    }

    private double EstimateRosterPlayerScore(HighSchoolRosterPlayer player, string position)
    {
        double score;
        if (position == "투수")
        {
            var pitching = GetAverageFromDict(player.Stats.Pitching);
            var physical = GetAverageFromDict(player.Stats.Physical);
            score = (pitching * 0.7 + physical * 0.3 + player.Overall * 0.6) / 2.0 + 10;
        }
        else
        {
            var batting = GetAverageFromDict(player.Stats.Batting);
            var physical = GetAverageFromDict(player.Stats.Physical);
            score = (batting * 0.7 + physical * 0.3 + player.Overall * 0.6) / 2.0 + 8;
        }

        return Math.Clamp(Math.Round(score, 1), 10, 90);
    }

    private static double GetAverageFromDict(IReadOnlyDictionary<string, int> dict)
        => dict.Count == 0 ? 25 : dict.Values.Average();

    private static string ResolveDraftPosition(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "타자";
        }

        var token = raw.Trim().ToUpperInvariant();
        if (token.Contains("SP") || token.Contains("RP") || token.Contains("P"))
        {
            return "투수";
        }

        if (token.Contains("C"))
        {
            return "포수";
        }

        if (token.Contains("IF"))
        {
            return "내야";
        }

        if (token.Contains("OF"))
        {
            return "외야";
        }

        return "타자";
    }

    private void EnsureDraftMock(List<DraftCandidate> pool)
    {
        if (_draftMockPicks is not null)
        {
            return;
        }

        _draftTeamNeeds = BuildDraftTeamNeeds(pool);

        var remaining = new List<DraftCandidate>(pool);
        var picks = new List<DraftMockPick>();
        for (var round = 1; round <= 10; round++)
        {
            foreach (var teamNeed in _draftTeamNeeds)
            {
                var pick = ChooseDraftPick(teamNeed, remaining);
                remaining.Remove(pick);
                picks.Add(new DraftMockPick(round, teamNeed.TeamName, pick.Id, pick.Name));
            }
        }

        _draftMockPicks = picks;
    }

    private DraftCandidate ChooseDraftPick(DraftTeamNeed need, List<DraftCandidate> remaining)
    {
        var weighted = remaining
            .Select(candidate =>
            {
                var weight = candidate.Score;
                if (need.Need == "투수" && candidate.Position == "투수") weight += 6;
                if (need.Need == "타자" && candidate.Position is "타자" or "내야" or "외야" or "포수") weight += 5;
                if (need.Need == "포수" && candidate.Position == "포수") weight += 5;
                if (need.Need == "내야" && candidate.Position == "내야") weight += 5;
                if (need.Need == "외야" && candidate.Position == "외야") weight += 5;
                return new { Candidate = candidate, Weight = weight };
            })
            .OrderByDescending(entry => entry.Weight)
            .Take(8)
            .ToList();

        return weighted[_random.Next(weighted.Count)].Candidate;
    }

    private List<DraftTeamNeed> BuildDraftTeamNeeds(IReadOnlyList<DraftCandidate> pool)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["투수"] = pool.Count(c => c.Position == "투수"),
            ["포수"] = pool.Count(c => c.Position == "포수"),
            ["내야"] = pool.Count(c => c.Position == "내야"),
            ["외야"] = pool.Count(c => c.Position == "외야"),
            ["타자"] = pool.Count(c => c.Position == "타자")
        };

        var needs = new List<DraftTeamNeed>();
        foreach (var team in DraftTeams)
        {
            var need = ResolveTeamNeed(team, counts);
            needs.Add(new DraftTeamNeed(team, need));
        }

        return needs;
    }

    private string ResolveTeamNeed(string teamName, IReadOnlyDictionary<string, int> counts)
    {
        var scarcity = counts
            .Select(pair => new { Need = pair.Key, Score = 1.0 / (pair.Value + 1) })
            .OrderByDescending(entry => entry.Score)
            .ToList();

        var hash = Math.Abs(teamName.GetHashCode());
        var prefersPitching = (hash % 3) == 0;
        var prefersDefense = (hash % 3) == 1;

        foreach (var entry in scarcity)
        {
            if (prefersPitching && entry.Need == "투수") return entry.Need;
            if (prefersDefense && (entry.Need == "포수" || entry.Need == "내야")) return entry.Need;
        }

        return scarcity.First().Need;
    }

    private double CalculateDraftScore()
    {
        var velo = Player.GetStatValue("SKL_FOURSEAM");
        var command = Player.GetStatValue("SKL_COMMAND");
        var changeup = Player.GetStatValue("SKL_CHANGEUP");
        var focus = Player.GetStatValue("MNT_FOCUS");
        var stamina = Player.GetStatValue("PHY_STAMINA");
        var scout = _yearManager.ScoutInterest;
        var score = velo * 0.35 + command * 0.3 + changeup * 0.2 + focus * 0.15 + stamina * 0.1 + scout * 0.5;
        score += _random.Next(-6, 7);
        return Math.Clamp(Math.Round(score, 1), 0, 100);
    }

    private IReadOnlyList<string> BuildDraftPreview()
    {
        var lines = new List<string>();
        var pool = EnsureDraftPool();
        EnsureDraftMock(pool);

        lines.Add("[드래프트] 모의 드래프트 Top5");
        foreach (var pick in _draftMockPicks!.Where(p => p.Round == 1).Take(5))
        {
            lines.Add($"- {pick.TeamName} 1R: {pick.CandidateName}");
        }

        lines.Add("[드래프트] 팀 Needs 요약");
        foreach (var need in _draftTeamNeeds!.Take(5))
        {
            lines.Add($"- {need.TeamName}: {need.Need}");
        }

        var rank = pool.FindIndex(c => c.Id == _draftPlayerCandidateId) + 1;
        if (rank > 0)
        {
            lines.Add($"[드래프트] 내 스카우트 랭킹 예상: {rank}위");
        }

        _draftSummaryLines = lines.ToList();
        _draftSummaryDay = DayIndex;
        return lines;
    }

    public string GetDraftSummaryText()
    {
        if (_draftSummaryLines is null || _draftSummaryDay <= 0)
        {
            return "드래프트 프리뷰가 아직 없습니다.";
        }

        return $"Day {_draftSummaryDay}\n" + string.Join('\n', _draftSummaryLines);
    }

    public IReadOnlyList<DraftCandidate> GetDraftPool()
        => EnsureDraftPool();

    public IReadOnlyList<DraftTeamNeed> GetDraftTeamNeeds()
    {
        EnsureDraftMock(EnsureDraftPool());
        return _draftTeamNeeds ?? new List<DraftTeamNeed>();
    }

    public IReadOnlyList<DraftMockPick> GetDraftMockPicks()
    {
        EnsureDraftMock(EnsureDraftPool());
        return _draftMockPicks ?? new List<DraftMockPick>();
    }

    private IReadOnlyList<string> NegotiateDraftContract()
    {
        var lines = new List<string>();
        var outcome = EnsureDraftOutcome();
        if (!outcome.Drafted || outcome.Round is null || outcome.TeamName is null)
        {
            lines.Add("[드래프트] 지명 결과가 없어 협상을 진행할 수 없습니다.");
            return lines;
        }

        var offer = _draftContractOffer ?? CreateDraftContractOffer(outcome.TeamName, outcome.Round.Value);
        var success = _random.NextDouble() < 0.6;
        if (success)
        {
            offer = new DraftContractOffer(offer.TeamName, offer.Round, offer.Bonus * 1.1, offer.Salary * 1.05, offer.Years);
            _draftContractOffer = offer;
            lines.Add($"[계약] 조건 조정 성공. 보너스 {offer.Bonus:0.0} / 연봉 {offer.Salary:0.0} ({offer.Years}년)");
        }
        else
        {
            lines.Add("[계약] 조건 조정이 받아들여지지 않았습니다. 기본 제안을 유지합니다.");
        }

        return lines;
    }

    private DraftContractOffer CreateDraftContractOffer(string teamName, int round)
    {
        var baseBonus = Math.Max(1, 12 - round) * 8.0 + _random.NextDouble() * 4.0;
        var baseSalary = 2.0 + (10 - round) * 0.6 + _random.NextDouble() * 0.8;
        var years = 3 + (round <= 3 ? 1 : 0);
        var offer = new DraftContractOffer(teamName, round, Math.Round(baseBonus, 1), Math.Round(baseSalary, 1), years);
        _draftContractOffer = offer;
        return offer;
    }

    private string BuildRandomKoreanName()
    {
        var family = new[] { "김", "이", "박", "최", "정", "강", "한", "윤", "조", "임" };
        var given = new[] { "준", "도", "현", "우", "서", "민", "성", "진", "태", "호" };
        return $"{family[_random.Next(family.Length)]}{given[_random.Next(given.Length)]}{given[_random.Next(given.Length)]}";
    }

    private DailyChoiceCard BuildScrimmageChoiceCard(int day)
    {
        var id = $"year1_scrimmage_{day}";
        return new DailyChoiceCard(
            id,
            "연습 경기 & 청백전",
            "코치 조언을 받을지, 내 스타일을 고집할지 선택합니다.",
            new List<DailyChoiceOption>
            {
                new("scrimmage_mentor","멘토 조언","멘토의 피드백을 반영합니다.", (s, r, logs) =>
                {
                    s.EnsureMentorName();
                    s._mentorTrust = Math.Clamp(s._mentorTrust + 3, 0, 100);
                    s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                    s.AdjustCoachTrust(1);
                    logs.Add($"[선택] 멘토 {s._mentorName}의 조언으로 루틴을 보정했습니다.");
                }),
                new("scrimmage_self","자기 추천","스스로의 루틴을 밀어붙입니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("SKL_COMMAND", 0.3);
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel + 1.5, 0, 100);
                    s.AdjustCoachTrust(2);
                    logs.Add("[선택] 자기 추천 루틴으로 강하게 밀어붙였습니다.");
                }),
                new("scrimmage_rival","라이벌 관찰","라이벌의 루틴을 분석합니다.", (s, r, logs) =>
                {
                    s.EnsureRivalName();
                    s._rivalryLevel = Math.Clamp(s._rivalryLevel + 3, 0, 100);
                    s.Player.ApplyDelta("MNT_FOCUS", 0.2);
                    logs.Add($"[선택] 라이벌 {s._rivalName}의 움직임을 관찰했습니다.");
                })
            },
            "scrimmage_mentor");
    }

    private DailyChoiceCard BuildRoutineReviewCard()
    {
        return new DailyChoiceCard(
            "year1_routine_review",
            "루틴 점검 미팅",
            "첫 루틴 리뷰에서 방향을 선택합니다.",
            new List<DailyChoiceOption>
            {
                new("routine_review_balance","밸런스 유지","기본 루틴을 유지합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_FOCUS", 0.2);
                    s.AdjustCoachTrust(1);
                    logs.Add("[선택] 기본 루틴을 유지하며 균형을 지켰습니다.");
                }),
                new("routine_review_skill","스킬 강화","커맨드/변화구에 집중합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("SKL_COMMAND", 0.3);
                    s.Player.ApplyDelta("SKL_CHANGEUP", 0.2);
                    logs.Add("[선택] 스킬 강화 루틴으로 투구 감각을 끌어올립니다.");
                }),
                new("routine_review_rest","회복 우선","피로를 줄여 컨디션을 정비합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 2.0, 0, 100);
                    s.Player.ApplyDelta("MNT_MORALE", 0.2);
                    logs.Add("[선택] 회복을 우선해 컨디션을 정비했습니다.");
                })
            },
            "routine_review_balance");
    }

    private DailyChoiceCard BuildAcademicLoopCard(int day)
    {
        var id = $"year1_academic_{day}";
        return new DailyChoiceCard(
            id,
            "학업 루프",
            "수업/튜터링/과제 중 집중할 항목을 선택합니다.",
            new List<DailyChoiceOption>
            {
                new("academic_class_focus","수업을 듣는다","수업 집중으로 이해도를 올립니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.3);
                    s.Player.ApplyDelta("MNT_FOCUS", 0.1);
                    logs.Add("[선택] 수업 집중으로 이해도가 상승했습니다.");
                }),
                new("academic_class_slack","수업을 대충 듣는다","피로를 아끼면서 수업을 소화합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.1);
                    s.Player.ApplyDelta("MNT_MORALE", 0.1);
                    logs.Add("[선택] 수업을 무리 없이 소화했습니다.");
                }),
                new("academic_class_sleep","잔다(수업)","수업 시간에 잠을 잡니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 0.8, 0, 100);
                    s.Player.ApplyDelta("MNT_FOCUS", -0.1);
                    logs.Add("[선택] 수업 시간에 잠을 청했습니다.");
                }),
                new("academic_tutor_study","추가 학습을 한다","추가 학습으로 실력을 끌어올립니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.4);
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel + 0.4, 0, 100);
                    logs.Add("[선택] 추가 학습으로 이해도를 끌어올렸습니다.");
                }),
                new("academic_tutor_english","영어 회화를 한다","교양 학습으로 집중을 전환합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.2);
                    s.Player.ApplyDelta("MNT_MORALE", 0.2);
                    logs.Add("[선택] 영어 회화 세션으로 리듬을 잡았습니다.");
                }),
                new("academic_tutor_sleep","잔다(튜터링)","튜터링 시간에 휴식합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 0.6, 0, 100);
                    logs.Add("[선택] 튜터링 대신 휴식을 택했습니다.");
                }),
                new("academic_hw_done","과제를 한다","과제를 마무리합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.3);
                    s.Player.ApplyDelta("MNT_FOCUS", 0.2);
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel + 0.3, 0, 100);
                    logs.Add("[선택] 과제를 정리하며 집중도를 높였습니다.");
                }),
                new("academic_hw_slack","과제를 대충한다","과제를 간단히 처리합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.1);
                    s.Player.ApplyDelta("MNT_MORALE", 0.1);
                    logs.Add("[선택] 과제를 가볍게 처리했습니다.");
                }),
                new("academic_hw_sleep","잔다(과제)","과제 대신 잠을 택합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 0.5, 0, 100);
                    logs.Add("[선택] 과제 대신 휴식을 선택했습니다.");
                })
            },
            "academic_class_focus");
    }

    private DailyChoiceCard BuildMentorFeedbackCard()
    {
        return new DailyChoiceCard(
            "year1_mentor_feedback",
            "멘토 피드백 세션",
            "멘토 피드백의 방향을 선택합니다.",
            new List<DailyChoiceOption>
            {
                new("mentor_feedback_bullpen","불펜 피드백","불펜 피드백에 집중합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("SKL_COMMAND", 0.3);
                    s._mentorTrust = Math.Clamp(s._mentorTrust + 4, 0, 100);
                    logs.Add("[선택] 불펜 피드백으로 제구 루틴을 정비했습니다.");
                }),
                new("mentor_feedback_video","영상 분석","영상 분석으로 투구 패턴을 점검합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                    logs.Add("[선택] 영상 분석으로 투구 패턴을 정리했습니다.");
                }),
                new("mentor_feedback_rest","컨디션 조절","피로를 조절하며 리듬을 회복합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 1.0, 0, 100);
                    s.Player.ApplyDelta("MNT_MORALE", 0.2);
                    logs.Add("[선택] 컨디션 조절을 우선했습니다.");
                })
            },
            "mentor_feedback_bullpen");
    }

    private DailyChoiceCard BuildRivalChallengeCard()
    {
        return new DailyChoiceCard(
            "year1_rival_challenge",
            "라이벌 도전전",
            "라이벌 매치에 어떤 자세로 임할지 결정합니다.",
            new List<DailyChoiceOption>
            {
                new("rival_attack","정면 승부","정면 승부로 기세를 올립니다.", (s, r, logs) =>
                {
                    s._rivalryLevel = Math.Clamp(s._rivalryLevel + 4, 0, 100);
                    s.Player.ApplyDelta("MNT_MORALE", 0.3);
                    logs.Add("[선택] 정면 승부로 경쟁심을 끌어올렸습니다.");
                }),
                new("rival_adjust","전략 조정","상황 판단을 우선합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                    logs.Add("[선택] 전략 조정으로 집중도를 높였습니다.");
                }),
                new("rival_provoke","가벼운 도발","가볍게 도발해 긴장감을 높입니다.", (s, r, logs) =>
                {
                    s._rivalryLevel = Math.Clamp(s._rivalryLevel + 2, 0, 100);
                    s.AdjustCoachTrust(-1);
                    logs.Add("[선택] 가벼운 도발로 라이벌의 긴장을 유도했습니다.");
                })
            },
            "rival_attack");
    }

    private DailyChoiceCard BuildMentalSessionCard()
    {
        return new DailyChoiceCard(
            "year1_mental_session",
            "멘탈 컨디셔닝",
            "멘탈 세션에서 선택할 루틴을 결정합니다.",
            new List<DailyChoiceOption>
            {
                new("mental_breath","호흡 훈련","호흡 훈련으로 안정감을 높입니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_MORALE", 0.4);
                    logs.Add("[선택] 호흡 훈련으로 멘탈을 안정시켰습니다.");
                }),
                new("mental_consult","상담 세션","멘탈 상담으로 집중을 회복합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_FOCUS", 0.3);
                    logs.Add("[선택] 상담 세션으로 집중력을 회복했습니다.");
                }),
                new("mental_rest","휴식 선택","컨디션 회복을 우선합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 1.2, 0, 100);
                    logs.Add("[선택] 휴식으로 컨디션을 회복했습니다.");
                })
            },
            "mental_breath");
    }

    private DailyChoiceCard BuildCampCard(string id, string title)
    {
        return new DailyChoiceCard(
            id,
            title,
            "캠프에서 중점 루트를 결정합니다.",
            new List<DailyChoiceOption>
            {
                new("camp_stamina","체력 집중","하체와 체력을 끌어올립니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("PHY_STAMINA", 0.6);
                    s.Player.ApplyDelta("PHY_LEG_DRIVE", 0.4);
                    logs.Add("[합숙] 체력과 하체 폭발력이 상승했습니다.");
                }),
                new("camp_mental","멘탈 리트릿","멘탈 루틴을 정비합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_FOCUS", 0.5);
                    s.Player.ApplyDelta("MNT_MORALE", 0.4);
                    logs.Add("[합숙] 멘탈 루틴이 안정되었습니다.");
                }),
                new("camp_skill","포지션 스킬","커맨드와 변화구 감각을 강화합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("SKL_COMMAND", 0.4);
                    s.Player.ApplyDelta("SKL_CHANGEUP", 0.4);
                    logs.Add("[합숙] 커맨드/체인지업 감각이 상승했습니다.");
                })
            },
            "camp_stamina");
    }

    private DailyChoiceCard BuildExamPrepCard(string id, string title)
    {
        return new DailyChoiceCard(
            id,
            title,
            "시험 대비 방식을 선택합니다.",
            new List<DailyChoiceOption>
            {
                new("exam_focus","집중 학습","집중적으로 학습합니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.6);
                    s.Player.ApplyDelta("MNT_FOCUS", 0.4);
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel + 1.0, 0, 100);
                    logs.Add("[학업] 집중 학습으로 이해도가 상승했습니다.");
                }),
                new("exam_balance","컨디션 관리","무리하지 않고 컨디션을 챙깁니다.", (s, r, logs) =>
                {
                    s.Player.ApplyDelta("MNT_ACADEMIC", 0.2);
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 1.0, 0, 100);
                    logs.Add("[학업] 컨디션을 유지하며 기본 학습을 진행했습니다.");
                }),
                new("exam_routine","평소 루틴","기존 루틴을 유지합니다.", (s, r, logs) =>
                {
                    logs.Add("[학업] 평소 루틴을 유지했습니다.");
                })
            },
            "exam_focus");
    }

    private DailyChoiceCard BuildInjuryChoiceCard(int day)
    {
        var id = $"year1_injury_{day}";
        return new DailyChoiceCard(
            id,
            "부상 경고",
            "팔 피로 경고가 뜹니다. 휴식을 취할까요?",
            new List<DailyChoiceOption>
            {
                new("injury_rest","휴식","회복을 우선합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel - 6.0, 0, 100);
                    s.Player.ApplyDelta("MNT_MORALE", 0.2);
                    logs.Add("[컨디션] 휴식으로 피로가 크게 감소했습니다.");
                }),
                new("injury_push","강행","출전을 강행합니다.", (s, r, logs) =>
                {
                    s._fatigueLevel = Math.Clamp(s._fatigueLevel + 4.0, 0, 100);
                    s.Player.ApplyDelta("PHY_ARM_HEALTH", -0.3);
                    s.AdjustCoachTrust(1);
                    logs.Add("[컨디션] 강행 출전으로 피로와 팔 내구도가 악화되었습니다.");
                })
            },
            "injury_rest");
    }

    private MatchSimulationState EnsureMatchState()
    {
        _activeMatch ??= new MatchSimulationState(
            Player,
            MatchLabel,
            MatchOpponent,
            _competitionLevel,
            _coach,
            _coachTrust,
            _random,
            School.Roster,
            ResolveOpponentRoster(MatchLabel, MatchOpponent),
            _yearManager.MatchIsHome);
        return _activeMatch;
    }

    private HighSchoolRoster? ResolveOpponentRoster(string matchLabel, string opponentName)
    {
        if (matchLabel.Contains("청백전", StringComparison.Ordinal))
        {
            return School.Roster;
        }

        return HighSchoolRosterRepository.LoadByTeamName(opponentName) ?? School.Roster;
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

    private static IReadOnlyList<EducationAction> BuildAcademicActions()
    {
        return new List<EducationAction>
        {
            new("lecture_listen","수업을 듣는다","집중해서 수업을 듣고 이해도를 올립니다.", AcademicSlot.Lecture, 0.6, 0.3, 0.4, 0.1),
            new("lecture_light","수업을 대충 듣는다","필요한 부분만 체크하고 피로를 관리합니다.", AcademicSlot.Lecture, 0.2, 0.1, 0.1, 0.0),
            new("lecture_sleep","잔다","수업 시간에 잠을 잡니다.", AcademicSlot.Lecture, 0.0, -0.1, -0.4, -0.1),

            new("support_extra","추가 학습을 한다","추가 학습으로 약점을 보완합니다.", AcademicSlot.Support, 0.5, 0.2, 0.3, 0.1),
            new("support_english","영어 회화를 한다","회화 수업으로 집중과 자신감을 올립니다.", AcademicSlot.Support, 0.3, 0.3, 0.2, 0.2),
            new("support_sleep","잔다","추가 학습 대신 잠을 잡니다.", AcademicSlot.Support, 0.0, 0.0, -0.3, -0.1),

            new("study_homework","과제를 한다","과제를 수행하며 이해도를 다집니다.", AcademicSlot.Study, 0.5, 0.2, 0.4, 0.1),
            new("study_lazy","과제를 대충한다","시간은 줄이되 완성도는 낮습니다.", AcademicSlot.Study, 0.2, 0.1, 0.1, -0.1),
            new("study_sleep","잔다","과제 대신 휴식을 취합니다.", AcademicSlot.Study, 0.0, 0.0, -0.4, 0.1)
        };
    }

    private static IReadOnlyList<TrainingRoutineTemplate> BuildRoutineTemplates(IReadOnlyList<DailyAction> actions)
    {
        DailyAction Pick(string id)
            => actions.FirstOrDefault(a => a.Id.Equals(id, StringComparison.OrdinalIgnoreCase)) ?? actions.First();

        return new List<TrainingRoutineTemplate>
        {
            new(
                "routine_balanced",
                "밸런스 루틴",
                "기본 균형 루틴",
                "균형",
                "근력·제구·멘탈을 균형 있게 관리합니다.",
                Pick("train_strength"),
                Pick("command_bullpen"),
                Pick("mental_care"),
                false),
            new(
                "routine_command",
                "제구 특화",
                "제구 안정화",
                "제구",
                "불펜 중심으로 제구와 커맨드를 끌어올립니다.",
                Pick("command_bullpen"),
                Pick("changeup_lab"),
                Pick("active_rest"),
                false),
            new(
                "routine_power",
                "파워 강화",
                "하체 폭발력",
                "체력",
                "하체와 구속을 집중 강화합니다.",
                Pick("train_strength"),
                Pick("team_scrimmage"),
                Pick("active_rest"),
                false)
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
    int OutsTarget,
    bool OnFirst,
    bool OnSecond,
    bool OnThird);

public sealed record MatchScoreboardSnapshot(
    string HomeLabel,
    string GuestLabel,
    IReadOnlyList<ScoreboardInning> Innings,
    int HomeRuns,
    int HomeHits,
    int HomeErrors,
    int GuestRuns,
    int GuestHits,
    int GuestErrors);

public sealed record MatchPitchingLine(
    int OutsRecorded,
    int RunsAllowed,
    int HitsAllowed,
    int WalksAllowed,
    int Strikeouts,
    int Pitches);

public sealed record ScoreboardInning(int Inning, int? HomeRuns, int? GuestRuns);

public sealed record MatchLineupSnapshot(
    string HomeLabel,
    string GuestLabel,
    IReadOnlyList<MatchLineupEntry> Home,
    IReadOnlyList<MatchLineupEntry> Guest);

public sealed record MatchLineupEntry(
    int Order,
    string Name,
    string Bats,
    string Archetype,
    double Contact,
    double Power,
    double Eye,
    double Rating);

public sealed record MatchRosterSnapshot(
    string HomeLabel,
    string GuestLabel,
    IReadOnlyList<MatchRosterEntry> Home,
    IReadOnlyList<MatchRosterEntry> Guest);

public sealed record MatchRosterEntry(
    string Name,
    int Year,
    string Position,
    string RoleLabel,
    string Bats,
    string Throws);

public enum PitchEventType
{
    Unknown,
    CalledStrike,
    SwingingStrike,
    Strikeout,
    Foul,
    Ball,
    Walk,
    BallInPlayOut,
    BallInPlayHit
}

public sealed record MatchPitchResult(string LogLine, MatchSnapshot Snapshot, CoachHookPrompt? HookPrompt = null, string ZoneKey = "", PitchEventType EventType = PitchEventType.Unknown);

public sealed record CoachHookPrompt(string CoachName, string Message);

public readonly struct CoachDecisionResult
{
    public CoachDecisionResult(bool resolved, bool matchEnded, bool playerPulled, MatchSnapshot? snapshot, string logLine)
    {
        Resolved = resolved;
        MatchEnded = matchEnded;
        PlayerPulled = playerPulled;
        Snapshot = snapshot;
        LogLine = logLine;
    }

    public bool Resolved { get; }
    public bool MatchEnded { get; }
    public bool PlayerPulled { get; }
    public MatchSnapshot? Snapshot { get; }
    public string LogLine { get; }

    public static CoachDecisionResult None => new(false, false, false, null, string.Empty);
}

internal sealed class MatchSimulationState
{
    private enum HalfInning
    {
        Top,
        Bottom
    }

    private enum AtBatResult
    {
        Out,
        Strikeout,
        Walk,
        Single,
        Double,
        Triple,
        HomeRun
    }

    private enum ContactType
    {
        GroundBall,
        LineDrive,
        FlyBall,
        PopUp
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
    private readonly HighSchoolRoster? _teamRoster;
    private readonly HighSchoolRoster? _opponentRoster;
    private readonly bool _isScrimmage;
    private readonly bool _isHomeTeam;
    private readonly HalfInning _playerPitchingHalf;
    private readonly List<HighSchoolRosterPlayer> _scrimmageHome = new();
    private readonly List<HighSchoolRosterPlayer> _scrimmageAway = new();
    private readonly List<LineupPlayer> _teamLineup = new();
    private readonly List<LineupPlayer> _opponentLineup = new();
    private int _teamBatIndex;
    private int _opponentBatIndex;
    private readonly int _totalInnings;
    private readonly List<int> _teamRunsByInning = new();
    private readonly List<int> _opponentRunsByInning = new();
    private int _teamHits;
    private int _opponentHits;
    private int _teamErrors;
    private int _opponentErrors;
    private double _coachTrust;
    private readonly double _stageScale;

    private int _inning = 1;
    private HalfInning _half;
    private int _outsInHalf;
    private int _totalOuts;
    private int _pitcherOutsRecorded;
    private int _balls;
    private int _strikes;
    private int _runsAllowed;
    private int _pitchCount;
    private double _staminaMeter;
    private BatterProfile? _currentBatter;
    private int _playerRuns;
    private int _walksAllowed;
    private int _strikeouts;
    private bool _awaitingHookDecision;
    private string? _pendingHookReason;

    public MatchSimulationState(
        PlayerProfile player,
        string matchLabel,
        string opponent,
        CompetitionLevel level,
        CoachProfile coach,
        double coachTrust,
        Random random,
        HighSchoolRoster? teamRoster,
        HighSchoolRoster? opponentRoster,
        bool isHomeTeam)
    {
        _player = player;
        _pitcherName = player.Name;
        _matchLabel = matchLabel;
        _opponent = opponent;
        _targetOuts = GetTargetOuts(level);
        _totalInnings = Math.Max(1, _targetOuts / 3);
        _staminaMax = Math.Max(20, player.GetStatValue("PHY_STAMINA"));
        _staminaMeter = _staminaMax;
        _pitcherCommand = player.GetStatValue("SKL_COMMAND");
        _pitcherFocus = player.GetStatValue("MNT_FOCUS");
        _random = random;
        _balance = MatchBalanceProfile.For(level);
        _coach = coach;
        _coachTrust = coachTrust;
        _stageScale = GetStageScale(level);
        _teamRoster = teamRoster;
        _opponentRoster = opponentRoster;
        _isHomeTeam = isHomeTeam;
        _playerPitchingHalf = _isHomeTeam ? HalfInning.Top : HalfInning.Bottom;
        _half = _playerPitchingHalf;
        _isScrimmage = matchLabel.Contains("청백전", StringComparison.Ordinal);
        if (_isScrimmage && _teamRoster is not null)
        {
            BuildScrimmagePools(_teamRoster);
        }

        BuildLineups();
        for (var i = 0; i < _totalInnings; i++)
        {
            _teamRunsByInning.Add(0);
            _opponentRunsByInning.Add(0);
        }

        if (!_isHomeTeam)
        {
            SimulateTeamOffense();
        }
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
            _targetOuts,
            _bases[0],
            _bases[1],
            _bases[2]);
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

        var normalizedBase = NormalizeTo100(baseSkill);
        var normalizedCommand = NormalizeTo100(_pitcherCommand);
        var normalizedStamina = NormalizeTo100(_staminaMax);
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
        return normalizedBase * 0.5 + normalizedCommand * 0.25 + normalizedStamina * 0.05 + nerves * 0.1 + zoneMod + intentMod - fatiguePenalty + randomSwing + _balance.QualityBonus;
    }

    private double NormalizeTo100(double value)
    {
        var scale = Math.Max(1, _stageScale);
        return value / scale * 100;
    }

    private static double GetStageScale(CompetitionLevel level) => level switch
    {
        CompetitionLevel.HighSchool => 30,
        CompetitionLevel.University => 50,
        CompetitionLevel.Independent => 50,
        CompetitionLevel.ProKbo => 100,
        CompetitionLevel.ProMlb => 100,
        _ => 50
    };

    private static int GetTargetOuts(CompetitionLevel level) => level switch
    {
        CompetitionLevel.HighSchool => 27,
        CompetitionLevel.University => 27,
        CompetitionLevel.Independent => 27,
        CompetitionLevel.ProKbo => 27,
        CompetitionLevel.ProMlb => 27,
        _ => 27
    };

    private PitchOutcome ApplyOutcome(double quality, string pitch, string zone, string intent)
    {
        var batter = _currentBatter;
        if (batter is null)
        {
            return new PitchOutcome("타자 정보가 없어 투구를 처리할 수 없습니다.", false, PitchEventType.Unknown);
        }

        string prefix = $"[{pitch}/{zone}/{intent}]";
        var normalizedContact = NormalizeTo100(batter.Contact);
        var normalizedPower = NormalizeTo100(batter.Power);
        var normalizedEye = NormalizeTo100(batter.Eye);

        var zoneBias = 0.0;
        if (!string.IsNullOrWhiteSpace(zone))
        {
            if (zone.Contains("코너", StringComparison.Ordinal) || zone.Contains("인코스", StringComparison.Ordinal) || zone.Contains("아웃코스", StringComparison.Ordinal))
            {
                zoneBias -= 0.06;
            }
            else if (zone.Contains("중앙", StringComparison.Ordinal))
            {
                zoneBias += 0.05;
            }
        }

        if (!string.IsNullOrWhiteSpace(intent))
        {
            if (intent.Contains("승부", StringComparison.Ordinal))
            {
                zoneBias += 0.05;
            }
            else if (intent.Contains("유인", StringComparison.Ordinal))
            {
                zoneBias -= 0.08;
            }
        }

        var zoneChance = 0.5 + (quality - 50) / 110.0 + zoneBias + _balance.ZoneBias;
        zoneChance = Math.Clamp(zoneChance, 0.2, 0.85);
        var inZone = _random.NextDouble() < zoneChance;

        var swingChance = inZone
            ? 0.6 + (50 - normalizedEye) / 220.0 + (quality - 50) / 280.0
            : 0.22 - (normalizedEye - 50) / 220.0 + (quality - 50) / 600.0;
        swingChance += _balance.SwingBias;
        swingChance = Math.Clamp(swingChance, 0.12, 0.75);
        var swung = _random.NextDouble() < swingChance;

        if (!swung)
        {
            if (inZone)
            {
                var wasTwoStrikes = _strikes >= 2;
                RegisterStrike();
                if (wasTwoStrikes)
                {
                    return new PitchOutcome($"{prefix} 루킹 삼진! 완벽한 결정구입니다.", true, PitchEventType.Strikeout);
                }

                return new PitchOutcome($"{prefix} 루킹 스트라이크! 카운트를 선점합니다.", false, PitchEventType.CalledStrike);
            }

            if (RegisterBall())
            {
                return new PitchOutcome($"{prefix} 볼넷 허용, 주자가 밀려 나갑니다.", true, PitchEventType.Walk);
            }

            return new PitchOutcome($"{prefix} 볼 판정. 카운트가 불리해집니다.", false, PitchEventType.Ball);
        }

        var contactChance = 0.52 + (normalizedContact - quality) / 170.0 + (normalizedEye - 50) / 450.0;
        contactChance += _balance.ContactBias;
        contactChance = Math.Clamp(contactChance, 0.2, 0.88);
        if (_random.NextDouble() > contactChance)
        {
            var wasTwoStrikes = _strikes >= 2;
            RegisterStrike();
            if (wasTwoStrikes)
            {
                return new PitchOutcome($"{prefix} 헛스윙 삼진! 타자가 속았습니다.", true, PitchEventType.Strikeout);
            }

            return new PitchOutcome($"{prefix} 헛스윙! 스트라이크를 추가합니다.", false, PitchEventType.SwingingStrike);
        }

        var foulChance = 0.14 + (quality - normalizedContact) / 260.0 + _balance.FoulBias;
        foulChance = Math.Clamp(foulChance, 0.04, 0.24);
        if (_random.NextDouble() < foulChance)
        {
            RegisterFoul();
            return new PitchOutcome($"{prefix} 파울. 승부가 길어집니다.", false, PitchEventType.Foul);
        }

        var inPlayScore = normalizedContact + normalizedPower * 0.6;
        var hitChance = 0.24 + (inPlayScore - quality) / 210.0 + _balance.HitBias;
        hitChance = Math.Clamp(hitChance, 0.12, 0.42);

        if (_random.NextDouble() < hitChance)
        {
            var extraBaseChance = 0.09 + (normalizedPower - 50) / 300.0 + _balance.ExtraBaseBias;
            extraBaseChance = Math.Clamp(extraBaseChance, 0.04, 0.2);
            var homerChance = 0.012 + (normalizedPower - 60) / 420.0 + _balance.HomerBias;
            homerChance = Math.Clamp(homerChance, 0.008, 0.06);
            var roll = _random.NextDouble();
            int bases;
            string label;
            if (roll < homerChance)
            {
                bases = 4;
                label = "홈런";
            }
            else if (roll < homerChance + extraBaseChance * 0.2)
            {
                bases = 3;
                label = "3루타";
            }
            else if (roll < homerChance + extraBaseChance * 0.7)
            {
                bases = 2;
                label = "2루타";
            }
            else
            {
                bases = 1;
                label = "안타";
            }

            _opponentHits++;
            AdvanceRunnersOnHit(bases);
            ResetCount();
            return new PitchOutcome($"{prefix} {label} 허용! 주자가 출루합니다.", true, PitchEventType.BallInPlayHit);
        }

        var contactType = RollContactType();
        return ResolveBallInPlayOut(contactType, prefix);
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
        _strikeouts++;
        RegisterOut();
    }

    private void RegisterFoul()
    {
        if (_strikes < 2)
        {
            _strikes++;
        }
    }

    private bool RegisterBall()
    {
        _balls++;
        if (_balls >= 4)
        {
            RegisterWalk();
            return true;
        }

        return false;
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
        var playerPulled = false;

        if (accept)
        {
            _totalOuts = _targetOuts;
            snapshot = CreateSnapshot();
            playerPulled = true;
        }

        _pendingHookReason = null;
        return new CoachDecisionResult(true, accept, playerPulled, snapshot, log);
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
        _pitcherOutsRecorded++;
        if (_outsInHalf >= 3)
        {
            _outsInHalf = 0;
            ResetCount();
            Array.Clear(_bases, 0, _bases.Length);
            if (_half == _playerPitchingHalf)
            {
                if (_playerPitchingHalf == HalfInning.Top)
                {
                    _half = HalfInning.Bottom;
                    SimulateTeamOffense();
                    _half = HalfInning.Top;
                    _inning++;
                }
                else
                {
                    _half = HalfInning.Top;
                    _inning++;
                    SimulateTeamOffense();
                    _half = HalfInning.Bottom;
                }
            }
        }
    }

    private void RegisterOuts(int outs)
    {
        var remaining = Math.Max(0, Math.Min(outs, 3 - _outsInHalf));
        for (var i = 0; i < remaining; i++)
        {
            var inningBefore = _inning;
            var halfBefore = _half;
            RegisterOut();
            if (_inning != inningBefore || _half != halfBefore)
            {
                break;
            }
        }
    }

    private ContactType RollContactType()
    {
        var roll = _random.NextDouble();
        if (roll < 0.45)
        {
            return ContactType.GroundBall;
        }

        if (roll < 0.75)
        {
            return ContactType.FlyBall;
        }

        if (roll < 0.92)
        {
            return ContactType.LineDrive;
        }

        return ContactType.PopUp;
    }

    private PitchOutcome ResolveBallInPlayOut(ContactType type, string prefix)
    {
        ResetCount();
        if (_random.NextDouble() < _balance.ErrorRate)
        {
            _teamErrors++;
            AdvanceRunners(1);
            return new PitchOutcome($"{prefix} 수비 실책! 타자가 살아나갑니다.", true, PitchEventType.BallInPlayHit);
        }

        if (type == ContactType.GroundBall && _bases[0] && _outsInHalf < 2)
        {
            var doublePlayChance = _balance.DoublePlayRate + (_bases[1] ? 0.05 : 0);
            if (_random.NextDouble() < doublePlayChance)
            {
                _bases[0] = false;
                RegisterOuts(2);
                return new PitchOutcome($"{prefix} 병살타! 아웃 카운트가 빠르게 늘어납니다.", true, PitchEventType.BallInPlayOut);
            }
        }

        if ((type == ContactType.FlyBall || type == ContactType.LineDrive) && _bases[2] && _outsInHalf < 2)
        {
            if (_random.NextDouble() < _balance.SacFlyRate)
            {
                _bases[2] = false;
                AddOpponentRun(1);
                RegisterOuts(1);
                return new PitchOutcome($"{prefix} 희생플라이로 1점을 내줍니다.", true, PitchEventType.BallInPlayOut);
            }
        }

        if (type == ContactType.GroundBall && _bases[1] && !_bases[2] && _random.NextDouble() < 0.25)
        {
            _bases[1] = false;
            _bases[2] = true;
        }

        RegisterOuts(1);
        return new PitchOutcome($"{prefix} 인플레이 아웃으로 마무리합니다.", true, PitchEventType.BallInPlayOut);
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
                AddOpponentRun(1);
            }
            else
            {
                _bases[next] = true;
            }
        }

        var batterIndex = bases - 1;
        if (batterIndex >= _bases.Length)
        {
            AddOpponentRun(1);
        }
        else if (batterIndex >= 0)
        {
            _bases[batterIndex] = true;
        }
    }

    private void AdvanceRunnersOnHit(int bases)
    {
        if (bases >= 4)
        {
            var runs = 1 + _bases.Count(b => b);
            Array.Clear(_bases, 0, _bases.Length);
            AddOpponentRun(runs);
            return;
        }

        AdvanceRunners(bases);
    }

    private void AddOpponentRun(int runs)
    {
        if (runs <= 0) return;
        _runsAllowed += runs;
        var inningIndex = Math.Clamp(_inning - 1, 0, _totalInnings - 1);
        _opponentRunsByInning[inningIndex] += runs;
    }

    private void ResetCount()
    {
        _balls = 0;
        _strikes = 0;
    }

    private void SimulateTeamOffense()
    {
        var pitcherRating = GetOpponentPitchingRating();
        if (pitcherRating <= 0)
        {
            pitcherRating = Math.Max(1, _stageScale) * 0.55;
        }

        var (runs, hits) = SimulateHalfInning(_teamLineup, ref _teamBatIndex, pitcherRating);
        _playerRuns += runs;
        _teamHits += hits;
        var inningIndex = Math.Clamp(_inning - 1, 0, _totalInnings - 1);
        _teamRunsByInning[inningIndex] += runs;
    }

    private (int Runs, int Hits) SimulateHalfInning(IReadOnlyList<LineupPlayer> lineup, ref int batterIndex, double pitcherRating)
    {
        if (lineup.Count == 0)
        {
            return (0, 0);
        }

        var outs = 0;
        var runs = 0;
        var hits = 0;
        var bases = new bool[3];

        while (outs < 3)
        {
            var batter = lineup[batterIndex % lineup.Count];
            batterIndex++;

            var result = ResolveAtBat(batter, pitcherRating);
            switch (result)
            {
                case AtBatResult.Walk:
                    AdvanceRunners(bases, 1, ref runs);
                    break;
                case AtBatResult.Single:
                    hits++;
                    AdvanceRunners(bases, 1, ref runs);
                    break;
                case AtBatResult.Double:
                    hits++;
                    AdvanceRunners(bases, 2, ref runs);
                    break;
                case AtBatResult.Triple:
                    hits++;
                    AdvanceRunners(bases, 3, ref runs);
                    break;
                case AtBatResult.HomeRun:
                    hits++;
                    runs += 1 + bases.Count(b => b);
                    Array.Clear(bases, 0, bases.Length);
                    break;
                case AtBatResult.Strikeout:
                    outs++;
                    break;
                case AtBatResult.Out:
                default:
                    if (_random.NextDouble() < _balance.ErrorRate)
                    {
                        _opponentErrors++;
                        AdvanceRunners(bases, 1, ref runs);
                        break;
                    }

                    if (outs < 2 && bases[0] && _random.NextDouble() < _balance.DoublePlayRate)
                    {
                        bases[0] = false;
                        outs += Math.Min(2, 3 - outs);
                        break;
                    }

                    if (outs < 2 && bases[2] && _random.NextDouble() < _balance.SacFlyRate)
                    {
                        bases[2] = false;
                        runs++;
                        outs++;
                        break;
                    }

                    if (bases[1] && !bases[2] && _random.NextDouble() < 0.25)
                    {
                        bases[1] = false;
                        bases[2] = true;
                    }

                    outs++;
                    break;
            }
        }

        return (runs, hits);
    }

    private AtBatResult ResolveAtBat(LineupPlayer batter, double pitcherRating)
    {
        var contact = batter.Contact;
        var power = batter.Power;
        var eye = batter.Eye;

        var normalizedPitch = pitcherRating / Math.Max(1, _stageScale) * 100;
        var normalizedContact = contact / Math.Max(1, _stageScale) * 100;
        var normalizedPower = power / Math.Max(1, _stageScale) * 100;
        var normalizedEye = eye / Math.Max(1, _stageScale) * 100;

        var walkChance = 0.06 + (normalizedEye - normalizedPitch) / 350.0;
        var strikeoutChance = 0.18 + (normalizedPitch - normalizedContact) / 280.0;
        var hitChance = 0.20 + (normalizedContact - normalizedPitch) / 240.0 + _balance.HitBias;
        var extraChance = 0.08 + (normalizedPower - normalizedPitch) / 320.0 + _balance.ExtraBaseBias;

        walkChance = Math.Clamp(walkChance, 0.03, 0.15);
        strikeoutChance = Math.Clamp(strikeoutChance, 0.08, 0.32);
        hitChance = Math.Clamp(hitChance, 0.12, 0.38);
        extraChance = Math.Clamp(extraChance, 0.04, 0.22);

        var roll = _random.NextDouble();
        if (roll < walkChance)
        {
            return AtBatResult.Walk;
        }

        roll -= walkChance;
        if (roll < strikeoutChance)
        {
            return AtBatResult.Strikeout;
        }

        roll -= strikeoutChance;
        if (roll < hitChance)
        {
            var extraRoll = _random.NextDouble();
            if (extraRoll < extraChance * (0.18 + _balance.HomerBias))
            {
                return AtBatResult.HomeRun;
            }
            if (extraRoll < extraChance * 0.6)
            {
                return AtBatResult.Double;
            }
            if (extraRoll < extraChance * 0.8)
            {
                return AtBatResult.Triple;
            }
            return AtBatResult.Single;
        }

        return AtBatResult.Out;
    }

    private static void AdvanceRunners(bool[] bases, int advance, ref int runs)
    {
        for (var i = bases.Length - 1; i >= 0; i--)
        {
            if (!bases[i]) continue;
            var next = i + advance;
            bases[i] = false;
            if (next >= bases.Length)
            {
                runs++;
            }
            else
            {
                bases[next] = true;
            }
        }

        var batterIndex = advance - 1;
        if (batterIndex >= bases.Length)
        {
            runs++;
        }
        else if (batterIndex >= 0)
        {
            bases[batterIndex] = true;
        }
    }

    private double GetTeamBattingRating()
    {
        if (_teamLineup.Count > 0)
        {
            return _teamLineup.Average(p => p.BattingRating);
        }

        var roster = _teamRoster;
        if (roster?.Varsity is null || roster.Varsity.Count == 0)
        {
            return -1;
        }

        var keyPool = new[] { "컨택", "장타력", "선구안", "배트 스피드", "상황대응" };
        var total = 0.0;
        var count = 0;

        foreach (var player in roster.Varsity)
        {
            if (player?.Stats?.Batting is null) continue;
            foreach (var key in keyPool)
            {
                if (player.Stats.Batting.TryGetValue(key, out var value))
                {
                    total += value;
                    count++;
                }
            }
        }

        return count > 0 ? total / count : -1;
    }

    private void BuildLineups()
    {
        var teamCandidates = _isScrimmage
            ? _scrimmageHome
            : GetRosterPlayers(_teamRoster);

        var opponentCandidates = _isScrimmage
            ? _scrimmageAway
            : GetRosterPlayers(_opponentRoster);

        _teamLineup.AddRange(BuildLineupFromRoster(teamCandidates));
        EnsureTeamLineupContainsPlayer();
        _opponentLineup.AddRange(BuildLineupFromRoster(opponentCandidates));
    }

    private static List<HighSchoolRosterPlayer> GetRosterPlayers(HighSchoolRoster? roster)
    {
        if (roster is null)
        {
            return new List<HighSchoolRosterPlayer>();
        }

        return roster.Varsity.Concat(roster.Junior).Where(p => p is not null).ToList();
    }

    private List<LineupPlayer> BuildLineupFromRoster(IReadOnlyList<HighSchoolRosterPlayer> players)
    {
        var candidates = new List<LineupPlayer>();
        foreach (var player in players)
        {
            var stats = player.Stats?.Batting;
            if (stats is null || stats.Count == 0)
            {
                continue;
            }

            var contact = AverageStat(stats, new[] { "컨택", "배트 스피드", "상황대응" });
            var power = GetStat(stats, "장타력", contact);
            var eye = GetStat(stats, "선구안", contact);
            var rating = contact * 0.5 + power * 0.3 + eye * 0.2;

            var archetype = power >= contact + 3
                ? "거포"
                : eye >= contact + 2
                    ? "선구안"
                    : "교타자";

            var bats = string.IsNullOrWhiteSpace(player.Bats) ? "우타" : player.Bats;
            candidates.Add(new LineupPlayer(player.Name, bats, archetype, player.AcademicYear, contact, power, eye, rating));
        }

        return candidates
            .OrderByDescending(c => c.BattingRating)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Take(9)
            .ToList();
    }

    private void EnsureTeamLineupContainsPlayer()
    {
        if (_teamLineup.Any(p => p.Name.Equals(_player.Name, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        var playerEntry = BuildLineupPlayerFromProfile();
        _teamLineup.Add(playerEntry);

        var ordered = _teamLineup
            .OrderByDescending(c => c.BattingRating)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ordered.Count > 9)
        {
            if (!ordered.Take(9).Any(p => p.Name.Equals(_player.Name, StringComparison.OrdinalIgnoreCase)))
            {
                ordered = ordered.Take(8).Concat(new[] { playerEntry }).ToList();
            }
            else
            {
                ordered = ordered.Take(9).ToList();
            }
        }

        _teamLineup.Clear();
        _teamLineup.AddRange(ordered);
    }

    private LineupPlayer BuildLineupPlayerFromProfile()
    {
        var contact = ClampBattingValue((_player.GetStatValue("MNT_FOCUS") + _player.GetStatValue("PHY_MOBILITY")) / 2.0);
        var power = ClampBattingValue((_player.GetStatValue("PHY_POWER") + _player.GetStatValue("PHY_LEG_DRIVE")) / 2.0);
        var eye = ClampBattingValue(_player.GetStatValue("MNT_FOCUS") * 0.6 + _player.GetStatValue("MNT_MORALE") * 0.4);
        var rating = contact * 0.5 + power * 0.3 + eye * 0.2;

        var archetype = power >= contact + 3
            ? "거포"
            : eye >= contact + 2
                ? "선구안"
                : "교타자";

        return new LineupPlayer(_player.Name, "우타", archetype, _player.AcademicYear, contact, power, eye, rating);
    }

    private double ClampBattingValue(double value)
        => Math.Clamp(value, 5, 35);

    private double GetOpponentPitchingRating()
    {
        var candidates = _isScrimmage
            ? _scrimmageAway
            : GetRosterPlayers(_opponentRoster);

        if (candidates.Count == 0)
        {
            return -1;
        }

        var pitchers = candidates
            .Where(p => p.Position.Contains("P", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (pitchers.Count == 0)
        {
            pitchers = candidates;
        }

        var ratings = new List<double>();
        foreach (var player in pitchers)
        {
            var stats = player.Stats?.Pitching;
            if (stats is null || stats.Count == 0)
            {
                continue;
            }

            var rating = AverageStat(stats, new[] { "패스트볼", "커맨드", "무브먼트", "세컨더리", "체인지업", "슬라이더" });
            ratings.Add(rating);
        }

        if (ratings.Count == 0)
        {
            return -1;
        }

        return ratings.OrderByDescending(r => r).Take(3).Average();
    }

    private static double AverageStat(IReadOnlyDictionary<string, int> stats, IReadOnlyList<string> keys)
    {
        var total = 0.0;
        var count = 0;
        foreach (var key in keys)
        {
            if (stats.TryGetValue(key, out var value))
            {
                total += value;
                count++;
            }
        }

        return count > 0 ? total / count : 0;
    }

    private static double GetStat(IReadOnlyDictionary<string, int> stats, string key, double fallback)
        => stats.TryGetValue(key, out var value) ? value : fallback;

    public MatchScoreboardSnapshot BuildScoreboardSnapshot()
    {
        var innings = new List<ScoreboardInning>();
        for (var i = 0; i < _totalInnings; i++)
        {
            bool opponentComplete;
            bool teamComplete;

            if (_playerPitchingHalf == HalfInning.Top)
            {
                opponentComplete = i < _inning - 1 || (i == _inning - 1 && _half == HalfInning.Bottom);
                teamComplete = i < _inning - 1;
            }
            else
            {
                opponentComplete = i < _inning - 1 || (i == _inning - 1 && _half == HalfInning.Top);
                teamComplete = i < _inning - 1 || (i == _inning - 1 && _half == HalfInning.Bottom);
            }

            var teamRuns = teamComplete ? _teamRunsByInning[i] : (int?)null;
            var opponentRuns = opponentComplete ? _opponentRunsByInning[i] : (int?)null;

            var homeRuns = _isHomeTeam ? teamRuns : opponentRuns;
            var guestRuns = _isHomeTeam ? opponentRuns : teamRuns;

            innings.Add(new ScoreboardInning(i + 1, homeRuns, guestRuns));
        }

        var homeRunsTotal = _isHomeTeam ? _playerRuns : _runsAllowed;
        var guestRunsTotal = _isHomeTeam ? _runsAllowed : _playerRuns;
        var homeHits = _isHomeTeam ? _teamHits : _opponentHits;
        var guestHits = _isHomeTeam ? _opponentHits : _teamHits;
        var homeErrors = _isHomeTeam ? _teamErrors : _opponentErrors;
        var guestErrors = _isHomeTeam ? _opponentErrors : _teamErrors;

        return new MatchScoreboardSnapshot(
            GetHomeLabel(),
            GetGuestLabel(),
            innings,
            homeRunsTotal,
            homeHits,
            homeErrors,
            guestRunsTotal,
            guestHits,
            guestErrors);
    }

    public MatchPitchingLine BuildPitchingLine()
        => new(_pitcherOutsRecorded, _runsAllowed, _opponentHits, _walksAllowed, _strikeouts, _pitchCount);

    public MatchLineupSnapshot BuildLineupSnapshot()
    {
        var teamLineup = _teamLineup
            .Select((p, idx) => new MatchLineupEntry(idx + 1, p.Name, p.Bats, p.Archetype, p.Contact, p.Power, p.Eye, p.BattingRating))
            .ToList();
        var opponentLineup = _opponentLineup
            .Select((p, idx) => new MatchLineupEntry(idx + 1, p.Name, p.Bats, p.Archetype, p.Contact, p.Power, p.Eye, p.BattingRating))
            .ToList();

        var home = _isHomeTeam ? teamLineup : opponentLineup;
        var guest = _isHomeTeam ? opponentLineup : teamLineup;

        return new MatchLineupSnapshot(GetHomeLabel(), GetGuestLabel(), home, guest);
    }

    public MatchRosterSnapshot BuildRosterSnapshot()
    {
        var teamRoster = BuildRosterEntries(_isScrimmage ? _scrimmageHome : GetRosterPlayers(_teamRoster));
        var opponentRoster = BuildRosterEntries(_isScrimmage ? _scrimmageAway : GetRosterPlayers(_opponentRoster));
        EnsurePlayerInRosterEntries(teamRoster);

        var homeRoster = _isHomeTeam ? teamRoster : opponentRoster;
        var guestRoster = _isHomeTeam ? opponentRoster : teamRoster;
        return new MatchRosterSnapshot(GetHomeLabel(), GetGuestLabel(), homeRoster, guestRoster);
    }

    private static List<MatchRosterEntry> BuildRosterEntries(IReadOnlyList<HighSchoolRosterPlayer> players)
        => players
            .Select(p => new MatchRosterEntry(
                p.Name,
                p.AcademicYear,
                p.Position,
                p.RoleLabel,
                string.IsNullOrWhiteSpace(p.Bats) ? "-" : p.Bats,
                string.IsNullOrWhiteSpace(p.Throws) ? "-" : p.Throws))
            .ToList();

    private void EnsurePlayerInRosterEntries(ICollection<MatchRosterEntry> homeRoster)
    {
        if (homeRoster.Any(e => e.Name.Equals(_player.Name, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        homeRoster.Add(BuildRosterEntryFromProfile());
    }

    private MatchRosterEntry BuildRosterEntryFromProfile()
    {
        var throwsHand = _player.Position.Contains("좌완", StringComparison.OrdinalIgnoreCase)
            ? "좌투"
            : _player.Position.Contains("우완", StringComparison.OrdinalIgnoreCase)
                ? "우투"
                : "-";

        return new MatchRosterEntry(
            _player.Name,
            _player.AcademicYear,
            _player.Position,
            _player.PreferredRole,
            "우타",
            throwsHand);
    }

    private string GetHomeLabel()
    {
        if (_isScrimmage)
        {
            return $"{_teamRoster?.TeamName ?? "홈"} 청팀";
        }

        if (_isHomeTeam)
        {
            return _teamRoster?.TeamName ?? "HOME";
        }

        return string.IsNullOrWhiteSpace(_opponent) ? "HOME" : _opponent;
    }

    private string GetGuestLabel()
    {
        if (_isScrimmage)
        {
            return $"{_teamRoster?.TeamName ?? "어웨이"} 백팀";
        }

        if (_isHomeTeam)
        {
            return string.IsNullOrWhiteSpace(_opponent) ? "GUEST" : _opponent;
        }

        return _teamRoster?.TeamName ?? "GUEST";
    }

    private void BuildScrimmagePools(HighSchoolRoster roster)
    {
        _scrimmageHome.Clear();
        _scrimmageAway.Clear();
        var allPlayers = roster.Varsity
            .Concat(roster.Junior)
            .Where(p => p is not null)
            .ToList();

        var groups = allPlayers
            .GroupBy(p => p.AcademicYear)
            .OrderBy(g => g.Key);

        foreach (var group in groups)
        {
            var list = group.ToList();
            Shuffle(list);
            DistributeScrimmageGroup(list);
        }

        EnsureScrimmageMinimum(allPlayers);
        EnsureScrimmagePitchers(allPlayers);
    }

    private void DistributeScrimmageGroup(IReadOnlyList<HighSchoolRosterPlayer> players)
    {
        if (players.Count == 0)
        {
            return;
        }

        var giveExtraToHome = _scrimmageHome.Count <= _scrimmageAway.Count;
        var homeTarget = players.Count / 2 + (giveExtraToHome && players.Count % 2 == 1 ? 1 : 0);

        for (var i = 0; i < players.Count; i++)
        {
            if (i < homeTarget)
            {
                _scrimmageHome.Add(players[i]);
            }
            else
            {
                _scrimmageAway.Add(players[i]);
            }
        }
    }

    private void EnsureScrimmageMinimum(IReadOnlyList<HighSchoolRosterPlayer> allPlayers)
    {
        if (_scrimmageHome.Count >= 9 && _scrimmageAway.Count >= 9)
        {
            return;
        }

        var pooled = allPlayers.ToList();
        Shuffle(pooled);
        _scrimmageHome.Clear();
        _scrimmageAway.Clear();

        var giveExtraToHome = true;
        var homeTarget = pooled.Count / 2 + (pooled.Count % 2 == 1 && giveExtraToHome ? 1 : 0);
        for (var i = 0; i < pooled.Count; i++)
        {
            if (i < homeTarget)
            {
                _scrimmageHome.Add(pooled[i]);
            }
            else
            {
                _scrimmageAway.Add(pooled[i]);
            }
        }
    }

    private void EnsureScrimmagePitchers(IReadOnlyList<HighSchoolRosterPlayer> allPlayers)
    {
        if (allPlayers.Count(p => IsPitcher(p)) < 2)
        {
            return;
        }

        if (CountPitchers(_scrimmageHome) == 0)
        {
            SwapPitcher(_scrimmageAway, _scrimmageHome);
        }

        if (CountPitchers(_scrimmageAway) == 0)
        {
            SwapPitcher(_scrimmageHome, _scrimmageAway);
        }
    }

    private static bool IsPitcher(HighSchoolRosterPlayer player)
        => player.Position.Contains("P", StringComparison.OrdinalIgnoreCase);

    private static int CountPitchers(IReadOnlyList<HighSchoolRosterPlayer> players)
        => players.Count(IsPitcher);

    private static void SwapPitcher(ICollection<HighSchoolRosterPlayer> from, ICollection<HighSchoolRosterPlayer> to)
    {
        var pitcher = from.FirstOrDefault(IsPitcher);
        var nonPitcher = to.FirstOrDefault(p => !IsPitcher(p));
        if (pitcher is null || nonPitcher is null)
        {
            return;
        }

        from.Remove(pitcher);
        to.Add(pitcher);
        to.Remove(nonPitcher);
        from.Add(nonPitcher);
    }

    private void Shuffle<T>(IList<T> list)
    {
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = _random.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
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
        _currentBatter ??= CreateOpponentBatter();
    }

    private void NextBatter()
    {
        _currentBatter = CreateOpponentBatter();
    }

    private BatterProfile CreateOpponentBatter()
    {
        if (_opponentLineup.Count > 0)
        {
            var batter = _opponentLineup[_opponentBatIndex % _opponentLineup.Count];
            _opponentBatIndex++;
            var threatScore = batter.Contact * 0.4 + batter.Power * 0.4 + batter.Eye * 0.2;
            var threatLabel = threatScore switch
            {
                > 65 => "위험",
                > 50 => "주의",
                _ => "보통"
            };
            return new BatterProfile(batter.Name, batter.Bats, batter.Archetype, batter.Contact, batter.Power, batter.Eye, threatLabel);
        }

        var namePool = new[] { "김현수", "박진우", "최강민", "이도윤", "정태민", "한기현", "유진호", "문승호" };
        var hand = _random.NextDouble() < 0.35 ? "좌타" : "우타";
        var archetypes = new[] { "교타자", "거포", "콘택트", "스피드" };
        var archetype = archetypes[_random.Next(archetypes.Length)];
        var scale = Math.Max(1, _stageScale);
        double Range(double minFrac, double maxFrac) => (minFrac + _random.NextDouble() * (maxFrac - minFrac)) * scale;
        var contact = Range(0.50, 0.70);
        var power = Range(0.45, 0.65);
        var eye = Range(0.45, 0.63);
        var threatScoreFallback = contact * 0.4 + power * 0.4 + eye * 0.2;
        var threatLabelFallback = threatScoreFallback switch
        {
            > 65 => "위험",
            > 50 => "주의",
            _ => "보통"
        };
        var opponentTag = _opponent.Split(' ').FirstOrDefault() ?? _opponent;
        var name = $"{opponentTag} {namePool[_random.Next(namePool.Length)]}";
        return new BatterProfile(name, hand, archetype, contact, power, eye, threatLabelFallback);
    }

    private sealed record BatterProfile(
        string Name,
        string Handedness,
        string Archetype,
        double Contact,
        double Power,
        double Eye,
        string ThreatLabel);

    private sealed record LineupPlayer(
        string Name,
        string Bats,
        string Archetype,
        int AcademicYear,
        double Contact,
        double Power,
        double Eye,
        double BattingRating);

    private readonly struct MatchBalanceProfile
    {
        public MatchBalanceProfile(
            double qualityBonus,
            double randomSwingRange,
            int baseHookRuns,
            int baseHookWalks,
            int baseHookPitchCount,
            double zoneBias,
            double swingBias,
            double contactBias,
            double hitBias,
            double foulBias,
            double errorRate,
            double doublePlayRate,
            double sacFlyRate,
            double extraBaseBias,
            double homerBias,
            PitchOutcomeBands bands)
        {
            QualityBonus = qualityBonus;
            RandomSwingRange = randomSwingRange;
            BaseHookRuns = baseHookRuns;
            BaseHookWalks = baseHookWalks;
            BaseHookPitchCount = baseHookPitchCount;
            ZoneBias = zoneBias;
            SwingBias = swingBias;
            ContactBias = contactBias;
            HitBias = hitBias;
            FoulBias = foulBias;
            ErrorRate = errorRate;
            DoublePlayRate = doublePlayRate;
            SacFlyRate = sacFlyRate;
            ExtraBaseBias = extraBaseBias;
            HomerBias = homerBias;
            Bands = bands;
        }

        public double QualityBonus { get; }
        public double RandomSwingRange { get; }
        public int BaseHookRuns { get; }
        public int BaseHookWalks { get; }
        public int BaseHookPitchCount { get; }
        public double ZoneBias { get; }
        public double SwingBias { get; }
        public double ContactBias { get; }
        public double HitBias { get; }
        public double FoulBias { get; }
        public double ErrorRate { get; }
        public double DoublePlayRate { get; }
        public double SacFlyRate { get; }
        public double ExtraBaseBias { get; }
        public double HomerBias { get; }
        public PitchOutcomeBands Bands { get; }

        public static MatchBalanceProfile For(CompetitionLevel level) => level switch
        {
            CompetitionLevel.HighSchool => new MatchBalanceProfile(
                10, 18, 2, 3, 55,
                -0.03, -0.02, -0.04, -0.03, 0.02,
                0.05, 0.18, 0.32, -0.02, -0.01,
                PitchOutcomeBands.HighSchool),
            CompetitionLevel.University => new MatchBalanceProfile(
                7, 15, 3, 3, 70,
                -0.01, 0.0, -0.02, -0.01, 0.01,
                0.04, 0.2, 0.35, -0.01, -0.005,
                PitchOutcomeBands.University),
            CompetitionLevel.Independent => new MatchBalanceProfile(
                4, 13, 3, 4, 80,
                0.0, 0.01, 0.0, 0.0, 0.0,
                0.03, 0.22, 0.38, 0.0, 0.0,
                PitchOutcomeBands.Independent),
            CompetitionLevel.ProKbo => new MatchBalanceProfile(
                2, 11, 4, 4, 95,
                0.01, 0.02, 0.02, 0.02, -0.01,
                0.02, 0.24, 0.4, 0.01, 0.005,
                PitchOutcomeBands.ProKbo),
            CompetitionLevel.ProMlb => new MatchBalanceProfile(
                0, 9, 4, 4, 105,
                0.02, 0.03, 0.03, 0.03, -0.015,
                0.015, 0.26, 0.42, 0.02, 0.01,
                PitchOutcomeBands.ProMlb),
            _ => new MatchBalanceProfile(
                0, 12, 3, 3, 80,
                0.0, 0.0, -0.01, -0.01, 0.0,
                0.03, 0.2, 0.36, 0.0, 0.0,
                PitchOutcomeBands.University)
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

public enum HighSchoolMatchKind
{
    Scrimmage,
    Friendly,
    WeekendLeague,
    Official,
    Tournament
}

public sealed class HighSchoolSeasonTracker
{
    private readonly Dictionary<string, TeamSeasonRecord> _teamRecords = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<HighSchoolMatchRecord> _matchHistory = new();

    public HighSchoolSeasonTracker(HighSchoolProfile playerSchool, int academicYear)
    {
        PlayerSchoolId = playerSchool.Id;
        PlayerSchoolName = playerSchool.Name;
        AcademicYear = academicYear;
    }

    public int AcademicYear { get; }
    public string PlayerSchoolId { get; }
    public string PlayerSchoolName { get; }
    public IReadOnlyDictionary<string, TeamSeasonRecord> TeamRecords => _teamRecords;
    public IReadOnlyList<HighSchoolMatchRecord> MatchHistory => _matchHistory;
    public PlayerSeasonPitchingStats PlayerPitching { get; } = new();

    public TeamSeasonRecord EnsureTeam(string teamId, string teamName)
    {
        if (_teamRecords.TryGetValue(teamId, out var record))
        {
            return record;
        }

        record = new TeamSeasonRecord(teamId, teamName);
        _teamRecords[teamId] = record;
        return record;
    }

    public void RecordMatch(HighSchoolMatchRecord record)
    {
        _matchHistory.Add(record);
    }
}

public sealed class TeamSeasonRecord
{
    public TeamSeasonRecord(string teamId, string teamName)
    {
        TeamId = teamId;
        TeamName = teamName;
    }

    public string TeamId { get; }
    public string TeamName { get; }
    public int Wins { get; private set; }
    public int Losses { get; private set; }
    public int HomeWins { get; private set; }
    public int AwayWins { get; private set; }
    public int RunsFor { get; private set; }
    public int RunsAgainst { get; private set; }
    public int HitsFor { get; private set; }
    public int HitsAgainst { get; private set; }
    public int ErrorsFor { get; private set; }
    public int ErrorsAgainst { get; private set; }

    public int Games => Wins + Losses;
    public int RunDiff => RunsFor - RunsAgainst;
    public double WinRate => Games == 0 ? 0 : (double)Wins / Games;

    public void RecordGame(bool isHome, int runsFor, int runsAgainst, int hitsFor, int hitsAgainst, int errorsFor, int errorsAgainst)
    {
        if (runsFor > runsAgainst)
        {
            Wins++;
            if (isHome) HomeWins++;
            else AwayWins++;
        }
        else
        {
            Losses++;
        }

        RunsFor += runsFor;
        RunsAgainst += runsAgainst;
        HitsFor += hitsFor;
        HitsAgainst += hitsAgainst;
        ErrorsFor += errorsFor;
        ErrorsAgainst += errorsAgainst;
    }
}

public sealed class PlayerSeasonPitchingStats
{
    public int Games { get; private set; }
    public int Starts { get; private set; }
    public int OutsRecorded { get; private set; }
    public int RunsAllowed { get; private set; }
    public int HitsAllowed { get; private set; }
    public int WalksAllowed { get; private set; }
    public int Strikeouts { get; private set; }
    public int Pitches { get; private set; }
    public int Wins { get; private set; }
    public int Losses { get; private set; }

    public double InningsPitched => OutsRecorded / 3.0;
    public double Era => OutsRecorded == 0 ? 0 : RunsAllowed * 27.0 / OutsRecorded;
    public double Whip => OutsRecorded == 0 ? 0 : (HitsAllowed + WalksAllowed) * 3.0 / OutsRecorded;

    public void RecordGame(int outs, int runs, int hits, int walks, int strikeouts, int pitches, bool isWin)
    {
        Games++;
        Starts++;
        OutsRecorded += outs;
        RunsAllowed += runs;
        HitsAllowed += hits;
        WalksAllowed += walks;
        Strikeouts += strikeouts;
        Pitches += pitches;
        if (isWin) Wins++;
        else Losses++;
    }
}

public sealed record HighSchoolMatchRecord(
    int Day,
    HighSchoolMatchKind Kind,
    string HomeTeamId,
    string HomeTeamName,
    string AwayTeamId,
    string AwayTeamName,
    int HomeRuns,
    int AwayRuns,
    int HomeHits,
    int AwayHits,
    int HomeErrors,
    int AwayErrors,
    bool IsRivalry,
    string StageLabel);

public sealed record HighSchoolLeagueMatch(
    int Day,
    int Round,
    string HomeTeamId,
    string HomeTeamName,
    string AwayTeamId,
    string AwayTeamName,
    bool IsRivalry);

public sealed class HighSchoolLeagueSchedule
{
    public HighSchoolLeagueSchedule(IReadOnlyList<HighSchoolLeagueMatch> matches)
    {
        Matches = matches;
    }

    public IReadOnlyList<HighSchoolLeagueMatch> Matches { get; }

    public IReadOnlyList<HighSchoolLeagueMatch> GetMatchesForTeam(string teamId)
        => Matches.Where(m =>
                m.HomeTeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ||
                m.AwayTeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase))
            .OrderBy(m => m.Day)
            .ToList();

    public IReadOnlyList<HighSchoolLeagueMatch> GetMatchesForDay(int day)
        => Matches.Where(m => m.Day == day).ToList();

    public HighSchoolLeagueMatch? GetMatchForTeamOnDay(string teamId, int day)
        => Matches.FirstOrDefault(m => m.Day == day &&
                                      (m.HomeTeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ||
                                       m.AwayTeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase)));
}

public sealed record HighSchoolTournamentTeam(string TeamId, string TeamName);

public sealed class HighSchoolTournamentMatch
{
    public HighSchoolTournamentMatch(
        string matchId,
        int day,
        string roundLabel,
        HighSchoolTournamentTeam? home,
        HighSchoolTournamentTeam? away,
        string? homeSourceMatchId,
        string? awaySourceMatchId)
    {
        MatchId = matchId;
        Day = day;
        RoundLabel = roundLabel;
        Home = home;
        Away = away;
        HomeSourceMatchId = homeSourceMatchId;
        AwaySourceMatchId = awaySourceMatchId;
    }

    public string MatchId { get; }
    public int Day { get; }
    public string RoundLabel { get; }
    public HighSchoolTournamentTeam? Home { get; private set; }
    public HighSchoolTournamentTeam? Away { get; private set; }
    public string? HomeSourceMatchId { get; }
    public string? AwaySourceMatchId { get; }
    public HighSchoolTournamentTeam? Winner { get; private set; }

    public bool IsCompleted => Winner is not null;

    public bool HasTeam(string teamId)
        => (Home?.TeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ?? false) ||
           (Away?.TeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ?? false);

    public HighSchoolTournamentTeam? GetOpponent(string teamId)
    {
        if (Home?.TeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ?? false)
        {
            return Away;
        }

        if (Away?.TeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase) ?? false)
        {
            return Home;
        }

        return null;
    }

    public void SetHome(HighSchoolTournamentTeam team) => Home = team;
    public void SetAway(HighSchoolTournamentTeam team) => Away = team;
    public void SetWinner(HighSchoolTournamentTeam team) => Winner = team;
}

public sealed class HighSchoolTournamentRound
{
    public HighSchoolTournamentRound(string label, int day, IReadOnlyList<HighSchoolTournamentMatch> matches)
    {
        Label = label;
        Day = day;
        Matches = matches.ToList();
    }

    public string Label { get; }
    public int Day { get; }
    public List<HighSchoolTournamentMatch> Matches { get; }
}

public sealed class HighSchoolTournamentBracket
{
    private readonly List<HighSchoolTournamentRound> _rounds = new();

    public HighSchoolTournamentBracket(string id, string name, IEnumerable<HighSchoolTournamentRound> rounds)
    {
        Id = id;
        Name = name;
        _rounds.AddRange(rounds);
    }

    public string Id { get; }
    public string Name { get; }
    public IReadOnlyList<HighSchoolTournamentRound> Rounds => _rounds;

    public HighSchoolTournamentMatch? GetMatchForTeamOnDay(string teamId, int day)
    {
        return _rounds
            .SelectMany(r => r.Matches)
            .FirstOrDefault(m => m.Day == day && m.HasTeam(teamId));
    }

    public bool IsTeamEliminated(string teamId)
    {
        return _rounds
            .SelectMany(r => r.Matches)
            .Where(m => m.IsCompleted && m.HasTeam(teamId))
            .Any(m => m.Winner is not null && !m.Winner.TeamId.Equals(teamId, StringComparison.OrdinalIgnoreCase));
    }

    public void RecordResult(string matchId, HighSchoolTournamentTeam winner)
    {
        var match = _rounds.SelectMany(r => r.Matches).FirstOrDefault(m => m.MatchId == matchId);
        if (match is null || match.IsCompleted)
        {
            return;
        }

        match.SetWinner(winner);

        foreach (var next in _rounds.SelectMany(r => r.Matches))
        {
            if (next.HomeSourceMatchId == matchId)
            {
                next.SetHome(winner);
            }

            if (next.AwaySourceMatchId == matchId)
            {
                next.SetAway(winner);
            }
        }
    }
}

