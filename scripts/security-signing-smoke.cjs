const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { TronWeb } = require('tronweb');

function loadTransactionValidation() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src/security/transaction-validation.ts'),
    'utf8',
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', javascript)(require, loaded, loaded.exports);
  return loaded.exports;
}

async function main() {
  const validation = loadTransactionValidation();
  const owner = TronWeb.address.fromPrivateKey('1'.repeat(64));
  const recipient = TronWeb.address.fromPrivateKey('2'.repeat(64));
  const attacker = TronWeb.address.fromPrivateKey('3'.repeat(64));
  const token = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const now = Date.now();
  const blockHeader = {
    ref_block_bytes: '0001',
    ref_block_hash: '0011223344556677',
    timestamp: now,
    expiration: now + 60_000,
  };
  const local = new TronWeb({ fullHost: 'http://127.0.0.1' });

  // TronWeb must reject a Fullnode response whose signed meaning differs from
  // the locally requested recipient/amount. This guards future dependency work.
  const malicious = (await local.transactionBuilder.triggerSmartContract(
    token,
    'transfer(address,uint256)',
    { feeLimit: 50_000_000, txLocal: true, blockHeader },
    [
      { type: 'address', value: attacker },
      { type: 'uint256', value: '999000000' },
    ],
    owner,
  )).transaction;
  const victim = new TronWeb({ fullHost: 'http://127.0.0.1' });
  victim.fullNode.request = async (requestPath) => {
    assert.equal(requestPath, 'wallet/triggersmartcontract');
    return { result: { result: true }, transaction: malicious };
  };
  await assert.rejects(
    victim.transactionBuilder.triggerSmartContract(
      token,
      'transfer(address,uint256)',
      { feeLimit: 50_000_000 },
      [
        { type: 'address', value: recipient },
        { type: 'uint256', value: '1000000' },
      ],
      owner,
    ),
    /Invalid transaction/,
  );

  const trx = await local.transactionBuilder.sendTrx(
    recipient,
    1_000_000,
    owner,
    { blockHeader },
  );
  validation.assertSafeImportedMultisigTransaction(trx);

  const tokenTransfer = (await local.transactionBuilder.triggerSmartContract(
    token,
    'transfer(address,uint256)',
    { feeLimit: 50_000_000, txLocal: true, blockHeader },
    [
      { type: 'address', value: recipient },
      { type: 'uint256', value: '1234567' },
    ],
    owner,
  )).transaction;
  validation.assertSafeImportedMultisigTransaction(tokenTransfer);
  assert(
    validation.describeSafeImportedMultisigTransaction(tokenTransfer)
      .some((line) => line.includes(recipient)),
  );

  const tampered = JSON.parse(JSON.stringify(tokenTransfer));
  tampered.raw_data.contract[0].parameter.value.data =
    `${tampered.raw_data.contract[0].parameter.value.data.slice(0, -1)}0`;
  assert.throws(
    () => validation.assertSafeImportedMultisigTransaction(tampered),
    /transaction_integrity_invalid/,
  );

  const approval = (await local.transactionBuilder.triggerSmartContract(
    token,
    'approve(address,uint256)',
    { feeLimit: 50_000_000, txLocal: true, blockHeader },
    [
      { type: 'address', value: recipient },
      { type: 'uint256', value: '1234567' },
    ],
    owner,
  )).transaction;
  assert.throws(
    () => validation.assertSafeImportedMultisigTransaction(approval),
    /multisig_contract_method_unsupported/,
  );

  const ownerPermission = {
    type: 0,
    permission_name: 'owner',
    threshold: 1,
    keys: [{ address: attacker, weight: 1 }],
  };
  const activePermission = {
    type: 2,
    permission_name: 'payments',
    threshold: 1,
    parent_id: 0,
    operations: '7fff1fc0033e0000000000000000000000000000000000000000000000000000',
    keys: [{ address: owner, weight: 1 }],
  };
  const permissionUpdate = await local.transactionBuilder.updateAccountPermissions(
    owner,
    ownerPermission,
    null,
    [activePermission],
    { blockHeader },
  );
  const permissionReview = validation.describeSafeImportedMultisigTransaction(permissionUpdate);
  assert(permissionReview.some((line) => line.startsWith('DANGER:')));
  assert(permissionReview.some((line) => line.includes(attacker)));

  console.log('RPC substitution rejection and imported multisig signing checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
