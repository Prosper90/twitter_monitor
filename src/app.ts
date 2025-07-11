import express from "express";
import { logger } from "./utils/logger";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API endpoints for monitoring
app.get("/api/coins", async (req, res) => {
  try {
    const { Coin } = await import("@/models/Coin");
    const coins = await Coin.find().sort({ createdAt: -1 }).limit(20);
    res.json(coins);
  } catch (error) {
    logger.error("Error fetching coins:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const { News } = await import("@/models/News");
    const news = await News.find().sort({ publishedAt: -1 }).limit(20);
    res.json(news);
  } catch (error) {
    logger.error("Error fetching news:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tweets", async (req, res) => {
  try {
    const { Tweet } = await import("@/models/Tweet");
    const tweets = await Tweet.find().sort({ createdAt: -1 }).limit(20);
    res.json(tweets);
  } catch (error) {
    logger.error("Error fetching tweets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Error handling middleware
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
);

export { app };
