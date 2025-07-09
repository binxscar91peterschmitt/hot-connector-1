import { NearWallet, EventNearWalletInjected, WalletManifest, Network, WalletFeatures, Logger } from "./types/wallet";
import { ParentFrameWallet } from "./wallets/ParentFrameWallet";
import { InjectedWallet } from "./wallets/InjectedWallet";
import { SandboxWallet } from "./wallets/SandboxedWallet";
import { LocalStorage, DataStorage } from "./storage";
import { EventMap } from "./types/wallet-events";
import { EventEmitter } from "./helpers/events";
import IndexedDB from "./indexdb";

interface WalletSelectorOptions {
  storage?: DataStorage;
  logger?: Logger;
  events?: EventEmitter<EventMap>;
  manifest?: string | { wallets: WalletManifest[]; version: string };
  network?: Network;
  features?: Partial<WalletFeatures>;
  connectWithKey?: {
    contractId: string;
    methodNames?: string[];
    allowance?: string;
  };
}

export class WalletSelector {
  private storage: DataStorage;
  readonly events: EventEmitter<EventMap>;
  readonly db: IndexedDB;

  wallets: NearWallet[] = [];
  manifest: { wallets: WalletManifest[]; version: string } = { wallets: [], version: "1.0.0" };
  features: Partial<WalletFeatures> = {};
  logger?: Logger;

  network: Network = "mainnet";
  connectWithKey?: { contractId: string; methodNames?: string[]; allowance?: string };

  readonly whenManifestLoaded: Promise<void>;

  constructor(options?: WalletSelectorOptions) {
    this.db = new IndexedDB("hot-connector", "wallets");
    this.storage = options?.storage ?? new LocalStorage();
    this.events = options?.events ?? new EventEmitter<EventMap>();
    this.logger = options?.logger;

    this.network = options?.network ?? "mainnet";
    this.connectWithKey = options?.connectWithKey;
    this.features = options?.features ?? {};

    this.whenManifestLoaded = new Promise(async (resolve) => {
      if (options?.manifest == null || typeof options.manifest === "string") {
        this.manifest = await this._loadManifest(options?.manifest).catch(() => ({ wallets: [], version: "1.0.0" }));
      } else {
        this.manifest = options?.manifest ?? { wallets: [], version: "1.0.0" };
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      resolve();
    });

    window.addEventListener<any>("near-wallet-injected", this._handleNearWalletInjected);
    window.dispatchEvent(new Event("near-selector-ready"));

    this.whenManifestLoaded.then(() => {
      window.parent.postMessage({ type: "near-selector-ready" }, "*");
      this.manifest.wallets.forEach((wallet) => this.registerWallet(wallet));
      this.storage.get("debug-wallets").then((json) => {
        const debugWallets = JSON.parse(json ?? "[]") as WalletManifest[];
        debugWallets.forEach((wallet) => this.registerDebugWallet(wallet));
      });
    });

    window.addEventListener("message", async (event) => {
      if (event.data.type === "near-wallet-injected") {
        await this.whenManifestLoaded.catch(() => {});
        this.wallets = this.wallets.filter((wallet) => wallet.manifest.id !== event.data.manifest.id);
        this.wallets.unshift(new ParentFrameWallet(this, event.data.manifest));
        this.events.emit("selector:walletsChanged", {});
        this.connect(event.data.manifest.id);
      }
    });
  }

  get availableWallets() {
    return this.wallets.filter((wallet) => {
      return Object.entries(this.features).every(([key, value]) => {
        if (value && !wallet.manifest.features?.[key as keyof WalletFeatures]) return false;
        return true;
      });
    });
  }

  private _handleNearWalletInjected = (event: EventNearWalletInjected) => {
    this.wallets = this.wallets.filter((wallet) => wallet.manifest.id !== event.detail.manifest.id);
    this.wallets.unshift(new InjectedWallet(this, event.detail as any));
    this.events.emit("selector:walletsChanged", {});
  };

  private async _loadManifest(manifestUrl?: string) {
    let manifestEndpoint = manifestUrl
      ? manifestUrl
      : "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json";

    const manifest = (await (await fetch(manifestEndpoint)).json()) as { wallets: WalletManifest[]; version: string };
    return manifest;
  }

  async registerWallet(manifest: WalletManifest) {
    if (manifest.type !== "sandbox") throw new Error("Only sandbox wallets are supported");
    if (this.wallets.find((wallet) => wallet.manifest.id === manifest.id)) return;
    this.wallets.push(new SandboxWallet(this, manifest));
    this.events.emit("selector:walletsChanged", {});
  }

  async registerDebugWallet(manifest: WalletManifest) {
    if (manifest.type !== "sandbox") throw new Error("Only sandbox wallets are supported");
    if (this.wallets.find((wallet) => wallet.manifest.id === manifest.id)) throw new Error("Wallet already registered");

    manifest.debug = true;
    this.wallets.push(new SandboxWallet(this, manifest));
    this.events.emit("selector:walletsChanged", {});

    const debugWallets = this.wallets.filter((wallet) => wallet.manifest.debug).map((wallet) => wallet.manifest);
    this.storage.set("debug-wallets", JSON.stringify(debugWallets));
  }

  async connect(id: string) {
    try {
      const wallet = await this.wallet(id);
      this.logger?.log(`Wallet available to connect`, wallet);

      await this.storage.set("selected-wallet", id);
      this.logger?.log(`Set preferred wallet, try to signIn`, id);

      const accounts = await wallet.signIn(this.connectWithKey ?? { contractId: "" });
      this.logger?.log(`Signed in to wallet`, id, accounts);

      if (!accounts?.length) throw new Error("Failed to sign in");
      this.events.emit("wallet:signIn", { wallet, accounts, success: true });
      return wallet;
    } catch (e) {
      this.logger?.log("Failed to connect to wallet", e);
      throw e;
    }
  }

  async disconnect(wallet?: NearWallet) {
    if (!wallet) wallet = await this.wallet();
    await wallet.signOut({ network: this.network });

    await this.storage.remove("selected-wallet");
    this.events.emit("wallet:signOut", { success: true });
  }

  async getConnectedWallet() {
    await this.whenManifestLoaded.catch(() => {});
    const id = await this.storage.get("selected-wallet");
    const wallet = this.wallets.find((wallet) => wallet.manifest.id === id);
    if (!wallet) throw new Error("No wallet selected");

    const accounts = await wallet.getAccounts();
    if (!accounts?.length) throw new Error("No accounts found");
    return { wallet, accounts };
  }

  async wallet(id?: string | null): Promise<NearWallet> {
    await this.whenManifestLoaded.catch(() => {});

    if (!id) {
      return this.getConnectedWallet()
        .then(({ wallet }) => wallet)
        .catch(async () => {
          await this.storage.remove("selected-wallet");
          throw new Error("No accounts found");
        });
    }

    const wallet = this.wallets.find((wallet) => wallet.manifest.id === id);
    if (!wallet) throw new Error("Wallet not found");
    return wallet;
  }

  on<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.on(event, callback);
  }

  once<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.once(event, callback);
  }

  off<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.off(event, callback);
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    this.events.removeAllListeners(event);
  }
}
