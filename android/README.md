# Bhavya Android app (glasses)

A small native Kotlin app that connects Meta glasses to Bhavya. It shows the child web app from
the home hub and adds what a browser cannot do:

- **Glasses camera** through the Meta Wearables Device Access Toolkit (1.0.1). Frames are turned
  into JPEGs on the phone and sent to the hub's existing step-check and object-finder endpoints.
- **Voice** through Android's built-in text-to-speech, heard in the glasses speakers when the
  glasses are connected as a Bluetooth audio device.
- **Privacy gate on the device:** the glasses camera session runs only during a camera-OK step
  while the app is on screen. Leaving the step, entering a private room, or leaving the app stops
  the session and drops the last frame.

Without glasses, **simulated glasses** (Meta's Mock Device Kit) use the phone's back camera as the
glasses camera, so the whole flow can be demoed on any Android phone.

## What you need

- An Android phone with **Android 12 or newer**, a USB cable, and USB debugging turned on
  (Settings, About phone, tap *Build number* 7 times, then Developer options, *USB debugging*).
- The phone and the laptop on the **same Wi-Fi**.
- For real glasses: the **Meta AI app** with the glasses paired and **Developer Mode** on
  (Meta AI app, Settings, App Info, tap *App Version* 5 times).

No emulator is needed; the glasses only work with a real phone.

## Build and install

From this folder, with the Android SDK installed (see `local.properties.example`):

```bash
gradlew.bat assembleDebug            # builds app/build/outputs/apk/debug/app-debug.apk
gradlew.bat installDebug             # installs it on the phone connected by USB
gradlew.bat testDebugUnitTest        # unit tests
```

## First run on the phone

1. Start the hub on the laptop (`npm run dev` in the repo root). Its log prints the laptop's
   address, for example `http://192.168.1.8:8787`.
2. Open **Bhavya** on the phone and allow Bluetooth (and the camera, for simulated glasses).
3. Enter the hub address. With `npm run dev`, the child app is served on port **5173**
   (`http://192.168.1.8:5173`); after `npm run build && npm start`, use port **8787**.
4. Keep **Simulated glasses** on to demo with the phone camera, or turn it off and tap
   **Connect glasses** to register with the Meta AI app, then **Allow the glasses camera**.
5. Tap **Open the child app**. Hold the top strip at any time to come back to setup.

## Notes

- `mwdat_application_id` and `mwdat_client_token` default to `0`, which works while Developer Mode
  is on. For other builds, add your Wearables Developer Center values to `local.properties`.
- Plain HTTP is allowed because the hub runs on the home network
  (`res/xml/network_security_config.xml`). The web view never navigates away from the hub, so no
  other page can reach the JavaScript bridge.
