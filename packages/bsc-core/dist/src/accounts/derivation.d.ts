export declare const BSC_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";
export declare const MAX_ACCOUNT_INDEX = 2147483647;
export type DerivationOptions = Readonly<{
    passphrase?: string;
}>;
export declare function bscDerivationPath(accountIndex: number): string;
export declare function validateMnemonic(mnemonic: string): boolean;
export declare function deriveBscAddressFromMnemonic(mnemonic: string, accountIndex: number, options?: DerivationOptions): string;
export declare function deriveBscAddressFromPrivateKey(privateKeyBytes: Uint8Array): string;
export declare function accountIndexFromTronDerivationPath(path: string): number;
//# sourceMappingURL=derivation.d.ts.map
