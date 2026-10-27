/**
 * Demo data: an "Alex" account with a handful of personal projects at every
 * stage — a bookshelf half built, a trip being planned, a garden idea, a
 * finished course — with specs, boards, shopping lists and sessions, and a few
 * weeks of history so the analytics have something to show. Never touches
 * khal (sync is off for this account).
 *
 *   npm run db:seed-demo && npm run auth:link
 */
import { DateTime } from "luxon";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { activity, milestones, projects, purchases, tasks, workSessions } from "@/server/db/schema";
import { listCategories, createProject, updateProject } from "@/server/services/projects";
import { addPurchase, addTask, updatePurchase, updateTask } from "@/server/services/items";
import { applySpec, saveSpec } from "@/server/services/specs";
import { scheduleSession } from "@/server/services/sessions";
import { getSettings, updateSettings } from "@/server/services/settings";
import { createUser, listUsers } from "@/server/services/users";
import type { Spec } from "@/lib/spec";

db();
if (listUsers().some((u) => u.name === "Alex")) {
  console.log("Demo account already exists — not seeding twice.");
  process.exit(0);
}
const user = createUser("Alex");
const uid = user.id;
updateSettings(uid, { khalSync: false, currency: "EUR" });
const tz = getSettings(uid).timezone;
const now = DateTime.now().setZone(tz);
const day = (n: number) => now.plus({ days: n }).toISODate()!;
const cat = (name: string) => listCategories(uid).find((c) => c.name.startsWith(name))!.id;
const ago = (d: number, h = 18) => now.minus({ days: d }).set({ hour: h, minute: 0 }).toJSDate();

/** Rewrite a row's timestamps so history looks lived-in. */
function backdate(projectId: string, created: number) {
  db().update(projects).set({ createdAt: ago(created), updatedAt: ago(Math.max(0, created - 30)) }).where(eq(projects.id, projectId)).run();
}

// ── 1. Bookshelf: active, spec applied, half done ────────────────────────
const shelfSpec: Spec = {
  summary: "Floor-to-ceiling shelves in the living-room alcove so the books finally leave their boxes. Simple fixed shelves on wall battens, painted to match the wall.",
  goal: "Six level shelves up, painted, holding books, and the boxes gone.",
  scopeIn: ["Alcove left of the fireplace, 92 × 240 cm", "Battens screwed to the wall, 18 mm MDF shelves", "Paint to match the wall"],
  scopeOut: ["Doors or cupboards at the bottom", "Lighting"],
  approach: ["Measure each wall of the alcove at three heights: alcoves are never square", "Cut battens and shelves at the timber yard to save sawing", "Fix battens with a laser level, starting from the top shelf", "Fill, sand and paint before loading books"],
  milestones: [
    { title: "Measured and ordered", weekOffset: 0, tasks: ["Measure the alcove at three heights", "Sketch shelf spacing around the tallest books", "Order cut-to-size MDF and battens"] },
    { title: "Shelves up", weekOffset: 1, tasks: ["Find studs and cables with the detector", "Fix the battens, top shelf first", "Fit and pin the shelves"] },
    { title: "Painted and loaded", weekOffset: 3, tasks: ["Fill screw holes and caulk the edges", "Two coats of wall paint", "Load the books"] },
  ],
  purchases: [
    { name: "18 mm MDF shelves, cut to size", quantity: 6, estimatedCost: 14, note: "ask for the offcuts" },
    { name: "Planed batten 44 × 21 mm, 2.4 m", quantity: 4, estimatedCost: 5, note: null },
    { name: "Wall plugs and 70 mm screws", quantity: 1, estimatedCost: 9, note: null },
    { name: "Decorator's caulk", quantity: 2, estimatedCost: 4, note: null },
    { name: "Matt emulsion, 1 L tin", quantity: 1, estimatedCost: 18, note: "match the wall colour" },
  ],
  sessions: { count: 5, minutes: 180, cadence: "Saturday mornings" },
  risks: ["Old plaster crumbles: use longer plugs and check for cables first"],
  openQuestions: [],
  firstStep: "Measure the alcove width at floor, middle and top, and write the three numbers down.",
  estimate: { hours: 14, budget: 150 },
};
const shelf = createProject(uid, { title: "Bookshelf in the alcove", emoji: "📚", pitch: "Floor-to-ceiling shelves so the books leave the boxes", category: cat("Home"), priority: 3, startDate: day(-16), targetDate: day(20), budget: 160, notes: "Alcove next to the fireplace, about 92 cm wide and 2.4 m high. Want it simple, painted like the wall. Have a drill and a jigsaw. Parents visit mid-December." });
backdate(shelf.id, 24);
const s1 = saveSpec(uid, shelf.id, shelfSpec, "claude-code", "claude-opus-5-5");
applySpec(uid, s1.id);
updateProject(uid, shelf.id, { status: "active" });
const shelfTasks = db().select().from(tasks).where(eq(tasks.projectId, shelf.id)).all();
for (const t of shelfTasks.slice(0, 4)) updateTask(uid, t.id, { status: "done" });
updateTask(uid, shelfTasks[4].id, { status: "doing" });
for (const b of db().select().from(purchases).where(eq(purchases.projectId, shelf.id)).all().slice(0, 3)) updatePurchase(uid, b.id, { status: "bought" });
const shelfMs = db().select().from(milestones).where(eq(milestones.projectId, shelf.id)).all();
db().update(milestones).set({ doneAt: ago(12) }).where(eq(milestones.id, shelfMs[0].id)).run();

// ── 2. Lisbon trip: planned, spec not applied yet ────────────────────────
const lisbon = createProject(uid, { title: "Long weekend in Lisbon", emoji: "✈️", pitch: "Four days of food, tiles and miradouros in spring", category: cat("Travel"), targetDate: day(70), budget: 900, notes: "Two people, late March or early April. Like walking, food markets, not museums all day. Want one day trip (Sintra?)." });
backdate(lisbon.id, 9);
saveSpec(uid, lisbon.id, {
  summary: "Four days in Lisbon in early spring, based in Alfama or Graça, walking-first, with one day trip to Sintra. Book flights and the flat early; leave the days loose.",
  goal: "Flights, flat and the Sintra tickets booked, with a one-page plan per day.",
  scopeIn: ["Flights and a flat for two", "Sintra day trip", "A short list of places to eat"],
  scopeOut: ["Porto", "Hour-by-hour itinerary"],
  approach: ["Pick dates around the cheapest Thursday–Sunday flights", "Book a flat near a tram 28 stop", "Book Pena Palace tickets for a weekday morning", "Shortlist eight places to eat, two per day"],
  milestones: [
    { title: "Dates and flights booked", weekOffset: 1, tasks: ["Compare Thursday–Sunday fares for three weekends", "Book flights"] },
    { title: "Flat and Sintra booked", weekOffset: 2, tasks: ["Shortlist three flats in Alfama or Graça", "Book the flat", "Book Pena Palace tickets"] },
    { title: "Ready to go", weekOffset: 8, tasks: ["Shortlist places to eat", "Download offline maps", "Buy a Viva Viagem card on arrival"] },
  ],
  purchases: [{ name: "Travel adapter (EU)", quantity: 1, estimatedCost: 8, note: null }],
  sessions: { count: 3, minutes: 60, cadence: "two evenings" },
  risks: ["Easter weekend prices double: avoid it"],
  openQuestions: ["Hand luggage only, or one checked bag?"],
  firstStep: "Open a fare calendar and note the three cheapest Thursday–Sunday weekends in March–April.",
  estimate: { hours: 3, budget: 850 },
}, "claude-code", "claude-opus-5-5");

// ── 3. Vegetable beds: idea ──────────────────────────────────────────────
const beds = createProject(uid, { title: "Raised vegetable beds", emoji: "🥕", pitch: "Two beds by the fence for tomatoes and herbs", category: cat("Garden"), status: "idea", notes: "Sunny strip along the back fence, 4 m. Want to start in April." });
backdate(beds.id, 40);

// ── 4. Home server backups: active, no spec, tasks by hand ───────────────
const backup = createProject(uid, { title: "Offsite backups for the home server", emoji: "💾", pitch: "Encrypted nightly copy somewhere that isn't this house", category: cat("Tech"), priority: 2, startDate: day(-30) });
backdate(backup.id, 35);
updateProject(uid, backup.id, { status: "active" });
for (const [title, status] of [["Pick a provider and price 1 TB", "done"], ["Write the restic script", "done"], ["Test a full restore to a spare disk", "doing"], ["Add a weekly integrity check", "todo"], ["Document the recovery steps", "todo"]] as const) addTask(uid, backup.id, { title, status });
addPurchase(uid, backup.id, { name: "External SSD 1 TB", unitPrice: 79, status: "bought" });

// ── 5. Spanish course: done ──────────────────────────────────────────────
const spanish = createProject(uid, { title: "Finish A2 Spanish", emoji: "🇪🇸", pitch: "Pass the A2 mock test before the summer", category: cat("Learning"), startDate: day(-150), targetDate: day(-20), budget: 60 });
backdate(spanish.id, 160);
for (const t of ["Units 1–6 of the workbook", "Units 7–12", "Two mock tests", "Book the exam"]) addTask(uid, spanish.id, { title: t, status: "done" });
addPurchase(uid, spanish.id, { name: "A2 workbook", unitPrice: 29, status: "bought" });
updateProject(uid, spanish.id, { status: "done" });
db().update(projects).set({ completedAt: ago(22) }).where(eq(projects.id, spanish.id)).run();

// ── 6. Bike service: paused ──────────────────────────────────────────────
const bike = createProject(uid, { title: "Service the road bike", emoji: "🚲", category: cat("Car"), status: "paused", pitch: "New chain and brake pads before spring" });
backdate(bike.id, 50);
addPurchase(uid, bike.id, { name: "11-speed chain", unitPrice: 32 });
addPurchase(uid, bike.id, { name: "Brake pads (pair)", quantity: 2, unitPrice: 12 });

// ── Sessions: history and the coming week ────────────────────────────────
const at = (d: number, h: number) => now.plus({ days: d }).set({ hour: h, minute: 0, second: 0, millisecond: 0 }).toMillis();
for (const d of [-21, -14, -7]) await scheduleSession(uid, shelf.id, { title: "Bookshelf: Saturday session", start: at(d, 9), end: at(d, 12), status: "done" });
for (const d of [-26, -19, -12, -5]) await scheduleSession(uid, backup.id, { title: "Backups: evening session", start: at(d, 20), end: at(d, 21) + 30 * 60_000, status: "done" });
await scheduleSession(uid, shelf.id, { title: "Fit and pin the shelves", start: at(((6 - now.weekday + 7) % 7) || 7, 9), end: at(((6 - now.weekday + 7) % 7) || 7, 12) });
await scheduleSession(uid, lisbon.id, { title: "Compare fares and pick dates", start: at(2, 20), end: at(2, 21) });

// Spread the activity log over the last weeks so the charts have a shape.
const rows = db().select().from(activity).where(eq(activity.userId, uid)).all();
rows.forEach((r, i) => {
  if (r.kind === "task_done" || r.kind === "purchase_bought") db().update(activity).set({ at: ago(3 + ((i * 5) % 60), 10 + (i % 9)) }).where(eq(activity.id, r.id)).run();
});
// Worked time counts on the day the session happened, not the day it was seeded.
db().delete(activity).where(and(eq(activity.userId, uid), eq(activity.kind, "session_done"))).run();
for (const s of db().select().from(workSessions).where(and(eq(workSessions.userId, uid), eq(workSessions.status, "done"))).all()) {
  db().insert(activity).values({ userId: uid, projectId: s.projectId, kind: "session_done", detail: s.title, amount: Math.round((s.end - s.start) / 60_000), at: new Date(s.end) }).run();
}

console.log(`Seeded the demo account "Alex" (${uid}). Sign in with: npm run auth:link -- --user ${uid}`);
