import type {
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  ManagedWallet,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  WalletLink
} from "../domain/types.js";

export interface Repository {
  getGroupWallet(chatId: ChatId): Promise<GroupWallet | null>;
  saveGroupWallet(wallet: GroupWallet): Promise<void>;
  getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null>;
  getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]>;
  saveWalletLink(link: WalletLink): Promise<void>;
  getManagedWallet(telegramUserId: string): Promise<ManagedWallet | null>;
  saveManagedWallet(wallet: ManagedWallet): Promise<void>;
  getSafeCreationSession(id: string): Promise<SafeCreationSession | null>;
  saveSafeCreationSession(session: SafeCreationSession): Promise<void>;
  getTradeProposal(id: string): Promise<TradeProposal | null>;
  saveTradeProposal(proposal: TradeProposal): Promise<void>;
  getFlapLaunch(id: string): Promise<FlapLaunchProposal | null>;
  saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void>;
  getSafeSubmission(id: string): Promise<SafeSubmission | null>;
  saveSafeSubmission(submission: SafeSubmission): Promise<void>;
}
