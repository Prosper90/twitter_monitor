import { DexScreenerService } from "./DexScreenerService";
import { CoinMarketCapService } from "./CoinMarketCapService";
import { CoinGeckoService } from "./CoinGeckoService";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { CoinData, NewsItem } from "../types";
import { logger } from "../utils/logger";

export class MonitoringService {
  private dexScreener: DexScreenerService;
  private coinMarketCap: CoinMarketCapService;
  private coinGecko: CoinGeckoService;

  constructor() {
    this.dexScreener = new DexScreenerService();
    this.coinMarketCap = new CoinMarketCapService();
    this.coinGecko = new CoinGeckoService();
  }

  async monitorNewLaunches(): Promise<void> {
    logger.info("Starting new coin launch monitoring...");

    const networks: ("sui" | "bnb")[] = ["sui", "bnb"];

    for (const network of networks) {
      await this.monitorNetworkLaunches(network);
    }
  }

  private async monitorNetworkLaunches(network: "sui" | "bnb"): Promise<void> {
    try {
      // Get data from all sources
      const [dexScreenerResult, cmcResult] = await Promise.all([
        this.dexScreener.getNewTokens(network),
        this.coinMarketCap.getNewListings(),
      ]);

      //geckoResult
      //this.coinGecko.getNewCoins(),

      const allCoins: CoinData[] = [];

      if (dexScreenerResult.success && dexScreenerResult.data) {
        allCoins.push(
          ...dexScreenerResult.data.filter((coin) => coin.network === network)
        );
      }

      if (cmcResult.success && cmcResult.data) {
        allCoins.push(
          ...cmcResult.data.filter((coin) => coin.network === network)
        );
      }

      //   if (geckoResult.success && geckoResult.data) {
      //     allCoins.push(
      //       ...geckoResult.data.filter((coin) => coin.network === network)
      //     );
      //   }

      // Filter and save new coins
      const filteredCoins = this.filterCoins(allCoins);
      await this.saveNewCoins(filteredCoins);

      logger.info(
        `Processed ${filteredCoins.length} coins for ${network} network`
      );
    } catch (error) {
      logger.error(`Error monitoring ${network} launches:`, error);
    }
  }

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
            `New coin saved: ${coinData.symbol} (${coinData.network})`
          );
        }
      } catch (error) {
        logger.error(`Error saving coin ${coinData.symbol}:`, error);
      }
    }
  }

  async monitorNews(): Promise<void> {
    logger.info("Starting news monitoring...");

    const recentCoins = await Coin.find({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    }).limit(20);

    for (const coin of recentCoins) {
      try {
        const newsResult = await this.coinGecko.getNewsForCoin(coin.id);

        if (newsResult.success && newsResult.data) {
          await this.saveNews(newsResult.data, coin.network);
        }
      } catch (error) {
        logger.error(`Error fetching news for coin ${coin.symbol}:`, error);
      }
    }
  }

  private async saveNews(
    newsItems: NewsItem[],
    network: "sui" | "bnb"
  ): Promise<void> {
    for (const newsItem of newsItems) {
      try {
        const existingNews = await News.findOne({ id: newsItem.id });

        if (!existingNews) {
          const news = new News({
            ...newsItem,
            network,
          });
          await news.save();
          logger.info(`New news saved: ${newsItem.title}`);
        }
      } catch (error) {
        logger.error(`Error saving news ${newsItem.title}:`, error);
      }
    }
  }
}
