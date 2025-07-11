export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  network: "sui" | "bnb";
  contractAddress: string;
  marketCap: number;
  volume24h: number;
  price: number;
  priceChange24h: number;
  launchTime: Date;
  dexscreenerUrl?: string;
  coinmarketcapUrl?: string;
  coingeckoUrl?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  coinSymbol: string;
  network: "sui" | "bnb";
  source: string;
}

export interface TweetData {
  content: string;
  coinId?: string;
  newsId?: string;
  type: "launch" | "news";
  scheduledFor?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
