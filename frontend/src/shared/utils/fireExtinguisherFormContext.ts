export type FireExtinguisherFormContext = 'inventory' | 'audit-request'

export function fireExtinguisherFormCapabilities(context: FireExtinguisherFormContext) {
  return {
    canSelectAssociatedAsset: context === 'inventory',
  }
}
