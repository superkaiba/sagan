/**
 * One-shot: run the lit-review job once and exit. Useful for seeding
 * lit_inbox without waiting for the 06:00 cron.
 */
import '../src/env.js';
import { close } from '../src/db.js';
import { runLitReview } from '../src/jobs/lit-review.js';

async function main() {
  await runLitReview();
  await close();
}

main().catch(async (err) => {
  console.error(err);
  await close();
  process.exit(1);
});
