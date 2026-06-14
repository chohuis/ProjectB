use crate::sim_types::*;

fn simple_hash(s: &str) -> u32 {
    s.bytes().fold(2166136261u32, |h, b| {
        h.wrapping_mul(16777619).wrapping_add(b as u32)
    })
}

fn lcg_noise(seed: u32, range: f64) -> f64 {
    let s = seed.wrapping_mul(1664525).wrapping_add(1013904223);
    let norm = (s as f64 / u32::MAX as f64) * 2.0 - 1.0;
    norm * range
}

pub fn apply_scouting_noise(params: ScoutingNoiseParams) -> ScoutingNoiseResult {
    let team_hash = simple_hash(&params.team_id);

    let scouted = params.players.into_iter().map(|p| {
        if p.is_own_player {
            let pot_seed = simple_hash(&p.player_id)
                .wrapping_add(team_hash)
                .wrapping_add(params.season_year);
            let scouted_potential = p.true_potential.map(|tp| {
                let noise = lcg_noise(pot_seed, 5.0);
                (tp + noise).clamp(20.0, 99.0)
            });
            return ScoutedPlayer {
                player_id: p.player_id,
                scouted_ovr: p.true_ovr,
                scouted_potential,
                scouted_personality: p.true_personality,
                confidence: 0.95,
            };
        }

        let base_noise = (100.0 - params.scouting_quality) / 100.0;
        let fame_factor = 1.0 - (p.fame / 100.0) * 0.40;
        let prospect_factor = if p.is_prospect { 1.5 } else { 1.0 };
        let age_factor = if p.age >= 28 { 0.80 } else if p.age <= 22 { 1.20 } else { 1.0 };
        let noise_mult = base_noise * fame_factor * prospect_factor * age_factor;

        let seed_base = simple_hash(&p.player_id)
            .wrapping_add(team_hash)
            .wrapping_add(params.season_year);

        let ovr_noise = lcg_noise(seed_base, 12.0 * noise_mult);
        let scouted_ovr = (p.true_ovr + ovr_noise).clamp(20.0, 99.0);

        let scouted_potential = p.true_potential.map(|tp| {
            let pot_noise = lcg_noise(seed_base.wrapping_add(1), 20.0 * noise_mult);
            (tp + pot_noise).clamp(20.0, 99.0)
        });

        let scouted_personality = p.true_personality.map(|pers| {
            let noise_p = |offset: u32, v: f64| -> f64 {
                (v + lcg_noise(seed_base.wrapping_add(offset), 25.0 * noise_mult))
                    .clamp(0.0, 100.0)
            };
            NpcPersonality {
                loyalty:              noise_p(2, pers.loyalty),
                ambition:             noise_p(3, pers.ambition),
                greed:                noise_p(4, pers.greed),
                competitive_drive:    noise_p(5, pers.competitive_drive),
                stability_preference: noise_p(6, pers.stability_preference),
                professionalism:      noise_p(7, pers.professionalism),
                overseas_ambition:    noise_p(8, pers.overseas_ambition),
                market_preference:    noise_p(9, pers.market_preference),
                home_team_id:         pers.home_team_id,
            }
        });

        let confidence = (1.0 - noise_mult * 0.6).clamp(0.1, 1.0);

        ScoutedPlayer {
            player_id: p.player_id,
            scouted_ovr,
            scouted_potential,
            scouted_personality,
            confidence,
        }
    }).collect();

    ScoutingNoiseResult { scouted }
}
