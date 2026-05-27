import type { ChatId, FlapLaunchProposal, GroupWallet, SafeSubmission, TradeProposal, WalletLink } from "../domain/types.js";

export interface Repository {
  getGroupWallet(chatId: ChatId): Promise<GroupWallet | null>;
  saveGroupWallet(wallet: GroupWallet): Promise<void>;
  getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null>;
  saveWalletLink(link: WalletLink): Promise<void>;
  getTradeProposal(id: string): Promise<TradeProposal | null>;
  saveTradeProposal(proposal: TradeProposal): Promise<void>;
  getFlapLaunch(id: string): Promise<FlapLaunchProposal | null>;
  saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void>;
  getSafeSubmission(id: string): Promise<SafeSubmission | null>;
  saveSafeSubmission(submission: SafeSubmission): Promise<void>;
}
