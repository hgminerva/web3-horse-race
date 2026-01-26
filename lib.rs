#![cfg_attr(not(feature = "std"), no_std, no_main)]
#![allow(clippy::arithmetic_side_effects)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_possible_wrap)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::needless_range_loop)]

//! # Horse Race Betting Engine
//! 
//! A complete horse race betting and simulation engine built in Ink!.
//! 
//! ## Features
//! - 6 horses with strength-based racing
//! - 3-phase race simulation
//! - Exacta betting system
//! - Deterministic RNG when seeded
//! - Fixed-point arithmetic for precision

use ink::prelude::vec::Vec;
use ink::prelude::vec;
use ink::storage::Mapping;

/// Precision for fixed-point arithmetic (4 decimal places)
const PRECISION: u64 = 10000;

/// Number of horses in the race
const NUM_HORSES: usize = 6;

/// Horse strengths: H[0]=6, H[1]=5, H[2]=4, H[3]=3, H[4]=2, H[5]=1
const HORSE_STRENGTHS: [u64; NUM_HORSES] = [6, 5, 4, 3, 2, 1];

/// Sum of all strengths (6+5+4+3+2+1 = 21)
const TOTAL_STRENGTH: u64 = 21;

#[ink::contract]
mod horse_race {
    use super::*;

    // ============================================================================
    // ERROR TYPES
    // ============================================================================

    /// Contract errors
    #[derive(Debug, Clone, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    pub enum Error {
        /// Betting is closed
        BettingClosed,
        /// Invalid horse ID
        InvalidHorseId,
        /// First and second pick must be different
        SameHorsePicked,
        /// Bet amount must be greater than 0
        ZeroBetAmount,
        /// Only owner can perform this action
        NotOwner,
        /// Race already started or finished
        RaceNotInBettingPhase,
        /// Race not in progress
        RaceNotInProgress,
        /// Race not finished
        RaceNotFinished,
        /// Insufficient balance to place bet or withdraw
        InsufficientBalance,
    }

    /// Result type for contract operations
    pub type Result<T> = core::result::Result<T, Error>;

    // ============================================================================
    // DATA STRUCTURES
    // ============================================================================

    /// Horse model with racing attributes
    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub struct Horse {
        pub id: u8,
        pub name: Vec<u8>,
        pub strength: u64,
        pub normalized_strength: u64,  // S[i] * PRECISION
        pub base_speed: u64,           // Bs[i] = 14 + strength
    }

    /// Exacta bet structure (predicting 1st and 2nd in exact order)
    #[derive(Debug, Clone, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub struct ExactaBet {
        pub bettor: AccountId,
        pub amount: u128,              // Bet amount in asset units
        pub first_pick: u8,            // Predicted 1st place horse ID
        pub second_pick: u8,           // Predicted 2nd place horse ID
        pub timestamp: u64,
    }

    /// Race result structure
    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub struct RaceResult {
        pub race_id: u64,
        pub rankings: Vec<u8>,         // Horse IDs in finish order [1st, 2nd, 3rd, ...]
        pub finish_times: Vec<u64>,    // Finish times for each position
        pub winning_exacta: (u8, u8),  // (1st, 2nd)
        pub total_pot: u128,           // Total pot in asset units
        pub seed_used: u64,
    }

    /// Payout record
    #[derive(Debug, Clone, PartialEq, Eq)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub struct Payout {
        pub bettor: AccountId,
        pub bet_amount: u128,          // Original bet in asset units
        pub multiplier: u64,
        pub payout_amount: u128,       // Payout in asset units
        pub exacta: (u8, u8),
    }

    /// Exacta probability entry
    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub struct ExactaProbability {
        pub first: u8,
        pub second: u8,
        pub probability: u64,          // Scaled by PRECISION
        pub multiplier: u64,
    }

    /// Race status enum
    #[derive(Debug, Clone, PartialEq, Eq, Default)]
    #[ink::scale_derive(Encode, Decode, TypeInfo)]
    #[cfg_attr(feature = "std", derive(ink::storage::traits::StorageLayout))]
    pub enum RaceStatus {
        #[default]
        Betting,        // 0 - Accepting bets (14 minutes)
        Racing,         // 1 - Race in progress (1 minute)
        Finished,       // 2 - Race complete, payouts ready
        Closed,         // 3 - Payouts distributed
    }

    // ============================================================================
    // EVENTS
    // ============================================================================

    #[ink(event)]
    pub struct RaceStarted {
        #[ink(topic)]
        race_id: u64,
        seed: u64,
        total_bets: u32,
    }

    #[ink(event)]
    pub struct RaceFinished {
        #[ink(topic)]
        race_id: u64,
        first_place: u8,
        second_place: u8,
        third_place: u8,
    }

    #[ink(event)]
    pub struct BetPlaced {
        #[ink(topic)]
        bettor: AccountId,
        first_pick: u8,
        second_pick: u8,
        amount: u128,
    }

    #[ink(event)]
    pub struct PayoutDistributed {
        #[ink(topic)]
        bettor: AccountId,
        amount: u128,
        multiplier: u64,
    }

    #[ink(event)]
    pub struct Deposited {
        #[ink(topic)]
        account: AccountId,
        amount: u128,
    }

    #[ink(event)]
    pub struct Withdrawn {
        #[ink(topic)]
        account: AccountId,
        amount: u128,
    }

    // ============================================================================
    // CONTRACT STORAGE
    // ============================================================================

    #[ink(storage)]
    pub struct HorseRace {
        /// Contract owner
        owner: AccountId,
        
        /// Current race ID
        race_id: u64,
        
        /// Race status
        status: RaceStatus,
        
        /// Horses in the race
        horses: Vec<Horse>,
        
        /// Current bets for this race
        bets: Vec<ExactaBet>,
        
        /// Race results history
        race_results: Vec<RaceResult>,
        
        /// Latest race result
        latest_result: RaceResult,
        
        /// Payouts for current race
        payouts: Vec<Payout>,
        
        /// Random seed for deterministic simulation
        current_seed: u64,
        
        /// Race start timestamp
        race_start_time: u64,
        
        /// Betting start timestamp
        betting_start_time: u64,
        
        /// Total pot for current race
        total_pot: u128,
        
        /// Exacta reward multipliers (stored as flat array for gas efficiency)
        /// Format: multipliers[first * 6 + second] = multiplier
        reward_multipliers: Vec<u64>,
        
        /// User balances (asset balances, not native tokens)
        balances: Mapping<AccountId, u128>,
    }

    // ============================================================================
    // IMPLEMENTATION
    // ============================================================================

    impl HorseRace {
        /// Initialize the contract with 6 horses and reward multipliers
        #[ink(constructor)]
        pub fn new() -> Self {
            let caller = Self::env().caller();
            let mut contract = Self {
                owner: caller,
                race_id: 0,
                status: RaceStatus::Betting,
                horses: Vec::new(),
                bets: Vec::new(),
                race_results: Vec::new(),
                latest_result: RaceResult::default(),
                payouts: Vec::new(),
                current_seed: 0,
                race_start_time: 0,
                betting_start_time: Self::env().block_timestamp(),
                total_pot: 0,
                reward_multipliers: Vec::new(),
                balances: Mapping::default(),
            };
            
            // Initialize horses
            contract.initialize_horses();
            
            // Initialize reward multipliers
            contract.initialize_multipliers();
            
            contract
        }

        /// Default constructor
        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new()
        }

        // ========================================================================
        // INITIALIZATION HELPERS
        // ========================================================================

        /// Initialize the 6 horses with their strengths
        fn initialize_horses(&mut self) {
            let names = [
                b"Thunder Bolt".to_vec(),
                b"Silver Arrow".to_vec(),
                b"Golden Star".to_vec(),
                b"Dark Knight".to_vec(),
                b"Wild Spirit".to_vec(),
                b"Lucky Charm".to_vec(),
            ];

            for i in 0..NUM_HORSES {
                let strength = HORSE_STRENGTHS[i];
                // S[i] = strength[i] / sum(strength) * PRECISION
                let normalized = (strength * PRECISION) / TOTAL_STRENGTH;
                // Bs[i] = 14 + strength[i]
                let base_speed = 14 + strength;

                self.horses.push(Horse {
                    id: i as u8,
                    name: names[i].clone(),
                    strength,
                    normalized_strength: normalized,
                    base_speed,
                });
            }
        }

        /// Initialize exacta reward multipliers based on specification
        fn initialize_multipliers(&mut self) {
            // Initialize 36 slots (6x6 matrix)
            self.reward_multipliers = vec![0; 36];

            // H[0] combinations
            self.set_multiplier(0, 5, 60);
            self.set_multiplier(0, 4, 30);
            self.set_multiplier(0, 3, 10);
            self.set_multiplier(0, 2, 3);
            self.set_multiplier(0, 1, 2);

            // H[1] combinations
            self.set_multiplier(1, 5, 175);
            self.set_multiplier(1, 4, 125);
            self.set_multiplier(1, 3, 20);
            self.set_multiplier(1, 2, 5);
            self.set_multiplier(1, 0, 3);  // Reverse of H[0]→H[1]

            // H[2] combinations
            self.set_multiplier(2, 5, 100);
            self.set_multiplier(2, 4, 80);
            self.set_multiplier(2, 3, 8);
            self.set_multiplier(2, 1, 6);
            self.set_multiplier(2, 0, 4);

            // H[3] combinations
            self.set_multiplier(3, 5, 500);
            self.set_multiplier(3, 4, 250);
            self.set_multiplier(3, 2, 12);
            self.set_multiplier(3, 1, 15);
            self.set_multiplier(3, 0, 8);

            // H[4] combinations
            self.set_multiplier(4, 5, 1000);
            self.set_multiplier(4, 3, 300);
            self.set_multiplier(4, 2, 100);
            self.set_multiplier(4, 1, 150);
            self.set_multiplier(4, 0, 40);

            // H[5] combinations (weakest horse winning)
            self.set_multiplier(5, 4, 1500);
            self.set_multiplier(5, 3, 600);
            self.set_multiplier(5, 2, 200);
            self.set_multiplier(5, 1, 250);
            self.set_multiplier(5, 0, 80);
        }

        fn set_multiplier(&mut self, first: u8, second: u8, multiplier: u64) {
            let index = (first as usize) * 6 + (second as usize);
            if index < 36 {
                self.reward_multipliers[index] = multiplier;
            }
        }

        fn get_multiplier(&self, first: u8, second: u8) -> u64 {
            let index = (first as usize) * 6 + (second as usize);
            if index < 36 {
                self.reward_multipliers[index]
            } else {
                0
            }
        }

        // ========================================================================
        // BALANCE FUNCTIONS
        // ========================================================================

        /// Deposit assets into the contract (called by external asset transfer)
        /// In production, this would be called by an asset pallet or bridge
        #[ink(message)]
        pub fn deposit(&mut self, account: AccountId, amount: u128) -> Result<()> {
            // Only owner can credit deposits (in production, this would be an asset pallet callback)
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }

            let current_balance = self.balances.get(account).unwrap_or(0);
            self.balances.insert(account, &(current_balance + amount));

            self.env().emit_event(Deposited { account, amount });
            Ok(())
        }

        /// Withdraw assets from the contract
        #[ink(message)]
        pub fn withdraw(&mut self, amount: u128) -> Result<()> {
            let caller = self.env().caller();
            let current_balance = self.balances.get(caller).unwrap_or(0);

            if current_balance < amount {
                return Err(Error::InsufficientBalance);
            }

            self.balances.insert(caller, &(current_balance - amount));

            self.env().emit_event(Withdrawn {
                account: caller,
                amount,
            });
            Ok(())
        }

        /// Get balance for an account
        #[ink(message)]
        pub fn get_balance(&self, account: AccountId) -> u128 {
            self.balances.get(account).unwrap_or(0)
        }

        // ========================================================================
        // BETTING FUNCTIONS
        // ========================================================================

        /// Place an exacta bet (predict 1st and 2nd place in order)
        /// Only the operator (owner) can call this function
        /// Deducts the bet amount from the bettor's asset balance
        #[ink(message)]
        pub fn place_exacta_bet(&mut self, bettor: AccountId, first_pick: u8, second_pick: u8, amount: u128) -> Result<()> {
            // Only operator can place bets
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }

            // Validate race status
            if self.status != RaceStatus::Betting {
                return Err(Error::BettingClosed);
            }

            // Validate picks
            if first_pick >= NUM_HORSES as u8 || second_pick >= NUM_HORSES as u8 {
                return Err(Error::InvalidHorseId);
            }
            if first_pick == second_pick {
                return Err(Error::SameHorsePicked);
            }

            if amount == 0 {
                return Err(Error::ZeroBetAmount);
            }

            // Check and deduct balance from bettor's account
            let current_balance = self.balances.get(bettor).unwrap_or(0);
            if current_balance < amount {
                return Err(Error::InsufficientBalance);
            }
            self.balances.insert(bettor, &(current_balance - amount));

            // Create bet
            let bet = ExactaBet {
                bettor,
                amount,
                first_pick,
                second_pick,
                timestamp: self.env().block_timestamp(),
            };

            self.bets.push(bet);
            self.total_pot += amount;

            // Emit event
            self.env().emit_event(BetPlaced {
                bettor,
                first_pick,
                second_pick,
                amount,
            });

            Ok(())
        }

        /// Get all bets for current race
        #[ink(message)]
        pub fn get_bets(&self) -> Vec<ExactaBet> {
            self.bets.clone()
        }

        /// Get total pot for current race
        #[ink(message)]
        pub fn get_total_pot(&self) -> u128 {
            self.total_pot
        }

        // ========================================================================
        // RACE SIMULATION ENGINE
        // ========================================================================

        /// Start the race with a given seed for deterministic simulation
        #[ink(message)]
        pub fn start_race(&mut self, seed: u64) -> Result<()> {
            // Only owner can start race
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }

            if self.status != RaceStatus::Betting {
                return Err(Error::RaceNotInBettingPhase);
            }

            self.current_seed = seed;
            self.race_id += 1;
            self.status = RaceStatus::Racing;
            self.race_start_time = self.env().block_timestamp();

            self.env().emit_event(RaceStarted {
                race_id: self.race_id,
                seed,
                total_bets: self.bets.len() as u32,
            });

            Ok(())
        }

        /// Run the race simulation and determine winners
        /// Uses probability-weighted selection based on the exacta formula:
        /// P(i wins 1st) = S[i] / sum(S)
        /// P(j wins 2nd | i won 1st) = S[j] / (sum(S) - S[i])
        #[ink(message)]
        pub fn run_race_simulation(&mut self) -> Result<RaceResult> {
            if self.status != RaceStatus::Racing {
                return Err(Error::RaceNotInProgress);
            }

            let mut rng_state = self.current_seed;
            
            // Track which horses are still available
            let mut available: Vec<bool> = vec![true; NUM_HORSES];
            let mut rankings: Vec<u8> = Vec::new();
            let mut finish_times: Vec<u64> = Vec::new();
            
            // Select each position using weighted probability
            for position in 0..NUM_HORSES {
                // Calculate total remaining strength
                let mut remaining_strength: u64 = 0;
                for i in 0..NUM_HORSES {
                    if available[i] {
                        remaining_strength += HORSE_STRENGTHS[i];
                    }
                }
                
                if remaining_strength == 0 {
                    break;
                }
                
                // Generate random number for selection
                rng_state = self.next_random(rng_state);
                let random_val = rng_state % remaining_strength;
                
                // Select horse based on weighted probability
                let mut cumulative: u64 = 0;
                let mut selected_horse: u8 = 0;
                
                for i in 0..NUM_HORSES {
                    if available[i] {
                        cumulative += HORSE_STRENGTHS[i];
                        if random_val < cumulative {
                            selected_horse = i as u8;
                            break;
                        }
                    }
                }
                
                // Mark horse as finished
                available[selected_horse as usize] = false;
                rankings.push(selected_horse);
                
                // Simulate finish time (roughly based on position)
                // Base time + position offset + small random variation
                rng_state = self.next_random(rng_state);
                let time_variation = rng_state % 5;
                let finish_time = 50 + (position as u64 * 2) + time_variation;
                finish_times.push(finish_time);
            }

            let result = RaceResult {
                race_id: self.race_id,
                rankings: rankings.clone(),
                finish_times,
                winning_exacta: (rankings[0], rankings[1]),
                total_pot: self.total_pot,
                seed_used: self.current_seed,
            };

            self.latest_result = result.clone();
            self.race_results.push(result.clone());
            self.status = RaceStatus::Finished;

            self.env().emit_event(RaceFinished {
                race_id: self.race_id,
                first_place: rankings[0],
                second_place: rankings[1],
                third_place: rankings[2],
            });

            Ok(result)
        }

        /// Simple LCG random number generator
        fn next_random(&self, state: u64) -> u64 {
            // LCG parameters (same as glibc)
            const A: u64 = 1103515245;
            const C: u64 = 12345;
            const M: u64 = 2147483648; // 2^31
            
            (state.wrapping_mul(A).wrapping_add(C)) % M
        }

        // ========================================================================
        // PAYOUT ENGINE
        // ========================================================================

        /// Calculate and distribute payouts - credits winning amounts to user balances
        #[ink(message)]
        pub fn distribute_payouts(&mut self) -> Result<Vec<Payout>> {
            if self.status != RaceStatus::Finished {
                return Err(Error::RaceNotFinished);
            }

            let winning_exacta = self.latest_result.winning_exacta;
            let multiplier = self.get_multiplier(winning_exacta.0, winning_exacta.1);

            let mut payouts_list: Vec<Payout> = Vec::new();

            for bet in &self.bets {
                if bet.first_pick == winning_exacta.0 && bet.second_pick == winning_exacta.1 {
                    // Winner!
                    let payout_amount = bet.amount * multiplier as u128;
                    
                    // Credit the payout to the winner's balance
                    let current_balance = self.balances.get(bet.bettor).unwrap_or(0);
                    self.balances.insert(bet.bettor, &(current_balance + payout_amount));
                    
                    let payout = Payout {
                        bettor: bet.bettor,
                        bet_amount: bet.amount,
                        multiplier,
                        payout_amount,
                        exacta: winning_exacta,
                    };
                    
                    payouts_list.push(payout.clone());
                    self.payouts.push(payout);

                    self.env().emit_event(PayoutDistributed {
                        bettor: bet.bettor,
                        amount: payout_amount,
                        multiplier,
                    });
                }
            }

            self.status = RaceStatus::Closed;
            Ok(payouts_list)
        }

        /// Get payouts for current race
        #[ink(message)]
        pub fn get_payouts(&self) -> Vec<Payout> {
            self.payouts.clone()
        }

        // ========================================================================
        // EXACTA PROBABILITY CALCULATOR
        // ========================================================================

        /// Calculate exacta probability P(i → j)
        /// Formula: P(i → j) = (S[i] / sum(S)) * (S[j] / (sum(S) - S[i]))
        #[ink(message)]
        pub fn calculate_exacta_probability(&self, first: u8, second: u8) -> u64 {
            if first >= NUM_HORSES as u8 || second >= NUM_HORSES as u8 || first == second {
                return 0;
            }

            let s_first = HORSE_STRENGTHS[first as usize];
            let s_second = HORSE_STRENGTHS[second as usize];

            // P(first wins) = S[first] / TOTAL_STRENGTH
            let p_first = (s_first * PRECISION) / TOTAL_STRENGTH;

            // P(second | first won) = S[second] / (TOTAL_STRENGTH - S[first])
            let remaining = TOTAL_STRENGTH - s_first;
            let p_second_given_first = (s_second * PRECISION) / remaining;

            // P(exacta) = P(first) * P(second|first)
            (p_first * p_second_given_first) / PRECISION
        }

        /// Get all exacta probabilities and multipliers
        #[ink(message)]
        pub fn get_exacta_probability_table(&self) -> Vec<ExactaProbability> {
            let mut table: Vec<ExactaProbability> = Vec::new();

            for first in 0..NUM_HORSES as u8 {
                for second in 0..NUM_HORSES as u8 {
                    if first != second {
                        let prob = self.calculate_exacta_probability(first, second);
                        let mult = self.get_multiplier(first, second);
                        
                        if mult > 0 {
                            table.push(ExactaProbability {
                                first,
                                second,
                                probability: prob,
                                multiplier: mult,
                            });
                        }
                    }
                }
            }

            table
        }

        // ========================================================================
        // GETTERS
        // ========================================================================

        /// Get all horses
        #[ink(message)]
        pub fn get_horses(&self) -> Vec<Horse> {
            self.horses.clone()
        }

        /// Get horse by ID
        #[ink(message)]
        pub fn get_horse(&self, id: u8) -> Option<Horse> {
            self.horses.get(id as usize).cloned()
        }

        /// Get current race status
        #[ink(message)]
        pub fn get_status(&self) -> RaceStatus {
            self.status.clone()
        }

        /// Get current race ID
        #[ink(message)]
        pub fn get_race_id(&self) -> u64 {
            self.race_id
        }

        /// Get latest race result
        #[ink(message)]
        pub fn get_latest_result(&self) -> RaceResult {
            self.latest_result.clone()
        }

        /// Get race results history
        #[ink(message)]
        pub fn get_race_history(&self) -> Vec<RaceResult> {
            self.race_results.clone()
        }

        /// Get winners from latest race
        #[ink(message)]
        pub fn get_winners(&self) -> (u8, u8) {
            self.latest_result.winning_exacta
        }

        /// Get reward multiplier for an exacta combination
        #[ink(message)]
        pub fn get_reward_multiplier(&self, first: u8, second: u8) -> u64 {
            self.get_multiplier(first, second)
        }

        /// Get normalized strength for a horse
        #[ink(message)]
        pub fn get_normalized_strength(&self, horse_id: u8) -> u64 {
            if horse_id < NUM_HORSES as u8 {
                self.horses[horse_id as usize].normalized_strength
            } else {
                0
            }
        }

        /// Get contract owner
        #[ink(message)]
        pub fn get_owner(&self) -> AccountId {
            self.owner
        }

        // ========================================================================
        // ADMIN FUNCTIONS
        // ========================================================================

        /// Reset for new race
        #[ink(message)]
        pub fn reset_for_new_race(&mut self) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }

            self.bets.clear();
            self.payouts.clear();
            self.total_pot = 0;
            self.status = RaceStatus::Betting;
            self.betting_start_time = self.env().block_timestamp();
            self.current_seed = 0;

            Ok(())
        }

        /// Set contract owner
        #[ink(message)]
        pub fn set_owner(&mut self, new_owner: AccountId) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }
            self.owner = new_owner;
            Ok(())
        }

        // ========================================================================
        // SIMULATION HELPER - Run complete race cycle
        // ========================================================================

        /// Run a complete race simulation (for testing)
        #[ink(message)]
        pub fn simulate_complete_race(&mut self, seed: u64) -> Result<RaceResult> {
            // Start race
            self.current_seed = seed;
            self.race_id += 1;
            self.status = RaceStatus::Racing;
            self.race_start_time = self.env().block_timestamp();

            // Run simulation
            self.run_race_simulation()
        }
    }

    // ============================================================================
    // UNIT TESTS
    // ============================================================================

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn initialization_works() {
            let contract = HorseRace::new();
            
            // Check horses initialized
            assert_eq!(contract.get_horses().len(), 6);
            
            // Check horse strengths
            let horses = contract.get_horses();
            assert_eq!(horses[0].strength, 6);
            assert_eq!(horses[5].strength, 1);
            
            // Check status
            assert_eq!(contract.get_status(), RaceStatus::Betting);
        }

        #[ink::test]
        fn normalized_strength_works() {
            let contract = HorseRace::new();
            
            // H[0] strength = 6, normalized = 6/21 * 10000 = 2857
            let ns = contract.get_normalized_strength(0);
            assert!(ns > 2850 && ns < 2860);
            
            // H[5] strength = 1, normalized = 1/21 * 10000 = 476
            let ns = contract.get_normalized_strength(5);
            assert!(ns > 470 && ns < 480);
        }

        #[ink::test]
        fn exacta_probability_works() {
            let contract = HorseRace::new();
            
            // P(0 → 1) should be highest
            let p_01 = contract.calculate_exacta_probability(0, 1);
            // P(5 → 4) should be lowest
            let p_54 = contract.calculate_exacta_probability(5, 4);
            
            assert!(p_01 > p_54);
        }

        #[ink::test]
        fn multipliers_initialized() {
            let contract = HorseRace::new();
            
            // Check specific multipliers
            assert_eq!(contract.get_reward_multiplier(0, 5), 60);
            assert_eq!(contract.get_reward_multiplier(4, 5), 1000);
            assert_eq!(contract.get_reward_multiplier(5, 4), 1500);
        }

        #[ink::test]
        fn probability_table_works() {
            let contract = HorseRace::new();
            let table = contract.get_exacta_probability_table();
            
            // Should have entries for combinations with multipliers
            assert!(!table.is_empty());
            
            // Each entry should have valid data
            for entry in &table {
                assert!(entry.first < 6);
                assert!(entry.second < 6);
                assert!(entry.first != entry.second);
                assert!(entry.multiplier > 0);
            }
        }

        #[ink::test]
        fn race_simulation_deterministic() {
            let mut contract = HorseRace::new();
            
            // Run with same seed twice
            let result1 = contract.simulate_complete_race(12345).unwrap();
            contract.reset_for_new_race().unwrap();
            let result2 = contract.simulate_complete_race(12345).unwrap();
            
            // Results should be identical
            assert_eq!(result1.rankings, result2.rankings);
            assert_eq!(result1.winning_exacta, result2.winning_exacta);
        }
    }

    // ============================================================================
    // E2E TESTS
    // ============================================================================

    #[cfg(all(test, feature = "e2e-tests"))]
    mod e2e_tests {
        use super::*;
        use ink_e2e::ContractsBackend;

        type E2EResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;

        #[ink_e2e::test]
        async fn e2e_initialization(mut client: ink_e2e::Client<C, E>) -> E2EResult<()> {
            let mut constructor = HorseRaceRef::new();
            let contract = client
                .instantiate("horse_race", &ink_e2e::alice(), &mut constructor)
                .submit()
                .await
                .expect("instantiate failed");
            
            let call_builder = contract.call_builder::<HorseRace>();

            // Check horses
            let get_horses = call_builder.get_horses();
            let result = client.call(&ink_e2e::alice(), &get_horses).dry_run().await?;
            assert_eq!(result.return_value().len(), 6);

            Ok(())
        }
    }
}
