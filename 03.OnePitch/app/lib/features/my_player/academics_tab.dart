import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';

/// 학업 탭 — [01_내선수](../../../../04_UI기획/01_내선수.md)/`02.SvelteElectron`
/// `AcademicsPage.svelte` 그대로: 과목별 표(석차백분율·등급·출석·과제)·
/// 주간 학습모드 4종·시험 D-day+누적 진행바·대학이면 전공 배너. 등급
/// 산출(`percentileToGrade`)은 순수 계산이라 엔진 동기 호출로 하고, 나머지
/// 라벨(과목명 한글화·전공 설명 문구)은 고정 표시 텍스트라 여기서 직접
/// 매핑한다(계산·판정 없음 — 03_구조.md §3 "UI가 해도 됨: 숫자 포맷").
class AcademicsTab extends StatefulWidget {
  const AcademicsTab({super.key});

  @override
  State<AcademicsTab> createState() => _AcademicsTabState();
}

const _subjectLabels = {'kor': '국어', 'eng': '영어', 'math': '수학', 'soc': '사회', 'sci': '과학'};

const _studyModeOptions = [
  (id: 'focus', name: '집중 수업', desc: '학업 +8점/주, 훈련 효율 70%'),
  (id: 'normal', name: '일반 수업', desc: '학업 +4점/주, 훈련 효율 85%'),
  (id: 'rest', name: '수업 중 휴식', desc: '학업 +1점/주, 훈련 효율 100%, 출석 -3%'),
  (id: 'sleep', name: '수업 중 수면', desc: '학업 0점/주, 훈련 효율 105%, 경고 위험'),
];

const _universityMajorOptions = [
  (id: '체육교육', desc: '전반적인 훈련 효율 +5%'),
  (id: '스포츠과학', desc: '전반적인 훈련 효율 +8%'),
  (id: '일반전공', desc: '훈련 효율 보너스 없음, 학업 점수 획득 +50%'),
];

class _AcademicsTabState extends State<AcademicsTab> {
  AcademicsStatusInfo? _status;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final status = await getAcademicsStatus();
    if (!mounted) return;
    setState(() {
      _status = status;
      _loading = false;
    });
  }

  Future<void> _setStudyMode(String mode) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await setWeeklyStudyMode(mode: mode);
      await _load();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _pickMajor(String major) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await setUniversityMajor(major: major);
      await _load();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _saving = false);
    }
  }

  Map<String, dynamic> _decodeSubjects(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingIndicator();
    final status = _status;
    if (status == null) return const Center(child: Text('학업 정보를 불러올 수 없습니다.'));

    final subjects = _decodeSubjects(status.subjectScoresJson);
    final percentiles = [
      for (final s in subjects.values)
        if (s is Map) ((s['percentile'] as num?)?.toDouble() ?? 50.0),
    ];
    final avgPercentile = percentiles.isEmpty ? 50.0 : percentiles.reduce((a, b) => a + b) / percentiles.length;
    final avgGrade = percentileToGrade(percentile: avgPercentile).toInt();
    final lastGrade = status.lastGrade?.toInt();
    final accumPct = status.examAccumScore.clamp(0, 100).round();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (status.eligibilityBlocked)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
              child: const Text('⚠ 학사 경고 — 다음 경기는 출전할 수 없습니다', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.bold)),
            ),
          ),
        _SummaryHeader(status: status, avgGrade: avgGrade, lastGrade: lastGrade),
        if (status.attendsUniversity && !status.majorSelected) ...[
          const SizedBox(height: 16),
          _MajorSelectBanner(saving: _saving, onPick: _pickMajor),
        ],
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBanner(message: '오류: $_error'), const SizedBox(height: 12)],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 3, child: _SubjectPanel(subjects: subjects)),
            const SizedBox(width: 16),
            Expanded(flex: 2, child: _StudyModePanel(current: status.weeklyStudyMode, saving: _saving, onSelect: _setStudyMode)),
            const SizedBox(width: 16),
            Expanded(
              flex: 2,
              child: _ExamPanel(
                nextExamLabel: status.nextExamLabel,
                weeksUntilNextExam: status.weeksUntilNextExam.toInt(),
                accumPct: accumPct,
                lastGrade: lastGrade,
                lastGradeRisk: status.lastGradeRisk,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

Color _gradeColor(int grade) {
  if (grade <= 2) return AppColors.safe;
  if (grade <= 4) return AppColors.accent;
  if (grade <= 6) return AppColors.warn;
  return AppColors.danger;
}

Color _riskColor(String risk) {
  switch (risk) {
    case 'ok':
      return AppColors.safe;
    case 'warn':
      return AppColors.warn;
    default:
      return AppColors.danger;
  }
}

String _riskLabel(String risk) {
  switch (risk) {
    case 'ok':
      return '정상';
    case 'warn':
      return '주의';
    default:
      return '경고';
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.status, required this.avgGrade, required this.lastGrade});
  final AcademicsStatusInfo status;
  final int avgGrade;
  final int? lastGrade;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Wrap(
        spacing: 24,
        runSpacing: 12,
        children: [
          if (status.attendsUniversity)
            _summaryItem('전공', status.majorSelected ? (status.universityMajor ?? '-') : '미선택', status.majorSelected ? AppColors.accent : AppColors.warn)
          else
            _summaryItem('평균 등급', '$avgGrade등급', _gradeColor(avgGrade)),
          _summaryItem('학업 상태', _riskLabel(status.lastGradeRisk), _riskColor(status.lastGradeRisk)),
          if (lastGrade case final grade?)
            _summaryItem('최근 성적', '$grade등급', _gradeColor(grade))
          else
            _summaryItem('최근 성적', '미응시', AppColors.textSecondary),
        ],
      ),
    );
  }

  Widget _summaryItem(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }
}

class _MajorSelectBanner extends StatelessWidget {
  const _MajorSelectBanner({required this.saving, required this.onPick});
  final bool saving;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('전공을 선택해주세요', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('전공은 훈련 효율에 영구적으로 영향을 줍니다.', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in _universityMajorOptions)
                OutlinedButton(
                  onPressed: saving ? null : () => onPick(m.id),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [Text(m.id, style: const TextStyle(fontWeight: FontWeight.bold)), Text(m.desc, style: const TextStyle(fontSize: 11))],
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SubjectPanel extends StatelessWidget {
  const _SubjectPanel({required this.subjects});
  final Map<String, dynamic> subjects;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('과목별 현황', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Table(
            columnWidths: const {0: FlexColumnWidth(1), 1: FlexColumnWidth(1.2), 2: FlexColumnWidth(0.8), 3: FlexColumnWidth(0.8), 4: FlexColumnWidth(0.8)},
            children: [
              const TableRow(
                children: [
                  Text('과목', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  Text('석차백분율', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  Text('등급', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  Text('출석', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  Text('과제', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                ],
              ),
              for (final entry in _subjectLabels.entries) _subjectRow(entry.key, entry.value),
            ],
          ),
        ],
      ),
    );
  }

  TableRow _subjectRow(String id, String label) {
    final raw = subjects[id];
    final percentile = raw is Map ? ((raw['percentile'] as num?)?.toDouble() ?? 50.0) : 50.0;
    final attendance = raw is Map ? ((raw['attendance'] as num?)?.toDouble() ?? 100.0) : 100.0;
    final assignment = raw is Map ? ((raw['assignment'] as num?)?.toDouble() ?? 100.0) : 100.0;
    final grade = percentileToGrade(percentile: percentile).toInt();
    return TableRow(
      children: [
        Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold))),
        Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('${percentile.toStringAsFixed(1)}%')),
        Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('$grade등급', style: TextStyle(color: _gradeColor(grade)))),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text('${attendance.toStringAsFixed(0)}%', style: TextStyle(color: attendance < 85 ? AppColors.warn : null)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text('${assignment.toStringAsFixed(0)}%', style: TextStyle(color: assignment < 75 ? AppColors.warn : null)),
        ),
      ],
    );
  }
}

class _StudyModePanel extends StatelessWidget {
  const _StudyModePanel({required this.current, required this.saving, required this.onSelect});
  final String current;
  final bool saving;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('주간 학업 선택', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('다음 주 진행 시 적용됩니다.', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          for (final opt in _studyModeOptions)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ChoiceChip(
                label: SizedBox(
                  width: double.infinity,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [Text(opt.name, style: const TextStyle(fontWeight: FontWeight.bold)), Text(opt.desc, style: const TextStyle(fontSize: 11))],
                  ),
                ),
                selected: current == opt.id,
                onSelected: saving ? null : (_) => onSelect(opt.id),
              ),
            ),
        ],
      ),
    );
  }
}

class _ExamPanel extends StatelessWidget {
  const _ExamPanel({
    required this.nextExamLabel,
    required this.weeksUntilNextExam,
    required this.accumPct,
    required this.lastGrade,
    required this.lastGradeRisk,
  });
  final String nextExamLabel;
  final int weeksUntilNextExam;
  final int accumPct;
  final int? lastGrade;
  final String lastGradeRisk;

  @override
  Widget build(BuildContext context) {
    final barColor = accumPct >= 65 ? AppColors.safe : (accumPct >= 38 ? AppColors.warn : AppColors.danger);
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('시험 준비 현황', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(nextExamLabel, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              Text('D-$weeksUntilNextExam주', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [const Text('누적 학업 점수', style: TextStyle(fontSize: 12)), Text('$accumPct / 100', style: const TextStyle(fontSize: 12))],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: accumPct / 100, minHeight: 8, color: barColor, backgroundColor: barColor.withValues(alpha: 0.15)),
          ),
          if (lastGrade != null) ...[
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 12),
            const Text('직전 시험 성적', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Row(
              children: [
                Text('$lastGrade등급', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: _gradeColor(lastGrade!))),
                const SizedBox(width: 8),
                Text(_riskLabel(lastGradeRisk), style: TextStyle(fontSize: 12, color: _riskColor(lastGradeRisk))),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
