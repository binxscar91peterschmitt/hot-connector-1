import type { providers, utils } from "near-api-js";
import type { Transaction, Action } from "./transactions";

export type Logger = {
  log: (...logs: any[]) => void;
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Network = "mainnet" | "testnet";

export interface Account {
  accountId: string;
  publicKey: string;
}

export interface SignInParams {
  /**
   * Account ID of the Smart Contract.
   */
  contractId: string;
  /**
   * Specify limited access to particular methods on the Smart Contract.
   */
  methodNames?: Array<string>;
  /**
   * Specify the network to sign in to.
   */
  network?: Network;
}

export interface SignMessageParams {
  message: string;
  recipient: string;
  nonce: Buffer | Uint8Array;
  network?: Network;
}

export interface SignedMessage {
  accountId: string;
  publicKey: string;
  signature: string;
}

export interface SignAndSendTransactionParams {
  /**
   * Account ID used to sign the transaction. Defaults to the first account.
   */
  signerId?: string;
  /**
   * Account ID to receive the transaction. Defaults to `contractId` defined in `init`.
   */
  receiverId?: string;
  /**
   * NEAR Action(s) to sign and send to the network (e.g. `FunctionCall`). You can find more information on `Action` {@link https://github.com/near/wallet-selector/blob/main/packages/core/docs/api/transactions.md | here}.
   */
  actions: Array<Action>;
  /**
   * Specify the network to sign and send the transaction on.
   */
  network?: Network;
}

export interface SignAndSendTransactionsParams {
  /**
   * NEAR Transactions(s) to sign and send to the network. You can find more information on `Transaction` {@link https://github.com/near/wallet-selector/blob/main/packages/core/docs/api/transactions.md | here}.
   */
  transactions: Array<Optional<Transaction, "signerId">>;
  /**
   * Specify the network to sign and send the transactions on.
   */
  network?: Network;
}

export type EventNearWalletInjected = CustomEvent<NearWallet>;

export interface WalletPermissions {
  storage?: boolean;
  open?: { allows?: string[] };
  autoRun?: { parentFrame?: boolean; webviewUserAgent?: string };
  parentFrame?: string[];
  usb?: boolean;
  hid?: boolean;
}

export interface WalletManifest {
  id: string;
  platform: string[];
  name: string;
  icon: string;
  description: string;
  website: string;
  version: string;
  executor: string;
  type: "sandbox" | "injected";
  permissions: WalletPermissions;
  features: WalletFeatures;
  debug?: boolean;
}

export interface WalletFeatures {
  signMessage: boolean;
  signTransaction: boolean;
  signAndSendTransaction: boolean;
  signAndSendTransactions: boolean;
  signInWithoutAddKey: boolean;
  testnet: boolean;
}

export interface NearWallet {
  manifest: WalletManifest;

  /**
   * Programmatically sign in. Hardware wallets (e.g. Ledger) require `derivationPaths` to validate access key permissions.
   */
  signIn(params: SignInParams): Promise<Array<Account>>;
  /**
   * Sign out from the wallet.
   */
  signOut(data?: { network?: Network }): Promise<void>;
  /**
   * Returns one or more accounts when signed in.
   * This method can be useful for wallets that support accounts at once such as WalletConnect.
   * In this case, you can use an `accountId` returned as the `signerId` for `signAndSendTransaction`.
   */
  getAccounts(data?: { network?: Network }): Promise<Array<Account>>;
  /**
   * Signs one or more NEAR Actions before sending to the network.
   * The user must be signed in to call this method as there's at least charges for gas spent.
   */
  signAndSendTransaction(params: SignAndSendTransactionParams): Promise<providers.FinalExecutionOutcome>;
  /**
   * Signs one or more transactions before sending to the network.
   * The user must be signed in to call this method as there's at least charges for gas spent.
   */
  signAndSendTransactions(params: SignAndSendTransactionsParams): Promise<Array<providers.FinalExecutionOutcome>>;
  signMessage(params: SignMessageParams): Promise<SignedMessage>;
}

export type WalletEvents = {
  signedIn: { contractId: string; methodNames: Array<string>; accounts: Array<Account> };
  accountsChanged: { accounts: Array<Account> };
  networkChanged: { networkId: string };
  signedOut: null;
};
