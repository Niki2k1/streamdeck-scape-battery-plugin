# Stream Deck Fractal Scape Battery Monitor Plugin

A Stream Deck plugin that shows the battery level of your [Fractal Design Scape](https://www.fractal-design.com/products/headsets/scape/) wireless headset on a key — no companion software required. The plugin talks directly to the Scape's 2.4 GHz USB dongle over HID, the same way Fractal's [Adjust](https://adjust.fractal-design.com) web app does.

## Plugin Features

- Shows the headset's battery percentage with an icon representing the charge level.
- Detects when the headset is powered off, out of range, or the dongle is unplugged, and shows an "asleep" icon.
- A customizable title lets you add a descriptive label above the percentage.
- The background color is customizable via custom hex code.
- Works standalone — no Fractal software needs to be installed or running.

> [!NOTE]
> The plugin polls the dongle over USB HID every 1.5 seconds (the same cadence Fractal's own Adjust app uses). The wireless dongle must be plugged in; Bluetooth-only connections are not supported.

> [!IMPORTANT]
> The plugin cannot run at the same time as Fractal's [Adjust](https://adjust.fractal-design.com) web app (or its offline Electron app). Both talk to the dongle over the same HID stream and will fight over responses. Close the Adjust tab before using the plugin, and likewise quit the Stream Deck plugin if you need Adjust (e.g. for firmware updates or EQ changes).

## How it works

The Scape dongle (USB VID `0x36BC`, PID `0x0001`) exposes a vendor-specific HID collection. The plugin sends a status poll (`f1 21`) every 1.5 s, which the dongle relays to the headset over 2.4 GHz. The response contains the battery percentage, connection state, and power state. When the headset is off, the poll times out and the key shows the asleep icon.

The HID protocol was reverse-engineered and documented by [charlietran/scapectl](https://github.com/charlietran/scapectl) — see its README for a full protocol reference. Note that the Scape protocol does not expose a charging indicator, so unlike a charging icon there is only the battery percentage.

## Development

The dev environment utilizes the [Stream Deck NodeJS SDK and CLI](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/).\
Once the CLI is installed and you're in your root directory, you can initialize your development environment with `npm install`.\
To build the plugin (including copying the native `node-hid` module into the plugin folder), use `npm run build`.\
To run the plugin in development hot reload mode, you can use `npm run watch`.

See the [Elgato documentation](https://docs.elgato.com/streamdeck/sdk/introduction/your-first-changes) for information on developing, modifying, and packing plugins.

### Native module note

USB HID access uses [node-hid](https://github.com/node-hid/node-hid), a native module that ships prebuilt N-API binaries for macOS, Windows, and Linux. It is deliberately excluded from the rollup bundle and copied into `*.sdPlugin/node_modules` by the `copy-deps` build step.

## Testing

A personal checklist of (manual) integration tests to make sure everything functions correctly.

- Making a new Action shows the Scape dongle in the device list and displays the battery level.
- Changing the Device Name and any other settings works individually on each Action.
- Switching between pages does not unload any Actions.
- Turning the headset off shows the asleep icon within a few seconds; turning it back on restores the percentage.
- Unplugging the dongle shows the asleep icon; replugging it resumes monitoring without a restart.
- When Stream Deck starts before the dongle is plugged in, the Action recovers once it is.

## Credits

- HID protocol reference: [charlietran/scapectl](https://github.com/charlietran/scapectl)
- Headphones action icon: [Lucide](https://lucide.dev) (ISC license)
- Property inspector components: [sdpi-components](https://sdpi-components.dev) by Elgato

## License

[MIT](LICENSE)
