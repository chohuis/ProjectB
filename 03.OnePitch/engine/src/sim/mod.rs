// eval·market은 대부분 주인공 전용(09_평가_시스템 §5-2, 06_시장_계약)이라
// I6로 이월 — 10_구현_Phase_계획.md §6-11 참고.
pub mod growth;
pub mod injury;
pub mod npc;
pub mod pitch;
pub mod protagonist;
pub mod roster;
pub mod schedule;
#[path = "match_.rs"]
pub mod match_sim;