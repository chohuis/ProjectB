using System.Collections.Generic;
using System.Linq;
using System.Windows;
using CareerSimTextDemo.Core.HighSchool;

namespace CareerSimTextDemo;

public partial class PlayerDetailWindow : Window
{
    public PlayerDetailWindow(HighSchoolRosterPlayer player)
    {
        InitializeComponent();
        DataContext = new PlayerDetailView(player);
    }

    private sealed class PlayerDetailView
    {
        public PlayerDetailView(HighSchoolRosterPlayer player)
        {
            Header = $"{player.Name} · {player.Position}";
            MetaLine = $"{player.RoleLabel} | Throws {player.Throws} / Bats {player.Bats} | OVR {player.Overall} / POT {player.Potential}";
            Tags = player.Tags.Count > 0 ? string.Join(", ", player.Tags) : "태그 없음";
            PhysicalStats = BuildList(player.Stats.Physical);
            PitchingStats = BuildList(player.Stats.Pitching);
            BattingStats = BuildList(player.Stats.Batting);
            MentalStats = BuildList(player.Stats.Mental);
            HiddenStats = BuildList(player.Stats.Hidden);
            PersonalityStats = BuildList(player.Stats.Personality);
        }

        public string Header { get; }
        public string MetaLine { get; }
        public string Tags { get; }
        public IReadOnlyList<StatRow> PhysicalStats { get; }
        public IReadOnlyList<StatRow> PitchingStats { get; }
        public IReadOnlyList<StatRow> BattingStats { get; }
        public IReadOnlyList<StatRow> MentalStats { get; }
        public IReadOnlyList<StatRow> HiddenStats { get; }
        public IReadOnlyList<StatRow> PersonalityStats { get; }

        private static List<StatRow> BuildList(IReadOnlyDictionary<string, int> stats)
            => stats
                .OrderByDescending(kv => kv.Value)
                .Select(kv => new StatRow(MainWindow.ResolveStatLabel(kv.Key), kv.Value))
                .ToList();
    }

    private sealed record StatRow(string Label, int Value);
}
