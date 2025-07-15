import { DexScreenerService } from "./DexScreenerService";
import { CoinMarketCapService } from "./CoinMarketCapService";
import { CryptoPanicService } from "./CryptoPanicService";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { CoinData, NewsItem } from "../types";
import { logger } from "../utils/logger";
import { OnchainPairScannerService } from "./OnchainPairScannerService ";

export class MonitoringService {
  //   private dexScreener: DexScreenerService;
  //   private coinMarketCap: CoinMarketCapService;

  private onchainScanner: OnchainPairScannerService;
  private cryptoPanic: CryptoPanicService;

  constructor() {
    // this.dexScreener = new DexScreenerService();
    // this.coinMarketCap = new CoinMarketCapService();
    this.onchainScanner = new OnchainPairScannerService();
    this.cryptoPanic = new CryptoPanicService();
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
    logger.info("📰 Starting CryptoPanic news monitoring...");

    try {
      const newsResult = await this.cryptoPanic.getLatestNews();
      if (newsResult.success && newsResult.data) {
        await this.saveNews(newsResult.data);
        logger.info(
          `✅ Saved ${newsResult.data.length} CryptoPanic news items`
        );
      } else {
        logger.warn(`⚠️ CryptoPanic API failed: ${newsResult.error}`);
      }
    } catch (error) {
      logger.error("❌ Error fetching news from CryptoPanic:", error);
    }
  }

  private async saveNews(newsItems: NewsItem[]): Promise<void> {
    for (const newsItem of newsItems) {
      try {
        const existingNews = await News.findOne({ id: newsItem.id });

        if (!existingNews) {
          const news = new News(newsItem);
          await news.save();
          logger.info(`🆕 News saved: ${newsItem.title}`);
        }
      } catch (error) {
        logger.error(`❌ Error saving news ${newsItem.title}:`, error);
      }
    }
  }
}
