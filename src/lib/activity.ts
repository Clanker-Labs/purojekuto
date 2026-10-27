/** One line per activity row, for the timeline and the home feed. Pure. */
export function describeActivity(kind: string, detail: string): string {
  switch (kind) {
    case "created":
      return detail ? `Created ${detail}` : "Created";
    case "status":
      return detail;
    case "task_done":
      return `Done: ${detail}`;
    case "milestone_done":
      return `Milestone reached: ${detail}`;
    case "purchase_bought":
      return `Bought ${detail}`;
    case "session_done":
      return `Worked: ${detail}`;
    case "spec":
      return `${detail} written`;
    default:
      return detail;
  }
}
