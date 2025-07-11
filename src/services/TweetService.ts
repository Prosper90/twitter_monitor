import { TwitterClient } from "../config/twitter";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { Tweet, ITweet } from "../models/Tweet";
import { TweetData } from "../types";
import { logger } from "../utils/logger";

export class TweetService {
  private twitter: TwitterClient;

  constructor() {
    this.twitter = new TwitterClient();
  }

  async processPendingTweets(): Promise<void> {
    logger.info("Processing pending tweets...");

    // Process new coin launches
    await this.processNewCoinTweets();

    // Process news tweets
    await this.processNewsTweets();
  }

  private async processNewCoinTweets(): Promise<void> {
    const unpostedCoins = await Coin.find({ isPosted: false })
      .sort({ launchTime: -1 })
      .limit(5);

    for (const coin of unpostedCoins) {
      try {
        const tweetContent = this.generateCoinLaunchTweet(coin);
        const tweetId = await this.twitter.tweet(tweetContent);

        if (tweetId) {
          // Save tweet record
          const tweet = new Tweet({
            content: tweetContent,
            coinId: coin.id,
            type: "launch",
            tweetId,
            isPosted: true,
            postedAt: new Date(),
          });
          await tweet.save();

          // Mark coin as posted
          coin.isPosted = true;
          await coin.save();

          logger.info(`Tweet posted for coin: ${coin.symbol}`);
        }
      } catch (error) {
        logger.error(`Error posting tweet for coin ${coin.symbol}:`, error);
      }
    }
  }

  private async processNewsTweets(): Promise<void> {
    const unpostedNews = await News.find({ isPosted: false })
      .sort({ publishedAt: -1 })
      .limit(3);

    for (const news of unpostedNews) {
      try {
        const tweetContent = this.generateNewsTweet(news);
        const tweetId = await this.twitter.tweet(tweetContent);

        if (tweetId) {
          // Save tweet record
          const tweet = new Tweet({
            content: tweetContent,
            newsId: news.id,
            type: "news",
            tweetId,
            isPosted: true,
            postedAt: new Date(),
          });
          await tweet.save();

          // Mark news as posted
          news.isPosted = true;
          await news.save();

          logger.info(`News tweet posted: ${news.title}`);
        }
      } catch (error) {
        logger.error(`Error posting news tweet:`, error);
      }
    }
  }

  private generateCoinLaunchTweet(coin: ICoin): string {
    const networkEmoji = coin.network === "sui" ? "🌊" : "🚀";
    const priceChangeEmoji = coin.priceChange24h >= 0 ? "📈" : "📉";

    let tweet = `${networkEmoji} NEW LAUNCH ALERT!\n\n`;
    tweet += `💎 ${coin.name} ($${coin.symbol})\n`;
    tweet += `🏷️ ${coin.network.toUpperCase()} Network\n`;
    tweet += `💰 Price: $${coin.price.toFixed(6)}\n`;
    tweet += `📊 Market Cap: $${this.formatNumber(coin.marketCap)}\n`;
    tweet += `📈 24h Volume: $${this.formatNumber(coin.volume24h)}\n`;
    tweet += `${priceChangeEmoji} 24h Change: ${coin.priceChange24h.toFixed(
      2
    )}%\n\n`;

    if (coin.dexscreenerUrl) {
      tweet += `📊 DexScreener: ${coin.dexscreenerUrl}\n`;
    }

    tweet += `\n#${coin.network.toUpperCase()}Network #CryptoLaunch #DeFi #NewToken`;

    return tweet;
  }

  private generateNewsTweet(news: INews): string {
    const networkEmoji = news.network === "sui" ? "🌊" : "🚀";

    let tweet = `${networkEmoji} CRYPTO NEWS ALERT!\n\n`;
    tweet += `📰 ${news.title}\n\n`;
    tweet += `🪙 ${news.coinSymbol.toUpperCase()}\n`;
    tweet += `🏷️ ${news.network.toUpperCase()} Network\n`;
    tweet += `📅 ${news.publishedAt.toLocaleDateString()}\n\n`;
    tweet += `🔗 ${news.url}\n\n`;
    tweet += `#${news.network.toUpperCase()}Network #CryptoNews #${news.coinSymbol.toUpperCase()}`;

    return tweet;
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(2);
  }

  async verifyTwitterConnection(): Promise<boolean> {
    return await this.twitter.verifyCredentials();
  }
}
