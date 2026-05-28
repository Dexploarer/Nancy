import type {
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  PendingPrompt,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  WalletLink
} from "../domain/types.js";

export interface Repository {
  getGroupWallet(chatId: ChatId): Promise<GroupWallet | null>;
  saveGroupWallet(wallet: GroupWallet): Promise<void>;
  deleteGroupWallet(chatId: ChatId): Promise<void>;
  getPendingPrompt(chatId: ChatId, telegramUserId: string): Promise<PendingPrompt | null>;
  savePendingPrompt(prompt: PendingPrompt): Promise<void>;
  deletePendingPrompt(chatId: ChatId, telegramUserId: string): Promise<void>;
  getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null>;
  getWalletLinkByNonce(nonce: string): Promise<WalletLink | null>;
  getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]>;
  saveWalletLink(link: WalletLink): Promise<void>;
  getSafeCreationSession(id: string): Promise<SafeCreationSession | null>;
  saveSafeCreationSession(session: SafeCreationSession): Promise<void>;
  getTradeProposal(id: string): Promise<TradeProposal | null>;
  saveTradeProposal(proposal: TradeProposal): Promise<void>;
  getFlapLaunch(id: string): Promise<FlapLaunchProposal | null>;
  saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void>;
  getSafeSubmission(id: string): Promise<SafeSubmission | null>;
  saveSafeSubmission(submission: SafeSubmission): Promise<void>;
}
