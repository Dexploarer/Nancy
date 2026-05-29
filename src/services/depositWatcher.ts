import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { Logger } from "../logger.js";
import type { Repository } from "../storage/repository.js";
import type { PoolService } from "./poolService.js";

export type DepositMatch = {
  chatId: string;
  telegramUserId: string;
  amountWei: bigint;
  transactionHash: Hex;
  sender: Address;
};

export type ScannedTx = {
  hash: Hex;
  from: Address;
  to: Address | null;
  value: bigint;
};

// Pure core: which transactions in a block are deposits we should credit?
// A deposit is a native transfer (value > 0) to a known group Safe from an address
// linked to a Telegram user. Easily unit-tested without any RPC.
export async function matchBlockDeposits(
  transactions: ScannedTx[],
  safeToChatId: Map<string, string>,
  resolveLinkedUser: (address: Address) => Promise<string | null>
): Promise<DepositMatch[]> {
  const matches: DepositMatch[] = [];
  for (const tx of transactions) {
    if (tx.to === null || tx.value <= 0n) {
      continue;
    }
    const chatId = safeToChatId.get(tx.to.toLowerCase());
    if (chatId === undefined) {
      continue;
    }
    const telegramUserId = await resolveLinkedUser(tx.from);
    if (telegramUserId === null) {
      continue;
    }
    matches.push({ chatId, telegramUserId, amountWei: tx.value, transactionHash: tx.hash, sender: tx.from });
  }
  return matches;
}

// Background poller: scans new BSC blocks for BNB transfers into group Safes and
// auto-credits the matching pool member. Plain RPC, no indexer/API key. Bounded
// catch-up so a slow tick can never scan unbounded history.
export class DepositWatcher {
  private readonly publicClient: PublicClient;
  private lastScannedBlock = 0n;
  // Only credit deposits this many blocks behind the head, so a shallow BSC re-org
  // can't leave us having credited a tx that later drops off the canonical chain.
  private readonly confirmations = 5n;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly repository: Repository,
    private readonly poolService: PoolService,
    private readonly notify: (chatId: string, text: string) => Promise<void>,
    rpcUrl: string,
    chainId: 56 | 97,
    // BSC is ~0.45s/block post-Fermi (~2.2 blocks/s), so a 30s tick is ~66 blocks.
    // Keep generous headroom so a normal tick never hits the skip backstop below.
    private readonly maxBlocksPerTick = 300,
    publicClient?: PublicClient
  ) {
    this.publicClient =
      publicClient ?? createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: http(rpcUrl) });
  }

  start(intervalMs = 30_000): void {
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        Logger.warn("[DepositWatcher] tick failed", { err: error instanceof Error ? error : undefined })
      );
    }, intervalMs);
    Logger.info("[DepositWatcher] watching group Safes for deposits", { intervalMs });
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const wallets = await this.repository.listGroupWallets();
      if (wallets.length === 0) {
        return;
      }
      const safeToChatId = new Map(wallets.map((wallet) => [wallet.safeAddress.toLowerCase(), wallet.chatId]));
      const head = await this.publicClient.getBlockNumber();
      // Treat the tip minus a confirmation lag as the scannable head (re-org safety).
      const confirmedHead = head > this.confirmations ? head - this.confirmations : 0n;
      if (this.lastScannedBlock === 0n) {
        // Start from the current confirmed head — only auto-detect deposits from now on.
        this.lastScannedBlock = confirmedHead;
        return;
      }
      if (confirmedHead <= this.lastScannedBlock) {
        return;
      }
      let from = this.lastScannedBlock + 1n;
      if (confirmedHead - from + 1n > BigInt(this.maxBlocksPerTick)) {
        // Fell too far behind (downtime / RPC stall): skip the gap so we never scan
        // unbounded history — but log it loudly, since deposits in the gap are missed.
        Logger.warn("[DepositWatcher] behind chain head — skipping blocks (deposits in the gap won't be auto-credited)", {
          from: from.toString(),
          head: confirmedHead.toString(),
          skipped: (confirmedHead - from + 1n - BigInt(this.maxBlocksPerTick)).toString()
        });
        from = confirmedHead - BigInt(this.maxBlocksPerTick) + 1n;
      }
      for (let blockNumber = from; blockNumber <= confirmedHead; blockNumber++) {
        const block = await this.publicClient.getBlock({ blockNumber, includeTransactions: true });
        const transactions: ScannedTx[] = block.transactions.map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value
        }));
        const matches = await matchBlockDeposits(transactions, safeToChatId, async (address) => {
          const links = await this.repository.getLinkedWalletsByAddress(address);
          return links[0]?.telegramUserId ?? null;
        });
        for (const match of matches) {
          await this.credit(match);
        }
        this.lastScannedBlock = blockNumber;
      }
    } finally {
      this.running = false;
    }
  }

  private async credit(match: DepositMatch): Promise<void> {
    try {
      await this.poolService.creditDeposit({
        chatId: match.chatId,
        telegramUserId: match.telegramUserId,
        amountWei: match.amountWei,
        transactionHash: match.transactionHash
      });
      await this.notify(match.chatId, `💰 Deposit auto-credited: ${match.amountWei.toString()} wei from ${match.sender}.`);
    } catch (error) {
      // Already credited (tx-hash unique index) or pool not initialised yet — skip.
      Logger.warn("[DepositWatcher] skipped a deposit credit", {
        transactionHash: match.transactionHash,
        err: error instanceof Error ? error : undefined
      });
    }
  }
}
