import { WalletType } from "../wallets/ChainAbstracted";
import { Popup } from "./Popup";

export class MultichainPopup extends Popup {
  constructor(
    readonly delegate: {
      chains: WalletType[];
      wallets: Record<WalletType, string | undefined>;
      onDisconnect: (type: WalletType) => void;
      onConnect: (type: WalletType) => void;
      onReject: () => void;
    }
  ) {
    super(delegate);
    this.state = delegate.wallets;
  }

  create() {
    super.create({ show: true });
    this.root.querySelectorAll(".connect-item").forEach((item) => {
      if (!(item instanceof HTMLDivElement)) return;
      item.addEventListener("click", () => {
        if (this.state[Number(item.dataset.type)]) {
          this.delegate.onDisconnect(Number(item.dataset.type));
        } else {
          this.delegate.onConnect(Number(item.dataset.type));
        }
      });
    });
  }

  get logout() {
    return `
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.58L17 17L22 12L17 7ZM4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z" fill="rgba(255,255,255,0.5)"/>
			</svg>
		`;
  }

  label(type: WalletType) {
    switch (type) {
      case WalletType.EVM:
        return "EVM Wallet";
      case WalletType.SOLANA:
        return "Solana Wallet";
      case WalletType.TON:
        return "TON Wallet";
      case WalletType.NEAR:
        return "NEAR Wallet";
      default:
        return type;
    }
  }

  address(type: WalletType) {
    if (!this.state[type]) return null;
    if (this.state[type].length < 20) return this.state[type];
    return `${this.state[type].slice(0, 8)}...${this.state[type].slice(-8)}`;
  }

  walletOption(type: WalletType) {
    return `
			<div class="connect-item" data-type="${type}">
				<img src="https://storage.herewallet.app/ft/${type}:native.png" alt="${type}" />
				<div class="connect-item-info">
					<span>${this.label(type)}</span>
					${this.address(type) ? `<span class="wallet-address">${this.address(type)}</span>` : ""}
				</div>
				${this.address(type) ? this.logout : ""}
			</div>`;
  }

  get dom() {
    return `
			<div class="modal-container">
				<div class="modal-content">
					<div class="modal-header">
						<p>Select network</p>
					</div>

					<div class="modal-body">
						${this.delegate.chains.map((type) => this.walletOption(type)).join("")}
					</div>

					<div class="footer">
						<img src="https://tgapp.herewallet.app/images/hot/hot-icon.png" alt="HOT Connector" />
						<p>HOT Connector</p>
						<p class="get-wallet-link">Don't have a wallet?</p>
					</div>
				</div>
			</div>`;
  }
}
