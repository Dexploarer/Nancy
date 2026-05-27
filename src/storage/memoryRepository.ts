import type { ChatId, FlapLaunchProposal, GroupWallet, SafeSubmission, TradeProposal } from "../domain/types.js";
import type { Repository } from "./repository.js";

export class MemoryRepository implements Repository {
  private readonly groupWallets = new Map<ChatId, GroupWallet>();
  private readonly tradeProposals = new Map<string, TradeProposal>();
  private readonly flapLaunches = new Map<string, FlapLaunchProposal>();
  private readonly safeSubmissions = new Map<string, SafeSubmission>();

  async getGroupWallet(chatId: ChatId): Promise<GroupWallet | null> {
    return this.groupWallets.get(chatId) ?? null;
  }

  async saveGroupWallet(wallet: GroupWallet): Promise<void> {
    this.groupWallets.set(wallet.chatId, wallet);
  }

  async getTradeProposal(id: string): Promise<TradeProposal | null> {
    return this.tradeProposals.get(id) ?? null;
  }

  async saveTradeProposal(proposal: TradeProposal): Promise<void> {
    this.tradeProposals.set(proposal.id, proposal);
  }

  async getFlapLaunch(id: string): Promise<FlapLaunchProposal | null> {
    return this.flapLaunches.get(id) ?? null;
  }

  async saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void> {
    this.flapLaunches.set(proposal.id, proposal);
  }

  async getSafeSubmission(id: string): Promise<SafeSubmission | null> {
    return this.safeSubmissions.get(id) ?? null;
  }

  async saveSafeSubmission(submission: SafeSubmission): Promise<void> {
    this.safeSubmissions.set(submission.id, submission);
  }
}
