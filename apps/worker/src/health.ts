import { REDIS_CONNECTION } from "@repo/shared";
import { Queue } from "bullmq";
import { createLogger } from "./lib/logger";

const log = createLogger({ module: "health" });

const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 9090);
const pingQueue = new Queue("_health", {
  connection: REDIS_CONNECTION,
});

let server: ReturnType<typeof Bun.serve> | null = null;

export function startHealthServer(): void {
  server = Bun.serve({
    port: HEALTH_PORT,
    fetch: async () => {
      try {
        const client = await pingQueue.client;
        await client.ping();
        return Response.json({ status: "ok" });
      } catch {
        return Response.json(
          { status: "error", message: "Redis unreachable" },
          { status: 503 },
        );
      }
    },
  });

  log.info({ port: HEALTH_PORT }, "Health check server started");
}

export async function stopHealthServer(): Promise<void> {
  await pingQueue.close();
  server?.stop();
}
