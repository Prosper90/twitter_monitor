import cron from "node-cron";
import { MonitoringService } from "../services/MonitoringService";
import { TweetService } from "../services/TweetService";
import { logger } from "../utils/logger";

export class Scheduler {
  private monitoringService: MonitoringService;
  private tweetService: TweetService;

  constructor() {
    this.monitoringService = new MonitoringService();
    this.tweetService = new TweetService();
  }

  start(): void {
    logger.info("Starting scheduler...");

    // Monitor new coin launches every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
      try {
        await this.monitoringService.monitorNewLaunches();
      } catch (error) {
        logger.error("Error in coin launch monitoring:", error);
      }
    });

    // Monitor news every 15 minutes
    cron.schedule("*/15 * * * *", async () => {
      try {
        await this.monitoringService.monitorNews();
      } catch (error) {
        logger.error("Error in news monitoring:", error);
      }
    });

    // Process and post tweets every 2 minutes
    cron.schedule("*/20 * * * *", async () => {
      try {
        await this.tweetService.processPendingTweets();
      } catch (error) {
        logger.error("Error in tweet processing:", error);
      }
    });

    // Health check every hour
    cron.schedule("0 * * * *", async () => {
      try {
        const isTwitterConnected =
          await this.tweetService.verifyTwitterConnection();
        if (!isTwitterConnected) {
          logger.error("Twitter connection lost!");
        }
        logger.info("Health check completed");
      } catch (error) {
        logger.error("Error in health check:", error);
      }
    });

    logger.info("Scheduler started successfully");
  }
}
