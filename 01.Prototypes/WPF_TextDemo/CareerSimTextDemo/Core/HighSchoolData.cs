using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo.Core;

public sealed class HighSchoolProfile
{
    public HighSchoolProfile(string id, string name, string region, string keywords, string philosophy, int budget, int enrollment, int attendance, int fanLoyalty, bool isPlayable)
    {
        Id = id;
        Name = name;
        Region = region;
        Keywords = keywords;
        Philosophy = philosophy;
        Budget = budget;
        Enrollment = enrollment;
        AverageAttendance = attendance;
        FanLoyalty = fanLoyalty;
        IsPlayable = isPlayable;
    }

    public string Id { get; }
    public string Name { get; }
    public string Region { get; }
    public string Keywords { get; }
    public string Philosophy { get; }
    public int Budget { get; }
    public int Enrollment { get; }
    public int AverageAttendance { get; }
    public int FanLoyalty { get; }
    public bool IsPlayable { get; }
    public HighSchoolRoster? Roster { get; private set; }

    public string Summary => $"{Region} · {Keywords}\n{Philosophy}";

    internal void AttachRoster(HighSchoolRoster roster)
        => Roster = roster;
}

public static class HighSchoolRepository
{
    public static IReadOnlyList<HighSchoolProfile> LoadPlayableSchools()
        => LoadByPattern("HS_*.txt", true);

    public static IReadOnlyList<HighSchoolProfile> LoadNpcSchools()
        => LoadByPattern("HSNPC_*.txt", false);

    private static IReadOnlyList<HighSchoolProfile> LoadByPattern(string pattern, bool isPlayable)
    {
        var dir = DataPathResolver.HighSchoolSchoolDirectory;
        if (!Directory.Exists(dir))
        {
            throw new DirectoryNotFoundException($"고등학교 데이터 디렉터리를 찾을 수 없습니다: {dir}");
        }

        var files = Directory.GetFiles(dir, pattern, SearchOption.TopDirectoryOnly);
        var list = new List<HighSchoolProfile>();
        foreach (var file in files)
        {
            try
            {
                var profile = HighSchoolFileParser.Parse(file, isPlayable);
                var roster = HighSchoolRosterRepository.Load(profile.Id);
                if (roster is not null)
                {
                    profile.AttachRoster(roster);
                }
                list.Add(profile);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HighSchoolRepository] '{file}' 파싱 실패: {ex.Message}");
            }
        }

        return list
            .OrderByDescending(p => p.IsPlayable)
            .ThenBy(p => p.Region, StringComparer.OrdinalIgnoreCase)
            .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

internal static class DataPathResolver
{
    private static readonly Lazy<string> _stageRules = new(() =>
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "..", "..",
            "00.OneF", "00.Planning", "Stage_Rules")));

    public static string StageRulesRoot => _stageRules.Value;
    public static string HighSchoolSchoolDirectory => Path.Combine(StageRulesRoot, "HighSchool_Schools");
    public static string HighSchoolRosterDirectory => Path.Combine(StageRulesRoot, "HighSchool_Rosters");
}

internal static class HighSchoolFileParser
{
    public static HighSchoolProfile Parse(string filePath, bool isPlayable)
    {
        var text = File.ReadAllText(filePath, Encoding.UTF8);
        var id = Path.GetFileNameWithoutExtension(filePath);
        var name = id;
        var region = "미상";
        var keywords = string.Empty;
        var philosophy = string.Empty;
        int budget = 0, enrollment = 0, attendance = 0, loyalty = 50;

        using var reader = new StringReader(text);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (!trimmed.StartsWith("-", StringComparison.Ordinal)) continue;
            var payload = trimmed.TrimStart('-').Trim();
            var parts = payload.Split(':', 2);
            if (parts.Length < 2) continue;

            var key = parts[0].Trim();
            var value = parts[1].Trim();
            switch (key)
            {
                case "학교명":
                    name = value;
                    break;
                case "지역":
                    region = value;
                    break;
                case "키워드":
                    keywords = value;
                    break;
                case "팀 철학":
                    philosophy = value;
                    break;
                case "운영예산_KRW억":
                    budget = ParseInt(value);
                    break;
                case "재학생수":
                    enrollment = ParseInt(value);
                    break;
                case "평균관중":
                    attendance = ParseInt(value);
                    break;
                case "팬충성도(1~100)":
                    loyalty = ParseInt(value);
                    break;
            }
        }

        return new HighSchoolProfile(id, name, region, keywords, philosophy, budget, enrollment, attendance, loyalty, isPlayable);
    }

    private static int ParseInt(string raw)
        => int.TryParse(raw.Replace(",", "").Replace("억", "").Trim(), out var result) ? result : 0;
}
