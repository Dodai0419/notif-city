import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildings, isProtected, parse, render, scan } from "../notif_city.mjs";
import { iso } from "../vendor/iso.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dump = (name, importance = 3) => `PackagePreferences:
      AppSettings: com.example importance=DEFAULT
        NotificationChannel{mId='promo', mName=${name}, mDescription=null, mImportance=${importance}, mDeleted=false}
    `;
const channels = (rows) => ({ channels: rows.map(([id, name]) => ({ pkg: "com.example", id, name, importance: 3, deleted: false })), appOff: {} });

// The next four tests are the scan cases of rddmwmddr/android-ad-cleaner (e2419d1), same inputs, same expected output.
test("upstream test_scan_startup: a marketing channel is listed, a switched-off one is not", () => {
  assert.deepEqual(scan(parse(dump("活动优惠"))), ["com.example\tpromo\t活动优惠"]);
  assert.deepEqual(scan(parse(dump("活动优惠", 0))), []);
});

test("upstream test_scan_startup: mixed payment and deals channels are not candidates", () => {
  for (const name of ["付款事宜、特惠信息和推荐内容", "Payments, deals and recommendations"])
    assert.deepEqual(scan(parse(dump(name))), [], name);
});

test("upstream test_feedback_safety: camera photo-spot channels are protected even with a marketing id", () => {
  for (const name of ["找机位", "找 机 位通知", "找​機位", "机位推荐", "推薦機位", "摄影找机位活动"]) {
    assert.deepEqual(scan({ channels: [{ pkg: "com.example", id: "recommend", name, importance: 3, deleted: false }], appOff: {} }), [], name);
    assert.ok(isProtected(name));
  }
});

test("upstream test_release_regressions: Honor service channels are excluded", () => {
  const names = ["警告", "实时活动", "赛事资讯", "护眼推荐", "活动优惠"];
  assert.deepEqual(scan(channels(names.map((n, i) => [`recommend_${i}`, n]))), ["com.example\trecommend_4\t活动优惠"]);
});

test("parse keeps the first entry per channel, honours app-level off and deleted channels", () => {
  const text = `junk\nPackagePreferences:\r\n  AppSettings: a.b importance=NONE\r\n    NotificationChannel{mId='deal', mName=Deals, mDescription=, mImportance=3, mDeleted=false}\r\n` +
    `  AppSettings: c.d (1) importance=DEFAULT\n    NotificationChannel{mId='deal', mName=Deals, mDescription=, mImportance=3, mBypassDnd=false, mDeleted=false}\n` +
    `    NotificationChannel{mId='deal', mName=Deals again, mDescription=, mImportance=0, mDeleted=false}\n` +
    `    NotificationChannel{mId='old', mName=Old promo, mDescription=, mImportance=3, mDeleted=true}\n`;
  const p = parse(text);
  assert.equal(p.channels.length, 3);
  assert.equal(p.appOff["a.b"], true);
  assert.deepEqual(scan(p), ["c.d\tdeal\tDeals"]);
  assert.throws(() => parse("no channels here"), /PackagePreferences/);
});

test("English and Chinese keywords both count; orders and security alerts do not", () => {
  const rows = scan(channels([["a", "Deals and promotions"], ["b", "Order updates"], ["c", "Security alerts"], ["d", "直播推荐"], ["e", "Top stories"], ["topstory", "Top stories"]]));
  // the name or the channel id may carry the keyword ("Top stories" alone has none)
  assert.deepEqual(rows.map((r) => r.split("\t")[1]), ["a", "d", "topstory"]);
});

test("the city has one orange floor per scanned channel and one ghost floor per switched-off channel", () => {
  for (const [file, hot, ghosts] of [["demo-before.txt", 14, 0], ["demo-after.txt", 0, 14]]) {
    const p = parse(readFileSync(join(ROOT, "examples", file), "utf8"));
    const svg = render(p);
    assert.equal(scan(p).length, hot);
    assert.equal((svg.match(/data-marketing="1"/g) || []).length, hot, file);
    assert.equal((svg.match(/data-off="1"/g) || []).length, ghosts, file);
    assert.ok(!svg.includes("NaN"));
  }
  // same buildings in the same places before and after
  const order = (f) => buildings(parse(readFileSync(join(ROOT, "examples", f), "utf8"))).map((b) => b.pkg);
  assert.deepEqual(order("demo-before.txt"), order("demo-after.txt"));
});

test("vendored iso() is the anatomy projection: 45 degree azimuth, 30 degree elevation", () => {
  const k = Math.sqrt(1.6);
  const [x, y] = iso([1, 0, 0], { scale: 1, origin: [0, 0] });
  assert.ok(Math.abs(x - Math.SQRT1_2 * k) < 1e-12 && Math.abs(y - Math.SQRT1_2 * 0.5 * k) < 1e-12);
});

test("CLI writes city.svg and a channels.tsv that android-ad-cleaner can read back", () => {
  const out = mkdtempSync(join(tmpdir(), "notif-city-"));
  const crlf = join(out, "dump.txt");
  writeFileSync(crlf, readFileSync(join(ROOT, "examples", "demo-before.txt"), "utf8").replace(/\n/g, "\r\n"));
  const log = execFileSync(process.execPath, [join(ROOT, "notif_city.mjs"), "--dump", crlf, "-o", out], { encoding: "utf8" });
  assert.match(log, /14 marketing channels on in 8 apps/);
  const tsv = readFileSync(join(out, "channels.tsv"), "utf8").trimEnd().split("\n");
  assert.equal(tsv.length, 14);
  for (const line of tsv) assert.match(line, /^[\w.]+\t\S+\t.+$/); // chan_fast.load(): package, channel id, label
  assert.match(readFileSync(join(out, "city.svg"), "utf8"), /^<svg[\s\S]*<\/svg>$/);
});
