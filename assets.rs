use sp_runtime::MultiAddress;
use ink::env::DefaultEnvironment;

type AccountId = <DefaultEnvironment as ink::env::Environment>::AccountId;
type Balance = <DefaultEnvironment as ink::env::Environment>::Balance;

#[ink::scale_derive(Encode)]
pub enum RuntimeCall {
    /// Dispatches a call to the `Assets` pallet.
    #[codec(index = 50)]
    Assets(AssetsCall),
}

/// Defines relevant `Assets` pallet calls for web3 lottery.
#[ink::scale_derive(Encode)]
pub enum AssetsCall {
    /// Move some assets from the sender account to another.
    ///
    /// Used to transfer tokens into the recipient’s balance.
    #[codec(index = 8)]
    Transfer {
        #[codec(compact)]
        id: u128,
        target: MultiAddress<AccountId, ()>,
        #[codec(compact)]
        amount: Balance,
    },
}