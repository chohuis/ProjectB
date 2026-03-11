using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using CareerSimTextDemo.Core;

namespace CareerSimTextDemo.Core.HighSchool;

public sealed class HighSchoolRoster
{
    public HighSchoolRoster(
        string teamId,
        string teamName,
        string tier,
        HighSchoolRosterStaff manager,
        IReadOnlyList<HighSchoolRosterStaff> coaches,
        IReadOnlyList<HighSchoolRosterPlayer> varsity,
        IReadOnlyList<HighSchoolRosterPlayer> junior)
    {
        TeamId = teamId;
        TeamName = teamName;
        Tier = tier;
        Manager = manager;
        Coaches = coaches;
        Varsity = varsity;
        Junior = junior;
    }

    public string TeamId { get; }
    public string TeamName { get; }
    public string Tier { get; }
    public HighSchoolRosterStaff Manager { get; }
    public IReadOnlyList<HighSchoolRosterStaff> Coaches { get; }
    public IReadOnlyList<HighSchoolRosterPlayer> Varsity { get; }
    public IReadOnlyList<HighSchoolRosterPlayer> Junior { get; }
}

public sealed class HighSchoolRosterStaff
{
    public HighSchoolRosterStaff(string name, string role, string specialty, IReadOnlyDictionary<string, int> ratings)
    {
        Name = name;
        Role = role;
        Specialty = specialty;
        Ratings = ratings;
    }

    public string Name { get; }
    public string Role { get; }
    public string Specialty { get; }
    public IReadOnlyDictionary<string, int> Ratings { get; }
}

public sealed class HighSchoolRosterPlayer
{
    public HighSchoolRosterPlayer(
        string name,
        string status,
        int year,
        string position,
        string roleLabel,
        string archetype,
        string throwsHand,
        string bats,
        int overall,
        int potential,
        IReadOnlyList<string> tags,
        HighSchoolRosterPlayerStats stats)
    {
        Name = name;
        Status = status;
        AcademicYear = year;
        Position = position;
        RoleLabel = roleLabel;
        Archetype = archetype;
        Throws = throwsHand;
        Bats = bats;
        Overall = overall;
        Potential = potential;
        Tags = tags;
        Stats = stats;
    }

    public string Name { get; }
    public string Status { get; }
    public int AcademicYear { get; }
    public string Position { get; }
    public string RoleLabel { get; }
    public string Archetype { get; }
    public string Throws { get; }
    public string Bats { get; }
    public int Overall { get; }
    public int Potential { get; }
    public IReadOnlyList<string> Tags { get; }
    public HighSchoolRosterPlayerStats Stats { get; }
}

public sealed class HighSchoolRosterPlayerStats
{
    public HighSchoolRosterPlayerStats(
        IReadOnlyDictionary<string, int> physical,
        IReadOnlyDictionary<string, int> pitching,
        IReadOnlyDictionary<string, int> batting,
        IReadOnlyDictionary<string, int> mental,
        IReadOnlyDictionary<string, int> hidden,
        IReadOnlyDictionary<string, int> personality)
    {
        Physical = physical;
        Pitching = pitching;
        Batting = batting;
        Mental = mental;
        Hidden = hidden;
        Personality = personality;
    }

    public IReadOnlyDictionary<string, int> Physical { get; }
    public IReadOnlyDictionary<string, int> Pitching { get; }
    public IReadOnlyDictionary<string, int> Batting { get; }
    public IReadOnlyDictionary<string, int> Mental { get; }
    public IReadOnlyDictionary<string, int> Hidden { get; }
    public IReadOnlyDictionary<string, int> Personality { get; }
}

internal static class HighSchoolRosterRepository
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public static HighSchoolRoster? Load(string teamId)
    {
        if (string.IsNullOrWhiteSpace(teamId))
        {
            return null;
        }

        var path = Path.Combine(DataPathResolver.HighSchoolRosterDirectory, $"{teamId}.json");
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(path);
            var dto = JsonSerializer.Deserialize<HighSchoolRosterFileDto>(json, Options);
            return dto?.ToDomain();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HighSchoolRosterRepository] '{teamId}' 로스터 로드 실패: {ex.Message}");
            return null;
        }
    }

    public static HighSchoolRoster? LoadByTeamName(string teamName)
    {
        if (string.IsNullOrWhiteSpace(teamName))
        {
            return null;
        }

        var dir = DataPathResolver.HighSchoolRosterDirectory;
        if (!Directory.Exists(dir))
        {
            return null;
        }

        var files = Directory.GetFiles(dir, "*.json", SearchOption.TopDirectoryOnly)
            .Where(path => !string.Equals(Path.GetFileNameWithoutExtension(path), "index", StringComparison.OrdinalIgnoreCase));

        foreach (var file in files)
        {
            try
            {
                var json = File.ReadAllText(file);
                var dto = JsonSerializer.Deserialize<HighSchoolRosterFileDto>(json, Options);
                if (dto is null)
                {
                    continue;
                }

                if (string.Equals(dto.TeamName, teamName, StringComparison.OrdinalIgnoreCase))
                {
                    return dto.ToDomain();
                }
            }
            catch
            {
                // Ignore malformed roster file and continue scanning.
            }
        }

        return null;
    }

    private sealed class HighSchoolRosterFileDto
    {
        [JsonPropertyName("team_id")]
        public string TeamId { get; set; } = string.Empty;

        [JsonPropertyName("team_name")]
        public string TeamName { get; set; } = string.Empty;

        [JsonPropertyName("tier")]
        public string Tier { get; set; } = string.Empty;

        [JsonPropertyName("manager")]
        public StaffDto Manager { get; set; } = new();

        [JsonPropertyName("coaches")]
        public List<StaffDto> Coaches { get; set; } = new();

        [JsonPropertyName("players")]
        public PlayerGroupDto Players { get; set; } = new();

        public HighSchoolRoster ToDomain()
        {
            var manager = Manager.ToDomain();
            var coaches = Coaches.Select(c => c.ToDomain()).ToList();
            return new HighSchoolRoster(
                string.IsNullOrWhiteSpace(TeamId) ? TeamName : TeamId,
                TeamName,
                Tier,
                manager,
                coaches,
                Players?.Varsity?.Select(p => p.ToDomain()).ToList() ?? new List<HighSchoolRosterPlayer>(),
                Players?.Junior?.Select(p => p.ToDomain()).ToList() ?? new List<HighSchoolRosterPlayer>());
        }
    }

    private sealed class PlayerGroupDto
    {
        [JsonPropertyName("varsity")]
        public List<PlayerDto> Varsity { get; set; } = new();

        [JsonPropertyName("junior")]
        public List<PlayerDto> Junior { get; set; } = new();
    }

    private sealed class StaffDto
    {
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Specialty { get; set; } = string.Empty;
        public Dictionary<string, int> Ratings { get; set; } = new();

        public HighSchoolRosterStaff ToDomain()
            => new(Name, Role, Specialty, Ratings);
    }

    private sealed class PlayerDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("year")]
        public int Year { get; set; }

        [JsonPropertyName("position")]
        public string Position { get; set; } = string.Empty;

        [JsonPropertyName("role_label")]
        public string RoleLabel { get; set; } = string.Empty;

        [JsonPropertyName("archetype")]
        public string Archetype { get; set; } = string.Empty;

        [JsonPropertyName("throws")]
        public string Throws { get; set; } = string.Empty;

        [JsonPropertyName("bats")]
        public string Bats { get; set; } = string.Empty;

        [JsonPropertyName("overall")]
        public int Overall { get; set; }

        [JsonPropertyName("potential")]
        public int Potential { get; set; }

        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; } = new();

        [JsonPropertyName("stats")]
        public PlayerStatsDto Stats { get; set; } = new();

        public HighSchoolRosterPlayer ToDomain()
            => new(
                Name,
                Status,
                Year,
                Position,
                RoleLabel,
                Archetype,
                Throws,
                Bats,
                Overall,
                Potential,
                Tags,
                Stats?.ToDomain() ?? new HighSchoolRosterPlayerStats(new Dictionary<string, int>(), new Dictionary<string, int>(), new Dictionary<string, int>(), new Dictionary<string, int>(), new Dictionary<string, int>(), new Dictionary<string, int>()));
    }

    private sealed class PlayerStatsDto
    {
        public Dictionary<string, int> Physical { get; set; } = new();
        public Dictionary<string, int> Pitching { get; set; } = new();
        public Dictionary<string, int> Batting { get; set; } = new();
        public Dictionary<string, int> Mental { get; set; } = new();
        public Dictionary<string, int> Hidden { get; set; } = new();
        public Dictionary<string, int> Personality { get; set; } = new();

        public HighSchoolRosterPlayerStats ToDomain()
            => new(Physical, Pitching, Batting, Mental, Hidden, Personality);
    }
}
