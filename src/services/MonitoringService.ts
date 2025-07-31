import { DexScreenerService } from "./DexScreenerService";
import { CoinMarketCapService } from "./CoinMarketCapService";
import { EnhancedCryptoNewsService } from "./EnhancedCryptoNewsService";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { CoinData, NewsItem } from "../types";
import { logger } from "../utils/logger";
import { OnchainPairScannerService } from "./OnchainPairScannerService ";

export class MonitoringService {
  //   private dexScreener: DexScreenerService;
  //   private coinMarketCap: CoinMarketCapService;

  private onchainScanner: OnchainPairScannerService;
  private enhancedNewsService: EnhancedCryptoNewsService;

  constructor() {
    // this.dexScreener = new DexScreenerService();
    // this.coinMarketCap = new CoinMarketCapService();
    this.onchainScanner = new OnchainPairScannerService();
    this.enhancedNewsService = new EnhancedCryptoNewsService();
  }

  async monitorNewLaunches(): Promise<void> {
    logger.info("🚀 Starting new coin launch monitoring...");

    const networks: ("sui" | "bnb")[] = ["sui", "bnb"];

    for (const network of networks) {
      await this.monitorNetworkLaunches(network);
    }
  }

  private async monitorNetworkLaunches(network: "sui" | "bnb"): Promise<void> {
    try {
      const result =
        network === "bnb"
          ? await this.onchainScanner.getRecentBNBPairCreations()
          : await this.onchainScanner.getRecentSuiPairs();

      if (!result.success || !result.data) {
        logger.warn(`⚠️ No tokens found on ${network}: ${result.error}`);
        return;
      }

      const filteredCoins = this.filterCoins(result.data);
      await this.saveNewCoins(filteredCoins);

      logger.info(`✅ Saved ${filteredCoins.length} new coins from ${network}`);
    } catch (error) {
      logger.error(`❌ Failed to monitor ${network}:`, error);
    }
  }

  //   private async monitorNetworkLaunches(network: "sui" | "bnb"): Promise<void> {
  //     try {
  //       const [dexScreenerResult, cmcResult] = await Promise.all([
  //         this.dexScreener.getNewTokens(network),
  //         this.coinMarketCap.getNewListings(),
  //       ]);

  //       const allCoins: CoinData[] = [];

  //       if (dexScreenerResult.success && dexScreenerResult.data) {
  //         allCoins.push(
  //           ...dexScreenerResult.data.filter((coin) => coin.network === network)
  //         );
  //       }

  //       if (cmcResult.success && cmcResult.data) {
  //         allCoins.push(
  //           ...cmcResult.data.filter((coin) => coin.network === network)
  //         );
  //       }

  //       const filteredCoins = this.filterCoins(allCoins);
  //       await this.saveNewCoins(filteredCoins);

  //       logger.info(
  //         `✅ Processed ${filteredCoins.length} coins for ${network} network`
  //       );
  //     } catch (error) {
  //       logger.error(`❌ Error monitoring ${network} launches:`, error);
  //     }
  //   }

  private filterCoins(coins: CoinData[]): CoinData[] {
    const minMarketCap = parseInt(process.env.MIN_MARKET_CAP || "10000");
    const minVolume = parseInt(process.env.MIN_VOLUME_24H || "1000");

    return coins.filter(
      (coin) =>
        coin.marketCap >= minMarketCap &&
        coin.volume24h >= minVolume &&
        coin.contractAddress &&
        coin.symbol &&
        coin.name
    );
  }

  private async saveNewCoins(coins: CoinData[]): Promise<void> {
    for (const coinData of coins) {
      try {
        const existingCoin = await Coin.findOne({
          contractAddress: coinData.contractAddress,
          network: coinData.network,
        });

        if (!existingCoin) {
          const coin = new Coin(coinData);
          await coin.save();
          logger.info(
            `🆕 New coin saved: ${coinData.symbol} (${coinData.network})`
          );
        }
      } catch (error) {
        logger.error(`❌ Error saving coin ${coinData.symbol}:`, error);
      }
    }
  }

  async monitorNews(): Promise<void> {
    logger.info("📰 Starting enhanced crypto news monitoring...");

    try {
      const newsResult = await this.enhancedNewsService.getAllNews();

      if (newsResult.success && newsResult.data) {
        const { general, sui, combined } = newsResult.data;

        // Save general crypto news
        if (general.length > 0) {
          await this.saveNews(general);
          logger.info(`✅ Saved ${general.length} general crypto news items`);
        }

        // Save SUI-specific news
        if (sui.length > 0) {
          await this.saveNews(sui);
          logger.info(`✅ Saved ${sui.length} SUI-specific news items`);
        }

        logger.info(`📊 Total news items processed: ${combined.length}`);
        logger.info(
          `📈 General news: ${general.length} | SUI news: ${sui.length}`
        );
      } else {
        logger.warn(`⚠️ Enhanced news service failed: ${newsResult.error}`);
      }
    } catch (error) {
      logger.error("❌ Error fetching news from enhanced service:", error);
    }
  }

  // Alternative method to monitor only SUI news if needed
  async monitorSuiNews(): Promise<void> {
    logger.info("📰 Starting SUI-specific news monitoring...");

    try {
      const newsResult = await this.enhancedNewsService.getSuiNews();

      if (newsResult.success && newsResult.data) {
        await this.saveNews(newsResult.data);
        logger.info(`✅ Saved ${newsResult.data.length} SUI news items`);
      } else {
        logger.warn(`⚠️ SUI news monitoring failed: ${newsResult.error}`);
      }
    } catch (error) {
      logger.error("❌ Error fetching SUI news:", error);
    }
  }

  // Alternative method to monitor only general crypto news if needed
  async monitorGeneralNews(): Promise<void> {
    logger.info("📰 Starting general crypto news monitoring...");

    try {
      const newsResult = await this.enhancedNewsService.getCryptoPanicNews();

      if (newsResult.success && newsResult.data) {
        await this.saveNews(newsResult.data);
        logger.info(
          `✅ Saved ${newsResult.data.length} general crypto news items`
        );
      } else {
        logger.warn(`⚠️ General news monitoring failed: ${newsResult.error}`);
      }
    } catch (error) {
      logger.error("❌ Error fetching general crypto news:", error);
    }
  }

  private async saveNews(newsItems: NewsItem[]): Promise<void> {
    let savedCount = 0;
    let skippedCount = 0;

    for (const newsItem of newsItems) {
      try {
        const existingNews = await News.findOne({
          title: newsItem.title.trim(),
        });

        if (existingNews) {
          skippedCount++;
          logger.info(
            `⚠️ Duplicate news skipped: ${newsItem.title.substring(0, 50)}...`
          );
          continue;
        }

        const news = new News(newsItem);
        await news.save();
        savedCount++;
        logger.info(
          `🆕 News saved: ${newsItem.title} [${newsItem.source}] [${newsItem.network}]`
        );
      } catch (error) {
        logger.error(`❌ Error saving news "${newsItem.title}":`, error);
      }
    }

    if (skippedCount > 0) {
      logger.info(`📝 Skipped ${skippedCount} duplicate news items`);
    }

    logger.info(
      `💾 News save summary: ${savedCount} new, ${skippedCount} duplicates`
    );
  }

  // Method to run comprehensive monitoring (coins + news)
  async runFullMonitoring(): Promise<void> {
    logger.info("🔄 Starting comprehensive monitoring cycle...");

    try {
      // Monitor new coin launches
      await this.monitorNewLaunches();

      // Monitor news from all sources
      await this.monitorNews();

      logger.info("✅ Comprehensive monitoring cycle completed successfully");
    } catch (error) {
      logger.error("❌ Error during comprehensive monitoring:", error);
    }
  }

  // Method for targeted monitoring with options
  async runCustomMonitoring(options: {
    includeCoins?: boolean;
    includeGeneralNews?: boolean;
    includeSuiNews?: boolean;
    networks?: ("sui" | "bnb")[];
  }): Promise<void> {
    const {
      includeCoins = true,
      includeGeneralNews = true,
      includeSuiNews = true,
      networks = ["sui", "bnb"],
    } = options;

    logger.info("🎯 Starting custom monitoring with options:", options);

    try {
      if (includeCoins) {
        for (const network of networks) {
          await this.monitorNetworkLaunches(network);
        }
      }

      if (includeGeneralNews && includeSuiNews) {
        // Get both general and SUI news
        await this.monitorNews();
      } else if (includeGeneralNews) {
        // Get only general news
        await this.monitorGeneralNews();
      } else if (includeSuiNews) {
        // Get only SUI news
        await this.monitorSuiNews();
      }

      logger.info("✅ Custom monitoring completed successfully");
    } catch (error) {
      logger.error("❌ Error during custom monitoring:", error);
    }
  }
}
