//! Shared table-roll resolution. Both the oracle panel (`table_result`) and
//! exploration hex generation (`hex::generate`) resolve rolls through this
//! module so their dice semantics cannot drift; only the handling of the
//! degenerate outcomes (range gap, no positive weight) differs per caller.

use rand::Rng;

pub struct RollRow {
    pub weight: i32,
    pub range_min: Option<i32>,
    pub range_max: Option<i32>,
}

pub enum TableRoll {
    Range { roll: i32, index: usize },
    Weighted { total_weight: i32, index: usize },
    RangeGap { roll: i32 },
    NoPositiveWeight,
}

pub fn resolve(mode: &str, rows: &[RollRow]) -> TableRoll {
    if mode == "range"
        && !rows.is_empty()
        && rows
            .iter()
            .all(|row| row.range_min.is_some() && row.range_max.is_some())
    {
        let min = rows.iter().filter_map(|row| row.range_min).min().unwrap();
        let max = rows.iter().filter_map(|row| row.range_max).max().unwrap();
        let roll = rand::thread_rng().gen_range(min..=max);
        return match rows
            .iter()
            .position(|row| row.range_min.unwrap() <= roll && roll <= row.range_max.unwrap())
        {
            Some(index) => TableRoll::Range { roll, index },
            None => TableRoll::RangeGap { roll },
        };
    }

    let total_weight: i32 = rows.iter().map(|row| row.weight).sum();
    if total_weight <= 0 {
        return TableRoll::NoPositiveWeight;
    }
    let mut roll = rand::thread_rng().gen_range(1..=total_weight);
    for (index, row) in rows.iter().enumerate() {
        roll -= row.weight;
        if roll <= 0 {
            return TableRoll::Weighted { total_weight, index };
        }
    }
    TableRoll::NoPositiveWeight
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(weight: i32, range: Option<(i32, i32)>) -> RollRow {
        RollRow {
            weight,
            range_min: range.map(|(min, _)| min),
            range_max: range.map(|(_, max)| max),
        }
    }

    #[test]
    fn weighted_rolls_always_land_on_a_row() {
        let rows = vec![row(1, None), row(3, None), row(2, None)];
        for _ in 0..200 {
            match resolve("weighted", &rows) {
                TableRoll::Weighted { index, total_weight } => {
                    assert!(index < rows.len());
                    assert_eq!(total_weight, 6);
                }
                _ => panic!("weighted table must resolve to a row"),
            }
        }
    }

    #[test]
    fn range_gaps_are_reported_not_swallowed() {
        let rows = vec![row(1, Some((1, 3))), row(1, Some((5, 6)))];
        let mut saw_gap = false;
        for _ in 0..500 {
            match resolve("range", &rows) {
                TableRoll::Range { roll, index } => {
                    let (min, max) = (rows[index].range_min.unwrap(), rows[index].range_max.unwrap());
                    assert!(min <= roll && roll <= max);
                }
                TableRoll::RangeGap { roll } => {
                    assert_eq!(roll, 4);
                    saw_gap = true;
                }
                _ => panic!("range table must resolve or report a gap"),
            }
        }
        assert!(saw_gap, "roll=4 should hit the gap at least once in 500 tries");
    }

    #[test]
    fn zero_weight_and_empty_tables_resolve_to_no_positive_weight() {
        assert!(matches!(resolve("weighted", &[]), TableRoll::NoPositiveWeight));
        let rows = vec![row(0, None)];
        assert!(matches!(resolve("weighted", &rows), TableRoll::NoPositiveWeight));
    }

    #[test]
    fn range_mode_with_partial_ranges_falls_back_to_weighted() {
        let rows = vec![row(2, Some((1, 2))), row(2, None)];
        assert!(matches!(
            resolve("range", &rows),
            TableRoll::Weighted { .. }
        ));
    }
}
