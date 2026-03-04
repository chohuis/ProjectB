using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using CareerSimTextDemo.Core;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo;

public partial class MainWindow : Window
{
    private const double PitchMapWidth = 360;
    private const double PitchMapHeight = 420;
    private const double StrikeZoneLeft = 110;
    private const double StrikeZoneTop = 80;
    private const double StrikeZoneWidth = 180;
    private const double StrikeZoneHeight = 240;
    private const double PitchMarkerSize = 26;
    private const int MaxPitchMarkers = 20;

    private static readonly SolidColorBrush StrikeBrush = CreateBrush(46, 204, 113);
    private static readonly SolidColorBrush BallBrush = CreateBrush(241, 196, 15);
    private static readonly SolidColorBrush OutBrush = CreateBrush(231, 76, 60);
    private static readonly SolidColorBrush HitBrush = CreateBrush(230, 126, 34);
    private static readonly SolidColorBrush NeutralBrush = CreateBrush(149, 165, 166);

    private readonly string[] _targetZones =
    {
        "상단-인코스","상단-중앙","상단-아웃코스",
        "중단-인코스","중단-중앙","중단-아웃코스",
        "하단-인코스","하단-중앙","하단-아웃코스"
    };

    private readonly Random _simRandom = new();
    private readonly Random _pitchMarkerRandom = new();

    private GameState? _game;
    private HighSchoolProfile? _selectedSchool;
    private bool _suppressActionEvents;

    private readonly ObservableCollection<StatEntry> _physicalStats = new();
    private readonly ObservableCollection<StatEntry> _technicalStats = new();
    private readonly ObservableCollection<StatEntry> _mentalStats = new();
    private readonly ObservableCollection<TrainingSession> _trainingSessions = new();
    private readonly ObservableCollection<SchoolSelectionView> _playableSchools = new();
    private readonly ObservableCollection<WeeklyPlanView> _weeklyPlanViews = new();
    private readonly ObservableCollection<ScheduleEntryView> _scheduleEntries = new();
    private readonly ObservableCollection<CalendarMonthView> _calendarMonths = new();
    private readonly ObservableCollection<CalendarDayView> _currentCalendarDays = new();
    private readonly ObservableCollection<DayLogBlock> _logBlocks = new();
    private readonly ObservableCollection<PitchMarkerViewModel> _pitchMarkers = new();
    private readonly ObservableCollection<string> _recentMatchSummaries = new();
    private readonly ObservableCollection<RosterMemberView> _rosterMembers = new();
    private readonly ObservableCollection<RosterStaffView> _rosterStaffMembers = new();
    private readonly ObservableCollection<RosterStatView> _rosterPhysicalStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterPitchingStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterBattingStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterMentalStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterHiddenStats = new();
    private readonly ObservableCollection<LoopPreviewItem> _loopPreviewItems = new();
    private readonly StringBuilder _matchOverlayLogBuilder = new();
    private readonly Dictionary<string, (int Column, int Row)> _zoneGridLookup;

    private readonly List<SectionItem> _sections =
    [
        new SectionItem("홈", SectionType.Home),
        new SectionItem("내 정보", SectionType.Info),
        new SectionItem("로스터", SectionType.Roster),
        new SectionItem("훈련", SectionType.Training),
        new SectionItem("일정", SectionType.Schedule),
        new SectionItem("기록", SectionType.Records)
    ];

    private SectionType _currentSection = SectionType.Home;
    private RosterMemberView? _currentRosterSelection;
    private int _pitchMarkerSequence;

    public MainWindow()
    {
        InitializeComponent();
        _zoneGridLookup = BuildZoneLookup();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        PhysicalStatsList.ItemsSource = _physicalStats;
        TechnicalStatsList.ItemsSource = _technicalStats;
        MentalStatsList.ItemsSource = _mentalStats;
        TrainingSessionList.ItemsSource = _trainingSessions;
        WeeklyPlanList.ItemsSource = _weeklyPlanViews;
        WeeklyPlanWeekCombo.ItemsSource = _weeklyPlanViews;
        WeeklyPlanSessionCombo.ItemsSource = _trainingSessions;
        ScheduleList.ItemsSource = _scheduleEntries;
        CalendarDayGrid.ItemsSource = _currentCalendarDays;
        MatchTargetZoneCombo.ItemsSource = _targetZones;
        MatchTargetZoneCombo.SelectedIndex = 4;
        MatchPitchIntentCombo.SelectedIndex = 0;
        LogBlockList.ItemsSource = _logBlocks;
        PitchMarkerItems.ItemsSource = _pitchMarkers;
        PitchResultList.ItemsSource = _pitchMarkers;
        RecentMatchList.ItemsSource = _recentMatchSummaries;
        RosterList.ItemsSource = _rosterMembers;
        RosterStaffList.ItemsSource = _rosterStaffMembers;
        RosterPhysicalList.ItemsSource = _rosterPhysicalStats;
        RosterPitchingList.ItemsSource = _rosterPitchingStats;
        RosterBattingList.ItemsSource = _rosterBattingStats;
        RosterMentalList.ItemsSource = _rosterMentalStats;
        RosterHiddenList.ItemsSource = _rosterHiddenStats;
        HomeUpcomingList.ItemsSource = _loopPreviewItems;
        InfoLoopList.ItemsSource = _loopPreviewItems;

        SectionList.ItemsSource = _sections;
        SectionList.SelectedIndex = 0;

        LoadSchoolData();
        UpdateMatchStatus();
    }

    private Dictionary<string, (int Column, int Row)> BuildZoneLookup()
    {
        var dict = new Dictionary<string, (int Column, int Row)>(StringComparer.Ordinal);
        for (var row = 0; row < 3; row++)
        {
            for (var col = 0; col < 3; col++)
            {
                var index = row * 3 + col;
                if (index < _targetZones.Length)
                {
                    dict[_targetZones[index]] = (Column: col, Row: row);
                }
            }
        }

        return dict;
    }

    private void LoadSchoolData()
    {
        try
        {
            var schools = HighSchoolRepository.LoadPlayableSchools();
            foreach (var school in schools)
            {
                var view = new SchoolSelectionView(school);
                view.ApplyLoopPreview(BuildLoopPreview(school));
                _playableSchools.Add(view);
            }

            SchoolListBox.ItemsSource = _playableSchools;
            if (_playableSchools.Count > 0)
            {
                SchoolListBox.SelectedIndex = 0;
            }
            else
            {
                ClearSchoolDetail();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"학교 데이터를 불러오지 못했습니다.\n{ex.Message}", "데이터 오류", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private IReadOnlyList<LoopPreviewItem> BuildLoopPreview(HighSchoolProfile school)
    {
        try
        {
            var previewPlayer = PlayerProfile.CreateDefault(school.Name);
            var manager = HighSchoolYearManager.Create(previewPlayer, school, 1);
            return manager.GetPlannedEvents()
                .Where(e => e.Day <= 210)
                .Take(6)
                .Select(e => new LoopPreviewItem(e, 1))
                .ToList();
        }
        catch
        {
            return Array.Empty<LoopPreviewItem>();
        }
    }

    private void UpdateLoopPreviewFromGame(int referenceDay)
    {
        _loopPreviewItems.Clear();
        if (_game is null) return;

        var upcoming = _game.GetPlannedEvents()
            .Where(e => e.Day >= referenceDay)
            .OrderBy(e => e.Day)
            .Take(6)
            .Select(evt => new LoopPreviewItem(evt, referenceDay));

        foreach (var item in upcoming)
        {
            _loopPreviewItems.Add(item);
        }
    }

    private void InitializeGame(HighSchoolProfile school, int academicYear)
    {
        _game = GameState.CreateHighSchoolSeason(school, academicYear);
        _game.LogEntries.CollectionChanged += GameLogEntries_CollectionChanged;
        BindActions();
        RefreshSummary();
        RefreshStats();
        InitializeWeeklyPlanViews();
        RefreshScheduleEntries();
        RefreshCalendarMonths();
        SyncActionSelectionWithGame();
        UpdateDayLabel();
        UpdateMatchStatus();
        RebuildLogBlocks();
        SchoolSelectionOverlay.Visibility = Visibility.Collapsed;
    }

    private void BindActions()
    {
        if (_game is null) return;

        var actions = _game.AvailableActions;
        MorningActionCombo.ItemsSource = actions;
        AfternoonActionCombo.ItemsSource = actions;
        EveningActionCombo.ItemsSource = actions;

        _suppressActionEvents = true;
        MorningActionCombo.SelectedIndex = 0;
        AfternoonActionCombo.SelectedIndex = actions.Count > 1 ? 1 : 0;
        EveningActionCombo.SelectedIndex = actions.Count > 2 ? 2 : 0;
        _suppressActionEvents = false;

        MorningDescription.Text = (MorningActionCombo.SelectedItem as DailyAction)?.Description;
        AfternoonDescription.Text = (AfternoonActionCombo.SelectedItem as DailyAction)?.Description;
        EveningDescription.Text = (EveningActionCombo.SelectedItem as DailyAction)?.Description;
    }

    private void RefreshSummary()
    {
        if (_game is null)
        {
            PlayerSummaryText.Text = "선수 정보 - 데이터를 불러올 수 없습니다.";
            PitchInfoText.Text = string.Empty;
            InfoSchoolText.Text = string.Empty;
            InfoPitchStyleText.Text = string.Empty;
            PitchList.ItemsSource = null;
            MatchPitchTypeCombo.ItemsSource = null;
            LoopAcademicYearText.Text = "-";
            LoopCalendarText.Text = "-";
            LoopWeekText.Text = "-";
            LoopPhaseText.Text = "-";
            LoopMoodText.Text = "-";
            LoopTrainingText.Text = "-";
            LoopUpcomingText.Text = "-";
            return;
        }

        var player = _game.Player;
        PlayerSummaryText.Text = $"{player.School} · {player.AcademicYear}학년 {player.Position} | {player.Name}";
        PitchInfoText.Text = $"투구 스타일: {player.PitchStyle} / 구종: {string.Join(", ", player.PitchArsenal)}";
        InfoSchoolText.Text = $"{player.School} / {player.Position}";
        InfoPitchStyleText.Text = player.PitchStyle;
        PitchList.ItemsSource = player.PitchArsenal;
        MatchPitchTypeCombo.ItemsSource = player.PitchArsenal;
        MatchPitchTypeCombo.SelectedIndex = player.PitchArsenal.Count > 0 ? 0 : -1;
        RefreshLoopStatePanel();
        RefreshRecentMatches();
        RefreshRosterMembers();
    }

    private void RefreshStats()
    {
        if (_game is null) return;

        _physicalStats.Clear();
        _technicalStats.Clear();
        _mentalStats.Clear();

        foreach (var stat in _game.Player.GetVisibleStats())
        {
            switch (Classify(stat.Category))
            {
                case StatGroup.Physical:
                    _physicalStats.Add(stat);
                    break;
                case StatGroup.Technical:
                    _technicalStats.Add(stat);
                    break;
                default:
                    _mentalStats.Add(stat);
                    break;
            }
        }

        SortStats(_physicalStats);
        SortStats(_technicalStats);
        SortStats(_mentalStats);
    }

    private void RefreshScheduleEntries()
    {
        _scheduleEntries.Clear();
        if (_game is null) return;

        foreach (var evt in _game.GetPlannedEvents())
        {
            _scheduleEntries.Add(new ScheduleEntryView(evt));
        }
    }

    private void RefreshCalendarMonths()
    {
        _calendarMonths.Clear();
        _currentCalendarDays.Clear();
        if (_game is null) return;

        var events = _game.GetPlannedEvents().ToList();
        for (var month = 1; month <= 12; month++)
        {
            var monthView = new CalendarMonthView(month);
            var firstDayOfYear = (month - 1) * 30 + 1;
            var firstWeekday = (firstDayOfYear - 1) % 7;
            var dayNumber = 1;

            for (var cell = 0; cell < 42; cell++)
            {
                if (cell < firstWeekday || dayNumber > 30)
                {
                    monthView.Days.Add(CalendarDayView.Empty);
                }
                else
                {
                    var entries = events
                        .Where(e => e.Month == month && e.DayOfMonth == dayNumber)
                        .Select(e => $"{e.Category}: {e.Title}")
                        .ToList();
                    monthView.Days.Add(new CalendarDayView(dayNumber, entries));
                    dayNumber++;
                }
            }
            _calendarMonths.Add(monthView);
        }

        CalendarMonthCombo.ItemsSource = _calendarMonths;
        CalendarMonthCombo.SelectedIndex = _calendarMonths.Count > 0 ? 0 : -1;
    }

    private void InitializeWeeklyPlanViews()
    {
        _weeklyPlanViews.Clear();
        if (_game is null) return;

        for (var week = 1; week <= _game.TotalWeeks; week++)
        {
            var plan = _game.GetWeeklyPlan(week);
            _weeklyPlanViews.Add(new WeeklyPlanView(week, plan));
        }

        WeeklyPlanWeekCombo.SelectedIndex = _weeklyPlanViews.Count > 0 ? 0 : -1;
    }

    private void UpdateWeeklyPlanView(int weekNumber)
    {
        if (_game is null) return;
        var plan = _game.GetWeeklyPlan(weekNumber);
        var view = _weeklyPlanViews.FirstOrDefault(v => v.WeekNumber == weekNumber);
        view?.Apply(plan);
    }

    private void SyncActionSelectionWithGame()
    {
        if (_game is null) return;
        var selected = _game.SelectedActions;

        _suppressActionEvents = true;
        MorningActionCombo.SelectedItem = selected[ActionSlot.Morning];
        AfternoonActionCombo.SelectedItem = selected[ActionSlot.Afternoon];
        EveningActionCombo.SelectedItem = selected[ActionSlot.Evening];
        _suppressActionEvents = false;

        MorningDescription.Text = selected[ActionSlot.Morning].Description;
        AfternoonDescription.Text = selected[ActionSlot.Afternoon].Description;
        EveningDescription.Text = selected[ActionSlot.Evening].Description;
    }

    private void AdvanceButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (MatchOverlay.Visibility == Visibility.Visible)
        {
            MessageBox.Show(this, "경기 화면을 닫은 뒤에 하루를 진행할 수 있습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        _game.AdvanceDay();
        RefreshStats();
        RefreshSummary();
        SyncActionSelectionWithGame();
        UpdateDayLabel();
        UpdateWeeklyPlanView(_game.CurrentWeek);
        UpdateMatchStatus();

        var snapshot = BuildLogBlocksSnapshot();
        var latestBlock = RebuildLogBlocks(snapshot);
        if (latestBlock is not null && latestBlock.Entries.Count > 0)
        {
            ShowDailyLogPopup(latestBlock);
        }
    }

    private void ShowDailyLogPopup(DayLogBlock? block)
    {
        if (block is null || block.Entries.Count == 0) return;
        DailyLogTitleText.Text = block.Title;
        DailyLogEntriesList.ItemsSource = block.Entries;
        DailyLogOverlay.Visibility = Visibility.Visible;
    }

    private void DailyLogCloseButton_OnClick(object sender, RoutedEventArgs e)
        => DailyLogOverlay.Visibility = Visibility.Collapsed;

    private void UpdateDayLabel()
    {
        if (_game is null)
        {
            CurrentDayText.Text = "-";
            LoopAcademicYearText.Text = "-";
            LoopCalendarText.Text = "-";
            LoopWeekText.Text = "-";
            LoopPhaseText.Text = "-";
            LoopMoodText.Text = "-";
            LoopTrainingText.Text = "-";
            LoopUpcomingText.Text = "-";
            _loopPreviewItems.Clear();
            return;
        }

        CurrentDayText.Text = $"Day {_game.DayIndex}";
        RefreshLoopStatePanel();
    }

    private void RefreshLoopStatePanel()
    {
        if (_game is null) return;
        var snapshot = _game.BuildLoopSnapshot();
        LoopAcademicYearText.Text = $"{snapshot.AcademicYear}학년";
        LoopCalendarText.Text = $"{snapshot.Month}월 {snapshot.DayOfMonth}일 (Day {snapshot.DayOfYear})";
        LoopWeekText.Text = $"연간 W{snapshot.WeekOfYear} · 이번 달 {snapshot.WeekOfMonth}주차";
        LoopPhaseText.Text = snapshot.PhaseLabel;
        LoopMoodText.Text = snapshot.SeasonMood;
        LoopTrainingText.Text = $"피로 {snapshot.Fatigue:F0} / 집중 {snapshot.Focus:F0} | 훈련 부하 {snapshot.TrainingLoad:F0}";
        if (snapshot.UpcomingEvent is null)
        {
            LoopUpcomingText.Text = "예정된 이벤트 없음";
        }
        else
        {
            var countdown = snapshot.UpcomingEvent.DaysUntil == 0 ? "오늘" : $"D-{snapshot.UpcomingEvent.DaysUntil}";
            LoopUpcomingText.Text = $"{snapshot.UpcomingEvent.Title} ({snapshot.UpcomingEvent.Category}) · {countdown}\n{snapshot.UpcomingEvent.Preview}";
        }

        UpdateLoopPreviewFromGame(snapshot.DayOfYear);
    }

    private void MorningActionCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressActionEvents || _game is null) return;
        if (MorningActionCombo.SelectedItem is DailyAction action)
        {
            _game.SetAction(ActionSlot.Morning, action);
            MorningDescription.Text = action.Description;
        }
    }

    private void AfternoonActionCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressActionEvents || _game is null) return;
        if (AfternoonActionCombo.SelectedItem is DailyAction action)
        {
            _game.SetAction(ActionSlot.Afternoon, action);
            AfternoonDescription.Text = action.Description;
        }
    }

    private void EveningActionCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressActionEvents || _game is null) return;
        if (EveningActionCombo.SelectedItem is DailyAction action)
        {
            _game.SetAction(ActionSlot.Evening, action);
            EveningDescription.Text = action.Description;
        }
    }

    private void SectionList_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SectionList.SelectedItem is SectionItem item)
        {
            _currentSection = item.Type;
            UpdateSectionPanels();
        }
    }

    private void RosterList_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (RosterList.SelectedItem is RosterMemberView view)
        {
            BindRosterDetail(view);
        }
    }

    private void UpdateSectionPanels()
    {
        HomePanel.Visibility = _currentSection == SectionType.Home ? Visibility.Visible : Visibility.Collapsed;
        InfoPanel.Visibility = _currentSection == SectionType.Info ? Visibility.Visible : Visibility.Collapsed;
        RosterPanel.Visibility = _currentSection == SectionType.Roster ? Visibility.Visible : Visibility.Collapsed;
        TrainingPanel.Visibility = _currentSection == SectionType.Training ? Visibility.Visible : Visibility.Collapsed;
        SchedulePanel.Visibility = _currentSection == SectionType.Schedule ? Visibility.Visible : Visibility.Collapsed;
        RecordsPanel.Visibility = _currentSection == SectionType.Records ? Visibility.Visible : Visibility.Collapsed;
    }

    private void AddSessionButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;

        if (MorningActionCombo.SelectedItem is not DailyAction morning ||
            AfternoonActionCombo.SelectedItem is not DailyAction afternoon ||
            EveningActionCombo.SelectedItem is not DailyAction evening)
        {
            return;
        }

        var name = string.IsNullOrWhiteSpace(SessionNameText.Text)
            ? $"세션 {_trainingSessions.Count + 1}"
            : SessionNameText.Text.Trim();

        _trainingSessions.Add(new TrainingSession(name, morning, afternoon, evening));
        SessionNameText.Text = string.Empty;
    }

    private void RemoveSessionButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (TrainingSessionList.SelectedItem is TrainingSession session)
        {
            _trainingSessions.Remove(session);
        }
    }

    private void ApplyWeeklyPlanButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (WeeklyPlanWeekCombo.SelectedItem is not WeeklyPlanView weekView)
        {
            MessageBox.Show(this, "주차를 선택하세요.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (WeeklyPlanSessionCombo.SelectedItem is not TrainingSession session)
        {
            MessageBox.Show(this, "적용할 세션을 선택하세요.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (_game.FindActionById(session.MorningId) is not { } morning ||
            _game.FindActionById(session.AfternoonId) is not { } afternoon ||
            _game.FindActionById(session.EveningId) is not { } evening)
        {
            MessageBox.Show(this, "세션 정보를 읽을 수 없습니다.", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var assignment = new WeeklyPlanAssignment(weekView.WeekNumber, session.Name, morning, afternoon, evening);
        _game.AssignWeeklyPlan(assignment);
        weekView.Apply(assignment);

        if (_game.CurrentWeek == weekView.WeekNumber)
        {
            SyncActionSelectionWithGame();
        }
    }

    private void CalendarMonthCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _currentCalendarDays.Clear();
        if (CalendarMonthCombo.SelectedItem is not CalendarMonthView monthView) return;
        foreach (var day in monthView.Days)
        {
            _currentCalendarDays.Add(day);
        }
    }

    private void ShowMatchOverlay()
    {
        if (_game is null) return;
        HideCoachPrompt();
        var snapshot = _game.PrepareMatchSnapshot();
        ResetMatchOverlayLog($"--- {snapshot.MatchLabel} vs {snapshot.Opponent} 시작 ---");
        ResetPitchMarkers();

        MatchOverlay.Visibility = Visibility.Visible;
        MatchPitchTypeCombo.ItemsSource = _game.Player.PitchArsenal;
        MatchPitchTypeCombo.SelectedIndex = _game.Player.PitchArsenal.Count > 0 ? 0 : -1;
        if (_targetZones.Length > 0)
        {
            MatchTargetZoneCombo.SelectedIndex = Math.Min(4, _targetZones.Length - 1);
        }
        MatchPitchIntentCombo.SelectedIndex = 0;
        MatchSimulateButton.IsEnabled = true;
        UpdateMatchOverlay(snapshot);
    }

    private void HideMatchOverlay()
    {
        MatchOverlay.Visibility = Visibility.Collapsed;
        MatchSimulateButton.IsEnabled = false;
        MatchCloseButton.IsEnabled = false;
        _matchOverlayLogBuilder.Clear();
        UpdateMatchOverlayLogText();
        ResetPitchMarkers();
        HideCoachPrompt();
    }

    private void UpdateMatchOverlay(MatchSnapshot snapshot)
    {
        MatchOpponentText.Text = $"{snapshot.MatchLabel} vs {snapshot.Opponent}";
        MatchInningText.Text = snapshot.InningText;
        MatchCountText.Text = snapshot.CountText;
        MatchSituationText.Text = snapshot.SituationText;
        MatchScoreText.Text = $"{snapshot.MatchLabel} {snapshot.PlayerRuns} - {snapshot.OpponentRuns} {snapshot.Opponent}";
        MatchProgressText.Text = $"아웃 {snapshot.OutsRecorded}/{snapshot.OutsTarget} | 투구수 {snapshot.PitchCount}";
        MatchCloseButton.IsEnabled = snapshot.Completed;

        MatchPitcherNameText.Text = snapshot.PitcherName;
        MatchPitcherCommandText.Text = $"커맨드 {snapshot.PitcherCommand:F1} / 멘탈 {snapshot.PitcherFocus:F1}";
        MatchPitcherStaminaBar.Value = Math.Min(100, snapshot.PitcherStamina);
        MatchPitcherStaminaValue.Text = $"{snapshot.PitcherStamina:F1}%";
        MatchPitcherFocusText.Text = $"투구수 {snapshot.PitchCount} / 실점 {snapshot.RunsAllowed}";

        MatchBatterNameText.Text = snapshot.BatterName;
        MatchBatterTraitsText.Text = $"{snapshot.BatterHandedness} · {snapshot.BatterArchetype}";
        MatchBatterThreatText.Text = $"위협도: {snapshot.BatterThreatLabel}";
        MatchBatterContactText.Text = $"{snapshot.BatterContact:F1}";
        MatchBatterPowerText.Text = $"{snapshot.BatterPower:F1}";
        MatchBatterEyeText.Text = $"{snapshot.BatterEye:F1}";
    }

    private void MatchSimulateButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (!_game.MatchPending)
        {
            MessageBox.Show(this, "현재 진행 가능한 경기가 없습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (MatchPitchTypeCombo.SelectedItem is not string pitch)
        {
            MessageBox.Show(this, "구종을 선택해주세요.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var zone = MatchTargetZoneCombo.SelectedItem as string ?? _targetZones[4];
        var intent = (MatchPitchIntentCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "정면 승부";
        var result = _game.ResolvePitch(pitch, zone, intent);

        AppendMatchOverlayLogLine(result.LogLine);
        UpdateMatchOverlay(result.Snapshot);
        RegisterPitchMarker(result);

        if (result.HookPrompt is { } hookPrompt)
        {
            ShowCoachPrompt(hookPrompt);
        }
        else if (CoachPromptPanel.Visibility == Visibility.Visible)
        {
            HideCoachPrompt();
        }

        if (result.Snapshot.Completed)
        {
            MatchSimulateButton.IsEnabled = false;
            MatchCloseButton.IsEnabled = true;
        }
    }

    private void MatchCloseButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null || !_game.MatchPending)
        {
            HideMatchOverlay();
            return;
        }

        MessageBox.Show(this, "경기를 모두 진행한 뒤에 종료할 수 있습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void ResetMatchOverlayLog(string header)
    {
        _matchOverlayLogBuilder.Clear();
        AppendMatchOverlayLogLine(header);
    }

    private void ResetPitchMarkers()
    {
        _pitchMarkerSequence = 0;
        _pitchMarkers.Clear();
    }

    private void RegisterPitchMarker(MatchPitchResult result)
    {
        if (_game is null) return;
        var (baseLeft, baseTop) = GetMarkerBasePosition(result.ZoneKey);
        var jitterX = (_pitchMarkerRandom.NextDouble() - 0.5) * 10.0;
        var jitterY = (_pitchMarkerRandom.NextDouble() - 0.5) * 10.0;
        var left = Math.Clamp(baseLeft + jitterX, 0, PitchMapWidth - PitchMarkerSize);
        var top = Math.Clamp(baseTop + jitterY, 0, PitchMapHeight - PitchMarkerSize);

        var eventType = result.EventType != PitchEventType.Unknown
            ? result.EventType
            : InferEventTypeFromLog(result.LogLine);

        var marker = new PitchMarkerViewModel
        {
            Sequence = ++_pitchMarkerSequence,
            CanvasLeft = left,
            CanvasTop = top,
            FillBrush = GetMarkerBrush(eventType),
            ResultLabel = GetResultLabel(eventType),
            DetailText = result.LogLine,
            CountLabel = $"{result.Snapshot.InningText} | {result.Snapshot.CountText}"
        };

        _pitchMarkers.Add(marker);
        if (_pitchMarkers.Count > MaxPitchMarkers)
        {
            _pitchMarkers.RemoveAt(0);
        }
    }

    private (double Left, double Top) GetMarkerBasePosition(string zoneKey)
    {
        var cell = ResolveZoneCell(zoneKey);
        var cellWidth = StrikeZoneWidth / 3.0;
        var cellHeight = StrikeZoneHeight / 3.0;
        var left = StrikeZoneLeft + cell.Column * cellWidth + (cellWidth - PitchMarkerSize) / 2;
        var top = StrikeZoneTop + cell.Row * cellHeight + (cellHeight - PitchMarkerSize) / 2;
        return (left, top);
    }

    private (int Column, int Row) ResolveZoneCell(string zoneKey)
    {
        if (!string.IsNullOrWhiteSpace(zoneKey) && _zoneGridLookup.TryGetValue(zoneKey, out var idx))
        {
            return idx;
        }

        var row = 1;
        var column = 1;

        if (!string.IsNullOrWhiteSpace(zoneKey))
        {
            if (zoneKey.Contains("상단", StringComparison.Ordinal)) row = 0;
            else if (zoneKey.Contains("중단", StringComparison.Ordinal)) row = 1;
            else if (zoneKey.Contains("하단", StringComparison.Ordinal)) row = 2;

            if (zoneKey.Contains("인코스", StringComparison.Ordinal)) column = 0;
            else if (zoneKey.Contains("중앙", StringComparison.Ordinal)) column = 1;
            else if (zoneKey.Contains("아웃코스", StringComparison.Ordinal)) column = 2;
        }

        return (column, row);
    }

    private static Brush GetMarkerBrush(PitchEventType type) => type switch
    {
        PitchEventType.CalledStrike or PitchEventType.SwingingStrike => StrikeBrush,
        PitchEventType.Strikeout or PitchEventType.BallInPlayOut => OutBrush,
        PitchEventType.Ball or PitchEventType.Walk => BallBrush,
        PitchEventType.BallInPlayHit => HitBrush,
        _ => NeutralBrush
    };

    private static string GetResultLabel(PitchEventType type) => type switch
    {
        PitchEventType.CalledStrike => "스트라이크",
        PitchEventType.SwingingStrike => "헛스윙",
        PitchEventType.Strikeout => "삼진 아웃",
        PitchEventType.Ball => "볼",
        PitchEventType.Walk => "볼넷",
        PitchEventType.BallInPlayOut => "인플레이 아웃",
        PitchEventType.BallInPlayHit => "피안타",
        _ => "투구"
    };

    private static PitchEventType InferEventTypeFromLog(string logLine)
    {
        if (string.IsNullOrWhiteSpace(logLine))
        {
            return PitchEventType.Unknown;
        }

        var normalized = logLine;
        if (normalized.Contains("삼진", StringComparison.Ordinal))
        {
            return PitchEventType.Strikeout;
        }

        if (normalized.Contains("스트라이크", StringComparison.Ordinal) ||
            normalized.Contains("선점합니다", StringComparison.Ordinal))
        {
            return PitchEventType.CalledStrike;
        }

        if (normalized.Contains("볼넷", StringComparison.Ordinal))
        {
            return PitchEventType.Walk;
        }

        if (normalized.Contains("볼 판정", StringComparison.Ordinal) ||
            normalized.Contains("볼 판정", StringComparison.CurrentCulture) ||
            normalized.Contains("볼 허용", StringComparison.Ordinal))
        {
            return PitchEventType.Ball;
        }

        if (normalized.Contains("안타", StringComparison.Ordinal) ||
            normalized.Contains("장타", StringComparison.Ordinal))
        {
            return PitchEventType.BallInPlayHit;
        }

        if (normalized.Contains("아웃", StringComparison.Ordinal) ||
            normalized.Contains("처리로", StringComparison.Ordinal))
        {
            return PitchEventType.BallInPlayOut;
        }

        return PitchEventType.Unknown;
    }

    private void AppendMatchOverlayLogLine(string line)
    {
        _matchOverlayLogBuilder.AppendLine(line);
        UpdateMatchOverlayLogText();
    }

    private void UpdateMatchOverlayLogText()
    {
        if (MatchOverlayLogTextBox is null) return;
        var text = _matchOverlayLogBuilder.ToString();
        MatchOverlayLogTextBox.Dispatcher.BeginInvoke(new Action(() =>
        {
            MatchOverlayLogTextBox.Text = text;
            MatchOverlayLogTextBox.CaretIndex = text.Length;
            MatchOverlayLogTextBox.ScrollToEnd();
        }), DispatcherPriority.Background);
    }

    private void GameLogEntries_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        => RebuildLogBlocks();

    private void ShowCoachPrompt(CoachHookPrompt prompt)
    {
        CoachPromptPanel.Visibility = Visibility.Visible;
        CoachPromptText.Text = $"{prompt.CoachName}: {prompt.Message}";
        MatchSimulateButton.IsEnabled = false;
        MatchCloseButton.IsEnabled = false;
    }

    private void HideCoachPrompt()
    {
        CoachPromptPanel.Visibility = Visibility.Collapsed;
        CoachPromptText.Text = string.Empty;
        if (_game?.MatchPending == true)
        {
            MatchSimulateButton.IsEnabled = true;
        }
    }

    private void CoachPromptAcceptButton_OnClick(object sender, RoutedEventArgs e)
        => HandleCoachDecision(true);

    private void CoachPromptDeclineButton_OnClick(object sender, RoutedEventArgs e)
        => HandleCoachDecision(false);

    private void HandleCoachDecision(bool accept)
    {
        if (_game is null) return;
        var decision = _game.ResolveCoachDecision(accept);
        if (!decision.Resolved) return;

        HideCoachPrompt();
        RebuildLogBlocks();

        if (decision.MatchEnded && decision.Snapshot is { } snapshot)
        {
            UpdateMatchOverlay(snapshot);
            MatchSimulateButton.IsEnabled = false;
            MatchCloseButton.IsEnabled = true;
        }
    }

    private DayLogBlock? RebuildLogBlocks(List<DayLogBlock>? snapshot = null)
    {
        if (_game is null) return null;

        var blocks = snapshot ?? BuildLogBlocksSnapshot();
        var latestBlock = blocks.Count > 0 ? blocks[^1] : null;

        Dispatcher.BeginInvoke(new Action(() =>
        {
            _logBlocks.Clear();
            foreach (var block in blocks)
            {
                _logBlocks.Add(block);
            }

            if (LogBlockList is not null && _logBlocks.Count > 0)
            {
                LogBlockList.ScrollIntoView(_logBlocks[^1]);
            }

            RefreshRecentMatches();
        }), DispatcherPriority.Background);

        return latestBlock;
    }

    private List<DayLogBlock> BuildLogBlocksSnapshot()
    {
        var result = new List<DayLogBlock>();
        if (_game is null) return result;

        DayLogBlock? currentBlock = null;
        foreach (var line in _game.LogEntries)
        {
            if (TryParseDayHeader(line, out var header))
            {
                currentBlock = new DayLogBlock(header);
                result.Add(currentBlock);
                continue;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            currentBlock ??= new DayLogBlock("일반 기록");
            currentBlock.Entries.Add(line);
        }

        return result;
    }

    private static bool TryParseDayHeader(string line, out string header)
    {
        if (line.StartsWith("==="))
        {
            header = line.Trim('=').Trim();
            return true;
        }

        header = string.Empty;
        return false;
    }


    private void SchoolListBox_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SchoolListBox.SelectedItem is SchoolSelectionView view)
        {
            _selectedSchool = view.Profile;
            UpdateSchoolDetail(view);
        }
        else
        {
            ClearSchoolDetail();
        }
    }

    private void RosterList_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (RosterList.SelectedItem is not RosterMemberView member)
        {
            return;
        }

        var dialog = new PlayerDetailWindow(member.Player)
        {
            Owner = this,
            WindowStartupLocation = WindowStartupLocation.CenterOwner
        };
        dialog.ShowDialog();
    }

    private void UpdateSchoolDetail(SchoolSelectionView view)
    {
        SelectedSchoolName.Text = view.Name;
        SelectedSchoolRegion.Text = view.RegionTierLine;
        SelectedSchoolKeywords.Text = view.Keywords;
        SelectedSchoolStrength.Text = view.StrengthLabel;
        SelectedSchoolPhilosophy.Text = view.Philosophy;
        SelectedSchoolStats.Text = view.StatsLine;
        SelectedSchoolRosterStats.Text = view.RosterMetaLine;
        SelectedSchoolTopPlayerSummary.Text = view.TopPlayerSummary;
        SelectedSchoolTopPlayersList.ItemsSource = view.TopPlayers;
        SelectedSchoolLoopSummary.Text = view.LoopPreviewSummary;
        SelectedSchoolLoopPreviewList.ItemsSource = view.LoopPreview;
    }

    private void ClearSchoolDetail()
    {
        _selectedSchool = null;
        SelectedSchoolName.Text = "-";
        SelectedSchoolRegion.Text = string.Empty;
        SelectedSchoolKeywords.Text = string.Empty;
        SelectedSchoolStrength.Text = string.Empty;
        SelectedSchoolPhilosophy.Text = "학교를 선택하세요.";
        SelectedSchoolStats.Text = string.Empty;
        SelectedSchoolRosterStats.Text = string.Empty;
        SelectedSchoolTopPlayerSummary.Text = string.Empty;
        SelectedSchoolTopPlayersList.ItemsSource = null;
        SelectedSchoolLoopSummary.Text = string.Empty;
        SelectedSchoolLoopPreviewList.ItemsSource = null;
    }

    private void ConfirmSchoolButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_selectedSchool is null)
        {
            MessageBox.Show(this, "입학할 학교를 선택하세요.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        InitializeGame(_selectedSchool, 1);
    }

    private static void SortStats(ObservableCollection<StatEntry> stats)
    {
        var ordered = stats.OrderBy(s => s.Label).ToList();
        stats.Clear();
        foreach (var stat in ordered)
        {
            stats.Add(stat);
        }
    }

    private static StatGroup Classify(string category) => category switch
    {
        "신체" => StatGroup.Physical,
        "기술" => StatGroup.Technical,
        _ => StatGroup.Mental
    };

    private sealed record SectionItem(string Title, SectionType Type);

    private enum SectionType
    {
        Home,
        Info,
        Roster,
        Training,
        Schedule,
        Records
    }

    private sealed class SchoolSelectionView
    {
        private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

        public SchoolSelectionView(HighSchoolProfile profile)
        {
            Profile = profile;
            Name = profile.Name;
            Keywords = string.IsNullOrWhiteSpace(profile.Keywords) ? "-" : profile.Keywords;
            Philosophy = string.IsNullOrWhiteSpace(profile.Philosophy) ? "기본 철학 정보가 필요합니다." : profile.Philosophy;
            TierKey = profile.Roster?.Tier ?? string.Empty;
            TierLabel = TranslateTier(TierKey);
            RegionTierLine = $"{profile.Region} · {TierLabel}";
            StatsLine = BuildStatsLine(profile);

            var topPlayers = new List<TopPlayerView>();

            if (profile.Roster is { } roster)
            {
                VarsityCount = roster.Varsity.Count;
                JuniorCount = roster.Junior.Count;
                var allPlayers = roster.Varsity.Concat(roster.Junior).ToList();
                if (allPlayers.Count > 0)
                {
                    AvgOverall = allPlayers.Average(p => p.Overall);
                    topPlayers = allPlayers
                        .OrderByDescending(p => p.Overall)
                        .ThenBy(p => p.Name)
                        .Take(4)
                        .Select(p => new TopPlayerView(p))
                        .ToList();
                }
            }

            TopPlayers = topPlayers;
            AvgOverallText = AvgOverall > 0 ? AvgOverall.ToString("0.0", Culture) : "-";
            StrengthLabel = BuildStrengthLabel(AvgOverall);
            RosterCountLine = VarsityCount + JuniorCount > 0
                ? $"1군 {VarsityCount}명 · 2군 {JuniorCount}명"
                : "로스터 준비 중";
            RosterMetaLine = VarsityCount + JuniorCount > 0
                ? $"{RosterCountLine} | 평균 OVR {AvgOverallText}"
                : "로스터 세부 데이터가 필요합니다.";
            TopPlayerSummary = TopPlayers.Count > 0
                ? string.Join(" · ", TopPlayers.Select(p => p.ListLabel))
                : "주요 선수 데이터 준비 중";
        }

        public HighSchoolProfile Profile { get; }
        public string Name { get; }
        public string Keywords { get; }
        public string Philosophy { get; }
        public string TierKey { get; }
        public string TierLabel { get; }
        public string RegionTierLine { get; }
        public string StatsLine { get; }
        public string AvgOverallText { get; }
        public string StrengthLabel { get; }
        public string RosterCountLine { get; }
        public string RosterMetaLine { get; }
        public string TopPlayerSummary { get; }
        public string LoopPreviewSummary { get; private set; } = "연간 루프 데이터 준비 중";
        public IReadOnlyList<TopPlayerView> TopPlayers { get; }
        public IReadOnlyList<LoopPreviewItem> LoopPreview { get; private set; } = Array.Empty<LoopPreviewItem>();
        public int VarsityCount { get; }
        public int JuniorCount { get; }
        public double AvgOverall { get; }

        private static string BuildStatsLine(HighSchoolProfile profile)
        {
            static string FormatNumber(int value) => value <= 0 ? "-" : string.Format(Culture, "{0:N0}", value);
            return $"예산 {FormatNumber(profile.Budget)}억 | 재학생 {FormatNumber(profile.Enrollment)}명 | 평균 관중 {FormatNumber(profile.AverageAttendance)}명 | 팬 충성 {profile.FanLoyalty}";
        }

        private static string TranslateTier(string tier) => tier switch
        {
            "powerhouse" => "전국구 강호",
            "mid" => "상위권",
            "developing" => "육성형",
            _ => "전력 정보 없음"
        };

        private static string BuildStrengthLabel(double avg) => avg switch
        {
            >= 80 => "전국구 우승 후보",
            >= 74 => "상위권 컨텐더",
            >= 68 => "중상위 경쟁팀",
            >= 60 => "잠재력 있는 육성팀",
            _ => "재건이 필요한 팀"
        };

        public void ApplyLoopPreview(IReadOnlyList<LoopPreviewItem> preview)
        {
            LoopPreview = preview;
            LoopPreviewSummary = preview.Count > 0
                ? string.Join(" / ", preview.Select(p => $"{p.Label} {p.Category}"))
                : "연간 루프 데이터 준비 중";
        }
    }

    private sealed class TopPlayerView
    {
        public TopPlayerView(HighSchoolRosterPlayer player)
        {
            Name = player.Name;
            Position = player.Position;
            Overall = player.Overall;
            RoleLabel = player.RoleLabel;
            StatusLabel = player.Status.Equals("varsity", StringComparison.OrdinalIgnoreCase) ? "1군" : "2군";
            TagsText = player.Tags.Count > 0 ? string.Join(", ", player.Tags) : "태그 없음";
            ListLabel = $"{Position} {Name}({Overall})";
            DetailLine = $"{StatusLabel} · {RoleLabel} · OVR {Overall}";
        }

        public string Name { get; }
        public string Position { get; }
        public int Overall { get; }
        public string RoleLabel { get; }
        public string StatusLabel { get; }
        public string TagsText { get; }
        public string ListLabel { get; }
        public string DetailLine { get; }
    }

    private sealed class LoopPreviewItem
    {
        public LoopPreviewItem(HighSchoolPlannedEvent plannedEvent, int referenceDay = 1)
        {
            Month = plannedEvent.Month;
            Day = plannedEvent.DayOfMonth;
            Category = plannedEvent.Category;
            Title = plannedEvent.Title;
            Preview = string.IsNullOrWhiteSpace(plannedEvent.Description) ? "세부 정보 준비 중" : plannedEvent.Description;
            DaysUntil = Math.Max(0, plannedEvent.Day - referenceDay);
        }

        public int Month { get; }
        public int Day { get; }
        public string Category { get; }
        public string Title { get; }
        public string Preview { get; }
        public int DaysUntil { get; }
        public string Label => $"{Month}월 {Day}일";
        public string Summary => $"{Category} · {Title}";
        public string CountdownLabel => DaysUntil == 0 ? "D-DAY" : $"D-{DaysUntil}";
    }

    private sealed class TrainingSession
    {
        public TrainingSession(string name, DailyAction morning, DailyAction afternoon, DailyAction evening)
        {
            Name = name;
            Morning = morning.Name;
            Afternoon = afternoon.Name;
            Evening = evening.Name;
            MorningId = morning.Id;
            AfternoonId = afternoon.Id;
            EveningId = evening.Id;
        }

        public string Name { get; }
        public string Morning { get; }
        public string Afternoon { get; }
        public string Evening { get; }
        public string MorningId { get; }
        public string AfternoonId { get; }
        public string EveningId { get; }
        public string DisplayText => $"{Name} | 아:{Morning} / 점:{Afternoon} / 저:{Evening}";
    }

    private static SolidColorBrush CreateBrush(byte r, byte g, byte b)
    {
        var brush = new SolidColorBrush(Color.FromRgb(r, g, b));
        brush.Freeze();
        return brush;
    }

    private sealed class PitchMarkerViewModel
    {
        public int Sequence { get; init; }
        public string SequenceText => Sequence.ToString();
        public double CanvasLeft { get; init; }
        public double CanvasTop { get; init; }
        public Brush FillBrush { get; init; } = Brushes.White;
        public string ResultLabel { get; init; } = string.Empty;
        public string DetailText { get; init; } = string.Empty;
        public string CountLabel { get; init; } = string.Empty;
    }

    private sealed class DayLogBlock
    {
        public DayLogBlock(string title)
        {
            Title = title;
        }

        public string Title { get; }
        public ObservableCollection<string> Entries { get; } = new();
    }

    private sealed class WeeklyPlanView
    {
        public WeeklyPlanView(int weekNumber, WeeklyPlanAssignment? assignment)
        {
            WeekNumber = weekNumber;
            Apply(assignment);
        }

        public int WeekNumber { get; }
        public string WeekLabel => $"W{WeekNumber}";
        public string Morning { get; private set; } = "-";
        public string Afternoon { get; private set; } = "-";
        public string Evening { get; private set; } = "-";
        public string SessionName { get; private set; } = "-";

        public void Apply(WeeklyPlanAssignment? assignment)
        {
            if (assignment is null)
            {
                Morning = Afternoon = Evening = SessionName = "-";
            }
            else
            {
                Morning = assignment.Morning.Name;
                Afternoon = assignment.Afternoon.Name;
                Evening = assignment.Evening.Name;
                SessionName = assignment.SessionName;
            }
        }
    }

    private sealed class ScheduleEntryView
    {
        public ScheduleEntryView(HighSchoolPlannedEvent evt)
        {
            DateLabel = evt.DateLabel;
            Category = evt.Category;
            Title = evt.Title;
            Description = evt.Description;
        }

        public string DateLabel { get; }
        public string Category { get; }
        public string Title { get; }
        public string Description { get; }
    }

    private sealed class CalendarMonthView
    {
        public CalendarMonthView(int month)
        {
            Month = month;
            Name = $"{month}월";
        }

        public int Month { get; }
        public string Name { get; }
        public ObservableCollection<CalendarDayView> Days { get; } = new();
    }

    private sealed class CalendarDayView
    {
        public static CalendarDayView Empty { get; } = new(0, Array.Empty<string>());

        public CalendarDayView(int dayNumber, IReadOnlyList<string> events)
        {
            DayNumber = dayNumber;
            Events = events;
        }

        public int DayNumber { get; }
        public IReadOnlyList<string> Events { get; }
        public string DayText => DayNumber > 0 ? DayNumber.ToString() : string.Empty;
    }

    private enum StatGroup
    {
        Physical,
        Technical,
        Mental
    }

    private void UpdateMatchStatus()
    {
        if (_game is null)
        {
            HideMatchOverlay();
            return;
        }

        if (_game.MatchPending && MatchOverlay.Visibility != Visibility.Visible)
        {
            ShowMatchOverlay();
        }
    }

    private void RefreshRecentMatches()
    {
        _recentMatchSummaries.Clear();
        if (_game is null)
        {
            _recentMatchSummaries.Add("경기 정보가 없습니다.");
            return;
        }

        var entries = _game.GetRecentMatchSummaries();
        if (entries.Count == 0)
        {
            _recentMatchSummaries.Add("최근 경기 기록이 없습니다.");
            return;
        }

        foreach (var entry in entries)
        {
            _recentMatchSummaries.Add(entry);
        }
    }

    private void RefreshRosterMembers()
    {
        _rosterMembers.Clear();
        _rosterStaffMembers.Clear();
        ClearRosterDetail();

        var school = _game?.School ?? _selectedSchool;
        if (school?.Roster is null)
        {
            RosterDetailPlaceholder.Text = "로스터 데이터가 없습니다.";
            return;
        }

        var roster = school.Roster;
        var staffViews = new List<RosterStaffView>
        {
            new(roster.Manager.Name, roster.Manager.Role, roster.Manager.Specialty, roster.Manager.Ratings)
        };
        staffViews.AddRange(roster.Coaches.Select(c => new RosterStaffView(c.Name, c.Role, c.Specialty, c.Ratings)));
        foreach (var staff in staffViews)
        {
            _rosterStaffMembers.Add(staff);
        }

        foreach (var player in roster.Varsity.Concat(roster.Junior))
        {
            _rosterMembers.Add(new RosterMemberView(player));
        }

        if (_rosterMembers.Count > 0)
        {
            RosterList.SelectedIndex = 0;
        }
    }

    private void ClearRosterDetail()
    {
        _currentRosterSelection = null;
        RosterDetailNameText.Text = "-";
        RosterDetailMetaText.Text = string.Empty;
        RosterDetailArchetypeText.Text = string.Empty;
        RosterDetailTagsText.Text = string.Empty;
        RosterDetailOverallText.Text = string.Empty;
        RosterDetailPlaceholder.Text = "선수를 선택하면 상세 능력치가 표시됩니다.";
        RosterDetailPlaceholder.Visibility = Visibility.Visible;
        _rosterPhysicalStats.Clear();
        _rosterPitchingStats.Clear();
        _rosterBattingStats.Clear();
        _rosterMentalStats.Clear();
        _rosterHiddenStats.Clear();
    }

    private void BindRosterDetail(RosterMemberView? view)
    {
        if (view?.Player is null)
        {
            ClearRosterDetail();
            return;
        }

        _currentRosterSelection = view;
        var player = view.Player;

        RosterDetailPlaceholder.Visibility = Visibility.Collapsed;
        RosterDetailNameText.Text = player.Name;
        var statusLabel = $"{player.AcademicYear}학년 · {(player.Status.Equals("varsity", StringComparison.OrdinalIgnoreCase) ? "1군" : "2군")}";
        RosterDetailMetaText.Text = $"{statusLabel} · 포지션 {player.Position} · 투/타 {player.Throws}/{player.Bats}";
        RosterDetailArchetypeText.Text = $"{player.RoleLabel} · {player.Archetype}";
        RosterDetailTagsText.Text = view.Tags;
        RosterDetailOverallText.Text = $"OVR {player.Overall} / POT {player.Potential}";

        PopulateStats(_rosterPhysicalStats, player.Stats.Physical);
        PopulateStats(_rosterPitchingStats, player.Stats.Pitching);
        PopulateStats(_rosterBattingStats, player.Stats.Batting);
        PopulateStats(_rosterMentalStats, player.Stats.Mental);

        var hiddenCombined = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var dict in new[] { player.Stats.Hidden, player.Stats.Personality })
        {
            if (dict is null) continue;
            foreach (var kv in dict)
            {
                hiddenCombined[kv.Key] = kv.Value;
            }
        }
        PopulateStats(_rosterHiddenStats, hiddenCombined);
    }

    private sealed class RosterMemberView
    {
        public RosterMemberView(HighSchoolRosterPlayer player)
        {
            Player = player;
            Name = player.Name;
            Role = $"{player.Position} · {player.RoleLabel}";
            StatusLabel = $"{player.AcademicYear}학년 · {(player.Status.Equals("varsity", StringComparison.OrdinalIgnoreCase) ? "1군" : "2군")}";
            Tags = player.Tags.Count > 0 ? string.Join(", ", player.Tags) : "-";
        }

        public HighSchoolRosterPlayer Player { get; }
        public string Name { get; }
        public string Role { get; }
        public string StatusLabel { get; }
        public string Tags { get; }
    }

    private sealed class RosterStaffView
    {
        public RosterStaffView(string name, string role, string specialty, IReadOnlyDictionary<string, int> ratings)
        {
            Name = name;
            Role = role;
            Specialty = specialty;
            RatingSummary = BuildSummary(ratings);
        }

        public string Name { get; }
        public string Role { get; }
        public string Specialty { get; }
        public string RatingSummary { get; }

        private static string BuildSummary(IReadOnlyDictionary<string, int> ratings)
        {
            if (ratings.Count == 0)
            {
                return string.Empty;
            }

            return string.Join(" / ", ratings.Select(kv => $"{ResolveStaffLabel(kv.Key)}:{kv.Value}"));
        }

        private static string ResolveStaffLabel(string key) => key.ToLowerInvariant() switch
        {
            "leadership" => "리더십",
            "tactics" => "전술",
            "development" => "육성",
            "motivation" => "동기부여",
            "discipline" => "규율",
            "teaching" => "코칭",
            _ => key
        };
    }

    private sealed record RosterStatView(string Label, int Value);

    private static readonly Dictionary<string, string> StatLabelMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["PHY_POWER"] = "근력",
        ["PHY_SPEED"] = "주력",
        ["PHY_STAMINA"] = "체력",
        ["PHY_AGILITY"] = "민첩",
        ["PHY_BALANCE"] = "밸런스",
        ["PHY_FLEX"] = "유연성",
        ["PHY_ARM_HEALTH"] = "팔 내구",
        ["PHY_LEG_DRIVE"] = "하체 폭발",
        ["PIT_VELOCITY"] = "구속",
        ["PIT_COMMAND"] = "제구",
        ["PIT_BREAK"] = "무브먼트",
        ["PIT_BREAK_CMD"] = "변화구 제구",
        ["PIT_CHANGEUP"] = "체인지업",
        ["PIT_SECONDARY"] = "세컨드",
        ["PIT_FIELDING"] = "투수 수비",
        ["PIT_HOLD"] = "견제",
        ["BAT_CONTACT"] = "컨택",
        ["BAT_POWER"] = "장타력",
        ["BAT_DISCIPLINE"] = "선구안",
        ["BAT_DEFENSE"] = "수비력",
        ["BAT_ARM"] = "송구",
        ["BAT_SPEED"] = "주루",
        ["BAT_BUNT"] = "번트",
        ["BAT_VERSATILITY"] = "포지션",
        ["MNT_FOCUS"] = "집중력",
        ["MNT_MORALE"] = "동기부여",
        ["MNT_TOUGHNESS"] = "멘탈",
        ["HID_BIG_GAME"] = "큰 경기",
        ["HID_NERVES"] = "강심장",
        ["HID_RESILIENCE"] = "회복력",
        ["PVT_TALENT"] = "재능",
        ["PVT_WORK_ETHIC"] = "성실성",
        ["PVT_CHARACTER"] = "리더십"
    };

    internal static string ResolveStatLabel(string key)
        => StatLabelMap.TryGetValue(key, out var label) ? label : key.Replace("_", " ");

    private void PopulateStats(ObservableCollection<RosterStatView> target, IReadOnlyDictionary<string, int>? stats)
    {
        target.Clear();
        if (stats is null)
        {
            return;
        }

        foreach (var (key, value) in stats.OrderByDescending(kv => kv.Value))
        {
            target.Add(new RosterStatView(ResolveStatLabel(key), value));
        }
    }
}
