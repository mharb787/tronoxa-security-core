export type BscFeatureFlags = Readonly<{
  enabled: boolean;
  sendEnabled: boolean;
  mainnetSendEnabled: boolean;
  notificationsEnabled: boolean;
  energyPaymentEnabled: boolean;
}>;

export type BscFeatureFlagInput = Readonly<{
  BSC_ENABLED?: string;
  BSC_SEND_ENABLED?: string;
  BSC_MAINNET_SEND_ENABLED?: string;
  BSC_NOTIFICATIONS_ENABLED?: string;
  BSC_ENERGY_PAYMENT_ENABLED?: string;
}>;

export function resolveBscFeatureFlags(input: BscFeatureFlagInput): BscFeatureFlags {
  const enabled = input.BSC_ENABLED === 'true';
  const sendEnabled = enabled && input.BSC_SEND_ENABLED === 'true';
  const mainnetSendEnabled = sendEnabled && input.BSC_MAINNET_SEND_ENABLED === 'true';
  return Object.freeze({
    enabled,
    sendEnabled,
    mainnetSendEnabled,
    notificationsEnabled: enabled && input.BSC_NOTIFICATIONS_ENABLED === 'true',
    energyPaymentEnabled: sendEnabled && input.BSC_ENERGY_PAYMENT_ENABLED === 'true',
  });
}

// Expo only inlines direct EXPO_PUBLIC_* property reads. Production defaults
// remain false when a value is absent, misspelled, or anything other than "true".
export const BSC_FEATURE_FLAGS = resolveBscFeatureFlags({
  BSC_ENABLED: process.env.EXPO_PUBLIC_BSC_ENABLED,
  BSC_SEND_ENABLED: process.env.EXPO_PUBLIC_BSC_SEND_ENABLED,
  BSC_MAINNET_SEND_ENABLED: process.env.EXPO_PUBLIC_BSC_MAINNET_SEND_ENABLED,
  BSC_NOTIFICATIONS_ENABLED: process.env.EXPO_PUBLIC_BSC_NOTIFICATIONS_ENABLED,
  BSC_ENERGY_PAYMENT_ENABLED: process.env.EXPO_PUBLIC_BSC_ENERGY_PAYMENT_ENABLED,
});
