import React, { useState, useEffect } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import { BN, u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';

// Helper to compare addresses regardless of SS58 format
const addressesEqual = (addr1, addr2) => {
  try {
    if (!addr1 || !addr2) return false;
    // Decode both addresses to raw public key bytes and compare
    const decoded1 = u8aToHex(decodeAddress(addr1));
    const decoded2 = u8aToHex(decodeAddress(addr2));
    return decoded1 === decoded2;
  } catch (e) {
    console.error('Address comparison error:', e);
    return false;
  }
};

// Contract metadata - will be loaded from the built contract
import metadata from './metadata.json';

// Default configuration
const DEFAULT_WS_URL = 'wss://devnet02.xode.net';
const CONTRACT_ADDRESS = 'XqCj5mxGMxvbSBv5oHkqRsto78t1eqojcDy73p2CAB8GMCQp1';

// Horse data matching the contract
const HORSES = [
  { id: 0, name: 'Thunder Bolt', strength: 6, color: '#FFD700' },
  { id: 1, name: 'Silver Arrow', strength: 5, color: '#C0C0C0' },
  { id: 2, name: 'Golden Star', strength: 4, color: '#FFB347' },
  { id: 3, name: 'Dark Knight', strength: 3, color: '#4A4A4A' },
  { id: 4, name: 'Wild Spirit', strength: 2, color: '#9370DB' },
  { id: 5, name: 'Lucky Charm', strength: 1, color: '#50C878' },
];

// Contract Test Panel Component
function ContractTestPanel({ contract, api, selectedAccount, addLog }) {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  // Test queries list
  const queryTests = [
    { name: 'getStatus', args: [], description: 'Get race status' },
    { name: 'getRaceId', args: [], description: 'Get current race ID' },
    { name: 'getOwner', args: [], description: 'Get contract owner' },
    { name: 'getHorses', args: [], description: 'Get all horses' },
    { name: 'getTotalPot', args: [], description: 'Get total betting pot' },
    { name: 'getBets', args: [], description: 'Get all bets' },
    { name: 'getLatestResult', args: [], description: 'Get latest race result' },
    { name: 'getPayouts', args: [], description: 'Get payouts' },
    { name: 'getWinners', args: [], description: 'Get winners' },
    { name: 'calculateExactaProbability', args: [0, 1], description: 'Calculate exacta probability (0→1)' },
    { name: 'getRewardMultiplier', args: [0, 5], description: 'Get reward multiplier (0→5)' },
    { name: 'getNormalizedStrength', args: [0], description: 'Get normalized strength (horse 0)' },
  ];

  const addTestResult = (name, status, message, gasUsed = null) => {
    setTestResults(prev => [...prev, { 
      name, 
      status, 
      message, 
      gasUsed,
      timestamp: new Date().toLocaleTimeString() 
    }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const runAllTests = async () => {
    if (!contract || !selectedAccount) {
      addTestResult('Connection', 'error', 'Please connect wallet and contract first');
      return;
    }

    setIsRunning(true);
    clearResults();
    
    addTestResult('Connection', 'info', `Testing with account: ${selectedAccount.address.slice(0, 12)}...`);
    
    // Create gas limit
    let maxGas;
    try {
      maxGas = api.registry.createType('WeightV2', {
        refTime: 100_000_000_000n,
        proofSize: 1_000_000n,
      });
      addTestResult('Gas Setup', 'success', `Using WeightV2 gas limit`);
    } catch (e) {
      // Fallback for older chains
      maxGas = -1;
      addTestResult('Gas Setup', 'warning', `Using legacy gas limit (-1)`);
    }

    // Verify contract exists
    try {
      const contractInfo = await api.query.contracts.contractInfoOf(contract.address.toString());
      if (contractInfo.isSome) {
        const info = contractInfo.unwrap();
        addTestResult('Contract Check', 'success', `Contract found! Code hash: ${info.codeHash.toHex().slice(0, 16)}...`);
        
        // Compare with metadata
        if (metadata.source && metadata.source.hash) {
          if (metadata.source.hash === info.codeHash.toHex()) {
            addTestResult('Metadata Check', 'success', 'Metadata matches deployed contract');
          } else {
            addTestResult('Metadata Check', 'error', `MISMATCH! Deployed: ${info.codeHash.toHex().slice(0, 16)}... Metadata: ${metadata.source.hash.slice(0, 16)}...`);
          }
        }
      } else {
        addTestResult('Contract Check', 'error', 'Contract NOT found at this address!');
        setIsRunning(false);
        return;
      }
    } catch (e) {
      addTestResult('Contract Check', 'warning', `Could not verify: ${e.message}`);
    }

    // Run all query tests
    for (const test of queryTests) {
      try {
        const queryOptions = typeof maxGas === 'number' 
          ? { gasLimit: maxGas }
          : { gasLimit: maxGas, storageDepositLimit: null };
          
        const { result, output, gasRequired } = await contract.query[test.name](
          selectedAccount.address,
          queryOptions,
          ...test.args
        );

        const gasInfo = gasRequired?.refTime 
          ? `${(Number(gasRequired.refTime) / 1_000_000).toFixed(2)}M refTime`
          : gasRequired?.toHuman?.() || 'N/A';

        if (result.isOk) {
          const value = output?.toHuman();
          const displayValue = JSON.stringify(value, null, 2);
          const shortValue = displayValue.length > 100 
            ? displayValue.slice(0, 100) + '...' 
            : displayValue;
          addTestResult(test.name, 'success', shortValue, gasInfo);
        } else {
          const error = result.asErr.toHuman();
          addTestResult(test.name, 'error', JSON.stringify(error), gasInfo);
        }
      } catch (e) {
        addTestResult(test.name, 'error', e.message);
      }
      
      // Small delay between tests
      await new Promise(r => setTimeout(r, 100));
    }

    addTestResult('Summary', 'info', `Completed ${queryTests.length} tests`);
    setIsRunning(false);
  };

  const runSingleTest = async (testName, args = []) => {
    if (!contract || !selectedAccount) {
      addTestResult(testName, 'error', 'Not connected');
      return;
    }

    try {
      let maxGas;
      try {
        maxGas = api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 1_000_000n,
        });
      } catch {
        maxGas = -1;
      }

      const queryOptions = typeof maxGas === 'number' 
        ? { gasLimit: maxGas }
        : { gasLimit: maxGas, storageDepositLimit: null };

      const { result, output, gasRequired } = await contract.query[testName](
        selectedAccount.address,
        queryOptions,
        ...args
      );

      const gasInfo = gasRequired?.refTime 
        ? `${(Number(gasRequired.refTime) / 1_000_000).toFixed(2)}M refTime`
        : 'N/A';

      if (result.isOk) {
        const value = output?.toHuman();
        addTestResult(testName, 'success', JSON.stringify(value, null, 2), gasInfo);
      } else {
        const error = result.asErr.toHuman();
        addTestResult(testName, 'error', JSON.stringify(error), gasInfo);
      }
    } catch (e) {
      addTestResult(testName, 'error', e.message);
    }
  };

  if (!showPanel) {
    return (
      <div className="test-panel-toggle">
        <button className="secondary" onClick={() => setShowPanel(true)}>
          🧪 Open Contract Test Panel
        </button>
      </div>
    );
  }

  return (
    <div className="test-panel">
      <div className="test-panel-header">
        <h2>🧪 Contract Test Panel</h2>
        <button className="close-btn" onClick={() => setShowPanel(false)}>×</button>
      </div>
      
      <p className="info-text">
        Run contract queries using your connected wallet. This helps diagnose errors.
      </p>

      <div className="test-controls">
        <button 
          className="primary" 
          onClick={runAllTests} 
          disabled={isRunning || !contract}
        >
          {isRunning ? '⏳ Running...' : '▶ Run All Tests'}
        </button>
        <button 
          className="secondary" 
          onClick={clearResults}
          disabled={isRunning}
        >
          🗑 Clear Results
        </button>
      </div>

      <div className="test-quick-buttons">
        <span>Quick Test:</span>
        {queryTests.slice(0, 6).map(test => (
          <button 
            key={test.name}
            className="mini-btn"
            onClick={() => runSingleTest(test.name, test.args)}
            disabled={isRunning || !contract}
            title={test.description}
          >
            {test.name}
          </button>
        ))}
      </div>

      <div className="test-results">
        {testResults.length === 0 ? (
          <div className="no-results">
            Click "Run All Tests" to start testing the contract.
            <br /><br />
            Tests will check:
            <br />• Contract existence on chain
            <br />• Metadata hash matching
            <br />• All getter functions
            <br />• Probability calculations
          </div>
        ) : (
          testResults.map((result, idx) => (
            <div key={idx} className={`test-result test-${result.status}`}>
              <div className="test-header">
                <span className="test-icon">
                  {result.status === 'success' ? '✓' : result.status === 'error' ? '✗' : result.status === 'warning' ? '⚠' : 'ℹ'}
                </span>
                <span className="test-name">{result.name}</span>
                <span className="test-time">{result.timestamp}</span>
                {result.gasUsed && <span className="test-gas">Gas: {result.gasUsed}</span>}
              </div>
              <pre className="test-message">{result.message}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function App() {
  const [api, setApi] = useState(null);
  const [contract, setContract] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [contractAddress, setContractAddress] = useState(CONTRACT_ADDRESS);
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});

  // Betting form states
  const [firstPick, setFirstPick] = useState('');
  const [secondPick, setSecondPick] = useState('');
  const [betAmount, setBetAmount] = useState('1000000000000');
  const [raceSeed, setRaceSeed] = useState('');

  // Simulation states
  const [simLog, setSimLog] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simPhase, setSimPhase] = useState('idle'); // idle, betting, racing, results
  const [racePositions, setRacePositions] = useState([]);
  const [raceResult, setRaceResult] = useState(null);
  const [probabilityTable, setProbabilityTable] = useState([]);
  
  // Player betting states
  const [playerBet, setPlayerBet] = useState({ first: null, second: null });
  const [playerBetAmount, setPlayerBetAmount] = useState('1');
  const [playerBetPlaced, setPlayerBetPlaced] = useState(false);
  const [oddsTable, setOddsTable] = useState([]);
  const [loadingOdds, setLoadingOdds] = useState(false);

  // Add log entry
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSimLog(prev => [...prev, { timestamp, message, type }]);
  };

  // Clear logs
  const clearLogs = () => {
    setSimLog([]);
    setRaceResult(null);
    setRacePositions([]);
  };

  // Sleep helper
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Generate random seed
  const generateSeed = () => {
    return Math.floor(Math.random() * 1000000000);
  };

  // Get max gas limit helper
  const getMaxGas = () => {
    if (!api) return null;
    try {
      return api.registry.createType('WeightV2', {
        refTime: 300_000_000_000n,
        proofSize: 5_000_000n,
      });
    } catch {
      // Fallback for older chains
      return api.registry.createType('Weight', 300_000_000_000n);
    }
  };

  // Query contract and return value
  const queryContractValue = async (method, ...args) => {
    if (!contract || !selectedAccount) return null;
    
    try {
      const maxGas = getMaxGas();
      const queryOptions = maxGas?.refTime 
        ? { gasLimit: maxGas, storageDepositLimit: null }
        : { gasLimit: maxGas || -1 };
        
      const { result, output } = await contract.query[method](
        selectedAccount.address,
        queryOptions,
        ...args
      );
      if (result.isOk) {
        return output?.toHuman();
      } else {
        console.error(`Query ${method} failed:`, result.asErr.toHuman());
      }
    } catch (error) {
      console.error(`Query ${method} error:`, error);
    }
    return null;
  };

  // Send transaction and wait for completion
  const sendTxAndWait = async (method, args, value = 0) => {
    if (!contract || !selectedAccount) {
      throw new Error('Contract or account not connected');
    }

    const injector = await web3FromAddress(selectedAccount.address);
    const maxGas = getMaxGas();
    
    const queryOptions = maxGas?.refTime 
      ? { gasLimit: maxGas, storageDepositLimit: null, value }
      : { gasLimit: maxGas || -1, value };
    
    const { gasRequired, result } = await contract.query[method](
      selectedAccount.address,
      queryOptions,
      ...args
    );

    if (result.isErr) {
      const error = result.asErr.toHuman();
      throw new Error(JSON.stringify(error));
    }

    // Use the gasRequired from dry-run, with a small buffer
    const gasLimit = gasRequired;

    return new Promise((resolve, reject) => {
      contract.tx[method](
        { gasLimit, storageDepositLimit: null, value },
        ...args
      ).signAndSend(selectedAccount.address, { signer: injector.signer }, ({ status, events, dispatchError }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`));
          } else {
            reject(new Error(dispatchError.toString()));
          }
        }
        if (status.isInBlock) {
          resolve(status.asInBlock.toHex());
        }
        if (status.isFinalized) {
          resolve(status.asFinalized.toHex());
        }
      }).catch(reject);
    });
  };

  // Connect to wallet
  const connectWallet = async () => {
    try {
      setLoading(prev => ({ ...prev, wallet: true }));
      const extensions = await web3Enable('Web3 Horse Race');
      
      if (extensions.length === 0) {
        setResults(prev => ({ 
          ...prev, 
          wallet: { error: 'No wallet extension found. Please install Polkadot.js extension.' }
        }));
        return;
      }

      const allAccounts = await web3Accounts();
      setAccounts(allAccounts);
      
      if (allAccounts.length > 0) {
        setSelectedAccount(allAccounts[0]);
      }
      
      setResults(prev => ({ 
        ...prev, 
        wallet: { success: `Found ${allAccounts.length} account(s)` }
      }));
    } catch (error) {
      setResults(prev => ({ ...prev, wallet: { error: error.message } }));
    } finally {
      setLoading(prev => ({ ...prev, wallet: false }));
    }
  };

  // Connect to node
  const connectToNode = async () => {
    try {
      setLoading(prev => ({ ...prev, node: true }));
      
      const provider = new WsProvider(wsUrl);
      const apiInstance = await ApiPromise.create({ provider });
      
      setApi(apiInstance);
      setIsConnected(true);
      
      const chain = await apiInstance.rpc.system.chain();
      setResults(prev => ({ 
        ...prev, 
        node: { success: `Connected to ${chain}` }
      }));
    } catch (error) {
      setResults(prev => ({ ...prev, node: { error: error.message } }));
      setIsConnected(false);
    } finally {
      setLoading(prev => ({ ...prev, node: false }));
    }
  };

  // Connect to contract
  const connectToContract = async () => {
    if (!api || !contractAddress) {
      setResults(prev => ({ 
        ...prev, 
        contract: { error: 'Please connect to node and enter contract address' }
      }));
      return;
    }

    try {
      setLoading(prev => ({ ...prev, contract: true }));
      
      const contractInstance = new ContractPromise(api, metadata, contractAddress);
      setContract(contractInstance);
      
      setResults(prev => ({ 
        ...prev, 
        contract: { success: `Contract connected at ${contractAddress}` }
      }));

      // Load probability table
      setTimeout(() => loadProbabilityTable(contractInstance), 1000);
    } catch (error) {
      setResults(prev => ({ ...prev, contract: { error: error.message } }));
    } finally {
      setLoading(prev => ({ ...prev, contract: false }));
    }
  };

  // Load probability table
  const loadProbabilityTable = async (contractInstance) => {
    if (!contractInstance || !selectedAccount) return;
    
    try {
      const { result, output } = await contractInstance.query.getExactaProbabilityTable(
        selectedAccount.address,
        { gasLimit: -1 }
      );
      if (result.isOk) {
        const table = output?.toHuman()?.Ok || [];
        setProbabilityTable(table);
      }
    } catch (error) {
      console.error('Failed to load probability table:', error);
    }
  };

  // Generic query function
  const queryContract = async (method, key) => {
    if (!contract || !selectedAccount) {
      setResults(prev => ({ ...prev, [key]: { error: 'Contract or account not connected' } }));
      return;
    }

    try {
      setLoading(prev => ({ ...prev, [key]: true }));
      
      const maxGas = getMaxGas();
      const queryOptions = maxGas?.refTime 
        ? { gasLimit: maxGas, storageDepositLimit: null }
        : { gasLimit: maxGas || -1 };
      
      const { result, output } = await contract.query[method](
        selectedAccount.address,
        queryOptions
      );

      if (result.isOk) {
        const value = output?.toHuman();
        setResults(prev => ({ ...prev, [key]: { success: JSON.stringify(value, null, 2) } }));
      } else {
        const error = result.asErr.toHuman();
        setResults(prev => ({ ...prev, [key]: { error: JSON.stringify(error) } }));
      }
    } catch (error) {
      setResults(prev => ({ ...prev, [key]: { error: error.message } }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  // Render result box
  const renderResult = (key) => {
    const result = results[key];
    if (!result) return null;
    
    return (
      <div className={`result-box ${result.success ? 'success' : 'error'}`}>
        {result.success || result.error}
      </div>
    );
  };

  // ============================================================================
  // RACE SIMULATION - INTERACTIVE BETTING
  // ============================================================================

  // Reward multipliers (matching contract)
  const MULTIPLIERS = {
    '0-1': 2, '0-2': 3, '0-3': 10, '0-4': 30, '0-5': 60,
    '1-0': 2, '1-2': 5, '1-3': 20, '1-4': 125, '1-5': 175,
    '2-0': 3, '2-1': 5, '2-3': 8, '2-4': 80, '2-5': 100,
    '3-0': 10, '3-1': 20, '3-2': 8, '3-4': 250, '3-5': 500,
    '4-0': 30, '4-1': 125, '4-2': 80, '4-3': 250, '4-5': 1000,
    '5-0': 60, '5-1': 175, '5-2': 100, '5-3': 500, '5-4': 1000,
  };

  // Get multiplier for a combination
  const getMultiplier = (first, second) => {
    return MULTIPLIERS[`${first}-${second}`] || 0;
  };

  // Load odds table from contract or use defaults
  const loadOddsTable = async () => {
    setLoadingOdds(true);
    const table = [];
    
    for (let first = 0; first < 6; first++) {
      for (let second = 0; second < 6; second++) {
        if (first !== second) {
          const multiplier = getMultiplier(first, second);
          table.push({
            first,
            second,
            firstHorse: HORSES[first],
            secondHorse: HORSES[second],
            multiplier,
          });
        }
      }
    }
    
    // Sort by multiplier (highest first for exciting longshots)
    table.sort((a, b) => b.multiplier - a.multiplier);
    setOddsTable(table);
    setLoadingOdds(false);
  };

  // Start new race (reset and load odds)
  const startNewRace = async () => {
    if (!contract || !selectedAccount) {
      addLog('Please connect wallet and contract first!', 'error');
      return;
    }

    setSimRunning(true);
    clearLogs();
    setPlayerBet({ first: null, second: null });
    setPlayerBetPlaced(false);
    setRaceResult(null);

    addLog('═══════════════════════════════════════════════════', 'header');
    addLog('🏇 WEB3 HORSE RACE BETTING 🏇', 'header');
    addLog('═══════════════════════════════════════════════════', 'header');
    addLog('');

    try {
      // Check current status first
      const currentStatus = await queryContractValue('getStatus');
      const statusValue = currentStatus?.Ok || currentStatus;
      addLog(`Current contract status: ${JSON.stringify(statusValue)}`, 'info');

      // If not in Betting status, try to reset (owner only)
      if (statusValue !== 'Betting' && statusValue?.Betting === undefined) {
        addLog('Attempting to reset for new race...', 'info');
        try {
          await sendTxAndWait('resetForNewRace', []);
          addLog('✓ Race reset successful!', 'success');
        } catch (e) {
          addLog(`⚠ Reset failed: ${e.message}`, 'error');
          addLog('', 'info');
          addLog('═══════════════════════════════════════════════════', 'warning');
          addLog('⚠ OWNER PERMISSION REQUIRED ⚠', 'warning');
          addLog('═══════════════════════════════════════════════════', 'warning');
          addLog('', 'info');
          addLog('The contract is not in "Betting" status.', 'info');
          addLog('Only the contract owner can reset it for a new race.', 'info');
          addLog('', 'info');
          addLog('Options:', 'phase');
          addLog('1. Ask the contract owner to reset the contract', 'info');
          addLog('2. If you ARE the owner, make sure you\'re using the owner wallet', 'info');
          addLog('3. Wait for the current race cycle to complete', 'info');
          
          // Check who the owner is
          const owner = await queryContractValue('getOwner');
          addLog('', 'info');
          addLog(`Contract owner: ${owner?.Ok || owner || 'Unknown'}`, 'info');
          addLog(`Your address: ${selectedAccount.address}`, 'info');
          
          setSimRunning(false);
          return;
        }
      } else {
        addLog('✓ Contract is already in Betting status', 'success');
      }

      // Verify status is now Betting
      const newStatus = await queryContractValue('getStatus');
      const newStatusValue = newStatus?.Ok || newStatus;
      if (newStatusValue !== 'Betting' && newStatusValue?.Betting === undefined) {
        addLog(`Contract status is: ${JSON.stringify(newStatusValue)} (not Betting)`, 'error');
        addLog('Cannot place bets in current state.', 'error');
        setSimRunning(false);
        return;
      }

      // Load odds
      await loadOddsTable();
      addLog('✓ Odds table loaded', 'success');
      
      // Display horses
      addLog('');
      addLog('🐴 HORSES IN TODAY\'S RACE:', 'phase');
      HORSES.forEach(h => {
        const strengthBar = '★'.repeat(h.strength) + '☆'.repeat(6 - h.strength);
        addLog(`  #${h.id} ${h.name.padEnd(14)} | ${strengthBar}`, 'info');
      });
      addLog('');
      addLog('📋 Select your EXACTA bet from the table below!', 'phase');
      addLog('   (Predict 1st and 2nd place in exact order)', 'info');
      
      setSimPhase('betting');
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      setSimRunning(false);
    }
  };

  // Place player's bet
  const placePlayerBet = async () => {
    if (!contract || !selectedAccount) {
      addLog('Please connect wallet first!', 'error');
      return;
    }

    if (playerBet.first === null || playerBet.second === null) {
      addLog('Please select your exacta combination first!', 'error');
      return;
    }

    setSimRunning(true);
    
    try {
      // First check the contract status
      const currentStatus = await queryContractValue('getStatus');
      const statusValue = currentStatus?.Ok || currentStatus;
      
      if (statusValue !== 'Betting' && statusValue?.Betting === undefined) {
        addLog('', 'error');
        addLog('❌ Cannot place bet - Contract is not in Betting status!', 'error');
        addLog(`Current status: ${JSON.stringify(statusValue)}`, 'info');
        addLog('Click "New Race" to reset the contract (owner only).', 'info');
        setSimRunning(false);
        return;
      }
      
      const betAmountTokens = parseFloat(playerBetAmount) || 1;
      if (betAmountTokens <= 0) {
        addLog('❌ Bet amount must be greater than 0!', 'error');
        setSimRunning(false);
        return;
      }
      
      const betAmountSmallest = new BN((betAmountTokens * 1e12).toString());
      const multiplier = getMultiplier(playerBet.first, playerBet.second);
      
      addLog('');
      addLog('💰 PLACING YOUR BET...', 'phase');
      addLog(`  Combination: ${HORSES[playerBet.first].name} → ${HORSES[playerBet.second].name}`, 'info');
      addLog(`  Amount: ${betAmountTokens} tokens`, 'info');
      addLog(`  Multiplier: x${multiplier}`, 'info');
      addLog(`  Potential Win: ${(betAmountTokens * multiplier).toFixed(2)} tokens`, 'reward');
      
      await sendTxAndWait('placeExactaBet', [playerBet.first, playerBet.second], betAmountSmallest);
      addLog('✓ Bet placed successfully!', 'success');
      setPlayerBetPlaced(true);
      
      addLog('');
      addLog('🏁 Ready to race! Click "Start Race" when ready.', 'phase');
      
    } catch (error) {
      addLog('', 'error');
      addLog('❌ BET FAILED', 'error');
      
      // Parse specific error messages
      const errorMsg = error.message || '';
      if (errorMsg.includes('BettingClosed') || errorMsg.includes('ContractReverted')) {
        addLog('Reason: Betting is not open on the contract.', 'error');
        addLog('The contract owner needs to reset it for a new race.', 'info');
      } else if (errorMsg.includes('InvalidHorseId')) {
        addLog('Reason: Invalid horse selection.', 'error');
      } else if (errorMsg.includes('SameHorsePicked')) {
        addLog('Reason: Cannot pick the same horse for 1st and 2nd.', 'error');
      } else if (errorMsg.includes('ZeroBetAmount')) {
        addLog('Reason: Bet amount must be greater than 0.', 'error');
      } else if (errorMsg.includes('Inability to pay some fees')) {
        addLog('Reason: Insufficient balance to pay transaction fees.', 'error');
      } else {
        addLog(`Error: ${errorMsg}`, 'error');
      }
    } finally {
      setSimRunning(false);
    }
  };

  // Run the race
  const runRace = async () => {
    if (!contract || !selectedAccount) {
      addLog('Please connect wallet first!', 'error');
      return;
    }

    setSimRunning(true);
    setSimPhase('racing');

    try {
      const seed = generateSeed();
      
      addLog('');
      addLog('═══════════════════════════════════════════════════', 'header');
      addLog('🏁 THE RACE IS STARTING! 🏁', 'header');
      addLog('═══════════════════════════════════════════════════', 'header');
      addLog(`Race seed: ${seed}`, 'info');
      addLog('');

      // Visual race simulation
      const phases = [
        { name: 'Phase 1: Starting Gate', duration: 1000 },
        { name: 'Phase 2: First Turn', duration: 800 },
        { name: 'Phase 3: Back Stretch', duration: 800 },
        { name: 'Phase 4: Final Turn', duration: 800 },
        { name: 'Phase 5: Home Stretch', duration: 1000 },
      ];

      for (const phase of phases) {
        addLog(`━━━ ${phase.name} ━━━`, 'race');
        await sleep(phase.duration);
        
        // Simulate positions based on strength + randomness
        const positions = [...HORSES].sort((a, b) => 
          (b.strength + Math.random() * 4) - (a.strength + Math.random() * 4)
        );
        setRacePositions(positions);
        
        positions.forEach((horse, idx) => {
          const distance = 20 - idx * 3;
          const bar = '🏃'.repeat(Math.max(1, Math.floor(distance / 4)));
          addLog(`  ${bar} #${horse.id} ${horse.name}`, 'race');
        });
        addLog('', 'race');
      }

      // Run on-chain simulation
      addLog('🎲 Finalizing results on-chain...', 'info');
      let simSuccess = false;
      
      // First do a dry-run to check if it will work
      try {
        const maxGas = getMaxGas();
        const queryOptions = maxGas?.refTime 
          ? { gasLimit: maxGas, storageDepositLimit: null }
          : { gasLimit: maxGas || -1 };
          
        const dryRun = await contract.query.simulateCompleteRace(
          selectedAccount.address,
          queryOptions,
          seed
        );
        
        if (dryRun.result.isOk) {
          addLog('Dry-run successful, executing transaction...', 'info');
          // Log the dry-run result
          const dryRunResult = dryRun.output?.toHuman();
          addLog(`Dry-run result preview: ${JSON.stringify(dryRunResult)?.slice(0, 200)}`, 'info');
        } else {
          addLog(`Dry-run failed: ${JSON.stringify(dryRun.result.asErr.toHuman())}`, 'error');
        }
      } catch (dryRunErr) {
        addLog(`Dry-run error: ${dryRunErr.message}`, 'warning');
      }
      
      try {
        await sendTxAndWait('simulateCompleteRace', [seed]);
        addLog('✓ On-chain simulation complete!', 'success');
        simSuccess = true;
      } catch (e) {
        addLog(`⚠ Simulation error: ${e.message}`, 'error');
        addLog('Trying to get results anyway...', 'info');
      }

      // Get results - try multiple methods
      addLog('Fetching race results...', 'info');
      
      // Method 1: getLatestResult
      let result = await queryContractValue('getLatestResult');
      addLog(`Raw getLatestResult: ${JSON.stringify(result)?.slice(0, 300)}`, 'info');
      
      // Method 2: getWinners (returns tuple directly)
      const winners = await queryContractValue('getWinners');
      addLog(`Raw getWinners: ${JSON.stringify(winners)}`, 'info');
      
      // Check if result looks valid (not default/empty)
      const raceData = result?.Ok || result;
      const seedUsed = raceData?.seed_used || raceData?.seedUsed || 0;
      const raceId = raceData?.race_id || raceData?.raceId || 0;
      addLog(`Race validation: seed_used=${seedUsed}, race_id=${raceId}`, 'info');
      
      if (seedUsed === 0 && (!raceData?.rankings || raceData?.rankings?.length === 0)) {
        addLog('⚠ WARNING: Result appears to be default/empty!', 'warning');
        addLog('The simulation may not have executed properly.', 'warning');
      }
      
      setRaceResult(raceData);
      setSimPhase('results');

      addLog('');
      addLog('═══════════════════════════════════════════════════', 'header');
      addLog('🏆 OFFICIAL RESULTS 🏆', 'header');
      addLog('═══════════════════════════════════════════════════', 'header');

      // Try to get rankings from various possible structures
      let rankings = raceData?.rankings || [];
      let winningFirst = null, winningSecond = null;
      
      // Also try to get from getWinners response (tuple format)
      const winnersData = winners?.Ok || winners;
      if (winnersData) {
        // Could be array [first, second] or tuple format
        if (Array.isArray(winnersData) && winnersData.length >= 2) {
          winningFirst = typeof winnersData[0] === 'string' ? parseInt(winnersData[0]) : winnersData[0];
          winningSecond = typeof winnersData[1] === 'string' ? parseInt(winnersData[1]) : winnersData[1];
          addLog(`Winners from getWinners: #${winningFirst} → #${winningSecond}`, 'info');
        } else if (typeof winnersData === 'object') {
          // Might be {0: first, 1: second} format for tuples
          winningFirst = typeof winnersData[0] === 'string' ? parseInt(winnersData[0]) : winnersData[0];
          winningSecond = typeof winnersData[1] === 'string' ? parseInt(winnersData[1]) : winnersData[1];
          addLog(`Winners from tuple: #${winningFirst} → #${winningSecond}`, 'info');
        }
      }

      // If we have rankings, use those for display
      if (Array.isArray(rankings) && rankings.length >= 2) {
        rankings.forEach((horseId, idx) => {
          const id = typeof horseId === 'string' ? parseInt(horseId) : horseId;
          const horse = HORSES[id] || { name: `Horse ${horseId}` };
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
          addLog(`  ${medal} ${idx + 1}${['st','nd','rd'][idx] || 'th'} Place: ${horse.name}`, idx < 3 ? 'success' : 'info');
          
          if (idx === 0) winningFirst = id;
          if (idx === 1) winningSecond = id;
        });
      } else if (winningFirst !== null && winningSecond !== null) {
        // No rankings but we have winners from getWinners
        addLog(`  🥇 1st Place: ${HORSES[winningFirst]?.name || `Horse #${winningFirst}`}`, 'success');
        addLog(`  🥈 2nd Place: ${HORSES[winningSecond]?.name || `Horse #${winningSecond}`}`, 'success');
      } else {
        addLog('Could not determine race results', 'error');
        addLog(`Rankings: ${JSON.stringify(rankings)}`, 'info');
        addLog(`Winners: ${JSON.stringify(winnersData)}`, 'info');
      }

      // Check if player won
      addLog('');
      addLog('=== WIN CHECK DEBUG ===', 'info');
      addLog(`Player bet: first=${playerBet.first} (type: ${typeof playerBet.first}), second=${playerBet.second} (type: ${typeof playerBet.second})`, 'info');
      addLog(`Winning: first=${winningFirst} (type: ${typeof winningFirst}), second=${winningSecond} (type: ${typeof winningSecond})`, 'info');
      addLog(`Comparison: ${playerBet.first} === ${winningFirst} && ${playerBet.second} === ${winningSecond}`, 'info');
      addLog(`Result: ${playerBet.first === winningFirst} && ${playerBet.second === winningSecond} = ${playerBet.first === winningFirst && playerBet.second === winningSecond}`, 'info');
      
      if (playerBetPlaced && playerBet.first !== null && playerBet.second !== null && winningFirst !== null && winningSecond !== null) {
        // Ensure both are numbers for comparison
        const playerFirst = Number(playerBet.first);
        const playerSecond = Number(playerBet.second);
        const raceFirst = Number(winningFirst);
        const raceSecond = Number(winningSecond);
        
        addLog(`Normalized: player(${playerFirst}, ${playerSecond}) vs race(${raceFirst}, ${raceSecond})`, 'info');
        
        const playerWon = (playerFirst === raceFirst && playerSecond === raceSecond);
        const multiplier = getMultiplier(playerBet.first, playerBet.second);
        const betAmount = parseFloat(playerBetAmount) || 1;
        
        if (playerWon) {
          addLog('🎉🎉🎉 CONGRATULATIONS! YOU WON! 🎉🎉🎉', 'reward');
          addLog(`  Your bet: ${HORSES[playerFirst]?.name} → ${HORSES[playerSecond]?.name}`, 'success');
          addLog(`  Multiplier: x${multiplier}`, 'success');
          addLog(`  Payout: ${(betAmount * multiplier).toFixed(2)} tokens!`, 'reward');
        } else {
          addLog('😔 Better luck next time!', 'warning');
          addLog(`  Your bet: ${HORSES[playerFirst]?.name} → ${HORSES[playerSecond]?.name}`, 'info');
          addLog(`  Winning: ${HORSES[raceFirst]?.name || '?'} → ${HORSES[raceSecond]?.name || '?'}`, 'info');
        }
      } else if (!playerBetPlaced) {
        addLog('(No bet was placed)', 'info');
      }

      // Distribute payouts
      try {
        await sendTxAndWait('distributePayouts', []);
        addLog('');
        addLog('✓ Payouts distributed to winners!', 'success');
      } catch (e) {
        // Ignore payout errors
      }

      addLog('');
      addLog('Click "New Race" to play again!', 'phase');

    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
    } finally {
      setSimRunning(false);
    }
  };

  // Reset contract
  const resetContract = async () => {
    if (!contract || !selectedAccount) {
      addLog('Please connect wallet and contract first!', 'error');
      return;
    }

    setSimRunning(true);
    addLog('Resetting contract for new race...', 'info');

    try {
      await sendTxAndWait('resetForNewRace', []);
      addLog('✓ Contract reset successful!', 'success');
      setRaceResult(null);
      setRacePositions([]);
    } catch (error) {
      addLog(`Reset failed (owner only): ${error.message}`, 'error');
    } finally {
      setSimRunning(false);
    }
  };

  // Place manual bet
  const placeManualBet = async () => {
    if (!contract || !selectedAccount) {
      setResults(prev => ({ ...prev, placeBet: { error: 'Connect wallet first' } }));
      return;
    }

    try {
      setLoading(prev => ({ ...prev, placeBet: true }));
      const value = new BN(betAmount || '0');
      await sendTxAndWait('placeExactaBet', [parseInt(firstPick), parseInt(secondPick)], value);
      setResults(prev => ({ ...prev, placeBet: { success: 'Bet placed successfully!' } }));
    } catch (error) {
      setResults(prev => ({ ...prev, placeBet: { error: error.message } }));
    } finally {
      setLoading(prev => ({ ...prev, placeBet: false }));
    }
  };

  return (
    <div className="container">
      <header>
        <h1>🏇 Horse Race</h1>
        <p>Horse Racing Betting Engine</p>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : ''}`}></span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      {/* Connection Section */}
      <div className="connect-section">
        <h3>Connection Settings</h3>
        
        <div className="form-group">
          <label>WebSocket URL</label>
          <input 
            type="text" 
            value={wsUrl} 
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="wss://..."
          />
        </div>

        <div className="form-group">
          <label>Contract Address</label>
          <input 
            type="text" 
            value={contractAddress} 
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="5..."
          />
        </div>

        <div className="button-group">
          <button className="primary" onClick={connectWallet} disabled={loading.wallet}>
            {loading.wallet ? <span className="loading"></span> : 'Connect Wallet'}
          </button>
          <button className="primary" onClick={connectToNode} disabled={loading.node}>
            {loading.node ? <span className="loading"></span> : 'Connect to Node'}
          </button>
          <button className="primary" onClick={connectToContract} disabled={loading.contract || !isConnected}>
            {loading.contract ? <span className="loading"></span> : 'Connect Contract'}
          </button>
        </div>

        {renderResult('wallet')}
        {renderResult('node')}
        {renderResult('contract')}

        {accounts.length > 0 && (
          <>
            <p className="info-text">Select Account:</p>
            <div className="accounts-list">
              {accounts.map((account, idx) => (
                <button
                  key={idx}
                  className={`account-btn ${selectedAccount?.address === account.address ? 'selected' : ''}`}
                  onClick={() => setSelectedAccount(account)}
                >
                  {account.meta.name || account.address.slice(0, 8) + '...'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Race Betting Section */}
      <div className="simulation-section">
        <h2>🏇 Horse Race Betting</h2>
        <p className="info-text">
          Place your EXACTA bet - predict 1st and 2nd place horses in exact order!
        </p>

        {/* Control Buttons */}
        <div className="sim-controls">
          <button 
            className="primary sim-btn"
            onClick={startNewRace}
            disabled={simRunning || !contract}
          >
            {simRunning && simPhase === 'idle' ? <span className="loading"></span> : '🆕'} New Race
          </button>
          <button 
            className="primary sim-btn"
            onClick={placePlayerBet}
            disabled={simRunning || !contract || playerBet.first === null || playerBet.second === null || playerBetPlaced || simPhase !== 'betting'}
          >
            {simRunning ? <span className="loading"></span> : '💰'} Place Bet
          </button>
          <button 
            className="primary sim-btn"
            onClick={runRace}
            disabled={simRunning || !contract || !playerBetPlaced || simPhase !== 'betting'}
          >
            {simRunning && simPhase === 'racing' ? <span className="loading"></span> : '🏁'} Start Race
          </button>
          <button 
            className="secondary sim-btn"
            onClick={async () => {
              if (!contract || !selectedAccount) {
                addLog('Please connect first!', 'error');
                return;
              }
              addLog('═══ CONTRACT STATUS CHECK ═══', 'phase');
              const status = await queryContractValue('getStatus');
              const owner = await queryContractValue('getOwner');
              const raceId = await queryContractValue('getRaceId');
              const pot = await queryContractValue('getTotalPot');
              const ownerAddr = owner?.Ok || owner;
              const isOwner = addressesEqual(ownerAddr, selectedAccount.address);
              
              addLog(`Status: ${JSON.stringify(status?.Ok || status)}`, 'info');
              addLog(`Owner (contract): ${ownerAddr}`, 'info');
              addLog(`Your wallet: ${selectedAccount.address}`, 'info');
              addLog(`You are owner: ${isOwner ? 'YES ✓' : 'NO ✗'}`, isOwner ? 'success' : 'warning');
              addLog(`Race ID: ${raceId?.Ok || raceId}`, 'info');
              addLog(`Total Pot: ${pot?.Ok || pot}`, 'info');
            }}
            disabled={simRunning || !contract}
          >
            📊 Check Status
          </button>
          <button 
            className="secondary sim-btn"
            onClick={clearLogs}
            disabled={simRunning}
          >
            🗑 Clear
          </button>
        </div>

        {/* Phase Indicators */}
        <div className="sim-phases">
          <div className={`phase-indicator ${simPhase === 'idle' ? '' : simPhase === 'betting' ? 'active' : 'done'}`}>
            1. Place Bet
          </div>
          <div className={`phase-indicator ${simPhase === 'racing' ? 'active' : simPhase === 'results' ? 'done' : ''}`}>
            2. Race
          </div>
          <div className={`phase-indicator ${simPhase === 'results' ? 'active' : ''}`}>
            3. Results
          </div>
        </div>

        {/* Horses Display */}
        <div className="horses-display">
          <h3>🐴 Today's Horses</h3>
          <div className="horses-grid">
            {HORSES.map(h => (
              <div key={h.id} className="horse-display-card" style={{ borderColor: h.color }}>
                <span className="horse-num">#{h.id}</span>
                <span className="horse-display-name">{h.name}</span>
                <span className="horse-stars">{'★'.repeat(h.strength)}{'☆'.repeat(6 - h.strength)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Betting Table */}
        {simPhase === 'betting' && (
          <div className="betting-section">
            <h3>🎰 Exacta Combinations - Click to Select</h3>
            <p className="betting-info">
              Your selection: {playerBet.first !== null && playerBet.second !== null 
                ? `${HORSES[playerBet.first].name} → ${HORSES[playerBet.second].name} (x${getMultiplier(playerBet.first, playerBet.second)})`
                : 'None selected'}
            </p>
            
            <div className="odds-table-container">
              <table className="odds-table">
                <thead>
                  <tr>
                    <th>1st Place</th>
                    <th>2nd Place</th>
                    <th>Multiplier</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {oddsTable.map((combo, idx) => {
                    const isSelected = playerBet.first === combo.first && playerBet.second === combo.second;
                    const riskClass = combo.multiplier >= 500 ? 'longshot' : combo.multiplier >= 100 ? 'risky' : combo.multiplier >= 20 ? 'moderate' : 'safe';
                    return (
                      <tr 
                        key={idx} 
                        className={`odds-row ${riskClass} ${isSelected ? 'selected' : ''}`}
                        onClick={() => !playerBetPlaced && setPlayerBet({ first: combo.first, second: combo.second })}
                      >
                        <td>
                          <span className="horse-tag" style={{ background: combo.firstHorse.color }}>
                            #{combo.first}
                          </span>
                          {combo.firstHorse.name}
                        </td>
                        <td>
                          <span className="horse-tag" style={{ background: combo.secondHorse.color }}>
                            #{combo.second}
                          </span>
                          {combo.secondHorse.name}
                        </td>
                        <td className={`multiplier-cell ${riskClass}`}>
                          x{combo.multiplier}
                        </td>
                        <td>
                          <button 
                            className={`select-btn ${isSelected ? 'selected' : ''}`}
                            disabled={playerBetPlaced}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlayerBet({ first: combo.first, second: combo.second });
                            }}
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bet Amount */}
            <div className="bet-amount-section">
              <label>Bet Amount (tokens):</label>
              <input 
                type="number" 
                value={playerBetAmount}
                onChange={(e) => setPlayerBetAmount(e.target.value)}
                min="0.1"
                step="0.1"
                disabled={playerBetPlaced}
              />
              {playerBet.first !== null && playerBet.second !== null && (
                <span className="potential-win">
                  Potential Win: <strong>{((parseFloat(playerBetAmount) || 0) * getMultiplier(playerBet.first, playerBet.second)).toFixed(2)} tokens</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Race Result Display */}
        {raceResult && simPhase === 'results' && (() => {
          try {
            const rankings = raceResult?.rankings || raceResult?.Ok?.rankings || [];
            if (!Array.isArray(rankings) || rankings.length === 0) return null;
            
            const winningFirst = typeof rankings[0] === 'string' ? parseInt(rankings[0]) : rankings[0];
            const winningSecond = typeof rankings[1] === 'string' ? parseInt(rankings[1]) : rankings[1];
            const playerWon = playerBetPlaced && playerBet.first === winningFirst && playerBet.second === winningSecond;
            
            return (
              <div className={`race-result-card ${playerWon ? 'winner' : 'loser'}`}>
                <h3>{playerWon ? '🎉 YOU WON! 🎉' : '🏆 Race Results'}</h3>
                <div className="result-grid">
                  {rankings.slice(0, 3).map((horseId, idx) => {
                    const id = typeof horseId === 'string' ? parseInt(horseId) : horseId;
                    const horse = HORSES[id] || { name: `Horse ${horseId}`, color: '#888' };
                    return (
                      <div key={idx} className={`place-card place-${idx + 1}`}>
                        <span className="medal">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                        <span className="horse-name">{horse.name}</span>
                        <span className="horse-id">#{horseId}</span>
                      </div>
                    );
                  })}
                </div>
                {playerWon && (
                  <div className="win-amount">
                    Payout: {((parseFloat(playerBetAmount) || 0) * getMultiplier(playerBet.first, playerBet.second)).toFixed(2)} tokens!
                  </div>
                )}
              </div>
            );
          } catch (e) {
            return null;
          }
        })()}

        {/* Race Log */}
        <div className="sim-log">
          {simLog.length === 0 ? (
            <div className="log-empty">
              Click "New Race" to start betting!
              <br /><br />
              How to play:
              <br />1. Click "New Race" to open betting
              <br />2. Select your exacta combination from the table
              <br />3. Enter your bet amount
              <br />4. Click "Place Bet" to confirm
              <br />5. Click "Start Race" to see the results!
            </div>
          ) : (
            simLog.map((log, idx) => (
              <div key={idx} className={`log-entry log-${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sections">
        {/* Manual Betting Section */}
        <div className="section">
          <h2>🎰 Place Exacta Bet</h2>
          <p className="info-text">Predict 1st and 2nd place in exact order.</p>
          
          <div className="form-group">
            <label>1st Place Pick (0-5)</label>
            <select value={firstPick} onChange={(e) => setFirstPick(e.target.value)}>
              <option value="">Select horse...</option>
              {HORSES.map(h => (
                <option key={h.id} value={h.id}>{h.id}: {h.name} (str: {h.strength})</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>2nd Place Pick (0-5)</label>
            <select value={secondPick} onChange={(e) => setSecondPick(e.target.value)}>
              <option value="">Select horse...</option>
              {HORSES.map(h => (
                <option key={h.id} value={h.id}>{h.id}: {h.name} (str: {h.strength})</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Bet Amount (smallest unit)</label>
            <input 
              type="text" 
              value={betAmount} 
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="1000000000000"
            />
          </div>
          
          <button 
            className="primary" 
            onClick={placeManualBet}
            disabled={loading.placeBet || !contract || firstPick === '' || secondPick === '' || firstPick === secondPick}
          >
            {loading.placeBet ? <span className="loading"></span> : 'Place Bet'}
          </button>
          {renderResult('placeBet')}
        </div>

        {/* Horses Section */}
        <div className="section">
          <h2>🐴 Horses</h2>
          <button 
            className="secondary" 
            onClick={() => queryContract('getHorses', 'getHorses')}
            disabled={loading.getHorses || !contract}
          >
            {loading.getHorses ? <span className="loading"></span> : 'Get All Horses'}
          </button>
          {renderResult('getHorses')}
          
          <div className="horse-list">
            {HORSES.map(h => (
              <div key={h.id} className="horse-card" style={{ borderLeftColor: h.color }}>
                <span className="horse-id">#{h.id}</span>
                <span className="horse-name">{h.name}</span>
                <span className="horse-strength">{'★'.repeat(h.strength)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contract Status Section */}
        <div className="section">
          <h2>📊 Contract Status</h2>
          <div className="button-group">
            <button className="secondary" onClick={() => queryContract('getStatus', 'getStatus')} disabled={loading.getStatus || !contract}>
              Status
            </button>
            <button className="secondary" onClick={() => queryContract('getRaceId', 'getRaceId')} disabled={loading.getRaceId || !contract}>
              Race ID
            </button>
            <button className="secondary" onClick={() => queryContract('getTotalPot', 'getTotalPot')} disabled={loading.getTotalPot || !contract}>
              Total Pot
            </button>
          </div>
          {renderResult('getStatus')}
          {renderResult('getRaceId')}
          {renderResult('getTotalPot')}
        </div>

        {/* Bets Section */}
        <div className="section">
          <h2>🎫 Current Bets</h2>
          <button 
            className="secondary" 
            onClick={() => queryContract('getBets', 'getBets')}
            disabled={loading.getBets || !contract}
          >
            {loading.getBets ? <span className="loading"></span> : 'Get All Bets'}
          </button>
          {renderResult('getBets')}
        </div>

        {/* Results Section */}
        <div className="section">
          <h2>🏆 Race Results</h2>
          <div className="button-group">
            <button className="secondary" onClick={() => queryContract('getLatestResult', 'getLatestResult')} disabled={!contract}>
              Latest Result
            </button>
            <button className="secondary" onClick={() => queryContract('getWinners', 'getWinners')} disabled={!contract}>
              Winners
            </button>
            <button className="secondary" onClick={() => queryContract('getPayouts', 'getPayouts')} disabled={!contract}>
              Payouts
            </button>
          </div>
          {renderResult('getLatestResult')}
          {renderResult('getWinners')}
          {renderResult('getPayouts')}
        </div>

        {/* Probability Table Section */}
        <div className="section">
          <h2>📈 Exacta Odds</h2>
          <button 
            className="secondary" 
            onClick={() => queryContract('getExactaProbabilityTable', 'getExactaProbabilityTable')}
            disabled={!contract}
          >
            Load Probability Table
          </button>
          {renderResult('getExactaProbabilityTable')}
          
          {probabilityTable.length > 0 && (
            <div className="probability-table">
              <table>
                <thead>
                  <tr>
                    <th>1st → 2nd</th>
                    <th>Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {probabilityTable.slice(0, 10).map((entry, idx) => (
                    <tr key={idx}>
                      <td>H[{entry.first}] → H[{entry.second}]</td>
                      <td className="multiplier">x{entry.multiplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Contract Test Panel */}
      <ContractTestPanel 
        contract={contract} 
        api={api}
        selectedAccount={selectedAccount} 
        addLog={addLog}
      />
    </div>
  );
}

export default App;
