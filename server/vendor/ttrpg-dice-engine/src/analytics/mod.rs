pub mod statistics;

pub use statistics::{
    Anomaly, AnomalyDirection, EmpiricalStats, Streak, StreakKind,
    detect_anomalies, detect_streaks, empirical_stats,
};
