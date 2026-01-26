# Web3 Horse Race Betting Engine

## Smart Contract Documentation

A complete horse race betting and simulation engine built in Ink! for Substrate/Polkadot blockchains.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Constants & Configuration](#constants--configuration)
4. [Data Structures](#data-structures)
5. [Error Types](#error-types)
6. [Events](#events)
7. [Contract Functions](#contract-functions)
8. [Race Simulation Algorithm](#race-simulation-algorithm)
9. [Exacta Betting System](#exacta-betting-system)
10. [Reward Multipliers](#reward-multipliers)
11. [Usage Examples](#usage-examples)
12. [Testing](#testing)

---

## Overview

The Web3 Horse Race Betting Engine is a decentralized horse racing simulation and betting platform. It features:

- **6 horses** with strength-based racing mechanics
- **3-phase race simulation** with varying speed modifiers
- **Exacta betting** (predict 1st and 2nd place in exact order)
- **Deterministic RNG** for verifiable race results
- **Fixed-point arithmetic** for precision without floating-point operations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEB3 HORSE RACE BETTING ENGINE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │    HORSE     │  │   BETTING    │  │    RACE      │           │
│  │    MODEL     │  │   ENGINE     │  │  SIMULATOR   │           │
│  │              │  │              │  │              │           │
│  │ • Strength   │  │ • Exacta     │  │ • 3 Phases   │           │
│  │ • Base Speed │  │ • Validation │  │ • Variance   │           │
│  │ • Normalized │  │ • Total Pot  │  │ • LCG RNG    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  PROBABILITY │  │   PAYOUT     │  │    ADMIN     │           │
│  │  CALCULATOR  │  │   ENGINE     │  │  FUNCTIONS   │           │
│  │              │  │              │  │              │           │
│  │ • P(i → j)   │  │ • Multiplier │  │ • Start Race │           │
│  │ • Table Gen  │  │ • Distribute │  │ • Reset      │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Constants & Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `PRECISION` | 10,000 | Fixed-point precision (4 decimal places) |
| `RACE_DISTANCE` | 1,000 | Race distance in units |
| `MAX_RACE_DURATION` | 60 | Maximum race time in seconds |
| `NUM_HORSES` | 6 | Number of horses in each race |
| `TOTAL_STRENGTH` | 21 | Sum of all horse strengths |

### Horse Strengths

| Horse ID | Name | Strength | Normalized (%) | Base Speed |
|----------|------|----------|----------------|------------|
| H[0] | Thunder Bolt | 6 | 28.57% | 20 units/sec |
| H[1] | Silver Arrow | 5 | 23.81% | 19 units/sec |
| H[2] | Golden Star | 4 | 19.05% | 18 units/sec |
| H[3] | Dark Knight | 3 | 14.29% | 17 units/sec |
| H[4] | Wild Spirit | 2 | 9.52% | 16 units/sec |
| H[5] | Lucky Charm | 1 | 4.76% | 15 units/sec |

**Formulas:**
- Normalized Strength: `S[i] = strength[i] / 21`
- Base Speed: `Bs[i] = 14 + strength[i]`

---

## Data Structures

### Horse

```rust
pub struct Horse {
    pub id: u8,                    // Horse identifier (0-5)
    pub name: Vec<u8>,             // Horse name as bytes
    pub strength: u64,             // Raw strength value
    pub normalized_strength: u64,  // S[i] * PRECISION
    pub base_speed: u64,           // Bs[i] = 14 + strength
}
```

### HorseRaceState

```rust
pub struct HorseRaceState {
    pub horse_id: u8,        // Horse identifier
    pub position: u64,       // Current position (scaled by PRECISION)
    pub current_speed: u64,  // Speed this tick (scaled by PRECISION)
    pub finished: bool,      // Has crossed finish line
    pub finish_time: u64,    // Time when finished (0 if not finished)
}
```

### ExactaBet

```rust
pub struct ExactaBet {
    pub bettor: AccountId,   // Account that placed the bet
    pub amount: Balance,     // Bet amount in native tokens
    pub first_pick: u8,      // Predicted 1st place horse ID
    pub second_pick: u8,     // Predicted 2nd place horse ID
    pub timestamp: u64,      // Block timestamp when bet was placed
}
```

### RaceResult

```rust
pub struct RaceResult {
    pub race_id: u64,              // Unique race identifier
    pub rankings: Vec<u8>,         // Horse IDs in finish order
    pub finish_times: Vec<u64>,    // Finish times for each position
    pub winning_exacta: (u8, u8),  // (1st place, 2nd place)
    pub total_pot: Balance,        // Total amount bet
    pub seed_used: u64,            // RNG seed used for this race
}
```

### Payout

```rust
pub struct Payout {
    pub bettor: AccountId,       // Winner's account
    pub bet_amount: Balance,     // Original bet amount
    pub multiplier: u64,         // Reward multiplier applied
    pub payout_amount: Balance,  // Total payout
    pub exacta: (u8, u8),        // Winning combination
}
```

### RaceStatus

```rust
pub enum RaceStatus {
    Betting,   // Accepting bets
    Racing,    // Race in progress
    Finished,  // Race complete, payouts ready
    Closed,    // Payouts distributed
}
```

---

## Error Types

| Error | Description |
|-------|-------------|
| `BettingClosed` | Cannot place bet, race not in betting phase |
| `InvalidHorseId` | Horse ID must be 0-5 |
| `SameHorsePicked` | First and second pick must be different horses |
| `ZeroBetAmount` | Bet amount must be greater than 0 |
| `NotOwner` | Only contract owner can perform this action |
| `RaceNotInBettingPhase` | Race has already started or finished |
| `RaceNotInProgress` | Race must be in Racing status |
| `RaceNotFinished` | Race must be finished before distributing payouts |

---

## Events

### RaceStarted

Emitted when a race begins.

```rust
pub struct RaceStarted {
    race_id: u64,      // Race identifier
    seed: u64,         // RNG seed for this race
    total_bets: u32,   // Number of bets placed
}
```

### RaceFinished

Emitted when a race completes.

```rust
pub struct RaceFinished {
    race_id: u64,       // Race identifier
    first_place: u8,    // Winning horse ID
    second_place: u8,   // Second place horse ID
    third_place: u8,    // Third place horse ID
}
```

### BetPlaced

Emitted when a bet is placed.

```rust
pub struct BetPlaced {
    bettor: AccountId,  // Bettor's account
    first_pick: u8,     // Predicted 1st place
    second_pick: u8,    // Predicted 2nd place
    amount: Balance,    // Bet amount
}
```

### PayoutDistributed

Emitted when a payout is made.

```rust
pub struct PayoutDistributed {
    bettor: AccountId,  // Winner's account
    amount: Balance,    // Payout amount
    multiplier: u64,    // Multiplier applied
}
```

---

## Contract Functions

### Constructors

| Function | Description |
|----------|-------------|
| `new()` | Initialize contract with 6 horses and reward multipliers |
| `default()` | Alias for `new()` |

### Betting Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `place_exacta_bet` | `first_pick: u8, second_pick: u8` | `Result<()>` | Place an exacta bet (payable) |
| `get_bets` | - | `Vec<ExactaBet>` | Get all bets for current race |
| `get_total_pot` | - | `Balance` | Get total pot for current race |

### Race Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `start_race` | `seed: u64` | `Result<()>` | Start race with RNG seed (owner only) |
| `run_race_simulation` | - | `Result<RaceResult>` | Execute race simulation |
| `simulate_complete_race` | `seed: u64` | `Result<RaceResult>` | Start and run race in one call |

### Payout Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `distribute_payouts` | - | `Result<Vec<Payout>>` | Calculate and record payouts |
| `get_payouts` | - | `Vec<Payout>` | Get payouts for current race |

### Probability Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `calculate_exacta_probability` | `first: u8, second: u8` | `u64` | Calculate P(i → j) |
| `get_exacta_probability_table` | - | `Vec<ExactaProbability>` | Get all probabilities with multipliers |

### Getter Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get_horses` | `Vec<Horse>` | Get all horses |
| `get_horse` | `Option<Horse>` | Get horse by ID |
| `get_status` | `RaceStatus` | Get current race status |
| `get_race_id` | `u64` | Get current race ID |
| `get_latest_result` | `RaceResult` | Get latest race result |
| `get_race_history` | `Vec<RaceResult>` | Get all race results |
| `get_winners` | `(u8, u8)` | Get winners from latest race |
| `get_reward_multiplier` | `u64` | Get multiplier for exacta combination |
| `get_normalized_strength` | `u64` | Get normalized strength for horse |
| `get_owner` | `AccountId` | Get contract owner |

### Admin Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `reset_for_new_race` | - | `Result<()>` | Reset contract for new race (owner only) |
| `set_owner` | `new_owner: AccountId` | `Result<()>` | Transfer ownership (owner only) |

---

## Race Simulation Algorithm

### Overview

The race simulation runs tick-by-tick (1 second per tick) for up to 60 seconds or until all horses finish.

### Phase System

| Phase | Time | Constant (C) | Description |
|-------|------|--------------|-------------|
| Phase 1 | 0-15s | 0.85 | Warm-up phase, slower speeds |
| Phase 2 | 15-45s | 1.0 | Normal racing phase |
| Phase 3 | 45-60s | 1.0 + bonus | Sprint phase, strong horses get bonus |

**Phase 3 Bonus:** `bonus = S[i] / 12` (stronger horses accelerate more)

### Variance Model

Stronger horses have less variance, weaker horses have more:

```
epsilon[i] = ± (12 / strength[i])
```

| Horse | Max Variance |
|-------|--------------|
| H[0] (strength=6) | ±2 |
| H[1] (strength=5) | ±2.4 |
| H[2] (strength=4) | ±3 |
| H[3] (strength=3) | ±4 |
| H[4] (strength=2) | ±6 |
| H[5] (strength=1) | ±12 |

### Speed Calculation

```
speed[i] = Bs[i] * phase_constant * (1 + epsilon)
```

### Position Update

```
position[i] += speed[i]
```

### Race End Condition

Race ends when:
1. Any horse reaches >= 1000 units, AND
2. At least 3 horses have finished, AND
3. No unfinished horse can overtake

OR

Maximum time (60 seconds) is reached.

### Deterministic RNG

Uses Linear Congruential Generator (LCG) with glibc parameters:

```rust
fn next_random(state: u64) -> u64 {
    const A: u64 = 1103515245;
    const C: u64 = 12345;
    const M: u64 = 2147483648; // 2^31
    (state * A + C) % M
}
```

---

## Exacta Betting System

### What is Exacta?

Exacta betting means predicting the **1st and 2nd place horses in exact order**.

Example: Betting on "H[0] → H[1]" means you predict:
- H[0] (Thunder Bolt) wins 1st place
- H[1] (Silver Arrow) wins 2nd place

### Probability Formula

```
P(i → j) = P(i wins) × P(j second | i won)
         = (S[i] / Σ S) × (S[j] / (Σ S - S[i]))
```

### Example Calculations

**P(0 → 1):** Strongest horses finishing 1-2
```
P(0→1) = (6/21) × (5/15) = 0.2857 × 0.3333 = 9.52%
```

**P(5 → 4):** Weakest horses finishing 1-2
```
P(5→4) = (1/21) × (2/20) = 0.0476 × 0.1000 = 0.48%
```

---

## Reward Multipliers

Higher multipliers for less likely outcomes:

### Complete Multiplier Table

| 1st Place → 2nd Place | Multiplier |
|-----------------------|------------|
| H[0] → H[1] | x2 |
| H[0] → H[2] | x3 |
| H[0] → H[3] | x10 |
| H[0] → H[4] | x30 |
| H[0] → H[5] | x60 |
| H[1] → H[0] | x3 |
| H[1] → H[2] | x5 |
| H[1] → H[3] | x20 |
| H[1] → H[4] | x125 |
| H[1] → H[5] | x175 |
| H[2] → H[0] | x4 |
| H[2] → H[1] | x6 |
| H[2] → H[3] | x8 |
| H[2] → H[4] | x80 |
| H[2] → H[5] | x100 |
| H[3] → H[0] | x8 |
| H[3] → H[1] | x15 |
| H[3] → H[2] | x12 |
| H[3] → H[4] | x250 |
| H[3] → H[5] | x500 |
| H[4] → H[0] | x40 |
| H[4] → H[1] | x150 |
| H[4] → H[2] | x100 |
| H[4] → H[3] | x300 |
| H[4] → H[5] | x1000 |
| H[5] → H[0] | x80 |
| H[5] → H[1] | x250 |
| H[5] → H[2] | x200 |
| H[5] → H[3] | x600 |
| H[5] → H[4] | x1500 |

### Payout Calculation

```
payout = bet_amount × multiplier
```

---

## Usage Examples

### 1. Place a Bet

```javascript
// Bet 1 token on H[0] winning 1st, H[1] winning 2nd
await contract.tx.placeExactaBet(
  { value: 1_000_000_000_000 }, // 1 token
  0, // first pick: H[0]
  1  // second pick: H[1]
);
```

### 2. Start and Run Race

```javascript
// Owner starts the race with seed
await contract.tx.startRace(12345);

// Run simulation
const result = await contract.tx.runRaceSimulation();
console.log("Winner:", result.winning_exacta);
```

### 3. Distribute Payouts

```javascript
// After race finishes
const payouts = await contract.tx.distributePayouts();
for (const p of payouts) {
  console.log(`${p.bettor} won ${p.payout_amount} (x${p.multiplier})`);
}
```

### 4. Check Probabilities

```javascript
// Get probability for specific combination
const prob = await contract.query.calculateExactaProbability(0, 1);
console.log("P(H[0]→H[1]):", prob / 10000, "%");

// Get full probability table
const table = await contract.query.getExactaProbabilityTable();
```

---

## Testing

### Unit Tests

The contract includes comprehensive unit tests:

| Test | Description |
|------|-------------|
| `initialization_works` | Verifies 6 horses initialized correctly |
| `normalized_strength_works` | Checks strength normalization |
| `exacta_probability_works` | Validates probability calculations |
| `multipliers_initialized` | Confirms reward multipliers |
| `probability_table_works` | Tests probability table generation |
| `race_simulation_deterministic` | Verifies same seed = same result |

### Running Tests

```bash
# Run unit tests
cargo test

# Run with output
cargo test -- --nocapture

# Run e2e tests (requires running node)
cargo test --features e2e-tests
```

---

## Building

```bash
# Build the contract
cargo contract build

# Build in release mode
cargo contract build --release

# Generate metadata only
cargo contract build --generate-only
```

---

## License

MIT

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-20 | Initial release with full betting engine |
