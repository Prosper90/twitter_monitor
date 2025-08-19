import dotenv from "dotenv";
import { app } from "./app";
import { connectDatabase } from "./config/database";
import { Scheduler } from "./scheduler";
import { logger } from "./utils/logger";

// Load environment variables
dotenv.config();

async function bootstrap(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize scheduler
    // const scheduler = new Scheduler();
    // scheduler.start();

    // Start server
    const PORT = process.env.PORT || 3200;
    console.log(process.env.BNB_RPC_URL, "Shortttttttyyy");
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received, shutting down gracefully");
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT received, shutting down gracefully");
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

bootstrap();
