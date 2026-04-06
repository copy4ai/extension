import { CREDIT_THRESHOLDS, CREDIT_COSTS } from './constants';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCredits(charCount: number): number {
  if (charCount <= CREDIT_THRESHOLDS.small) {
    return CREDIT_COSTS.small;
  }
  if (charCount <= CREDIT_THRESHOLDS.medium) {
    return CREDIT_COSTS.medium;
  }
  return CREDIT_COSTS.large;
}
