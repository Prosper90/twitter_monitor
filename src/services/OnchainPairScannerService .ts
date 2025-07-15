import {
  Block,
  ethers,
  getDefaultProvider,
  JsonRpcProvider,
  Provider,
  TransactionReceipt,
} from "ethers";
import { CoinData, ApiResponse } from "../types";
import { logger } from "../utils/logger";
import { SuiClient } from "@mysten/sui.js/client";
import { getFullnodeUrl } from "@mysten/sui.js/client";

// PancakeSwap addresses
const PANCAKESWAP_FACTORY_ADDRESS =
  "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
const PANCAKESWAP_ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// Event signatures
const PAIR_CREATED_TOPIC = ethers.id(
  "PairCreated(address,address,address,uint256)"
);
const ADD_LIQUIDITY_ETH_TOPIC = ethers.id(
  "AddLiquidityETH(address,uint256,uint256,uint256,address,uint256)"
);
const ADD_LIQUIDITY_TOPIC = ethers.id(
  "AddLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"
);
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Sui factory address
const SUI_FACTORY = process.env.SUI_FACTORY_ADDRESS || "";

export class OnchainPairScannerService {
  private bnbProvider: Provider;
  private suiClient: SuiClient;

  constructor() {
    console.log(process.env.BNB_RPC_URL, "checking something");
    this.bnbProvider = new JsonRpcProvider(process.env.BNB_RPC_URL, {
      name: "binance",
      chainId: 56,
    });
    console.log(this.bnbProvider, "checking something out");
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("mainnet");
    this.suiClient = new SuiClient({ url: rpcUrl });
  }

  // Your original function - enhanced to detect more tokens
  async getRecentBNBPairCreations(): Promise<ApiResponse<CoinData[]>> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      // Last 30 minutes (assuming ~3 second block time on BSC)
      const blocksIn30Min = Math.floor((30 * 60) / 3); // ~600 blocks
      const fromBlock = latestBlock - blocksIn30Min;

      logger.info(
        `🔍 Scanning BNB blocks ${fromBlock} to ${latestBlock} (last 30 minutes)...`
      );

      // Run multiple detection methods in parallel
      const [factoryLogs, liquidityLogs, transferLogs] =
        await Promise.allSettled([
          this.getFactoryPairLogs(fromBlock, latestBlock),
          this.getLiquidityLogs(fromBlock, latestBlock),
          this.getLargeTransferLogs(fromBlock, latestBlock),
        ]);

      const allCoins: CoinData[] = [];

      // Process factory pair creation logs
      if (factoryLogs.status === "fulfilled") {
        for (const log of factoryLogs.value) {
          const coinData = await this.decodeFactoryPairLog(log);
          if (coinData) allCoins.push(coinData);
        }
        logger.info(`✅ Factory: ${factoryLogs.value.length} pair events`);
      }

      // Process liquidity addition logs
      if (liquidityLogs.status === "fulfilled") {
        for (const log of liquidityLogs.value) {
          const coinData = await this.decodeLiquidityLog(log);
          if (coinData) allCoins.push(coinData);
        }
        logger.info(`✅ Liquidity: ${liquidityLogs.value.length} events`);
      }

      // Process large transfer logs
      if (transferLogs.status === "fulfilled") {
        for (const log of transferLogs.value) {
          const coinData = await this.decodeTransferLog(log);
          if (coinData) allCoins.push(coinData);
        }
        logger.info(`✅ Transfers: ${transferLogs.value.length} events`);
      }

      // Remove duplicates and sort by newest first
      const uniqueCoins = this.removeDuplicatesAndSort(allCoins);

      logger.info(`🎯 Total unique tokens found: ${uniqueCoins.length}`);
      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ BNB Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan BNB network for new pairs.",
      };
    }
  }

  // Scan specific Sui event with proper package ID
  private async scanSuiSpecificEvent(
    packageId: string,
    eventType: string,
    thirtyMinutesAgo: number
  ): Promise<CoinData[]> {
    try {
      const fullEventType = `${packageId}::${eventType}`;

      const result = await this.suiClient.queryEvents({
        query: { MoveEventType: fullEventType },
        limit: 50,
      });

      const coins: CoinData[] = [];

      for (const ev of result.data) {
        try {
          const eventTime = ev.timestampMs || Date.now();
          if ((eventTime as number) < thirtyMinutesAgo) continue;

          const event = ev.parsedJson as any;
          let symbol = "UNKNOWN";
          let name = "Unknown Token";
          let contractAddress = ev.id.txDigest;

          // Handle different event structures
          if (event.token_x && event.token_y) {
            symbol = `${event.token_x.symbol || "UNK"}/${
              event.token_y.symbol || "UNK"
            }`;
            name = `${event.token_x.name || "Unknown"} / ${
              event.token_y.name || "Unknown"
            }`;
            contractAddress = event.pair || ev.id.txDigest;
          } else if (event.coin_type_a && event.coin_type_b) {
            const symbolA = event.coin_type_a.split("::").pop() || "UNK";
            const symbolB = event.coin_type_b.split("::").pop() || "UNK";
            symbol = `${symbolA}/${symbolB}`;
            name = `${symbolA} / ${symbolB}`;
            contractAddress = event.pool_id || ev.id.txDigest;
          } else if (event.coin_type) {
            symbol = event.coin_type.split("::").pop() || "UNKNOWN";
            name = symbol;
            contractAddress = event.coin_type;
          } else if (event.pool_id) {
            symbol = `POOL_${event.pool_id.slice(-8)}`;
            name = `Pool ${event.pool_id.slice(-8)}`;
            contractAddress = event.pool_id;
          } else {
            // Fallback: use transaction digest
            symbol = `TX_${ev.id.txDigest.slice(-8)}`;
            name = `Transaction ${ev.id.txDigest.slice(-8)}`;
            contractAddress = ev.id.txDigest;
          }

          coins.push({
            id: `${contractAddress}-${ev.id.eventSeq}`,
            symbol,
            name,
            network: "sui",
            contractAddress,
            marketCap: 0,
            volume24h: 0,
            price: 0,
            priceChange24h: 0,
            launchTime: new Date(eventTime),
            dextoolsUrl: `https://www.dextools.io/app/en/sui/pair-explorer/${contractAddress}`,
            dexscreenerUrl: `https://dexscreener.com/sui/${contractAddress}`,
            verified: false,
          });
        } catch (eventError) {
          logger.warn("Failed to parse Sui event:", eventError);
          continue;
        }
      }

      return coins;
    } catch (error) {
      logger.warn(`Sui ${packageId}::${eventType} scan failed:`, error);
      return [];
    }
  }

  // Your original function - enhanced for better Sui detection
  async getRecentSuiPairs(): Promise<ApiResponse<CoinData[]>> {
    try {
      const now = Date.now();
      const thirtyMinutesAgo = now - 30 * 60 * 1000;

      logger.info(`🔍 Scanning Sui events from last 30 minutes...`);

      // Use proper Sui DEX package IDs and event types
      const dexPackages = [
        {
          packageId:
            "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb", // Cetus DEX
          events: ["PoolCreatedEvent", "AddLiquidityEvent"],
        },
        {
          packageId:
            "0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1", // Turbos DEX
          events: ["PoolCreated", "LiquidityAdded"],
        },
        {
          packageId:
            "0x886b3ff4623c7a9d101e0470012e0612621fbc67fa4cedddd3b17b273e35a50e", // Your factory
          events: ["PairCreated"],
        },
      ];

      const allCoins: CoinData[] = [];

      for (const dex of dexPackages) {
        for (const eventType of dex.events) {
          try {
            const coins = await this.scanSuiSpecificEvent(
              dex.packageId,
              eventType,
              thirtyMinutesAgo
            );
            allCoins.push(...coins);
            logger.info(
              `✅ ${dex.packageId.slice(0, 8)}...::${eventType}: ${
                coins.length
              } events`
            );
          } catch (eventError) {
            logger.warn(
              `Sui ${dex.packageId.slice(0, 8)}...::${eventType} scan failed:`,
              eventError
            );
          }
        }
      }

      const uniqueCoins = this.removeDuplicatesAndSort(allCoins);

      logger.info(`🎯 Sui tokens found: ${uniqueCoins.length}`);
      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ Sui Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan Sui network for new pairs.",
      };
    }
  }

  // Helper: Get factory pair creation logs
  private async getFactoryPairLogs(fromBlock: number, toBlock: number) {
    return await this.bnbProvider.getLogs({
      address: PANCAKESWAP_FACTORY_ADDRESS,
      fromBlock,
      toBlock,
      topics: [PAIR_CREATED_TOPIC],
    });
  }

  // Helper: Get liquidity addition logs from multiple routers
  private async getLiquidityLogs(fromBlock: number, toBlock: number) {
    const routers = [
      "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V2
      "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap V3
    ];

    const allLogs = [];

    for (const router of routers) {
      try {
        const [ethLogs, tokenLogs] = await Promise.allSettled([
          this.bnbProvider.getLogs({
            address: router,
            fromBlock,
            toBlock,
            topics: [ADD_LIQUIDITY_ETH_TOPIC],
          }),
          this.bnbProvider.getLogs({
            address: router,
            fromBlock,
            toBlock,
            topics: [ADD_LIQUIDITY_TOPIC],
          }),
        ]);

        if (ethLogs.status === "fulfilled") {
          allLogs.push(
            ...ethLogs.value.map((log) => ({ ...log, type: "addLiquidityETH" }))
          );
        }
        if (tokenLogs.status === "fulfilled") {
          allLogs.push(
            ...tokenLogs.value.map((log) => ({ ...log, type: "addLiquidity" }))
          );
        }
      } catch (routerError) {
        logger.warn(`Router ${router} failed:`, routerError);
      }
    }

    return allLogs;
  }

  // Helper: Get large transfer logs (potential new liquidity)
  private async getLargeTransferLogs(fromBlock: number, toBlock: number) {
    const logs = await this.bnbProvider.getLogs({
      fromBlock,
      toBlock,
      topics: [TRANSFER_TOPIC],
    });

    // Filter for potentially interesting transfers
    const filteredLogs = [];
    for (const log of logs.slice(-100)) {
      // Last 100 transfers only
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "address", "uint256"],
          log.data
        );
        const [from, to, amount] = decoded;

        // Skip minting/burning, look for large amounts
        if (from !== ethers.ZeroAddress && to !== ethers.ZeroAddress) {
          const amountNum = Number(ethers.formatEther(amount));
          if (amountNum > 100000) {
            // Large transfer threshold
            filteredLogs.push(log);
          }
        }
      } catch (e) {
        // Skip invalid transfers
      }
    }

    return filteredLogs;
  }

  // Decode factory pair creation log with flexible parameter handling
  private async decodeFactoryPairLog(log: any): Promise<CoinData | null> {
    try {
      // Check the actual data length to determine parameter count
      const dataLength = log.data.length;
      logger.info(`Factory log data length: ${dataLength}`);

      let decoded;
      let token0: string, token1: string, pair: string;

      if (dataLength === 128) {
        // 4 parameters (address, address, address, uint256)
        try {
          decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address", "uint256"],
            log.data
          );
          [token0, token1, pair] = decoded;
        } catch (e) {
          logger.warn("4-param decode failed, trying 3-param");
          decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address"],
            log.data
          );
          [token0, token1, pair] = decoded;
        }
      } else if (dataLength === 96) {
        // 3 parameters (address, address, address)
        decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "address", "address"],
          log.data
        );
        [token0, token1, pair] = decoded;
      } else if (dataLength === 64) {
        // 2 parameters (address, address) - pair might be in topics
        decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "address"],
          log.data
        );
        [token0, token1] = decoded;

        // Try to get pair address from topics or transaction receipt
        try {
          const receipt = await this.bnbProvider.getTransactionReceipt(
            log.transactionHash
          );
          // Look for the pair address in other logs or events
          pair =
            (receipt as TransactionReceipt).logs.find(
              (l) => l.address !== PANCAKESWAP_FACTORY_ADDRESS
            )?.address || log.address;
        } catch (e) {
          // If we can't find pair address, skip this log
          logger.warn("Could not determine pair address for 2-param event");
          return null;
        }
      } else {
        logger.warn(`Unexpected data length: ${dataLength}, skipping log`);
        return null;
      }

      const tokenInfo = await this.getTokenInfoSafely(token0, token1);
      if (!tokenInfo) return null;

      const block = await this.bnbProvider.getBlock(log.blockNumber);

      return {
        id: `${pair.toLowerCase()}`,
        symbol: `${tokenInfo.token0Symbol}/${tokenInfo.token1Symbol}`,
        name: `${tokenInfo.token0Name} / ${tokenInfo.token1Name}`,
        network: "bnb",
        contractAddress: pair.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${pair}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${pair}`,
        verified: false,
      };
    } catch (error) {
      logger.warn("Failed to decode factory pair log:", error);
      return null;
    }
  }

  // Decode liquidity addition log
  private async decodeLiquidityLog(log: any): Promise<CoinData | null> {
    try {
      let tokenAddress: string | null = null;

      if (log.type === "addLiquidityETH") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "uint256", "uint256", "uint256", "address", "uint256"],
          log.data
        );
        tokenAddress = decoded[0];
      } else if (log.type === "addLiquidity") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          [
            "address",
            "address",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "address",
            "uint256",
          ],
          log.data
        );

        const [tokenA, tokenB] = decoded;
        const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaeBF2De08d9173bc095c";

        if (tokenA.toLowerCase() === WBNB_ADDRESS.toLowerCase()) {
          tokenAddress = tokenB;
        } else if (tokenB.toLowerCase() === WBNB_ADDRESS.toLowerCase()) {
          tokenAddress = tokenA;
        }
      }

      if (!tokenAddress) return null;

      const tokenInfo = await this.getEnhancedTokenInfo(tokenAddress);
      if (!tokenInfo) return null;

      const block = await this.bnbProvider.getBlock(log.blockNumber);

      return {
        id: `${tokenAddress.toLowerCase()}-${log.transactionHash}`,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        network: "bnb",
        contractAddress: tokenAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${tokenAddress}`,
        totalSupply: tokenInfo.totalSupply,
        verified: false,
        liquidity: 0, // Could calculate from log data
        risk: {
          score: 50,
          factors: ["New token"],
        },
      };
    } catch (error) {
      logger.warn("Failed to decode liquidity log:", error);
      return null;
    }
  }

  // Decode transfer log
  private async decodeTransferLog(log: any): Promise<CoinData | null> {
    try {
      const tokenAddress = log.address;
      const tokenInfo = await this.getEnhancedTokenInfo(tokenAddress);
      if (!tokenInfo) return null;

      const block = await this.bnbProvider.getBlock(log.blockNumber);

      return {
        id: `${tokenAddress.toLowerCase()}-transfer-${log.transactionHash}`,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        network: "bnb",
        contractAddress: tokenAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${tokenAddress}`,
        totalSupply: tokenInfo.totalSupply,
        verified: false,
        risk: {
          score: 60,
          factors: ["New token", "Large transfer detected"],
        },
      };
    } catch (error) {
      logger.warn("Failed to decode transfer log:", error);
      return null;
    }
  }

  // Scan specific Sui event type
  private async scanSuiEventType(
    eventType: string,
    thirtyMinutesAgo: number
  ): Promise<CoinData[]> {
    try {
      const result = await this.suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
      });

      const coins: CoinData[] = [];

      for (const ev of result.data) {
        try {
          const eventTime = ev.timestampMs || Date.now();
          if ((eventTime as number) < thirtyMinutesAgo) continue;

          const event = ev.parsedJson as any;
          let symbol = "UNKNOWN";
          let name = "Unknown Token";

          if (event.token_x && event.token_y) {
            symbol = `${event.token_x.symbol}/${event.token_y.symbol}`;
            name = `${event.token_x.name} / ${event.token_y.name}`;
          } else if (event.coin_type) {
            symbol = event.coin_type.split("::").pop() || "UNKNOWN";
            name = symbol;
          }

          const pairObjectId = event.pair || ev.id.txDigest;

          coins.push({
            id: pairObjectId,
            symbol,
            name,
            network: "sui",
            contractAddress: pairObjectId,
            marketCap: 0,
            volume24h: 0,
            price: 0,
            priceChange24h: 0,
            launchTime: new Date(eventTime),
            dextoolsUrl: `https://www.dextools.io/app/en/sui/pair-explorer/${pairObjectId}`,
            dexscreenerUrl: `https://dexscreener.com/sui/${pairObjectId}`,
            verified: false,
          });
        } catch (eventError) {
          continue;
        }
      }

      return coins;
    } catch (error) {
      logger.warn(`Sui ${eventType} scan failed:`, error);
      return [];
    }
  }

  // Get enhanced token information
  private async getEnhancedTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const tokenAbi = [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
      ];

      const tokenContract = new ethers.Contract(
        tokenAddress,
        tokenAbi,
        this.bnbProvider
      );

      const results = await Promise.allSettled([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply(),
      ]);

      const allSucceeded = results.every(
        (result) => result.status === "fulfilled"
      );
      if (!allSucceeded) return null;

      const [name, symbol, decimals, totalSupply] = results.map(
        (result: any) => result.value
      );

      if (!symbol || !name) return null;

      return {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: Number(ethers.formatUnits(totalSupply, decimals)),
      };
    } catch (error) {
      return null;
    }
  }

  // Get basic token info (your original method)
  private async getTokenInfoSafely(
    token0: string,
    token1: string
  ): Promise<any> {
    try {
      const tokenAbi = [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
      ];

      const token0Contract = new ethers.Contract(
        token0,
        tokenAbi,
        this.bnbProvider
      );
      const token1Contract = new ethers.Contract(
        token1,
        tokenAbi,
        this.bnbProvider
      );

      const results = await Promise.allSettled([
        token0Contract.name(),
        token0Contract.symbol(),
        token1Contract.name(),
        token1Contract.symbol(),
      ]);

      const allSucceeded = results.every(
        (result) => result.status === "fulfilled"
      );
      if (!allSucceeded) return null;

      const [token0Name, token0Symbol, token1Name, token1Symbol] = results.map(
        (result: any) => result.value
      );

      if (!token0Symbol || !token1Symbol || !token0Name || !token1Name)
        return null;

      return { token0Name, token0Symbol, token1Name, token1Symbol };
    } catch (error) {
      return null;
    }
  }

  // Remove duplicates and sort by newest first
  private removeDuplicatesAndSort(coins: CoinData[]): CoinData[] {
    const uniqueCoins = coins.filter(
      (coin, index, arr) =>
        arr.findIndex((c) => c.contractAddress === coin.contractAddress) ===
        index
    );

    return uniqueCoins.sort(
      (a, b) => b.launchTime.getTime() - a.launchTime.getTime()
    );
  }

  // Debug method (your original)
  async debugLogData(): Promise<void> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      const fromBlock = latestBlock - 10;

      logger.info(
        `🔍 Debugging logs from blocks ${fromBlock} to ${latestBlock}`
      );

      const logs = await this.bnbProvider.getLogs({
        address: PANCAKESWAP_FACTORY_ADDRESS,
        fromBlock,
        toBlock: latestBlock,
        topics: [PAIR_CREATED_TOPIC],
      });

      for (const log of logs.slice(0, 3)) {
        logger.info("Raw log data:", {
          address: log.address,
          topics: log.topics,
          data: log.data,
          dataLength: log.data.length,
        });

        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address", "uint256"],
            log.data
          );
          logger.info("Decoded successfully:", decoded);
        } catch (e: any) {
          logger.info("Decode failed:", e.message);
        }
      }
    } catch (error) {
      logger.error("Debug failed:", error);
    }
  }
}
