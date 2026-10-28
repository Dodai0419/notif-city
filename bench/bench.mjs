// Time parse + scan + render on the demo dump and on a synthetic 300-app dump.
//   node bench/bench.mjs [runs]
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parse, render, scan } from "../notif_city.mjs";

const runs = Number(process.argv[2] || 50);
const demo = readFileSync(new URL("../examples/demo-before.txt", import.meta.url), "utf8");
const names = ["Deals and promotions", "Order updates", "Messages", "Recommended for you", "Security alerts", "Live now", "News", "Payments", "Weekly offers", "Backup"];
let big = "PackagePreferences:\n";
for (let a = 0; a < 300; a++) {
  big += `  AppSettings: com.bench.app${a} (${10000 + a}) importance=DEFAULT\n`;
  for (let c = 0; c < 10; c++)
    big += `    NotificationChannel{mId='ch${c}', mName=${names[(a + c) % 10]}, mDescription=, mImportance=${(a * c) % 7 ? 3 : 0}, mBypassDnd=false, mLights=false, mDeleted=false, mDeletedTimeMs=-1}\n`;
}
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
for (const [label, text] of [["demo (12 apps, 40 channels)", demo], ["synthetic (300 apps, 3000 channels)", big]]) {
  const t = { scan: [], render: [] };
  for (let i = 0; i < runs; i++) {
    let s = performance.now();
    const p = parse(text);
    const rows = scan(p);
    t.scan.push(performance.now() - s);
    s = performance.now();
    render(p);
    t.render.push(performance.now() - s);
    if (!rows.length) throw new Error("no rows");
  }
  console.log(`${label}: parse+scan ${median(t.scan).toFixed(2)} ms, render ${median(t.render).toFixed(2)} ms (median of ${runs})`);
}
