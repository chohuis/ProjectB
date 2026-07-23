import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';

/// 리그 탭 "진행중인 대회" 카드 상세 — 라운드별 매치업 전부(대화
/// 2026-07-26). `get_tournament_bracket`은 `schedule` 테이블을 라운드
/// 순서대로 그대로 반환하므로, 여기서 라운드별로 묶어 그리기만 하면 됨.
/// 아직 안 뛴 경기는 `home_runs`/`away_runs`가 `null` — "-"로 표시.
class TournamentBracketScreen extends StatefulWidget {
  const TournamentBracketScreen({super.key, required this.tournamentId});
  final String tournamentId;

  @override
  State<TournamentBracketScreen> createState() => _TournamentBracketScreenState();
}

class _TournamentBracketScreenState extends State<TournamentBracketScreen> {
  TournamentBracketInfo? _bracket;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final bracket = await getTournamentBracket(tournamentId: widget.tournamentId);
    if (mounted) setState(() => _bracket = bracket);
  }

  @override
  Widget build(BuildContext context) {
    final bracket = _bracket;
    return Scaffold(
      appBar: AppBar(title: Text(bracket?.displayName ?? '대회')),
      body: bracket == null ? const LoadingIndicator() : _BracketBody(bracket: bracket),
    );
  }
}

class _BracketBody extends StatelessWidget {
  const _BracketBody({required this.bracket});
  final TournamentBracketInfo bracket;

  @override
  Widget build(BuildContext context) {
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        final byRound = <int, List<BracketMatchInfo>>{};
        for (final m in bracket.matches) {
          byRound.putIfAbsent(m.round.toInt(), () => []).add(m);
        }
        final rounds = byRound.keys.toList()..sort();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (bracket.status == 'done' && bracket.champion != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: AppPanel(
                  child: Row(
                    children: [
                      const Icon(Icons.emoji_events, color: AppColors.safe),
                      const SizedBox(width: 8),
                      Text('우승: ${names[bracket.champion] ?? bracket.champion}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            for (final round in rounds) ...[
              Text('라운드 $round', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
              const SizedBox(height: 6),
              for (final m in byRound[round]!) _MatchRow(match: m, names: names),
              const SizedBox(height: 16),
            ],
            if (rounds.isEmpty) const Text('대진 정보가 없습니다.', style: TextStyle(color: AppColors.textSecondary)),
          ],
        );
      },
    );
  }
}

class _MatchRow extends StatelessWidget {
  const _MatchRow({required this.match, required this.names});
  final BracketMatchInfo match;
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) {
    final homeName = names[match.home] ?? match.home;
    final awayName = names[match.away] ?? match.away;
    final played = match.homeRuns != null && match.awayRuns != null;
    final homeWon = played && match.homeRuns! > match.awayRuns!;
    final awayWon = played && match.awayRuns! > match.homeRuns!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: AppPanel(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Text(
                homeName,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: homeWon ? FontWeight.bold : FontWeight.normal, color: homeWon ? AppColors.safe : AppColors.textPrimary),
              ),
            ),
            const SizedBox(width: 8),
            Text(played ? '${match.homeRuns}' : '-', style: const TextStyle(fontWeight: FontWeight.bold)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text(':', style: TextStyle(color: AppColors.textSecondary))),
            Text(played ? '${match.awayRuns}' : '-', style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                awayName,
                textAlign: TextAlign.right,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: awayWon ? FontWeight.bold : FontWeight.normal, color: awayWon ? AppColors.safe : AppColors.textPrimary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
