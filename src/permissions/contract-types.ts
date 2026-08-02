export const TRON_CONTRACT_TYPES = [
  { id: 0, name: 'AccountCreateContract', label: 'Create accounts' },
  { id: 1, name: 'TransferContract', label: 'Transfer TRX' },
  { id: 2, name: 'TransferAssetContract', label: 'Transfer TRC-10 tokens' },
  { id: 4, name: 'VoteWitnessContract', label: 'Vote for Super Representatives' },
  { id: 10, name: 'AccountUpdateContract', label: 'Update account name' },
  { id: 13, name: 'WithdrawBalanceContract', label: 'Withdraw rewards' },
  { id: 19, name: 'SetAccountIdContract', label: 'Set account ID' },
  { id: 30, name: 'CreateSmartContract', label: 'Deploy smart contracts' },
  { id: 31, name: 'TriggerSmartContract', label: 'Use smart contracts / TRC-20' },
  { id: 46, name: 'AccountPermissionUpdateContract', label: 'Change account permissions', dangerous: true },
  { id: 48, name: 'ClearABIContract', label: 'Clear contract ABI' },
  { id: 54, name: 'FreezeBalanceV2Contract', label: 'Stake TRX' },
  { id: 55, name: 'UnfreezeBalanceV2Contract', label: 'Unstake TRX' },
  { id: 56, name: 'WithdrawExpireUnfreezeContract', label: 'Withdraw unstaked TRX' },
  { id: 57, name: 'DelegateResourceContract', label: 'Delegate resources' },
  { id: 58, name: 'UnDelegateResourceContract', label: 'Reclaim delegated resources' },
  { id: 59, name: 'CancelAllUnfreezeV2Contract', label: 'Cancel unstaking requests' },
] as const;

export const PERMISSION_OPERATION_PRESETS = {
  transfers: [1, 2, 31],
  staking: [4, 13, 54, 55, 56, 57, 58, 59],
  wallet: [0, 1, 2, 4, 10, 13, 19, 31, 54, 55, 56, 57, 58, 59],
} as const;
