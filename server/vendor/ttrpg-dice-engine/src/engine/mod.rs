pub mod convolution; // pub for integration testing
pub mod probability;
pub mod rng;
pub mod roll;

pub use probability::{compute_distribution, Distribution, OutcomeProb};
pub use roll::{eval_expr, RollResult, ExprBreakdown, DieResult, DistributionPosition, RollCategory};
pub use rng::{RngSource, LiveRng, SeededRng};
