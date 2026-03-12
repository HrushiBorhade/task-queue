import { Hono } from "hono";
import { Queue } from "bullmq";
import { createLogger } from "./lib/logger";

const log = createLogger({ module: "bull-board" });
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "hono/bun";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const BULL_BOARD_PORT = Number(process.env.BULL_BOARD_PORT ?? 9091);

const boardQueues: Queue[] = [];
for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
  boardQueues.push(new Queue(config.name, { connection: REDIS_CONNECTION }));
}

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: boardQueues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = new Hono();
app.route("/admin/queues", serverAdapter.registerPlugin());

let server: ReturnType<typeof Bun.serve> | null = null;

export function startBullBoard(): void {
  server = Bun.serve({
    port: BULL_BOARD_PORT,
    fetch: app.fetch,
  });

  log.info({ port: BULL_BOARD_PORT, path: "/admin/queues" }, "Bull Board UI started");
}

export async function stopBullBoard(): Promise<void> {
  await Promise.all(boardQueues.map((q) => q.close()));
  server?.stop();
}
