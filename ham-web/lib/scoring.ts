export interface ScoreConfig {
  timeMs: number;
  attempts: number;
  hasBooster: boolean;
  boosterMultiplier: number; // e.g., 0.10 for 10%
}

export function calculateScore(config: ScoreConfig): number {
  // Base points: 1,000,000 / time_in_seconds
  // To avoid infinity on 0 time, we use Math.max(timeMs, 1)
  const timeSeconds = Math.max(config.timeMs / 1000, 0.001);
  const baseScore = 1000000 / timeSeconds;

  // Penalize 5% per extra attempt (attempt 1 = 0 penalty, attempt 2 = 5% penalty)
  // Max penalty capped at 95% to avoid negative scores
  const extraAttempts = Math.max(config.attempts - 1, 0);
  const penaltyMultiplier = Math.max(1 - (extraAttempts * 0.05), 0.05);

  let finalScore = baseScore * penaltyMultiplier;

  // Apply booster if they hold the token/NFT
  if (config.hasBooster) {
    finalScore = finalScore * (1 + config.boosterMultiplier);
  }

  return Math.round(finalScore);
}
