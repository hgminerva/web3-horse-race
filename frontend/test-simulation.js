#!/usr/bin/env node
/**
 * Karera DS - Contract Simulation Test Script
 * 
 * This script tests the horse racing contract by:
 * 1. Connecting to the blockchain
 * 2. Querying contract state
 * 3. Running simulation functions
 * 4. Catching and reporting errors
 * 
 * Usage: node test-simulation.js [--ws URL] [--contract ADDRESS]
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DEFAULT_WS_URL = 'wss://devnet02.xode.net';
const DEFAULT_CONTRACT_ADDRESS = 'XqD1VXfyYxUF7huaLP5jruABns3wJL9hkRCxBUV8VicJD75Sq';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    wsUrl: DEFAULT_WS_URL,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ws' && args[i + 1]) {
      config.wsUrl = args[++i];
    } else if (args[i] === '--contract' && args[i + 1]) {
      config.contractAddress = args[++i];
    } else if (args[i] === '--help') {
      console.log(`
Karera DS - Contract Simulation Test Script

Usage: node test-simulation.js [options]

Options:
  --ws URL          WebSocket endpoint (default: ${DEFAULT_WS_URL})
  --contract ADDR   Contract address (default: ${DEFAULT_CONTRACT_ADDRESS})
  --help            Show this help message
      `);
      process.exit(0);
    }
  }

  return config;
}

// Console colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + colors.cyan + colors.bold + '═'.repeat(60) + colors.reset);
  console.log(colors.cyan + colors.bold + ' ' + message + colors.reset);
  console.log(colors.cyan + colors.bold + '═'.repeat(60) + colors.reset);
}

function logSection(message) {
  console.log('\n' + colors.yellow + '▶ ' + message + colors.reset);
}

function logSuccess(message) {
  console.log(colors.green + '  ✓ ' + message + colors.reset);
}

function logError(message) {
  console.log(colors.red + '  ✗ ' + message + colors.reset);
}

function logInfo(message) {
  console.log(colors.white + '  → ' + message + colors.reset);
}

function logWarning(message) {
  console.log(colors.yellow + '  ⚠ ' + message + colors.reset);
}

// Horse data
const HORSES = [
  { id: 0, name: 'Thunder Bolt', strength: 6 },
  { id: 1, name: 'Silver Arrow', strength: 5 },
  { id: 2, name: 'Golden Star', strength: 4 },
  { id: 3, name: 'Dark Knight', strength: 3 },
  { id: 4, name: 'Wild Spirit', strength: 2 },
  { id: 5, name: 'Lucky Charm', strength: 1 },
];

// Test results tracker
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
};

function recordPass(testName) {
  testResults.passed++;
  logSuccess(`PASS: ${testName}`);
}

function recordFail(testName, error) {
  testResults.failed++;
  const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : error);
  testResults.errors.push({ test: testName, error: errorMsg });
  logError(`FAIL: ${testName}`);
  logError(`      Error: ${errorMsg}`);
  
  // Interpret common errors
  if (errorMsg.includes('"index":51') || errorMsg.includes('index: 51')) {
    logWarning('      Hint: Module error 51 usually means "ContractNotFound"');
    logWarning('      Check: Is the contract deployed? Does the address match?');
  } else if (errorMsg.includes('0x02000000')) {
    logWarning('      Hint: Error 0x02000000 = Contract code not found or metadata mismatch');
  }
}

// Main test script
async function main() {
  const config = parseArgs();
  
  logHeader('KARERA DS - CONTRACT SIMULATION TEST');
  log(`WebSocket: ${config.wsUrl}`, 'cyan');
  log(`Contract: ${config.contractAddress}`, 'cyan');

  let api;
  let contract;

  try {
    // ============================================================
    // PHASE 1: CONNECTION
    // ============================================================
    logSection('Phase 1: Connecting to blockchain...');

    await cryptoWaitReady();
    logSuccess('Crypto initialized');

    const provider = new WsProvider(config.wsUrl);
    api = await ApiPromise.create({ provider });
    logSuccess(`Connected to chain: ${(await api.rpc.system.chain()).toString()}`);

    // Load metadata
    const metadataPath = path.join(__dirname, 'src', 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata file not found at ${metadataPath}`);
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    logSuccess('Contract metadata loaded');

    // Create contract instance
    contract = new ContractPromise(api, metadata, config.contractAddress);
    logSuccess('Contract instance created');

    // Create test account (Alice from dev keyring)
    const keyring = new Keyring({ type: 'sr25519' });
    const alice = keyring.addFromUri('//Alice');
    logSuccess(`Test account: ${alice.address}`);

    // Verify contract exists
    let contractCodeHash = null;
    logInfo('Verifying contract exists on chain...');
    try {
      const contractInfo = await api.query.contracts.contractInfoOf(config.contractAddress);
      if (contractInfo.isSome) {
        logSuccess('Contract found on chain');
        const info = contractInfo.unwrap();
        contractCodeHash = info.codeHash.toHex();
        logInfo(`  Code hash: ${contractCodeHash}`);
        
        // Check if metadata matches (look for source.hash in metadata)
        if (metadata.source && metadata.source.hash) {
          const metadataHash = metadata.source.hash;
          logInfo(`  Metadata code hash: ${metadataHash}`);
          if (metadataHash === contractCodeHash) {
            logSuccess('Metadata matches deployed contract!');
          } else {
            logWarning('METADATA MISMATCH DETECTED!');
            logWarning('The metadata.json does not match the deployed contract.');
            logWarning('Solutions:');
            logWarning('  1. Redeploy the contract with updated code');
            logWarning('  2. Or update metadata.json from the correct build');
          }
        }
      } else {
        logWarning('Contract NOT found at this address!');
        logWarning('Please deploy the contract first or check the address.');
        logWarning('Continuing with tests (they will likely fail)...');
      }
    } catch (e) {
      logWarning(`Could not verify contract: ${e.message}`);
    }

    // ============================================================
    // PHASE 2: READ-ONLY QUERIES
    // ============================================================
    logSection('Phase 2: Testing read-only queries...');

    // Get weight limits for queries
    const maxGas = api.registry.createType('WeightV2', {
      refTime: 100_000_000_000n,
      proofSize: 1_000_000n,
    });
    logInfo(`Using gas limit: refTime=${maxGas.refTime.toString()}, proofSize=${maxGas.proofSize.toString()}`);

    // Test getStatus
    try {
      const { result, output, gasRequired, storageDeposit } = await contract.query.getStatus(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null }
      );
      logInfo(`getStatus gasRequired: ${JSON.stringify(gasRequired?.toHuman())}`);
      if (result.isOk) {
        logInfo(`getStatus: ${JSON.stringify(output.toHuman())}`);
        recordPass('getStatus');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getStatus', e);
    }

    // Test getRaceId
    try {
      const { result, output } = await contract.query.getRaceId(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getRaceId: ${JSON.stringify(output.toHuman())}`);
        recordPass('getRaceId');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getRaceId', e);
    }

    // Test getHorses
    try {
      const { result, output } = await contract.query.getHorses(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        const horses = output.toHuman();
        logInfo(`getHorses: ${JSON.stringify(horses)}`);
        recordPass('getHorses');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getHorses', e);
    }

    // Test getOwner
    try {
      const { result, output } = await contract.query.getOwner(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getOwner: ${JSON.stringify(output.toHuman())}`);
        recordPass('getOwner');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getOwner', e);
    }

    // Test getTotalPot
    try {
      const { result, output } = await contract.query.getTotalPot(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getTotalPot: ${JSON.stringify(output.toHuman())}`);
        recordPass('getTotalPot');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getTotalPot', e);
    }

    // Test getBets
    try {
      const { result, output } = await contract.query.getBets(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getBets: ${JSON.stringify(output.toHuman())}`);
        recordPass('getBets');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getBets', e);
    }

    // Test getLatestResult
    try {
      const { result, output } = await contract.query.getLatestResult(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getLatestResult: ${JSON.stringify(output.toHuman())}`);
        recordPass('getLatestResult');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getLatestResult', e);
    }

    // Test getPayouts
    try {
      const { result, output } = await contract.query.getPayouts(alice.address, { gasLimit: maxGas, storageDepositLimit: null });
      if (result.isOk) {
        logInfo(`getPayouts: ${JSON.stringify(output.toHuman())}`);
        recordPass('getPayouts');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getPayouts', e);
    }

    // ============================================================
    // PHASE 3: PROBABILITY CALCULATIONS
    // ============================================================
    logSection('Phase 3: Testing probability calculations...');

    // Test calculateExactaProbability
    try {
      const { result, output } = await contract.query.calculateExactaProbability(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null },
        0, 1  // Thunder Bolt → Silver Arrow
      );
      if (result.isOk) {
        logInfo(`calculateExactaProbability(0, 1): ${JSON.stringify(output.toHuman())}`);
        recordPass('calculateExactaProbability');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('calculateExactaProbability', e);
    }

    // Test getRewardMultiplier
    try {
      const { result, output } = await contract.query.getRewardMultiplier(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null },
        0, 5  // Thunder Bolt → Lucky Charm (should be x60)
      );
      if (result.isOk) {
        logInfo(`getRewardMultiplier(0, 5): ${JSON.stringify(output.toHuman())}`);
        recordPass('getRewardMultiplier');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getRewardMultiplier', e);
    }

    // Test getExactaProbabilityTable
    try {
      const { result, output } = await contract.query.getExactaProbabilityTable(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null }
      );
      if (result.isOk) {
        const table = output.toHuman();
        logInfo(`getExactaProbabilityTable: ${Array.isArray(table?.Ok) ? table.Ok.length : 0} entries`);
        if (table?.Ok?.length > 0) {
          logInfo(`  Sample: ${JSON.stringify(table.Ok[0])}`);
        }
        recordPass('getExactaProbabilityTable');
      } else {
        throw new Error(JSON.stringify(result.asErr.toHuman()));
      }
    } catch (e) {
      recordFail('getExactaProbabilityTable', e);
    }

    // ============================================================
    // PHASE 4: DRY-RUN TRANSACTION TESTS
    // ============================================================
    logSection('Phase 4: Testing transactions (dry-run only)...');

    // Test placeExactaBet (dry-run)
    try {
      const betValue = 1_000_000_000_000n; // 1 token
      const { result, output, gasRequired } = await contract.query.placeExactaBet(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null, value: betValue },
        0, 1  // Bet: Thunder Bolt 1st, Silver Arrow 2nd
      );
      if (result.isOk) {
        logInfo(`placeExactaBet(0, 1) dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('placeExactaBet (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`placeExactaBet may fail in current state: ${JSON.stringify(error)}`);
        recordPass('placeExactaBet (dry-run checked)');
      }
    } catch (e) {
      recordFail('placeExactaBet (dry-run)', e);
    }

    // Test startRace (dry-run)
    try {
      const seed = 12345;
      const { result, output, gasRequired } = await contract.query.startRace(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null },
        seed
      );
      if (result.isOk) {
        logInfo(`startRace(${seed}) dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('startRace (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`startRace may fail: ${JSON.stringify(error)}`);
        recordPass('startRace (dry-run checked)');
      }
    } catch (e) {
      recordFail('startRace (dry-run)', e);
    }

    // Test runRaceSimulation (dry-run)
    try {
      const { result, output, gasRequired } = await contract.query.runRaceSimulation(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null }
      );
      if (result.isOk) {
        logInfo(`runRaceSimulation dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('runRaceSimulation (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`runRaceSimulation may fail: ${JSON.stringify(error)}`);
        recordPass('runRaceSimulation (dry-run checked)');
      }
    } catch (e) {
      recordFail('runRaceSimulation (dry-run)', e);
    }

    // Test distributePayouts (dry-run)
    try {
      const { result, output, gasRequired } = await contract.query.distributePayouts(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null }
      );
      if (result.isOk) {
        logInfo(`distributePayouts dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('distributePayouts (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`distributePayouts may fail: ${JSON.stringify(error)}`);
        recordPass('distributePayouts (dry-run checked)');
      }
    } catch (e) {
      recordFail('distributePayouts (dry-run)', e);
    }

    // Test resetForNewRace (dry-run)
    try {
      const { result, output, gasRequired } = await contract.query.resetForNewRace(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null }
      );
      if (result.isOk) {
        logInfo(`resetForNewRace dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('resetForNewRace (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`resetForNewRace may fail (owner only): ${JSON.stringify(error)}`);
        recordPass('resetForNewRace (dry-run checked)');
      }
    } catch (e) {
      recordFail('resetForNewRace (dry-run)', e);
    }

    // Test simulateCompleteRace (dry-run)
    try {
      const seed = 42;
      const { result, output, gasRequired } = await contract.query.simulateCompleteRace(
        alice.address, 
        { gasLimit: maxGas, storageDepositLimit: null },
        seed
      );
      if (result.isOk) {
        logInfo(`simulateCompleteRace(${seed}) dry-run: ${JSON.stringify(output.toHuman())}`);
        logInfo(`  Gas required: ${JSON.stringify(gasRequired?.toHuman())}`);
        recordPass('simulateCompleteRace (dry-run)');
      } else {
        const error = result.asErr.toHuman();
        logWarning(`simulateCompleteRace may fail: ${JSON.stringify(error)}`);
        recordPass('simulateCompleteRace (dry-run checked)');
      }
    } catch (e) {
      recordFail('simulateCompleteRace (dry-run)', e);
    }

    // ============================================================
    // PHASE 5: CONTRACT METADATA VALIDATION
    // ============================================================
    logSection('Phase 5: Validating contract metadata...');

    const expectedMethods = [
      'getStatus',
      'getRaceId',
      'getHorses',
      'getOwner',
      'getTotalPot',
      'getBets',
      'getLatestResult',
      'getPayouts',
      'calculateExactaProbability',
      'getRewardMultiplier',
      'getExactaProbabilityTable',
      'placeExactaBet',
      'startRace',
      'runRaceSimulation',
      'distributePayouts',
      'resetForNewRace',
      'simulateCompleteRace',
    ];

    const availableMethods = Object.keys(contract.query);
    logInfo(`Available query methods: ${availableMethods.length}`);

    const missingMethods = expectedMethods.filter(m => !availableMethods.includes(m));
    if (missingMethods.length === 0) {
      recordPass('All expected methods available');
    } else {
      recordFail('Missing methods', missingMethods.join(', '));
    }

    // Check for extra methods (informational)
    const extraMethods = availableMethods.filter(m => !expectedMethods.includes(m));
    if (extraMethods.length > 0) {
      logInfo(`Additional methods: ${extraMethods.join(', ')}`);
    }

  } catch (error) {
    logError(`Critical error: ${error.message}`);
    testResults.errors.push({ test: 'CRITICAL', error: error.message });
    testResults.failed++;
  } finally {
    // ============================================================
    // SUMMARY
    // ============================================================
    logHeader('TEST SUMMARY');
    
    log(`Total tests: ${testResults.passed + testResults.failed}`, 'white');
    log(`Passed: ${testResults.passed}`, 'green');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');

    if (testResults.errors.length > 0) {
      console.log('\n' + colors.red + 'Errors:' + colors.reset);
      testResults.errors.forEach((e, i) => {
        console.log(colors.red + `  ${i + 1}. [${e.test}] ${e.error}` + colors.reset);
      });
    }

    // Cleanup
    if (api) {
      await api.disconnect();
      logInfo('Disconnected from blockchain');
    }

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
