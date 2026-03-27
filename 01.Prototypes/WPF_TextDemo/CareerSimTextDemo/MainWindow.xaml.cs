using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
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

    private static readonly SolidColorBrush StrikeBrush = CreateBrush(241, 196, 15);
    private static readonly SolidColorBrush BallBrush = CreateBrush(46, 204, 113);
    private static readonly SolidColorBrush OutBrush = CreateBrush(231, 76, 60);
    private static readonly SolidColorBrush HitBrush = CreateBrush(230, 126, 34);
    private static readonly SolidColorBrush NeutralBrush = CreateBrush(149, 165, 166);

    private readonly string[] _targetZones =
    {
        "상단-인코스", "상단-중앙", "상단-아웃코스",
        "중단-인코스", "중단-중앙", "중단-아웃코스",
        "하단-인코스", "하단-중앙", "하단-아웃코스"
    };

    private readonly Random _simRandom = new();
    private readonly Random _pitchMarkerRandom = new();

    private GameState? _game;
    private HighSchoolProfile? _selectedSchool;
    private bool _suppressAcademicEvents;

    private readonly ObservableCollection<StatEntry> _physicalStats = new();
    private readonly ObservableCollection<StatEntry> _technicalStats = new();
    private readonly ObservableCollection<StatEntry> _mentalStats = new();
    private readonly ObservableCollection<SchoolSelectionView> _playableSchools = new();
    private readonly ObservableCollection<RoutineCardView> _routineCards = new();
    private readonly ObservableCollection<RoutineDayView> _routineDayViews = new();
    private readonly ObservableCollection<ScheduleEntryView> _scheduleEntries = new();
    private readonly ObservableCollection<CalendarMonthView> _calendarMonths = new();
    private readonly ObservableCollection<CalendarDayView> _currentCalendarDays = new();
    private readonly ObservableCollection<DayLogBlock> _logBlocks = new();
    private readonly ObservableCollection<PitchMarkerViewModel> _pitchMarkers = new();
    private readonly ObservableCollection<string> _recentMatchSummaries = new();
    private readonly ObservableCollection<MatchInningView> _matchInnings = new();
    private readonly ObservableCollection<MatchLineupView> _matchHomeLineup = new();
    private readonly ObservableCollection<MatchLineupView> _matchGuestLineup = new();
    private readonly ObservableCollection<MatchRosterView> _matchHomeRoster = new();
    private readonly ObservableCollection<MatchRosterView> _matchGuestRoster = new();
    private readonly ObservableCollection<RosterMemberView> _rosterMembers = new();
    private readonly ObservableCollection<RosterStaffView> _rosterStaffMembers = new();
    private readonly ObservableCollection<RosterStatView> _rosterPhysicalStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterPitchingStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterBattingStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterMentalStats = new();
    private readonly ObservableCollection<RosterStatView> _rosterHiddenStats = new();
    private readonly ObservableCollection<LoopPreviewItem> _loopPreviewItems = new();
    private readonly ObservableCollection<string> _academicLogs = new();
    private readonly ObservableCollection<AcademicOption> _academicLectureOptions = new();
    private readonly ObservableCollection<AcademicOption> _academicSupportOptions = new();
    private readonly ObservableCollection<AcademicOption> _academicStudyOptions = new();
    private readonly ObservableCollection<SeasonStandingView> _seasonStandings = new();
    private readonly ObservableCollection<TournamentRoundView> _tournamentRounds = new();
    private readonly ObservableCollection<SeasonMatchRecordView> _seasonMatchHistory = new();
    private readonly StringBuilder _matchOverlayLogBuilder = new();
    private readonly Dictionary<string, (int Column, int Row)> _zoneGridLookup;

    private readonly List<SectionItem> _sections =
    [
        new SectionItem("홈", SectionType.Home),
        new SectionItem("메시지", SectionType.Messages),
        new SectionItem("정보", SectionType.Info),
        new SectionItem("로스터", SectionType.Roster),
        new SectionItem("훈련", SectionType.Training),
        new SectionItem("학업", SectionType.Academics),
        new SectionItem("일정", SectionType.Schedule),
        new SectionItem("리그/대회", SectionType.Season),
        new SectionItem("기록", SectionType.Records)
    ];

    private SectionType _currentSection = SectionType.Home;
    private RosterMemberView? _currentRosterSelection;
    private int _pitchMarkerSequence;
    private RoutineDayView? _selectedRoutineDay;
    private int _routineWeekCursor = 1;
    private string? _editingRoutineId;
    private bool _isCreatingRoutine;
    private bool _matchPanelInitialized;

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
        RoutineCardList.ItemsSource = _routineCards;
        RoutineWeekGrid.ItemsSource = _routineDayViews;
        ScheduleList.ItemsSource = _scheduleEntries;
        CalendarDayGrid.ItemsSource = _currentCalendarDays;
        MatchTargetZoneCombo.ItemsSource = _targetZones;
        MatchTargetZoneCombo.SelectedIndex = 4;
        MatchPitchIntentCombo.SelectedIndex = 0;
        LogBlockList.ItemsSource = _logBlocks;
        MessageLogList.ItemsSource = _logBlocks;
        PitchMarkerItems.ItemsSource = _pitchMarkers;
        PitchResultList.ItemsSource = _pitchMarkers;
        RecentMatchList.ItemsSource = _recentMatchSummaries;
        MatchInningHeaderList.ItemsSource = _matchInnings;
        MatchInningHomeList.ItemsSource = _matchInnings;
        MatchInningGuestList.ItemsSource = _matchInnings;
        LineupHomeList.ItemsSource = _matchHomeLineup;
        LineupGuestList.ItemsSource = _matchGuestLineup;
        RosterHomeList.ItemsSource = _matchHomeRoster;
        RosterGuestList.ItemsSource = _matchGuestRoster;
        RosterList.ItemsSource = _rosterMembers;
        RosterStaffList.ItemsSource = _rosterStaffMembers;
        RosterPhysicalList.ItemsSource = _rosterPhysicalStats;
        RosterPitchingList.ItemsSource = _rosterPitchingStats;
        RosterBattingList.ItemsSource = _rosterBattingStats;
        RosterMentalList.ItemsSource = _rosterMentalStats;
        RosterHiddenList.ItemsSource = _rosterHiddenStats;
        HomeUpcomingList.ItemsSource = _loopPreviewItems;
        InfoLoopList.ItemsSource = _loopPreviewItems;
        AcademicLogList.ItemsSource = _academicLogs;
        AcademicLectureCombo.ItemsSource = _academicLectureOptions;
        AcademicSupportCombo.ItemsSource = _academicSupportOptions;
        AcademicStudyCombo.ItemsSource = _academicStudyOptions;
        LeagueTableList.ItemsSource = _seasonStandings;
        TournamentRoundList.ItemsSource = _tournamentRounds;
        SeasonMatchHistoryList.ItemsSource = _seasonMatchHistory;

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

    private void RefreshRoutinePanel()
    {
        RefreshRoutineCards();
        RefreshRoutineWeek();
    }

    private void RoutineAddButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        _isCreatingRoutine = true;
        _editingRoutineId = null;
        OpenRoutineEditor(null);
    }

    private void RoutineEditButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button { Tag: string routineId }) return;
        _isCreatingRoutine = false;
        _editingRoutineId = routineId;
        OpenRoutineEditor(routineId);
    }

    private void RoutineDeleteButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button { Tag: string routineId }) return;
        if (MessageBox.Show(this, "선택한 커스텀 루틴을 삭제할까요?", "루틴 삭제", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
        {
            return;
        }

        if (!_game.RemoveRoutineTemplate(routineId))
        {
            MessageBox.Show(this, "루틴을 삭제할 수 없습니다.", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        RefreshRoutinePanel();
    }

    private void RoutineResetButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button { Tag: string routineId }) return;
        if (!_game.ResetRoutineTemplate(routineId))
        {
            MessageBox.Show(this, "루틴을 복원할 수 없습니다.", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        RefreshRoutinePanel();
    }

    private void OpenRoutineEditor(string? routineId)
    {
        if (_game is null) return;

        RoutineEditorErrorText.Text = string.Empty;
        RoutineEditorOverlay.Visibility = Visibility.Visible;
        RoutineEditorTitleText.Text = _isCreatingRoutine ? "커스텀 루틴 추가" : "루틴 편집";

        var actions = _game.AvailableActions;
        RoutineEditorMorningCombo.ItemsSource = actions;
        RoutineEditorAfternoonCombo.ItemsSource = actions;
        RoutineEditorEveningCombo.ItemsSource = actions;

        if (_isCreatingRoutine || string.IsNullOrWhiteSpace(routineId))
        {
            RoutineEditorNameText.Text = string.Empty;
            RoutineEditorMorningCombo.SelectedIndex = actions.Count > 0 ? 0 : -1;
            RoutineEditorAfternoonCombo.SelectedIndex = actions.Count > 1 ? 1 : 0;
            RoutineEditorEveningCombo.SelectedIndex = actions.Count > 2 ? 2 : 0;
            return;
        }

        var template = _game.GetRoutineTemplate(routineId);
        if (template is null)
        {
            RoutineEditorErrorText.Text = "루틴 데이터를 찾을 수 없습니다.";
            return;
        }

        RoutineEditorNameText.Text = template.Name;
        RoutineEditorMorningCombo.SelectedItem = template.Morning;
        RoutineEditorAfternoonCombo.SelectedItem = template.Afternoon;
        RoutineEditorEveningCombo.SelectedItem = template.Evening;
    }

    private void CloseRoutineEditor()
    {
        RoutineEditorOverlay.Visibility = Visibility.Collapsed;
        RoutineEditorErrorText.Text = string.Empty;
        _editingRoutineId = null;
        _isCreatingRoutine = false;
    }

    private void RefreshRoutineCards()
    {
        _routineCards.Clear();
        if (_game is null) return;
        var stateMap = _game.RoutineStates.ToDictionary(s => s.Template.Id, s => s.Mastery, StringComparer.OrdinalIgnoreCase);
        foreach (var template in _game.RoutineTemplates)
        {
            var mastery = stateMap.TryGetValue(template.Id, out var value) ? value : 0;
            _routineCards.Add(new RoutineCardView(template, mastery));
        }
    }

    private void RefreshAcademicSummary()
    {
        _academicLogs.Clear();
        if (_game is null)
        {
            AcademicKnowledgeText.Text = "-";
            AcademicFocusText.Text = "-";
            AcademicGradeText.Text = "-";
            AcademicScholarshipText.Text = "-";
            AcademicWarningText.Text = "-";
            return;
        }

        var snapshot = _game.BuildAcademicSnapshot();
        AcademicKnowledgeText.Text = $"{snapshot.Knowledge:F1}";
        AcademicFocusText.Text = $"{snapshot.Focus:F1}";
        AcademicGradeText.Text = snapshot.CompletedTerms > 0 ? $"{snapshot.AverageGrade:F1}등급" : "미산정";
        AcademicScholarshipText.Text = snapshot.Scholarship.ToString("F1");
        AcademicWarningText.Text = snapshot.Warning.ToString("F1");

        foreach (var entry in _game.LogEntries
                     .Where(line => line.StartsWith("[학업]", StringComparison.Ordinal))
                     .TakeLast(20))
        {
            _academicLogs.Add(entry);
        }

        RefreshAcademicOptions();
    }

    private void RefreshAcademicOptions()
    {
        if (_game is null) return;
        UpdateAcademicOptionCollection(_academicLectureOptions, _game.GetAcademicOptions(AcademicSlot.Lecture));
        UpdateAcademicOptionCollection(_academicSupportOptions, _game.GetAcademicOptions(AcademicSlot.Support));
        UpdateAcademicOptionCollection(_academicStudyOptions, _game.GetAcademicOptions(AcademicSlot.Study));

        _suppressAcademicEvents = true;
        AcademicLectureCombo.SelectedItem = FindAcademicSelection(_academicLectureOptions, _game.GetAcademicPlan(AcademicSlot.Lecture));
        AcademicSupportCombo.SelectedItem = FindAcademicSelection(_academicSupportOptions, _game.GetAcademicPlan(AcademicSlot.Support));
        AcademicStudyCombo.SelectedItem = FindAcademicSelection(_academicStudyOptions, _game.GetAcademicPlan(AcademicSlot.Study));
        _suppressAcademicEvents = false;
        UpdateAcademicDescriptions();
    }

    private static AcademicOption? FindAcademicSelection(IEnumerable<AcademicOption> options, EducationAction? action)
        => action is null
            ? options.FirstOrDefault()
            : options.FirstOrDefault(o => o.Action == action) ?? options.FirstOrDefault();

    private static void UpdateAcademicOptionCollection(ObservableCollection<AcademicOption> target, IReadOnlyList<AcademicOption> source)
    {
        target.Clear();
        foreach (var option in source)
        {
            target.Add(option);
        }
    }

    private void RefreshRoutineWeek()
    {
        var selectedDayNumber = _selectedRoutineDay?.Day;
        _routineDayViews.Clear();
        if (_game is null) return;
        _routineWeekCursor = Math.Clamp(_routineWeekCursor, 1, _game.TotalWeeks);
        var blocks = _game.GetWeekRoutineBlocks(_routineWeekCursor);
        foreach (var block in blocks)
        {
            var template = _game.RoutineTemplates.FirstOrDefault(t => t.Id.Equals(block.RoutineId, StringComparison.OrdinalIgnoreCase));
            _routineDayViews.Add(new RoutineDayView(block, template?.Name ?? block.RoutineId));
        }

        RoutineWeekLabel.Text = $"주차 {_routineWeekCursor}";
        if (_routineDayViews.Count > 0)
        {
            var matched = _routineDayViews.FirstOrDefault(v => v.Day == selectedDayNumber);
            if (matched is not null)
            {
                SetSelectedRoutineDay(matched);
            }
            else
            {
                SetSelectedRoutineDay(_routineDayViews.FirstOrDefault(v => !v.IsLocked) ?? _routineDayViews.First());
            }
        }
        else
        {
            SetSelectedRoutineDay(null);
        }
    }

    private void SetSelectedRoutineDay(RoutineDayView? view)
    {
        _selectedRoutineDay = view;
        UpdateRoutineDaySelection();
    }

    private void UpdateRoutineDaySelection()
    {
        foreach (var day in _routineDayViews)
        {
            day.IsSelected = _selectedRoutineDay == day;
        }

        SelectedRoutineDayText.Text = _selectedRoutineDay is null
            ? "날짜를 선택하세요"
            : $"{_selectedRoutineDay.Label} · {_selectedRoutineDay.RoutineName}";
    }

    private void InitializeGame(HighSchoolProfile school, int academicYear)
    {
        if (_game is not null)
        {
            _game.LogEntries.CollectionChanged -= GameLogEntries_CollectionChanged;
            _game.PendingMessages.CollectionChanged -= PendingMessages_CollectionChanged;
        }

        _game = GameState.CreateHighSchoolSeason(school, academicYear);
        _game.LogEntries.CollectionChanged += GameLogEntries_CollectionChanged;
        _game.PendingMessages.CollectionChanged += PendingMessages_CollectionChanged;
        RefreshSummary();
        BindAcademicActions();
        RefreshStats();
        _routineWeekCursor = _game.CurrentWeek;
        _selectedRoutineDay = null;
        RefreshRoutinePanel();
        RefreshScheduleEntries();
        RefreshCalendarMonths();
        UpdateDayLabel();
        UpdateMatchStatus();
        RebuildLogBlocks();
        RefreshAcademicSummary();
        BindPendingMessages();
        SchoolSelectionOverlay.Visibility = Visibility.Collapsed;
    }

    private void BindAcademicActions()
    {
        RefreshAcademicOptions();
    }

    private void BindPendingMessages()
    {
        if (_game is null)
        {
            HomeMessageList.ItemsSource = null;
            MessagesList.ItemsSource = null;
            UpdateMessageSummary();
            return;
        }

        HomeMessageList.ItemsSource = _game.PendingMessages;
        MessagesList.ItemsSource = _game.PendingMessages;
        UpdateMessageSummary();
        UpdateHeaderMatchStatus();
    }

    private void PendingMessages_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        => UpdateMessageSummary();

    private void UpdateMessageSummary()
    {
        if (_game is null)
        {
            HomeMessageCountText.Text = "-";
            HomeMessageEmptyText.Visibility = Visibility.Visible;
            MessagesEmptyText.Visibility = Visibility.Visible;
            HeaderMessageButton.Content = "메시지 0";
            HeaderMessageButton.IsEnabled = false;
            AdvanceButton.IsEnabled = false;
            AdvanceButton.ToolTip = "게임 데이터를 먼저 불러오세요.";
            return;
        }

        var count = _game.PendingMessages.Count;
        HomeMessageCountText.Text = $"대기 메시지 {count}건";
        HomeMessageEmptyText.Visibility = count == 0 ? Visibility.Visible : Visibility.Collapsed;
        MessagesEmptyText.Visibility = count == 0 ? Visibility.Visible : Visibility.Collapsed;
        HeaderMessageButton.Content = $"메시지 {count}";
        HeaderMessageButton.IsEnabled = count > 0;
        AdvanceButton.IsEnabled = count == 0;
        AdvanceButton.ToolTip = count == 0 ? null : "대기 메시지를 먼저 선택하세요.";
    }

    private void SwitchToSection(SectionType section)
    {
        var target = _sections.FirstOrDefault(item => item.Type == section);
        if (target is null)
        {
            _currentSection = section;
            UpdateSectionPanels();
            return;
        }

        SectionList.SelectedItem = target;
    }

    private void HeaderMessageButton_OnClick(object sender, RoutedEventArgs e)
        => SwitchToSection(SectionType.Messages);

    private void HeaderMatchButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game?.MatchPending == true)
        {
            SetMatchPageVisibility(true);
            return;
        }

        MessageBox.Show(this, "현재 진행 중인 경기가 없습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void UpdateAcademicDescriptions()
    {
        AcademicLectureDescription.Text = (AcademicLectureCombo.SelectedItem as AcademicOption)?.Description ?? string.Empty;
        AcademicSupportDescription.Text = (AcademicSupportCombo.SelectedItem as AcademicOption)?.Description ?? string.Empty;
        AcademicStudyDescription.Text = (AcademicStudyCombo.SelectedItem as AcademicOption)?.Description ?? string.Empty;
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
        _seasonStandings.Clear();
        _tournamentRounds.Clear();
        _seasonMatchHistory.Clear();
        SeasonPitchingStatsText.Text = string.Empty;
        HeaderMatchStatusText.Text = "경기 없음";
        HeaderMatchButton.IsEnabled = false;
        return;
    }

        var player = _game.Player;
        PlayerSummaryText.Text = $"{player.School} · {player.AcademicYear}학년 {player.Position} | {player.Name}";
        PitchInfoText.Text = $"투구 스타일 {player.PitchStyle} / 구종: {string.Join(", ", player.PitchArsenal)}";
        InfoSchoolText.Text = $"{player.School} / {player.Position}";
        InfoPitchStyleText.Text = player.PitchStyle;
        PitchList.ItemsSource = player.PitchArsenal;
        MatchPitchTypeCombo.ItemsSource = player.PitchArsenal;
        MatchPitchTypeCombo.SelectedIndex = player.PitchArsenal.Count > 0 ? 0 : -1;
        RefreshLoopStatePanel();
        RefreshRecentMatches();
        RefreshRosterMembers();
        RefreshSeasonPanel();
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

    private void RefreshSeasonPanel()
    {
        _seasonStandings.Clear();
        _tournamentRounds.Clear();
        _seasonMatchHistory.Clear();

        if (_game is null)
        {
            SeasonPitchingStatsText.Text = string.Empty;
            return;
        }

        var teamLookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (_game.LeagueSchedule is { } schedule)
        {
            foreach (var match in schedule.Matches)
            {
                teamLookup[match.HomeTeamId] = match.HomeTeamName;
                teamLookup[match.AwayTeamId] = match.AwayTeamName;
            }
        }

        foreach (var record in _game.SeasonTracker.TeamRecords.Values)
        {
            teamLookup[record.TeamId] = record.TeamName;
        }

        var standings = new List<SeasonStandingView>();
        var playerTeamId = _game.School.Id;
        foreach (var entry in teamLookup)
        {
            if (_game.SeasonTracker.TeamRecords.TryGetValue(entry.Key, out var record))
            {
                standings.Add(new SeasonStandingView(record, playerTeamId));
            }
            else
            {
                standings.Add(new SeasonStandingView(entry.Key, entry.Value, playerTeamId));
            }
        }

        foreach (var row in standings
                     .OrderByDescending(r => r.WinRate)
                     .ThenByDescending(r => r.RunDiff)
                     .ThenByDescending(r => r.RunsFor)
                     .ThenBy(r => r.TeamName, StringComparer.OrdinalIgnoreCase))
        {
            _seasonStandings.Add(row);
        }

        if (_game.TournamentBracket is { } bracket)
        {
            foreach (var round in bracket.Rounds)
            {
                var roundView = new TournamentRoundView($"{bracket.Name} {round.Label} (Day {round.Day})");
                foreach (var match in round.Matches)
                {
                    var home = match.Home?.TeamName ?? "TBD";
                    var away = match.Away?.TeamName ?? "TBD";
                    var status = match.Winner is null ? "예정" : $"{match.Winner.TeamName} 승";
                    var isPlayerMatch = match.HasTeam(playerTeamId);
                    roundView.Matches.Add(new TournamentMatchView(home, away, status, isPlayerMatch));
                }

                _tournamentRounds.Add(roundView);
            }
        }

        var pitching = _game.SeasonTracker.PlayerPitching;
        SeasonPitchingStatsText.Text = pitching.Games == 0
            ? "아직 공식 기록이 없습니다."
            : $"경기 {pitching.Games} · 승패 {pitching.Wins}-{pitching.Losses} · 이닝 {pitching.InningsPitched:0.0} · ERA {pitching.Era:0.00} · WHIP {pitching.Whip:0.00} · K {pitching.Strikeouts} · BB {pitching.WalksAllowed}";
        SeasonDraftSummaryText.Text = _game.GetDraftSummaryText();

        foreach (var record in _game.SeasonTracker.MatchHistory
                     .OrderByDescending(r => r.Day)
                     .ThenByDescending(r => r.Kind))
        {
            _seasonMatchHistory.Add(new SeasonMatchRecordView(record, _game.School.Id));
        }
    }

    private void AdvanceButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (_game.PendingMessages.Any())
        {
            MessageBox.Show(this, "선택 메시지를 먼저 처리하세요.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            SwitchToSection(SectionType.Messages);
            return;
        }

        var card = _game.PrepareTodayChoiceCard();
        if (card is not null && card.Options.Count > 0)
        {
            if (!_game.PendingMessages.Any(m => m.CardId.Equals(card.Id, StringComparison.OrdinalIgnoreCase)))
            {
                var messageId = $"{card.Id}_daily_{DateTime.Now:yyyyMMddHHmmssfff}";
                _game.PendingMessages.Add(new PendingChoiceMessage(messageId, card));
            }

            SwitchToSection(SectionType.Messages);
            return;
        }

        CompleteDayAdvance();
    }

    private void CompleteDayAdvance()
    {
        if (_game is null) return;
        _game.AdvanceDay();
        RefreshStats();
        RefreshSummary();
        UpdateDayLabel();
        RefreshRoutinePanel();
        RefreshAcademicSummary();
        UpdateMatchStatus();

        var snapshot = BuildLogBlocksSnapshot();
        RebuildLogBlocks(snapshot);
    }

    private void MessageOptionButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button button) return;
        if (button.DataContext is not DailyChoiceOption option) return;
        if (button.Tag is not string messageId) return;

        _game.ResolveMessageChoice(messageId, option.Id);
        UpdateMessageSummary();
    }

    private void MessageDefaultButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button { DataContext: PendingChoiceMessage message }) return;

        _game.ResolveMessageChoice(message.Id, null);
        UpdateMessageSummary();
    }

    private void MainWindow_OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Space) return;
        if (IsFocusInTextInputOrButton())
        {
            return;
        }

        AdvanceButton_OnClick(AdvanceButton, new RoutedEventArgs());
        e.Handled = true;
    }

    private static bool IsFocusInTextInputOrButton()
    {
        var focused = Keyboard.FocusedElement as DependencyObject;
        while (focused is not null)
        {
            if (focused is TextBox || focused is ComboBox || focused is Button || focused is TextBoxBase)
            {
                return true;
            }

            focused = VisualTreeHelper.GetParent(focused);
        }

        return false;
    }

    private void RoutineEditorSaveButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (RoutineEditorMorningCombo.SelectedItem is not DailyAction morning ||
            RoutineEditorAfternoonCombo.SelectedItem is not DailyAction afternoon ||
            RoutineEditorEveningCombo.SelectedItem is not DailyAction evening)
        {
            RoutineEditorErrorText.Text = "모든 활동을 선택하세요.";
            return;
        }

        var name = RoutineEditorNameText.Text;

        bool success;
        if (_isCreatingRoutine)
        {
            _game.CreateCustomRoutine(name, morning, afternoon, evening);
            success = true;
        }
        else
        {
            if (string.IsNullOrWhiteSpace(_editingRoutineId))
            {
                RoutineEditorErrorText.Text = "편집할 루틴을 찾지 못했습니다.";
                return;
            }
            success = _game.UpdateRoutineTemplate(_editingRoutineId, name, morning, afternoon, evening);
        }

        if (!success)
        {
            RoutineEditorErrorText.Text = "루틴을 저장할 수 없습니다.";
            return;
        }

        CloseRoutineEditor();
        RefreshRoutinePanel();
    }

    private void RoutineEditorCancelButton_OnClick(object sender, RoutedEventArgs e)
        => CloseRoutineEditor();

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

        if (_routineWeekCursor != _game.CurrentWeek)
        {
            _routineWeekCursor = _game.CurrentWeek;
            RefreshRoutineWeek();
        }
    }

    private void RefreshLoopStatePanel()
    {
        if (_game is null) return;
        var snapshot = _game.BuildLoopSnapshot();
        LoopAcademicYearText.Text = $"{snapshot.AcademicYear}학년";
        LoopCalendarText.Text = $"{snapshot.Month}월 {snapshot.DayOfMonth}일 (Day {snapshot.DayOfYear})";
        LoopWeekText.Text = $"기간 W{snapshot.WeekOfYear} · 이번 달 {snapshot.WeekOfMonth}주차";
        LoopPhaseText.Text = snapshot.PhaseLabel;
        LoopMoodText.Text = snapshot.SeasonMood;
        LoopTrainingText.Text = $"일과 {snapshot.Fatigue:F0} / 집중 {snapshot.Focus:F0} | 훈련 부하 {snapshot.TrainingLoad:F0}";
        if (snapshot.UpcomingEvent is null)
        {
            LoopUpcomingText.Text = "예정 이벤트 없음";
        }
        else
        {
            var countdown = snapshot.UpcomingEvent.DaysUntil == 0 ? "오늘" : $"D-{snapshot.UpcomingEvent.DaysUntil}";
            LoopUpcomingText.Text = $"{snapshot.UpcomingEvent.Title} ({snapshot.UpcomingEvent.Category}) · {countdown}\n{snapshot.UpcomingEvent.Preview}";
        }

        UpdateLoopPreviewFromGame(snapshot.DayOfYear);
    }

    private void SectionList_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SectionList.SelectedItem is SectionItem item)
        {
            _currentSection = item.Type;
            UpdateSectionPanels();
        }
    }

    private void RoutineDayButton_OnClick(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.DataContext is not RoutineDayView view)
        {
            return;
        }

        if (view.IsLocked)
        {
            MessageBox.Show(this, view.LockReason ?? "잠금된 날짜입니다.", "루틴 잠금", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        SetSelectedRoutineDay(view);
    }

    private void RoutineCardApplyButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (_selectedRoutineDay is null)
        {
            MessageBox.Show(this, "먼저 날짜를 선택하세요", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (sender is not Button { Tag: string routineId }) return;
        if (!_game.TryAssignRoutineToDay(_selectedRoutineDay.Day, routineId, out var message))
        {
            MessageBox.Show(this, message ?? "루틴을 변경할 수 없습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        RefreshRoutineWeek();
    }

    private void CoachRecommendationButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (sender is not Button { Tag: string tag }) return;
        _game.ApplyCoachRecommendation(tag);
        RefreshRoutineWeek();
    }

    private void RoutineWeekPrevButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (_routineWeekCursor <= 1) return;
        _routineWeekCursor--;
        RefreshRoutineWeek();
    }

    private void RoutineWeekNextButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null) return;
        if (_routineWeekCursor >= _game.TotalWeeks) return;
        _routineWeekCursor++;
        RefreshRoutineWeek();
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
        MessagesPanel.Visibility = _currentSection == SectionType.Messages ? Visibility.Visible : Visibility.Collapsed;
        InfoPanel.Visibility = _currentSection == SectionType.Info ? Visibility.Visible : Visibility.Collapsed;
        RosterPanel.Visibility = _currentSection == SectionType.Roster ? Visibility.Visible : Visibility.Collapsed;
        TrainingPanel.Visibility = _currentSection == SectionType.Training ? Visibility.Visible : Visibility.Collapsed;
        AcademicPanel.Visibility = _currentSection == SectionType.Academics ? Visibility.Visible : Visibility.Collapsed;
        SchedulePanel.Visibility = _currentSection == SectionType.Schedule ? Visibility.Visible : Visibility.Collapsed;
        SeasonPanel.Visibility = _currentSection == SectionType.Season ? Visibility.Visible : Visibility.Collapsed;
        RecordsPanel.Visibility = _currentSection == SectionType.Records ? Visibility.Visible : Visibility.Collapsed;
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

    private void InitializeMatchPanel(MatchSnapshot snapshot)
    {
        if (_game is null) return;
        HideCoachPrompt();
        ResetMatchOverlayLog($"--- {snapshot.MatchLabel} vs {snapshot.Opponent} 시작 ---");
        ResetPitchMarkers();

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
        MatchBatterThreatText.Text = $"위협도 {snapshot.BatterThreatLabel}";
        MatchBatterContactText.Text = $"{snapshot.BatterContact:F1}";
        MatchBatterPowerText.Text = $"{snapshot.BatterPower:F1}";
        MatchBatterEyeText.Text = $"{snapshot.BatterEye:F1}";

        UpdateMatchSummaryPanel(snapshot);
    }

    private void UpdateMatchSummaryPanel(MatchSnapshot snapshot)
    {
        if (_game is null)
        {
            SetMatchPageVisibility(false);
            return;
        }

        SetMatchPageVisibility(_game.MatchPending);
        if (!_game.MatchPending)
        {
            return;
        }

        BaseFirst.Fill = snapshot.OnFirst ? new SolidColorBrush(Color.FromRgb(255, 214, 110)) : new SolidColorBrush(Color.FromRgb(42, 47, 66));
        BaseSecond.Fill = snapshot.OnSecond ? new SolidColorBrush(Color.FromRgb(94, 214, 184)) : new SolidColorBrush(Color.FromRgb(42, 47, 66));
        BaseThird.Fill = snapshot.OnThird ? new SolidColorBrush(Color.FromRgb(255, 122, 96)) : new SolidColorBrush(Color.FromRgb(42, 47, 66));

        UpdateCountLights(snapshot.CountText);
        UpdateScoreboard();
        UpdateLineups();
        UpdateRosters();
    }

    private void UpdateCountLights(string countText)
    {
        var balls = 0;
        var strikes = 0;
        var outs = 0;

        var parts = countText.Split('/');
        if (parts.Length > 0)
        {
            var bs = parts[0].Trim();
            var bIndex = bs.IndexOf('B');
            var sIndex = bs.IndexOf('S');
            if (bIndex >= 0 && sIndex > bIndex)
            {
                int.TryParse(bs.Substring(bIndex + 1, sIndex - bIndex - 1), out balls);
            }
            if (sIndex >= 0)
            {
                var sPart = bs.Substring(sIndex + 1);
                int.TryParse(sPart, out strikes);
            }
        }
        if (parts.Length > 1)
        {
            var outText = parts[1].Trim();
            var digits = new string(outText.Where(char.IsDigit).ToArray());
            int.TryParse(digits, out outs);
        }

        SetLight(MatchBall1, balls >= 1, BallBrush);
        SetLight(MatchBall2, balls >= 2, BallBrush);
        SetLight(MatchBall3, balls >= 3, BallBrush);
        SetLight(MatchStrike1, strikes >= 1, StrikeBrush);
        SetLight(MatchStrike2, strikes >= 2, StrikeBrush);
        SetLight(MatchOut1, outs >= 1, OutBrush);
        SetLight(MatchOut2, outs >= 2, OutBrush);
    }

    private static void SetLight(Ellipse ellipse, bool isOn, Brush onBrush)
    {
        ellipse.Fill = isOn ? onBrush : new SolidColorBrush(Color.FromRgb(42, 47, 66));
    }

    private void UpdateScoreboard()
    {
        _matchInnings.Clear();
        if (_game is null) return;
        var board = _game.GetMatchScoreboardSnapshot();
        if (board is null) return;

        MatchHomeLabelText.Text = board.HomeLabel;
        MatchGuestLabelText.Text = board.GuestLabel;
        MatchHomeRunsText.Text = board.HomeRuns.ToString();
        MatchHomeHitsText.Text = board.HomeHits.ToString();
        MatchHomeErrorsText.Text = board.HomeErrors.ToString();
        MatchGuestRunsText.Text = board.GuestRuns.ToString();
        MatchGuestHitsText.Text = board.GuestHits.ToString();
        MatchGuestErrorsText.Text = board.GuestErrors.ToString();

        foreach (var inning in board.Innings)
        {
            _matchInnings.Add(new MatchInningView(
                inning.Inning.ToString(),
                inning.HomeRuns?.ToString() ?? string.Empty,
                inning.GuestRuns?.ToString() ?? string.Empty));
        }
    }

    private void UpdateLineups()
    {
        _matchHomeLineup.Clear();
        _matchGuestLineup.Clear();
        if (_game is null) return;
        var lineup = _game.GetMatchLineupSnapshot();
        if (lineup is null) return;

        LineupHomeLabelText.Text = lineup.HomeLabel;
        LineupGuestLabelText.Text = lineup.GuestLabel;

        foreach (var entry in lineup.Home)
        {
            _matchHomeLineup.Add(new MatchLineupView(entry.Order, entry.Name, entry.Bats, entry.Rating));
        }
        foreach (var entry in lineup.Guest)
        {
            _matchGuestLineup.Add(new MatchLineupView(entry.Order, entry.Name, entry.Bats, entry.Rating));
        }

        if (_matchHomeLineup.Count == 0)
        {
            _matchHomeLineup.Add(new MatchLineupView(0, "라인업 없음", "-", 0));
        }

        if (_matchGuestLineup.Count == 0)
        {
            _matchGuestLineup.Add(new MatchLineupView(0, "라인업 없음", "-", 0));
        }
    }

    private void UpdateRosters()
    {
        _matchHomeRoster.Clear();
        _matchGuestRoster.Clear();
        if (_game is null) return;
        var roster = _game.GetMatchRosterSnapshot();
        if (roster is null) return;

        RosterHomeLabelText.Text = roster.HomeLabel;
        RosterGuestLabelText.Text = roster.GuestLabel;

        foreach (var entry in roster.Home)
        {
            _matchHomeRoster.Add(new MatchRosterView(entry.Name, entry.Year, entry.Position));
        }
        foreach (var entry in roster.Guest)
        {
            _matchGuestRoster.Add(new MatchRosterView(entry.Name, entry.Year, entry.Position));
        }

        if (_matchHomeRoster.Count == 0)
        {
            _matchHomeRoster.Add(new MatchRosterView("로스터 없음", 0, "-"));
        }

        if (_matchGuestRoster.Count == 0)
        {
            _matchGuestRoster.Add(new MatchRosterView("로스터 없음", 0, "-"));
        }
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
            RefreshSeasonPanel();
        }
    }

    private void MatchCloseButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_game is null || !_game.MatchPending)
        {
            SetMatchPageVisibility(false);
            _matchPanelInitialized = false;
            return;
        }

        MessageBox.Show(this, "경기를 모두 진행한 뒤에 종료할 수 있습니다.", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void SetMatchPageVisibility(bool isVisible)
    {
        MatchPagePanel.Visibility = isVisible ? Visibility.Visible : Visibility.Collapsed;
        MainLayout.Visibility = isVisible ? Visibility.Collapsed : Visibility.Visible;
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
        PitchEventType.CalledStrike or PitchEventType.SwingingStrike or PitchEventType.Foul => StrikeBrush,
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
        PitchEventType.Foul => "파울",
        PitchEventType.Ball => "볼",
        PitchEventType.Walk => "볼넷",
        PitchEventType.BallInPlayOut => "인플레이 아웃",
        PitchEventType.BallInPlayHit => "안타",
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
            normalized.Contains("실점했습니다", StringComparison.Ordinal))
        {
            return PitchEventType.CalledStrike;
        }

        if (normalized.Contains("볼넷", StringComparison.Ordinal))
        {
            return PitchEventType.Walk;
        }

        if (normalized.Contains("파울", StringComparison.Ordinal))
        {
            return PitchEventType.Foul;
        }

        if (normalized.Contains("볼 판정", StringComparison.Ordinal) ||
            normalized.Contains("볼 판정", StringComparison.CurrentCulture) ||
            normalized.Contains("볼 내용", StringComparison.Ordinal))
        {
            return PitchEventType.Ball;
        }

        if (normalized.Contains("히트", StringComparison.Ordinal) ||
            normalized.Contains("홈런", StringComparison.Ordinal))
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
        if (MatchOverlayLogTextBlock is null || MatchOverlayLogScroll is null) return;
        var text = _matchOverlayLogBuilder.ToString();
        MatchOverlayLogTextBlock.Text = text;
        MatchOverlayLogTextBlock.Dispatcher.BeginInvoke(new Action(() =>
        {
            MatchOverlayLogTextBlock.UpdateLayout();
            MatchOverlayLogScroll.UpdateLayout();
            MatchOverlayLogScroll.ScrollToEnd();
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
            RefreshSeasonPanel();
        }
    }

    private DayLogBlock? RebuildLogBlocks(List<DayLogBlock>? snapshot = null)
    {
        if (_game is null) return null;

        var blocks = snapshot ?? BuildLogBlocksSnapshot();
        var latestBlock = blocks.Count > 0 ? blocks[^1] : null;
        for (var i = 0; i < blocks.Count; i++)
        {
            blocks[i].IsLatest = i == blocks.Count - 1;
        }

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
        SelectedSchoolPhilosophy.Text = "학교를 선택하세요";
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
            MessageBox.Show(this, "입학할 학교를 선택하세요", "안내", MessageBoxButton.OK, MessageBoxImage.Information);
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
        Messages,
        Info,
        Roster,
        Training,
        Academics,
        Schedule,
        Season,
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
                : "로스터 데이터가 필요합니다.";
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
        public string LoopPreviewSummary { get; private set; } = "기간 루프 데이터 준비 중";
        public IReadOnlyList<TopPlayerView> TopPlayers { get; }
        public IReadOnlyList<LoopPreviewItem> LoopPreview { get; private set; } = Array.Empty<LoopPreviewItem>();
        public int VarsityCount { get; }
        public int JuniorCount { get; }
        public double AvgOverall { get; }

        private static string BuildStatsLine(HighSchoolProfile profile)
        {
            static string FormatNumber(int value) => value <= 0 ? "-" : string.Format(Culture, "{0:N0}", value);
            return $"예산 {FormatNumber(profile.Budget)}원 | 학생수 {FormatNumber(profile.Enrollment)}명 | 평균 관중 {FormatNumber(profile.AverageAttendance)}명 | 충성도 {profile.FanLoyalty}";
        }

        private static string TranslateTier(string tier) => tier switch
        {
            "powerhouse" => "최강급",
            "mid" => "상위권",
            "developing" => "성장형",
            _ => "하위권"
        };

        private static string BuildStrengthLabel(double avg) => avg switch
        {
            >= 80 => "최강급 후보",
            >= 74 => "상위권 컨텐더",
            >= 68 => "중상위 경쟁력",
            >= 60 => "잠재력 있는 성장형",
            _ => "하위권"
        };

        public void ApplyLoopPreview(IReadOnlyList<LoopPreviewItem> preview)
        {
            LoopPreview = preview;
            LoopPreviewSummary = preview.Count > 0
                ? string.Join(" / ", preview.Select(p => $"{p.Label} {p.Category}"))
                : "기간 루프 데이터 준비 중";
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
            Preview = string.IsNullOrWhiteSpace(plannedEvent.Description)
                ? "추가 정보 준비 중"
                : plannedEvent.Description;
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
        public bool IsLatest { get; set; }
    }

    private sealed class RoutineCardView
    {
        public RoutineCardView(TrainingRoutineTemplate template, double mastery)
        {
            Id = template.Id;
            Name = template.Name;
            Subtitle = template.Subtitle;
            Focus = template.Focus;
            Description = template.Description;
            Mastery = mastery;
            TierLabel = mastery switch
            {
                >= 75 => "훈련 Lv3",
                >= 50 => "훈련 Lv2",
                >= 25 => "훈련 Lv1",
                _ => "훈련 준비"
            };
            MorningName = $"오전 · {template.Morning.Name}";
            AfternoonName = $"오후 · {template.Afternoon.Name}";
            EveningName = $"저녁 · {template.Evening.Name}";
            IsCustom = template.IsCustom || template.Id.StartsWith("custom_", StringComparison.OrdinalIgnoreCase);
            CanReset = !template.IsCustom && template.IsModified;
        }

        public string Id { get; }
        public string Name { get; }
        public string Subtitle { get; }
        public string Focus { get; }
        public string Description { get; }
        public double Mastery { get; }
        public string TierLabel { get; }
        public string MorningName { get; }
        public string AfternoonName { get; }
        public string EveningName { get; }
        public bool IsCustom { get; }
        public bool CanReset { get; }
    }

    private sealed class RoutineDayView : INotifyPropertyChanged
    {
        public RoutineDayView(RoutineDayBlock block, string routineName)
        {
            Day = block.DayIndex;
            Label = block.Label;
            RoutineName = routineName;
            IsLocked = block.IsLocked;
            LockReason = block.LockReason;
        }

        public int Day { get; }
        public string Label { get; }
        public string RoutineName { get; }
        public bool IsLocked { get; }
        public string? LockReason { get; }

        private bool _isSelected;
        public bool IsSelected
        {
            get => _isSelected;
            set => SetProperty(ref _isSelected, value);
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        private bool SetProperty<T>(ref T storage, T value, [CallerMemberName] string? propertyName = null)
        {
            if (EqualityComparer<T>.Default.Equals(storage, value)) return false;
            storage = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
            return true;
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

    private sealed class SeasonStandingView
    {
        public SeasonStandingView(TeamSeasonRecord record, string playerTeamId)
        {
            TeamId = record.TeamId;
            TeamName = record.TeamName;
            Wins = record.Wins;
            Losses = record.Losses;
            RunsFor = record.RunsFor;
            RunsAgainst = record.RunsAgainst;
            RunDiff = record.RunDiff;
            WinRate = record.WinRate;
            IsPlayerTeam = record.TeamId.Equals(playerTeamId, StringComparison.OrdinalIgnoreCase);
        }

        public SeasonStandingView(string teamId, string teamName, string playerTeamId)
        {
            TeamId = teamId;
            TeamName = teamName;
            Wins = 0;
            Losses = 0;
            RunsFor = 0;
            RunsAgainst = 0;
            RunDiff = 0;
            WinRate = 0;
            IsPlayerTeam = teamId.Equals(playerTeamId, StringComparison.OrdinalIgnoreCase);
        }

        public string TeamId { get; }
        public string TeamName { get; }
        public int Wins { get; }
        public int Losses { get; }
        public int RunsFor { get; }
        public int RunsAgainst { get; }
        public int RunDiff { get; }
        public double WinRate { get; }
        public string WinRateText => Wins + Losses == 0 ? "-" : WinRate.ToString("0.000", CultureInfo.InvariantCulture);
        public bool IsPlayerTeam { get; }
    }

    private sealed class TournamentRoundView
    {
        public TournamentRoundView(string label)
        {
            Label = label;
        }

        public string Label { get; }
        public ObservableCollection<TournamentMatchView> Matches { get; } = new();
    }

    private sealed class TournamentMatchView
    {
        public TournamentMatchView(string homeTeam, string awayTeam, string status, bool isPlayerMatch)
        {
            HomeTeam = homeTeam;
            AwayTeam = awayTeam;
            Status = status;
            IsPlayerMatch = isPlayerMatch;
        }

        public string HomeTeam { get; }
        public string AwayTeam { get; }
        public string Status { get; }
        public bool IsPlayerMatch { get; }
    }

    private sealed class SeasonMatchRecordView
    {
        public SeasonMatchRecordView(HighSchoolMatchRecord record, string playerTeamId)
        {
            Day = record.Day.ToString(CultureInfo.InvariantCulture);
            Kind = TranslateKind(record.Kind);
            Stage = string.IsNullOrWhiteSpace(record.StageLabel) ? "-" : record.StageLabel;

            var playerIsHome = record.HomeTeamId.Equals(playerTeamId, StringComparison.OrdinalIgnoreCase);
            var playerIsAway = record.AwayTeamId.Equals(playerTeamId, StringComparison.OrdinalIgnoreCase);

            if (playerIsHome)
            {
                Opponent = record.AwayTeamName;
                HomeAway = "홈";
                Score = $"{record.HomeRuns}-{record.AwayRuns}";
            }
            else if (playerIsAway)
            {
                Opponent = record.HomeTeamName;
                HomeAway = "원정";
                Score = $"{record.AwayRuns}-{record.HomeRuns}";
            }
            else
            {
                Opponent = record.AwayTeamName;
                HomeAway = "-";
                Score = $"{record.HomeRuns}-{record.AwayRuns}";
            }

            Rivalry = record.IsRivalry ? "라이벌" : "-";
        }

        public string Day { get; }
        public string Kind { get; }
        public string Stage { get; }
        public string Opponent { get; }
        public string HomeAway { get; }
        public string Rivalry { get; }
        public string Score { get; }

        private static string TranslateKind(HighSchoolMatchKind kind) => kind switch
        {
            HighSchoolMatchKind.WeekendLeague => "주말리그",
            HighSchoolMatchKind.Tournament => "대회",
            HighSchoolMatchKind.Official => "공식전",
            HighSchoolMatchKind.Scrimmage => "청백전",
            HighSchoolMatchKind.Friendly => "친선",
            _ => "경기"
        };
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
            SetMatchPageVisibility(false);
            _matchPanelInitialized = false;
            UpdateHeaderMatchStatus();
            return;
        }

        if (_game.MatchPending)
        {
            var snapshot = _game.PrepareMatchSnapshot();
            if (!_matchPanelInitialized)
            {
                InitializeMatchPanel(snapshot);
                _matchPanelInitialized = true;
            }
            SetMatchPageVisibility(true);
            UpdateMatchSummaryPanel(snapshot);
            UpdateMatchOverlay(snapshot);
        }
        else
        {
            SetMatchPageVisibility(false);
            _matchPanelInitialized = false;
        }

        UpdateHeaderMatchStatus();
    }

    private void UpdateHeaderMatchStatus()
    {
        if (_game?.MatchPending == true)
        {
            var label = _game.MatchLabel;
            var opponent = _game.MatchOpponent;
            HeaderMatchStatusText.Text = $"{label} · {opponent}";
            HeaderMatchButton.IsEnabled = true;
        }
        else
        {
            HeaderMatchStatusText.Text = "경기 없음";
            HeaderMatchButton.IsEnabled = false;
        }
    }

    private void MatchLeftToggleButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (MatchLeftPanel.Visibility == Visibility.Visible)
        {
            MatchLeftPanel.Visibility = Visibility.Collapsed;
            MatchLeftColumn.Width = new GridLength(0);
        }
        else
        {
            MatchLeftPanel.Visibility = Visibility.Visible;
            MatchLeftColumn.Width = new GridLength(360);
        }
    }

    private void MatchRightToggleButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (MatchRightPanel.Visibility == Visibility.Visible)
        {
            MatchRightPanel.Visibility = Visibility.Collapsed;
            MatchRightColumn.Width = new GridLength(0);
        }
        else
        {
            MatchRightPanel.Visibility = Visibility.Visible;
            MatchRightColumn.Width = new GridLength(360);
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
        RosterDetailMetaText.Text = $"{statusLabel} · 포지션 {player.Position} · 투타 {player.Throws}/{player.Bats}";
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
            Overall = player.Overall;
            Role = $"{player.Position} · {player.RoleLabel}";
            StatusLabel = $"{player.AcademicYear}학년 · {(player.Status.Equals("varsity", StringComparison.OrdinalIgnoreCase) ? "1군" : "2군")}";
            Tags = player.Tags.Count > 0 ? string.Join(", ", player.Tags) : "-";
        }

        public HighSchoolRosterPlayer Player { get; }
        public string Name { get; }
        public int Overall { get; }
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

    private sealed record MatchInningView(string InningLabel, string HomeRunsText, string GuestRunsText);

    private sealed record MatchLineupView(int Order, string Name, string Bats, double Rating);

    private sealed record MatchRosterView(string Name, int Year, string Position);

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
        ["PIT_SECONDARY"] = "슬라이더",
        ["PIT_FIELDING"] = "투수 수비",
        ["PIT_HOLD"] = "견제",
        ["BAT_CONTACT"] = "컨택",
        ["BAT_POWER"] = "파워",
        ["BAT_DISCIPLINE"] = "선구",
        ["BAT_DEFENSE"] = "수비력",
        ["BAT_ARM"] = "송구",
        ["BAT_SPEED"] = "주루",
        ["BAT_BUNT"] = "번트",
        ["BAT_VERSATILITY"] = "포지션",
        ["MNT_FOCUS"] = "집중력",
        ["MNT_MORALE"] = "사기",
        ["MNT_TOUGHNESS"] = "멘탈",
        ["HID_BIG_GAME"] = "빅게임",
        ["HID_NERVES"] = "근성",
        ["HID_RESILIENCE"] = "회복력",
        ["PVT_TALENT"] = "재능",
        ["PVT_WORK_ETHIC"] = "근면",
        ["PVT_CHARACTER"] = "인성"
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

    private void AcademicLectureCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressAcademicEvents || _game is null) return;
        if (AcademicLectureCombo.SelectedItem is AcademicOption option)
        {
            _game.SetAcademicAction(AcademicSlot.Lecture, option.Action);
            AcademicLectureDescription.Text = option.Description;
        }
    }

    private void AcademicSupportCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressAcademicEvents || _game is null) return;
        if (AcademicSupportCombo.SelectedItem is AcademicOption option)
        {
            _game.SetAcademicAction(AcademicSlot.Support, option.Action);
            AcademicSupportDescription.Text = option.Description;
        }
    }

    private void AcademicStudyCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressAcademicEvents || _game is null) return;
        if (AcademicStudyCombo.SelectedItem is AcademicOption option)
        {
            _game.SetAcademicAction(AcademicSlot.Study, option.Action);
            AcademicStudyDescription.Text = option.Description;
        }
    }

}

