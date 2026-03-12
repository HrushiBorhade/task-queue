import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, WORKER_DEFAULTS, tasks } from "@repo/shared";
import type { TaskJobPayload, ImageGenOutput } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "image-gen" });

const STORAGE_BUCKET = "generated-images";

/**
 * Classify HTTP status codes into actionable categories:
 * - retryable: transient server errors, rate limits — worth retrying
 * - fatal: client errors (bad request, not found) — retrying won't help
 * - ok: success
 */
function classifyStatus(status: number): "ok" | "retryable" | "fatal" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "retryable"; // rate limited
  if (status >= 500) return "retryable"; // server error
  return "fatal"; // 4xx client errors — bad prompt, auth, etc.
}

/**
 * Try Pollinations AI (real generation) → fall back to Lorem Picsum (random photo).
 * Pollinations free tier is flaky (500s, 429s), so we retry transient errors
 * but bail immediately on fatal (4xx) responses.
 */
async function fetchImageWithFallback(
  prompt: string,
  taskId: string,
  logger: typeof log
): Promise<Response> {
  const encoded = encodeURIComponent(prompt);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;

  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(pollinationsUrl);
      const classification = classifyStatus(res.status);

      if (classification === "ok") {
        logger.info({ taskId, source: "pollinations" }, "Image fetched from Pollinations");
        return res;
      }

      if (classification === "fatal") {
        logger.error({ taskId, status: res.status }, "Pollinations returned fatal error, skipping retries");
        break; // don't retry 4xx — go straight to fallback
      }

      // retryable (429, 5xx)
      logger.warn({ taskId, status: res.status, attempt: i + 1 }, "Pollinations transient error, retrying");
    } catch (err) {
      // Network failure (DNS, timeout, connection reset) — retryable
      logger.warn({ taskId, err, attempt: i + 1 }, "Pollinations fetch threw");
    }
    if (i < 1) await new Promise((r) => setTimeout(r, 2000));
  }

  // Fallback: Lorem Picsum — deterministic seed from prompt so same prompt = same image
  logger.info({ taskId, source: "picsum" }, "Falling back to Lorem Picsum");
  const seed = prompt.slice(0, 50).replace(/\s+/g, "-");
  const picsumUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1024/1024`;
  const res = await fetch(picsumUrl, { redirect: "follow" });

  const fallbackClass = classifyStatus(res.status);
  if (fallbackClass !== "ok") {
    throw new Error(`Both Pollinations and Picsum failed (Picsum: ${res.status})`);
  }
  return res;
}

export function createImageGenWorker() {
  const config = QUEUE_CONFIGS.image_gen;

  const worker = new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, userId, input } = job.data;
      let batchId: string | null = null;
      const tracker = new ProgressTracker(job, taskId, userId);

      try {
        const [task] = await db
          .update(tasks)
          .set({
            status: "active",
            attempt: job.attemptsMade + 1,
            startedAt: new Date(),
            bullmqJobId: job.id,
          })
          .where(eq(tasks.id, taskId))
          .returning();

        batchId = task?.batchId ?? null;

        // Step 1: Fetch image — try Pollinations AI first, fall back to Picsum
        await tracker.broadcastStep("Generating image with AI");
        tracker.updateProgress(10);

        const imageResponse = await fetchImageWithFallback(input.prompt, taskId, log);

        tracker.updateProgress(50);
        await tracker.broadcastStep("Uploading to storage");

        // Step 2: Get image bytes and upload to Supabase Storage
        const imageBuffer = await imageResponse.arrayBuffer();
        const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
        const ext = contentType.includes("png") ? "png" : "jpg";
        const storagePath = `${taskId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, imageBuffer, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        tracker.updateProgress(80);
        await tracker.broadcastStep("Finalizing");

        // Step 3: Get public URL
        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        const output: ImageGenOutput = {
          image_url: urlData.publicUrl,
          prompt: input.prompt,
        };

        // Step 4: Complete
        tracker.complete();
        await db
          .update(tasks)
          .set({
            status: "completed",
            progress: 100,
            output,
            completedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        log.info({ taskId, storagePath }, "Image generated and stored");
        return output;
      } catch (error) {
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        log.error({ taskId, error, attempt: job.attemptsMade + 1, isLastAttempt }, "Image generation failed");

        if (isLastAttempt) {
          await db
            .update(tasks)
            .set({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            })
            .where(eq(tasks.id, taskId));

          if (batchId) {
            await supabase.rpc("increment_batch_completed", {
              p_batch_id: batchId,
            });
          }
        }

        throw error;
      } finally {
        await tracker.destroy();
      }
    },
    {
      connection: REDIS_CONNECTION,
      concurrency: config.concurrency,
      limiter: config.rateLimit,
      ...WORKER_DEFAULTS,
    },
  );

  worker.on("error", (err) => {
    log.error({ err }, "Worker error");
  });

  return worker;
}
