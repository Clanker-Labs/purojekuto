import type { Milestone, Project, Purchase, Task, WorkSession } from "@/server/db/schema";
import type { Spec } from "@/lib/spec";
import { duration, money, shortDate } from "@/lib/format";

/**
 * A project as one self-contained, interactive HTML file: open it on a phone
 * in the garden, tick tasks and purchases off, print it. No network, no
 * external fonts or scripts; ticks are kept in the browser (localStorage) and
 * start from the project's state at export time.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function projectHtml(opts: {
  project: Project;
  category: { name: string; emoji: string; color: string } | null;
  spec: Spec | null;
  tasks: Task[];
  milestones: Milestone[];
  purchases: Purchase[];
  sessions: WorkSession[];
  timezone: string;
  exportedAt: Date;
}): string {
  const { project: p, spec, tasks, milestones, purchases, sessions } = opts;
  const accent = opts.category?.color ?? "#7c72ff";
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: opts.timezone });

  const groups = milestones.map((m) => ({ m, items: tasks.filter((t) => t.milestoneId === m.id) }));
  const loose = tasks.filter((t) => !t.milestoneId || !milestones.some((m) => m.id === t.milestoneId));
  const check = (key: string, label: string, done: boolean, meta = "") =>
    `<label class="row"><input type="checkbox" data-k="${esc(key)}"${done ? " checked" : ""}><span class="t">${esc(label)}</span>${meta ? `<span class="meta">${meta}</span>` : ""}</label>`;

  const milestoneHtml = groups
    .map(
      ({ m, items }) => `<section class="ms">
  <div class="ms-h"><span class="dot${m.doneAt ? " done" : ""}"></span><h3>${esc(m.title)}</h3>${m.dueDate ? `<span class="meta">${esc(shortDate(m.dueDate))}</span>` : ""}</div>
  ${items.map((t) => check(`t:${t.id}`, t.title, t.status === "done", t.status === "doing" ? "doing" : "")).join("\n  ") || '<p class="empty">No tasks yet.</p>'}
</section>`,
    )
    .join("\n");
  const looseHtml = loose.length
    ? `<section class="ms"><div class="ms-h"><span class="dot"></span><h3>Other tasks</h3></div>${loose.map((t) => check(`t:${t.id}`, t.title, t.status === "done")).join("")}</section>`
    : "";

  const buy = purchases
    .map((b) => {
      const total = b.unitCents != null ? b.unitCents * b.quantity : null;
      return `<label class="row buy"><input type="checkbox" data-k="p:${esc(b.id)}" data-cents="${total ?? 0}"${b.status === "bought" ? " checked" : ""}><span class="t">${b.quantity > 1 ? `${b.quantity} × ` : ""}${esc(b.name)}${b.vendor ? ` <span class="meta">· ${esc(b.vendor)}</span>` : ""}</span><span class="num">${total != null ? esc(money(total, b.currency)) : "—"}</span></label>`;
    })
    .join("\n");
  const plannedCents = purchases.reduce((n, b) => n + (b.unitCents ?? 0) * b.quantity, 0);

  const upcoming = sessions.filter((s) => s.status === "planned" && s.end > opts.exportedAt.getTime());
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

  const specHtml = spec
    ? `<section class="card">
  <p class="lead">${esc(spec.summary)}</p>
  <p class="goal"><b>Done when</b> ${esc(spec.goal)}</p>
  <div class="cols">
    ${spec.scopeIn.length ? `<div><h4>In scope</h4>${list(spec.scopeIn)}</div>` : ""}
    ${spec.scopeOut.length ? `<div><h4>Not now</h4>${list(spec.scopeOut)}</div>` : ""}
  </div>
  <h4>Approach</h4><ol>${spec.approach.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>
  ${spec.risks.length ? `<h4>Watch out for</h4>${list(spec.risks)}` : ""}
  ${spec.openQuestions.length ? `<h4>Open questions</h4>${list(spec.openQuestions)}` : ""}
  <p class="first"><b>First step</b> ${esc(spec.firstStep)}</p>
</section>`
    : "";

  const facts = [
    p.startDate && p.targetDate ? `${shortDate(p.startDate)} → ${shortDate(p.targetDate)}` : p.targetDate ? `by ${shortDate(p.targetDate)}` : null,
    spec ? `${spec.sessions.count} × ${duration(spec.sessions.minutes)} · ${spec.sessions.cadence}` : null,
    p.budgetCents != null ? `budget ${money(p.budgetCents, p.currency)}` : null,
  ].filter(Boolean) as string[];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#0f1419;--ink2:#3d4853;--muted:#5d6976;--line:rgba(15,20,25,.1);--accent:${accent};--ok:#007a63}
@media (prefers-color-scheme:dark){:root{--bg:#0f1419;--card:#171d26;--ink:#e8edf2;--ink2:#a8b3bf;--muted:#8693a1;--line:#232b35;--ok:#00d4aa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:28px 16px 64px}
header{display:flex;gap:16px;align-items:center;margin-bottom:20px}
.ring{--p:0;width:64px;height:64px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--line) 0);position:relative}
.ring::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--bg)}
.ring b{position:relative;font-size:15px}
h1{font-size:24px;line-height:1.2;margin:0 0 4px;letter-spacing:-.01em}
.pitch{color:var(--ink2);margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.chip{font-size:12px;color:var(--ink2);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:2px 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:0 0 16px}
.lead{font-size:16px;margin:0 0 10px}.goal,.first{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--accent) 12%,transparent)}
.goal b,.first b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:28px 4px 10px}
h3{font-size:15px;margin:0;flex:1}h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 4px}
ul,ol{margin:4px 0;padding-left:20px}li{margin:2px 0}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 20px}
.ms{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 16px;margin:0 0 10px}
.ms-h{display:flex;align-items:center;gap:10px;padding:2px 0 6px}
.dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--accent);flex:none}.dot.done{background:var(--accent)}
.row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid var(--line);cursor:pointer}
.row input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent);flex:none}
.row .t{flex:1}.row input:checked~.t{color:var(--muted);text-decoration:line-through}
.meta{color:var(--muted);font-size:12px}.num{font-variant-numeric:tabular-nums;color:var(--ink2)}
.total{display:flex;justify-content:space-between;padding:10px 0 0;border-top:1px solid var(--line);font-weight:600}
.empty{color:var(--muted);margin:4px 0}
footer{color:var(--muted);font-size:12px;margin-top:32px;text-align:center}
button{font:inherit;color:var(--ink2);background:none;border:1px solid var(--line);border-radius:8px;padding:4px 10px;cursor:pointer}
@media print{body{background:#fff}.card,.ms{break-inside:avoid;border-color:#ddd}button{display:none}}
</style>
</head>
<body>
<main>
<header>
  <div class="ring" id="ring"><b id="pct">0%</b></div>
  <div>
    <h1>${p.emoji ? `${esc(p.emoji)} ` : ""}${esc(p.title)}</h1>
    ${p.pitch ? `<p class="pitch">${esc(p.pitch)}</p>` : ""}
    <div class="chips">${opts.category ? `<span class="chip">${esc(opts.category.emoji)} ${esc(opts.category.name)}</span>` : ""}${facts.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>
  </div>
</header>
${specHtml}
${groups.length || loose.length ? `<h2>Plan</h2>\n${milestoneHtml}\n${looseHtml}` : ""}
${purchases.length ? `<h2>To buy</h2><section class="card">${buy}<div class="total"><span>Left to buy</span><span class="num" id="left"></span></div><div class="total" style="border:0;font-weight:400;color:var(--muted)"><span>Planned in total</span><span class="num">${esc(money(plannedCents, p.currency))}</span></div></section>` : ""}
${upcoming.length ? `<h2>Working sessions</h2><section class="card">${upcoming.map((s) => `<div class="row" style="cursor:default"><span class="t">${esc(s.title)}</span><span class="meta">${esc(fmtTime(s.start))} · ${esc(duration((s.end - s.start) / 60000))}</span></div>`).join("")}</section>` : ""}
<footer>Exported from purojekuto on ${esc(opts.exportedAt.toISOString().slice(0, 10))}. Ticks are saved in this browser. <button id="reset" type="button">Reset ticks</button></footer>
</main>
<script>
(function(){
  var KEY="puro:${esc(p.id)}", st={};
  try{st=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
  var boxes=[].slice.call(document.querySelectorAll("input[data-k]"));
  var fmt=new Intl.NumberFormat(undefined,{style:"currency",currency:${JSON.stringify(p.currency)},maximumFractionDigits:0});
  function update(){
    var t=boxes.filter(function(b){return b.dataset.k[0]==="t"}), d=t.filter(function(b){return b.checked}).length;
    var pc=t.length?Math.round(d/t.length*100):0;
    document.getElementById("ring").style.setProperty("--p",pc);document.getElementById("pct").textContent=pc+"%";
    var left=boxes.filter(function(b){return b.dataset.k[0]==="p"&&!b.checked}).reduce(function(n,b){return n+Number(b.dataset.cents||0)},0);
    var el=document.getElementById("left");if(el)el.textContent=fmt.format(left/100);
  }
  boxes.forEach(function(b){
    if(b.dataset.k in st)b.checked=st[b.dataset.k];
    b.addEventListener("change",function(){st[b.dataset.k]=b.checked;try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}update()});
  });
  document.getElementById("reset").addEventListener("click",function(){try{localStorage.removeItem(KEY)}catch(e){}location.reload()});
  update();
})();
</script>
</body>
</html>`;
}
