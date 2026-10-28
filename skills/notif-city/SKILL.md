---
name: notif-city
description: Find which apps on an Android phone push marketing notifications (deals, promotions, recommendations, news, live streams) by reading the phone's notification channels over adb, read-only, and draw them as an isometric city where each app is a building and each marketing channel an orange floor. Use when the user says their phone shows too many ads or promo notifications, asks which apps spam them, or wants a before/after picture of cleaning up notifications.
---

# notif-city

Reads `adb shell dumpsys notification --noredact` (read-only; it changes nothing on the phone), finds the
notification channels that look like marketing, and writes:

- `city.svg`: one building per app, one floor per channel. Orange = marketing, grey = everything else,
  dashed = switched off. Run it again after cleaning up to get the "after" picture.
- `channels.tsv`: the marketing candidates, one `package<TAB>channel id<TAB>name` per line.

## Run

From the root of this repository (Node.js 18+, no packages to install):

```bash
node notif_city.mjs --demo -o out                     # synthetic demo phone
node notif_city.mjs --adb -o out                      # the one phone plugged in over USB debugging
node notif_city.mjs --adb SERIAL -o out               # a specific phone (adb devices)
node notif_city.mjs --dump dumpsys.txt -o out         # a dump saved with: adb shell dumpsys notification --noredact > dumpsys.txt
node notif_city.mjs --adb -o out --title "My phone"   # custom headline
```

Set `ADB=/path/to/adb` if adb is not on PATH.

## How to use it for the user
1. Make sure USB debugging is on and `adb devices` lists the phone. Run with `--adb` and show `city.svg`.
2. Read the printed list with the user. These are candidates found by keywords: "Breaking news" or "Weather news"
   may be wanted. Delete the lines they want to keep from `channels.tsv`.
3. To switch the rest off, the user can long-press a notification (or open Settings > Apps > the app >
   Notifications) and turn off those channels, or use android-ad-cleaner's `chan_fast.py -s SERIAL off channels.tsv`,
   which reads the same file. notif-city itself never changes phone settings.
4. Run again with `--title "After"` and show the two pictures side by side.
