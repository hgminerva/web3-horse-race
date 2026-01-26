# Web3 Horse Race Betting Smart Contract

A decentralized horse race betting system built with **Ink!** smart contracts on Substrate, featuring a React-based frontend for interactive betting.

## Overview

Web3 Horse Race is a provably fair horse racing game where players can place **Exacta bets** - predicting both the 1st and 2nd place finishers in exact order. The race outcomes are determined by a probability-weighted selection algorithm that matches the mathematical odds displayed to players.

## Features

- **6 Racing Horses** with different strength ratings (1-6)
- **Exacta Betting System** - Predict 1st and 2nd place in order
- **Probability-Based Racing** - Winners selected based on mathematical probability
- **Transparent Odds** - Multipliers from 2x to 1000x based on difficulty
- **Deterministic RNG** - Verifiable results using seeded random number generation
- **React Frontend** - Modern UI with Polkadot.js wallet integration

## Horse Lineup

| Horse | Name | Strength | Win Probability |
|-------|------|----------|-----------------|
| #0 | Thunder Bolt | 6 | 28.57% |
| #1 | Silver Arrow | 5 | 23.81% |
| #2 | Golden Star | 4 | 19.05% |
| #3 | Dark Knight | 3 | 14.29% |
| #4 | Wild Spirit | 2 | 9.52% |
| #5 | Lucky Charm | 1 | 4.76% |

## Probability System

### Exacta Probability Formula

The probability of a specific exacta outcome is calculated as:

```
P(i → j) = P(i wins 1st) × P(j wins 2nd | i won 1st)
         = (S[i] / ΣS) × (S[j] / (ΣS - S[i]))
```

Where:
- `S[i]` = Strength of horse i
- `ΣS` = Total strength (21)

### Example Probabilities

| Exacta | Probability | Multiplier |
|--------|-------------|------------|
| Thunder Bolt → Silver Arrow | 9.52% | 2x |
| Thunder Bolt → Lucky Charm | 2.86% | 60x |
| Lucky Charm → Wild Spirit | 0.48% | 1000x |

## Project Structure

```
horse_race/
├── lib.rs                    # Ink! smart contract
├── Cargo.toml                # Rust dependencies
├── SMART_CONTRACT_DOCUMENTATION.md
├── README.md
└── frontend/
    ├── src/
    │   ├── App.jsx           # React application
    │   ├── index.css         # Styles
    │   ├── main.jsx          # Entry point
    │   └── metadata.json     # Contract ABI
    ├── package.json
    └── vite.config.js
```

## Smart Contract

### Building the Contract

Prerequisites:
- Rust with `wasm32-unknown-unknown` target
- `cargo-contract` CLI tool

```bash
# Install cargo-contract if not already installed
cargo install cargo-contract

# Build the contract
cargo contract build --release
```

The compiled contract will be in `target/ink/`:
- `horse_race.contract` - Deployable bundle
- `horse_race.wasm` - Contract code
- `horse_race.json` - Metadata/ABI

### Deploying the Contract

Use [Contracts UI](https://contracts-ui.substrate.io/) or `cargo-contract`:

```bash
cargo contract instantiate \
  --constructor new \
  --suri //Alice \
  --url wss://your-node-url
```

### Contract Functions

#### For Players
- `place_exacta_bet(first_pick, second_pick)` - Place a bet on the exacta outcome

#### For Owner
- `reset_for_new_race()` - Reset contract for new betting round
- `simulate_complete_race(seed)` - Start and run the race simulation
- `process_payouts()` - Distribute winnings to winners

#### View Functions
- `get_horses()` - Get all horse information
- `get_status()` - Current race status (Betting/Racing/Finished)
- `get_exacta_probability_table()` - All combinations with probabilities
- `get_latest_result()` - Most recent race result
- `get_multiplier(first, second)` - Reward multiplier for a combination

## Frontend

### Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

Edit `src/App.jsx` to set your contract address and WebSocket URL:

```javascript
const DEFAULT_WS_URL = 'wss://your-node-url';
const CONTRACT_ADDRESS = 'your-contract-address';
```

### Usage

1. **Connect Wallet** - Click "Connect Wallet" and approve in your Polkadot.js extension
2. **Start New Race** - (Owner only) Click "New Race" to open betting
3. **Place Bet** - Select a horse combination from the odds table and enter bet amount
4. **Run Race** - (Owner only) Click "Start Race" to run the simulation
5. **View Results** - See the race results and check if you won

## Reward Multipliers

Multipliers are based on the inverse of probability, with adjustments for house edge:

| 1st Place → | #0 | #1 | #2 | #3 | #4 | #5 |
|-------------|-----|-----|-----|-----|-----|-----|
| **#0** | - | 2x | 3x | 10x | 30x | 60x |
| **#1** | 5x | - | 4x | 12x | 40x | 80x |
| **#2** | 10x | 8x | - | 15x | 50x | 100x |
| **#3** | 30x | 20x | 12x | - | 80x | 200x |
| **#4** | 80x | 50x | 30x | 20x | - | 500x |
| **#5** | 200x | 100x | 60x | 40x | 1000x | - |

## Technical Details

### Race Simulation Algorithm

The race uses a **probability-weighted selection** algorithm:

1. For each position (1st through 6th):
   - Calculate remaining strength pool
   - Generate random number from seed
   - Select horse proportionally to their strength
   - Remove selected horse from pool

This ensures that over many races, the win distribution matches the theoretical probabilities.

### Random Number Generation

Uses a deterministic **Linear Congruential Generator (LCG)**:

```rust
fn next_random(&self, state: u64) -> u64 {
    state.wrapping_mul(6364136223846793005)
         .wrapping_add(1442695040888963407)
}
```

The seed is provided at race start, making results verifiable and reproducible.

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
