#!/usr/bin/env node
// notif-city: see which apps on your Android phone push marketing notifications, drawn as an isometric city.
//
//   node notif_city.mjs --demo -o out                 # bundled synthetic dump
//   node notif_city.mjs --adb [SERIAL] -o out          # read-only: adb shell dumpsys notification --noredact
//   node notif_city.mjs --dump dumpsys.txt -o out      # a dump you saved before
//
// Writes out/city.svg and out/channels.tsv (the list format android-ad-cleaner's chan_fast.py off/on reads).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { depthOf, extrude, iso, pathOf, roundedPlan } from "./vendor/iso.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Channel rules from rddmwmddr/android-ad-cleaner tool/chan_fast.py and tool/channel_policy.py (MIT), unchanged.
// The Chinese words are the upstream keyword lists for China-market phones; the English ones cover the rest.
export const KW = /营销|活动|推荐|推广|热点|热门|资讯|新闻|福利|优惠|特惠|精选|精彩|运营|促销|红包|直播|种草|内容|头条|猜你|好物|权益|会员|签到|广告|recommend|promo|market|deal|news|topstory|upsell|offer/i;
// Python's \b is Unicode-aware; the lookarounds keep "payments" whole-word the same way.
export const SKIP = /下载|更新|安装|上传|订单|物流|快递|交易|支付|付款|(?<![\p{L}\p{N}_])payments?(?![\p{L}\p{N}_])|账号|安全|验证|通话|来电|消息|聊天|私信|评论|互动|提醒|闹钟|日程|天气预警|系统|前台|后台|服务运行|播放|媒体|热点和网络共享|智能热点|红包助手|盗窃|驾驶状态|权限建议|运营商|警告|告警|实时活动|赛事|护眼/iu;
const PHOTO_SPOT = /找[机機]位|[机機]位推[荐薦]|推[荐薦][机機]位/; // camera "photo spot" feature: never marketing
export const isProtected = (name, id = "", label = "") => PHOTO_SPOT.test([name, id, label].join(" ").replace(/[\s​﻿]+/gu, ""));

/** Parse `dumpsys notification --noredact`: one entry per (package, channel id), first one wins. */
export function parse(text) {
  const at = text.indexOf("PackagePreferences:");
  if (at < 0) throw new Error("no notification channel state in this dump (PackagePreferences: is missing); check USB debugging");
  const channels = new Map();
  const appOff = {};
  let pkg = null;
  for (const line of text.slice(at).split(/\r\n|\r|\n/)) {
    let m = line.match(/^\s*AppSettings: (\S+)/);
    if (m) {
      pkg = m[1];
      appOff[pkg] = line.includes("importance=NONE");
      continue;
    }
    m = line.match(/NotificationChannel\{mId='(.*?)', mName=(.*?), mDescription=.*?mImportance=(-?\d+).*?mDeleted=(\w+)/);
    if (m && pkg && !channels.has(`${pkg}\t${m[1]}`))
      channels.set(`${pkg}\t${m[1]}`, { pkg, id: m[1], name: m[2], importance: Number(m[3]), deleted: m[4] === "true" });
  }
  return { channels: [...channels.values()], appOff };
}

const isOn = (c, appOff) => c.importance !== 0 && !c.deleted && !appOff[c.pkg];
export const isMarketing = (c, appOff) =>
  isOn(c, appOff) && KW.test(`${c.name} ${c.id}`) && !SKIP.test(c.name) && !isProtected(c.name, c.id);

/** The same rows, in the same order, as `chan_fast.py -s SERIAL scan`. */
export function scan({ channels, appOff }) {
  return channels.filter((c) => isMarketing(c, appOff))
    .sort((a, b) => (a.pkg < b.pkg ? -1 : a.pkg > b.pkg ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => `${c.pkg}\t${c.id}\t${c.name}`);
}

// ---- the city -----------------------------------------------------------------------------------
const LOT = 15, BASE = 10, FLOOR = 2.4, SCALE = 9;
const GREY = ["#efede7", "#dedbd3", "#cdc9be", "#bbb6aa", "#a8a397"]; // top, then 4 side shades dark-to-light order below
const HOT = ["#ffb25e", "#f39a43", "#e2802f", "#c96a22", "#ad5619"];
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const short = (pkg) => pkg.split(".").filter((p) => !["com", "android", "app", "example"].includes(p)).pop() || pkg;

export function buildings(parsed) {
  const byPkg = new Map();
  for (const c of parsed.channels) {
    if (c.deleted || parsed.appOff[c.pkg]) continue;
    const b = byPkg.get(c.pkg) ?? { pkg: c.pkg, floors: [] };
    b.floors.push({ ...c, on: isOn(c, parsed.appOff), marketing: isMarketing(c, parsed.appOff) });
    byPkg.set(c.pkg, b);
  }
  const list = [...byPkg.values()];
  // switched-off channels become ghost floors on top, so a building keeps its height and place before and after
  for (const b of list) b.floors.sort((x, y) => y.on - x.on || x.marketing - y.marketing);
  return list.map((b) => ({ ...b, hot: b.floors.filter((f) => f.marketing).length }))
    .sort((a, b) => b.floors.length - a.floors.length || (a.pkg < b.pkg ? -1 : 1));
}

function slab(plan, z, h, proj, tones, attrs = "") {
  const s = extrude(roundedPlan(plan, 3), z, h, proj);
  const shades = s.shades.map((d, i) => (d ? `<path d="${d}" fill="${tones[i + 1]}"/>` : "")).join("");
  return `<g${attrs}><path d="${s.fill}" fill="${tones[2]}"/>${shades}<path d="${s.top}" fill="${tones[0]}"/>` +
    `<path d="${s.outline}${s.crease}" fill="none" stroke="#1b1b1b" stroke-width=".7" stroke-linejoin="round"/></g>`;
}

function ghost(plan, z, h, proj) {
  const s = extrude(roundedPlan(plan, 3), z, h, proj);
  return `<path data-off="1" d="${s.outline}${s.crease}" fill="none" stroke="#9a968c" stroke-width=".7" stroke-dasharray="3 3"/>`;
}

export function render(parsed, { title = "Your phone" } = {}) {
  const list = buildings(parsed);
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const lots = list.map((b, i) => ({ ...b, x: (i % cols) * LOT, y: Math.floor(i / cols) * LOT }));
  const rows = Math.ceil(list.length / cols) || 1;
  const proj0 = { scale: SCALE, origin: [0, 0] };
  const pts = [];
  for (const l of lots) for (const [dx, dy] of [[0, 0], [BASE, 0], [0, BASE], [BASE, BASE]])
    pts.push(iso([l.x + dx, l.y + dy, 0], proj0), iso([l.x + dx, l.y + dy, l.floors.length * FLOOR], proj0));
  pts.push(iso([-3, -3, 0], proj0), iso([cols * LOT, rows * LOT, 0], proj0), iso([cols * LOT, -3, 0], proj0), iso([-3, rows * LOT, 0], proj0));
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const pad = 40, head = 120;
  const W = Math.max(720, Math.ceil(maxX - minX + pad * 2)), H = Math.ceil(maxY - minY + pad * 2 + head + 20);
  const proj = { scale: SCALE, origin: [pad - minX + (W - (maxX - minX + pad * 2)) / 2, head + pad - minY] };

  const hot = lots.reduce((n, l) => n + l.hot, 0);
  const on = lots.reduce((n, l) => n + l.floors.filter((f) => f.on).length, 0);
  const off = lots.reduce((n, l) => n + l.floors.length, 0) - on;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif,'Segoe UI',Helvetica,Arial,sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#f7f6f2"/>`,
    `<text x="28" y="44" font-size="24" font-weight="700" fill="#1b1b1b">${esc(title)}: ${hot} marketing notification channel${hot === 1 ? "" : "s"} in ${lots.filter((l) => l.hot).length} apps</text>`,
    `<text x="28" y="70" font-size="13" fill="#555">${lots.length} apps · ${on} channels on · ${off} switched off · one floor per channel</text>`,
    `<rect x="28" y="86" width="14" height="14" fill="${HOT[0]}" stroke="#1b1b1b" stroke-width=".7"/><text x="48" y="98" font-size="12" fill="#333">marketing (deals, recommendations, news, live)</text>`,
    `<rect x="340" y="86" width="14" height="14" fill="${GREY[0]}" stroke="#1b1b1b" stroke-width=".7"/><text x="360" y="98" font-size="12" fill="#333">everything else (orders, messages, alerts)</text>`,
    `<rect x="620" y="86" width="14" height="14" fill="none" stroke="#9a968c" stroke-dasharray="3 3"/><text x="640" y="98" font-size="12" fill="#333">switched off</text>`];
  const ground = { x: -3, y: -3, w: cols * LOT + 1, d: rows * LOT + 1, r: 2 };
  out.push(slab(ground, -0.8, 0.8, proj, ["#e6e3da", "#c9c5bb", "#d4d0c6", "#dcd9d0", "#e1ded6"]));
  const order = lots.map((l) => ({ l, depth: depthOf([l.x + BASE / 2, l.y + BASE / 2, 0], proj) })).sort((a, b) => a.depth - b.depth);
  for (const { l } of order) {
    const plan = { x: l.x, y: l.y, w: BASE, d: BASE, r: 1.2 };
    out.push(`<g data-app="${esc(l.pkg)}">`);
    l.floors.forEach((f, i) => out.push(f.on ? slab(plan, i * FLOOR, FLOOR, proj, f.marketing ? HOT : GREY, f.marketing ? ' data-marketing="1"' : "")
      : ghost(plan, i * FLOOR, FLOOR, proj)));
    out.push("</g>");
  }
  for (const { l } of order) { // labels last, on the roofs, so no building hides them
    const [tx, ty] = iso([l.x + BASE / 2, l.y + BASE / 2, l.floors.length * FLOOR], proj);
    out.push(`<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" font-size="12" font-weight="600" text-anchor="middle" fill="#1b1b1b" paint-order="stroke" stroke="#fff" stroke-width="3.5">${esc(short(l.pkg))}${l.hot ? ` · ${l.hot}` : ""}</text>`);
  }
  out.push(`<text x="${W - 20}" y="${H - 14}" font-size="10.5" text-anchor="end" fill="#888">notif-city · rules: android-ad-cleaner · drawing: anatomy iso-kit</text></svg>`);
  return out.join("\n");
}

function readDump(args) {
  if (args.demo) return readFileSync(join(HERE, "examples", "demo-before.txt"), "utf8");
  if (args.dump) return readFileSync(args.dump, "utf8");
  const adb = process.env.ADB || "adb";
  const serial = typeof args.adb === "string" ? ["-s", args.adb] : [];
  return execFileSync(adb, [...serial, "shell", "dumpsys notification --noredact"], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 60000 });
}

export function main(argv = process.argv.slice(2)) {
  const args = { out: "notif-city-out" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo") args.demo = true;
    else if (a === "--dump") args.dump = argv[++i];
    else if (a === "--adb") args.adb = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : true;
    else if (a === "-o" || a === "--out") args.out = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).join("\n").replace(/^\/\/ ?/gm, "")); return a === "-h" || a === "--help" ? 0 : 2; }
  }
  if (!args.demo && !args.dump && !args.adb) args.demo = true;
  const parsed = parse(readDump(args));
  const rows = scan(parsed);
  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, "channels.tsv"), rows.map((r) => r + "\n").join(""), "utf8");
  writeFileSync(join(args.out, "city.svg"), render(parsed, { title: args.title }), "utf8");
  const apps = new Set(rows.map((r) => r.split("\t")[0]));
  console.log(rows.join("\n"));
  console.log(`\n${rows.length} marketing channels on in ${apps.size} apps (${parsed.channels.length} channels read)`);
  console.log(`wrote ${join(args.out, "city.svg")} and ${join(args.out, "channels.tsv")}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
