/** Resumes queued AI jobs once per server process (Node.js runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recoverJobs } = await import("./server/services/specs");
  recoverJobs();
}
