using System;

namespace CareerSimTextDemo.Core.HighSchool;

public sealed record HighSchoolLoopSnapshot(
    int AcademicYear,
    int DayOfYear,
    int Month,
    int DayOfMonth,
    int WeekOfYear,
    int WeekOfMonth,
    string PhaseLabel,
    string SeasonMood,
    double Fatigue,
    double Focus,
    double TrainingLoad,
    HighSchoolUpcomingEvent? UpcomingEvent);

public sealed record HighSchoolUpcomingEvent(
    string Category,
    string Title,
    string Preview,
    int Day,
    int DaysUntil);
