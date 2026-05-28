import type {
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  PendingPrompt,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  UsageEvent,
  WalletLink
} from "../domain/types.js";
import type { Repository } from "./repository.js";

export class MemoryRepository implements Repository {
  private readonly groupWallets = new Map<ChatId, GroupWallet>();
  private readonly walletLinks = new Map<string, WalletLink>();
  private readonly pendingPrompts = new Map<string, PendingPrompt>();
  private readonly safeCreationSessions = new Map<string, SafeCreationSession>();
  private readonly tradeProposals = new Map<string, TradeProposal>();
  private readonly flapLaunches = new Map<string, FlapLaunchProposal>();
  private readonly safeSubmissions = new Map<string, SafeSubmission>();
  private readonly usageEvents: UsageEvent[] = [];

  async getGroupWallet(chatId: ChatId): Promise<GroupWallet | null> {
    return this.groupWallets.get(chatId) ?? null;
  }

  async listGroupWallets(): Promise<GroupWallet[]> {
    return [...this.groupWallets.values()];
  }

  async saveGroupWallet(wallet: GroupWallet): Promise<void> {
    this.groupWallets.set(wallet.chatId, wallet);
  }

  async deleteGroupWallet(chatId: ChatId): Promise<void> {
    this.groupWallets.delete(chatId);
  }

  async getPendingPrompt(chatId: ChatId, telegramUserId: string): Promise<PendingPrompt | null> {
    return this.pendingPrompts.get(promptKey(chatId, telegramUserId)) ?? null;
  }

  async savePendingPrompt(prompt: PendingPrompt): Promise<void> {
    this.pendingPrompts.set(promptKey(prompt.chatId, prompt.telegramUserId), prompt);
  }

  async deletePendingPrompt(chatId: ChatId, telegramUserId: string): Promise<void> {
    this.pendingPrompts.delete(promptKey(chatId, telegramUserId));
  }

  async getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null> {
    return this.walletLinks.get(walletLinkKey(telegramUserId, address)) ?? null;
  }

  async getWalletLinkByNonce(nonce: string): Promise<WalletLink | null> {
    return [...this.walletLinks.values()].find((link) => link.nonce === nonce) ?? null;
  }

  async saveWalletLink(link: WalletLink): Promise<void> {
    this.walletLinks.set(walletLinkKey(link.telegramUserId, link.address), link);
  }

  async getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]> {
    return [...this.walletLinks.values()].filter((link) => link.telegramUserId === telegramUserId && link.status === "linked");
  }

  async getLinkedWalletsByAddress(address: string): Promise<WalletLink[]> {
    return [...this.walletLinks.values()].filter(
      (link) => link.address.toLowerCase() === address.toLowerCase() && link.status === "linked"
    );
  }

  async getSafeCreationSession(id: string): Promise<SafeCreationSession | null> {
    return this.safeCreationSessions.get(id) ?? null;
  }

  async saveSafeCreationSession(session: SafeCreationSession): Promise<void> {
    this.safeCreationSessions.set(session.id, session);
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

  async saveUsageEvent(event: UsageEvent): Promise<void> {
    this.usageEvents.push(event);
  }

  async listUsageEventsSince(since: Date): Promise<UsageEvent[]> {
    return this.usageEvents.filter((event) => event.createdAt >= since);
  }
}

function walletLinkKey(telegramUserId: string, address: string): string {
  return `${telegramUserId}:${address.toLowerCase()}`;
}

function promptKey(chatId: ChatId, telegramUserId: string): string {
  return `${chatId}:${telegramUserId}`;
}
