const ALLOCATION_PERCENTAGE_DECIMALS = 6

/**
 * Calculates the persisted allocation percentage without leaking IEEE-754
 * artifacts (for example, 100.00000000000003 for a full allocation).
 */
export function calculateAllocationPercentage(allocatedAmount: number, totalAmount: number): number {
  if (totalAmount <= 0) return 0

  const percentage = (allocatedAmount / totalAmount) * 100
  const factor = 10 ** ALLOCATION_PERCENTAGE_DECIMALS
  return Math.round(percentage * factor) / factor
}
