const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

globalThis.crypto = globalThis.crypto || require('node:crypto').webcrypto;

function compile(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadModule(javascript, customRequire) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', javascript)(
    customRequire,
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

async function main() {
  const codec = loadModule(compile('src/wallet/vault-codec.ts'), require);
  const key = codec.createWalletVaultKey();
  const vault = codec.emptyWalletVault();
  vault.index.push('wallet-1');
  vault.activeWalletId = 'wallet-1';
  vault.metadata['wallet-1'] = {
    id: 'wallet-1',
    name: 'My Wallet',
    type: 'mnemonic',
    address: 'TTest',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    isDefault: true,
    isWatchOnly: false,
  };
  vault.secrets['wallet-1'] = 'test-fixture-secret-never-used-on-chain';

  const encrypted = codec.encryptWalletVault(vault, key);
  assert.deepEqual(codec.decryptWalletVault(encrypted, key), vault);
  assert.throws(() => codec.decryptWalletVault(encrypted, codec.createWalletVaultKey()));

  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}AA`;
  assert.throws(() => codec.decryptWalletVault(JSON.stringify(tampered), key));

  assert.equal(codec.classifyWalletVaultBootstrap({
    hasVault: true,
    hasPendingVault: false,
    hasKey: true,
  }), 'open');
  assert.equal(codec.classifyWalletVaultBootstrap({
    hasVault: false,
    hasPendingVault: true,
    hasKey: true,
  }), 'resume');
  assert.equal(codec.classifyWalletVaultBootstrap({
    hasVault: false,
    hasPendingVault: false,
    hasKey: true,
  }), 'reinstall');
  assert.equal(codec.classifyWalletVaultBootstrap({
    hasVault: false,
    hasPendingVault: false,
    hasKey: false,
  }), 'migrate');

  const asyncData = new Map();
  const secureData = new Map();
  const asyncStore = {
    getItem: async (storageKey) => asyncData.get(storageKey) ?? null,
    setItem: async (storageKey, value) => { asyncData.set(storageKey, value); },
    removeItem: async (storageKey) => { asyncData.delete(storageKey); },
  };
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked',
    getItemAsync: async (storageKey) => secureData.get(storageKey) ?? null,
    setItemAsync: async (storageKey, value) => { secureData.set(storageKey, value); },
    deleteItemAsync: async (storageKey) => { secureData.delete(storageKey); },
  };
  const storageJavascript = compile('src/wallet/storage.ts');
  const loadStorage = () => loadModule(storageJavascript, (id) => {
    if (id === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: asyncStore };
    }
    if (id === 'expo-secure-store') return secureStore;
    if (id === './vault-codec') return codec;
    if (id === './types') return {};
    return require(id);
  });

  const legacyWallet = {
    ...vault.metadata['wallet-1'],
    encryptedSecretReference: 'wallet.secret.wallet-1',
  };
  secureData.set('wallets.index.v1', JSON.stringify(['wallet-1']));
  secureData.set('wallets.active.v1', 'wallet-1');
  secureData.set('wallet.metadata.wallet-1', JSON.stringify(legacyWallet));
  secureData.set('wallet.secret.wallet-1', vault.secrets['wallet-1']);
  secureData.set('tronoxa.security.pin.v1', 'pin-record');

  let storage = loadStorage();
  let bootstrap = await storage.initializeWalletStorage();
  assert.deepEqual(bootstrap, { reinstalled: false, migratedWallets: 1 });
  assert.deepEqual(await storage.readIndex(), ['wallet-1']);
  assert.equal(await storage.readSecret('wallet-1'), vault.secrets['wallet-1']);
  assert.equal(secureData.has('wallets.index.v1'), false);
  assert.equal(secureData.has('wallet.secret.wallet-1'), false);
  assert.equal(secureData.has('tronoxa.security.pin.v1'), true);

  // A normal app update keeps both the encrypted vault and its wallets.
  storage = loadStorage();
  bootstrap = await storage.initializeWalletStorage();
  assert.equal(bootstrap.reinstalled, false);
  assert.deepEqual(await storage.readIndex(), ['wallet-1']);

  // iOS uninstall removes the sandbox (AsyncStorage) but retains Keychain.
  asyncData.clear();
  storage = loadStorage();
  bootstrap = await storage.initializeWalletStorage();
  assert.equal(bootstrap.reinstalled, true);
  assert.deepEqual(await storage.readIndex(), []);
  assert.equal(asyncData.get('app.reinstallCleanupPending.v1'), '1');

  console.log('wallet vault migration, encryption, tamper detection, and uninstall checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
