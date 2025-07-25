import { logger } from "../utils/logger";
import { MonitoringService } from "@/services/MonitoringService";
import { TweetService } from "@/services/TweetService";

class SchedulerController {
  private monitoringService: MonitoringService;
  private tweetService: TweetService;

  constructor() {
    this.monitoringService = new MonitoringService();
    this.tweetService = new TweetService();
  }

  // Monitor new coin launches every 5 minutes
  monitorCoin = async () => {
    try {
      await this.monitoringService.monitorNewLaunches();
    } catch (error) {
      logger.error("Error in coin launch monitoring:", error);
    }
  };

  // Monitor news every 15 minutes
  monitorNews = async () => {
    try {
      await this.monitoringService.monitorNews();
    } catch (error) {
      logger.error("Error in news monitoring:", error);
    }
  };

  // Process and post tweets every 2 minutes
  processTweet = async () => {
    try {
      await this.tweetService.processPendingTweets();
    } catch (error) {
      logger.error("Error in tweet processing:", error);
    }
  };

  // Health check every hour
  checkHealth = async () => {
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
  };
}

export default new SchedulerController();
