//! Black-box tests for the public dice API: parsing, exact distributions, and
//! deterministic rolling. No RNG flakiness — rolls use a seeded RNG and assert
//! bounds/reproducibility rather than exact unseeded values.

use ttrpg_dice_engine::{distribution, parse, roll, SeededRng};

#[test]
fn distribution_of_2d6_is_symmetric_around_seven() {
    let dist = distribution("2d6").unwrap();
    assert_eq!(dist.min, 2);
    assert_eq!(dist.max, 12);
    assert!((dist.mean - 7.0).abs() < 1e-9, "mean was {}", dist.mean);
    // Var(2d6) = 2 * (d6 variance) = 2 * 35/12 = 35/6.
    assert!((dist.variance - 35.0 / 6.0).abs() < 1e-6, "variance was {}", dist.variance);
}

#[test]
fn single_die_distribution_is_uniform() {
    let dist = distribution("d20").unwrap();
    assert_eq!(dist.min, 1);
    assert_eq!(dist.max, 20);
    assert!((dist.mean - 10.5).abs() < 1e-9, "mean was {}", dist.mean);
}

#[test]
fn keep_highest_three_of_four_d6_is_bounded() {
    let dist = distribution("4d6kh3").unwrap();
    assert_eq!(dist.min, 3);
    assert_eq!(dist.max, 18);
    // The classic D&D ability-score roll skews above the flat 3d6 mean of 10.5.
    assert!(dist.mean > 11.0 && dist.mean < 13.5, "mean was {}", dist.mean);
}

#[test]
fn flat_modifier_keeps_total_in_range() {
    let mut rng = SeededRng::new(42);
    let result = roll("d20+5", &mut rng).unwrap();
    assert!((6..=25).contains(&result.total), "total was {}", result.total);
    assert_eq!(result.notation, "d20+5");
}

#[test]
fn same_seed_produces_the_same_roll() {
    let a = roll("3d8+2", &mut SeededRng::new(7)).unwrap().total;
    let b = roll("3d8+2", &mut SeededRng::new(7)).unwrap().total;
    assert_eq!(a, b);
    assert!((5..=26).contains(&a), "total was {}", a);
}

#[test]
fn exploding_d6_distribution_matches_the_recursion() {
    let dist = distribution("d6!").unwrap();
    // mean of an exploding d6 is 3.5 / (1 - 1/6) = 4.2
    assert!((dist.mean - 4.2).abs() < 1e-6, "mean was {}", dist.mean);
    let p = |outcome: i64| {
        dist.pmf
            .iter()
            .find(|op| op.outcome == outcome)
            .map(|op| op.probability)
            .unwrap_or(0.0)
    };
    // a 6 always explodes and adds at least 1, so totals of 6 and 12 are impossible
    assert!(p(6) < 1e-12, "p(6) was {}", p(6));
    assert!(p(12) < 1e-12, "p(12) was {}", p(12));
    // 7 is 6-then-1, 13 is 6-6-then-1
    assert!((p(7) - 1.0 / 36.0).abs() < 1e-9, "p(7) was {}", p(7));
    assert!((p(13) - 1.0 / 216.0).abs() < 1e-9, "p(13) was {}", p(13));
    let mass: f64 = dist.pmf.iter().map(|op| op.probability).sum();
    assert!((mass - 1.0).abs() < 1e-9, "mass was {}", mass);
}

#[test]
fn exploding_support_extends_past_two_dice() {
    // the old implementation truncated the support at two dice worth of faces
    let dist = distribution("d4!").unwrap();
    assert!(dist.max > 8, "max was {}", dist.max);
    assert!((dist.mean - 2.5 / (1.0 - 0.25)).abs() < 1e-6, "mean was {}", dist.mean);
}

#[test]
fn valid_notation_parses_and_garbage_does_not() {
    assert!(parse("2d6+3").is_ok());
    assert!(parse("4d6kh3").is_ok());
    assert!(parse("totally not dice").is_err());
    assert!(distribution("totally not dice").is_err());
}
