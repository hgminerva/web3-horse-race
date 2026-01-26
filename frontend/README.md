# Web3 Horse Race Frontend

A React-based frontend for testing and simulating the Horse Race smart contract on Substrate/Polkadot.

## Features

- **Wallet Connection** - Connect via Polkadot.js browser extension
- **Contract Interaction** - Full CRUD operations for all contract methods
- **Game Simulation** - Complete horse racing simulation with 4 phases
- **Real-time Logging** - Watch the simulation unfold with detailed logs
- **Modern UI** - Dark theme with responsive design

## Prerequisites

- **Node.js** v18 or higher
- **Polkadot.js Browser Extension** - [Download here](https://polkadot.js.org/extension/)
- **Deployed Contract** - The Horse Race contract must be deployed to a Substrate node

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 3. Connect and Test

1. Open the app in your browser
2. Click **Connect Wallet** to connect your Polkadot.js extension
3. Click **Connect to Node** to connect to the blockchain
4. Click **Connect to Contract** to initialize the contract
5. Run the simulation or test individual functions

## Configuration

The app is pre-configured with:

| Setting | Value |
|---------|-------|
| WebSocket URL | `wss://devnet02.xode.net` |
| Contract Address | `XqFfUXhebfpLLFKPKyb5uK7YJBxYjexFAm5UJKeg3VLvno8eA` |

You can change these in the Connection Settings section of the app.

## Game Simulation

The simulation demonstrates the complete horse racing flow:

### Phase 1: Setup
- Resets race status to PENDING (0)
- Adds 6 horses to the race:
  - #1 Thunder Bolt
  - #2 Silver Arrow
  - #3 Golden Star
  - #4 Dark Knight
  - #5 Wild Spirit
  - #6 Lucky Charm

### Phase 2: Betting
- Places 3 simulated bets with different horse combinations
- Each bet includes a token amount

### Phase 3: Racing
- Sets status to STARTED (1)
- Simulates a 3-lap race with position updates
- Randomly determines 1st, 2nd, and 3rd place winners
- Records winners on the blockchain

### Phase 4: Results
- Sets status to FINISHED (2)
- Calculates rewards based on winning bets
- Distributes rewards to winners

## Contract Methods

### Getters (Read-only)

| Method | Description |
|--------|-------------|
| `get_horses()` | Returns all horses in the race |
| `get_bets()` | Returns all placed bets |
| `get_status()` | Returns race status (0=pending, 1=started, 2=finished) |
| `get_winners()` | Returns the winning horses (1st, 2nd) |
| `get_winning_combinations()` | Returns all winning combinations |
| `get_rewards()` | Returns all rewards |

### Setters (Write)

| Method | Description |
|--------|-------------|
| `set_horses(horses)` | Sets the list of horses |
| `add_horse(id, name)` | Adds a single horse |
| `set_bets(bets)` | Sets the list of bets |
| `add_bet(choice)` | Places a bet (payable) |
| `set_status(status)` | Sets the race status |
| `set_winners(first, second)` | Sets the winning horses |
| `set_winning_combinations(combinations)` | Sets winning combinations |
| `add_winning_combination(first, second)` | Adds a winning combination |
| `set_rewards(rewards)` | Sets the rewards list |
| `add_reward(bettor, amount)` | Adds a reward |

## Project Structure

```
frontend/
├── index.html          # Entry HTML file
├── package.json        # Dependencies and scripts
├── vite.config.js      # Vite configuration
├── README.md           # This file
└── src/
    ├── main.jsx        # React entry point
    ├── App.jsx         # Main application component
    ├── index.css       # Styles (dark theme)
    └── metadata.json   # Contract ABI/metadata
```

## Updating Contract Metadata

If you modify the smart contract, rebuild and update the metadata:

```bash
# Build the contract
cd ..
cargo contract build

# Copy the new metadata
cp target/ink/horse_race.json frontend/src/metadata.json
```

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **@polkadot/api** - Substrate blockchain interaction
- **@polkadot/api-contract** - Smart contract interaction
- **@polkadot/extension-dapp** - Wallet extension integration

## Troubleshooting

### "No wallet extension found"
Install the Polkadot.js browser extension from [polkadot.js.org/extension](https://polkadot.js.org/extension/)

### "Contract or account not connected"
Make sure to:
1. Connect your wallet first
2. Connect to the node
3. Connect to the contract

### Transaction fails
- Ensure you have sufficient balance in your account
- Check that the contract address is correct
- Verify the node is accessible

### "gasLimit too low"
The app automatically estimates gas. If issues persist, the contract may be reverting due to invalid state.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

## License

MIT
