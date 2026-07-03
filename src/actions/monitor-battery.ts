/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import {
	action,
	DialAction,
	DidReceiveSettingsEvent,
	JsonObject,
	JsonValue,
	KeyAction,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { Jimp } from "jimp";

import { ScapeDongle } from "../scape-hid";
import type { HeadsetStatus, Instance, MonitorSettings } from "../types";

const dongle = new ScapeDongle();
let monitoring = false;

const instances = new Map<string, Instance>();

/**
 * This action talks directly to the Fractal Scape wireless dongle over USB HID and
 * polls it for the headset's battery percentage and connection status.
 *
 * Upon receiving updates, it changes the displayed icon and charged percentage value to match.
 */
@action({ UUID: "dev.niki2k1.scape-battery.monitor" })
export class MonitorBattery extends SingletonAction<MonitorSettings> {
	// Handle change in user defined settings from UI.
	// eslint-disable-next-line jsdoc/require-jsdoc
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<MonitorSettings>): Promise<void> | void {
		const instance = instances.get(ev.action.id);
		if (!instance) return;

		instance.name = ev.payload.settings.name ?? "";
		instance.deviceId = ev.payload.settings.device ?? instance.deviceId;
		instance.backgroundColor = ev.payload.settings.bg ?? instance.backgroundColor;
		instance.spacing = ev.payload.settings.spacing ?? 2;
	}

	// Respond to the UIs request to fill out the getDevices select field.
	// eslint-disable-next-line jsdoc/require-jsdoc
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, MonitorSettings>): Promise<void> | void {
		if (ev.payload instanceof Object && "event" in ev.payload && (ev.payload.event === "getDevices" || ev.payload.event === "refreshDevices")) {
			streamDeck.ui.sendToPropertyInspector({
				event: "getDevices",
				items: ScapeDongle.listDevices().map((device) => ({ label: device.displayName, value: device.id })),
			});
		}
	}

	// Runs once whenever a button instance "appears"; initial set up for the HID monitor.
	// eslint-disable-next-line jsdoc/require-jsdoc
	override onWillAppear(ev: WillAppearEvent<MonitorSettings>): Promise<void> | void {
		instances.set(ev.action.id, {
			deviceId: ev.payload.settings.device ?? "",
			name: ev.payload.settings.name ?? "",
			percentage: ev.payload.settings.value ?? 100,
			backgroundColor: ev.payload.settings.bg ?? "#12142D",
			spacing: ev.payload.settings.spacing ?? 2,
		});

		if (!monitoring) {
			monitoring = true;
			dongle.on("status", (status) => updateInstances(status));
			dongle.on("dongle", (present) => {
				if (!present) updateInstances({ connected: false, percentage: 0, powerOn: false, muted: false });
			});
			dongle.start();
		}
	}

	// Stop polling the dongle when no instances are left on screen.
	// eslint-disable-next-line jsdoc/require-jsdoc
	override onWillDisappear(ev: WillDisappearEvent<MonitorSettings>): Promise<void> | void {
		instances.delete(ev.action.id);
	}
}

/**
 * Updates every visible action instance with the latest headset status.
 * @param status The parsed status from the latest f1 21 poll.
 */
function updateInstances(status: HeadsetStatus): void {
	for (const action of streamDeck.actions) {
		const instance = instances.get(action.id);
		if (!instance) continue;

		// Headset off, out of range, or dongle unplugged.
		if (!status.connected) {
			setCompositeImage(action, "imgs/actions/monitor/asleep");
			action.setTitle("");
			continue;
		}

		instance.percentage = status.percentage;
		const spacingValue = "\n".repeat(instance.spacing);
		const image = getBatteryImage(status.percentage);
		const title = instance.name
			? `${instance.name}${spacingValue}${instance.percentage}%`
			: `${instance.percentage}%`;
		setCompositeImage(action, image);
		action.setTitle(title);
	}
}

/**
 * @param percentage The battery percentage reported by the headset.
 * @returns A string representing the path to the image to be used
 */
function getBatteryImage(percentage: number): string {
	if (percentage == 100) return "imgs/actions/monitor/key-100";
	else if (percentage >= 95) return "imgs/actions/monitor/key-95";
	else if (percentage >= 90) return "imgs/actions/monitor/key-90";
	else if (percentage >= 80) return "imgs/actions/monitor/key-80";
	else if (percentage >= 70) return "imgs/actions/monitor/key-70";
	else if (percentage >= 60) return "imgs/actions/monitor/key-60";
	else if (percentage >= 50) return "imgs/actions/monitor/key-50";
	else if (percentage >= 40) return "imgs/actions/monitor/key-40";
	else if (percentage >= 30) return "imgs/actions/monitor/key-30";
	else if (percentage >= 20) return "imgs/actions/monitor/key-20";
	else if (percentage > 0) return "imgs/actions/monitor/key-10";
	return "imgs/actions/monitor/key-0";
}

/**
 * Creates a Stream Deck-compatible 72x72 image with a background color and an icon layered on top.
 * @param backgroundColor The chosen background color to display, e.g. "#FF0000"
 * @param iconPath Path to the icon to be layered atop the background
 * @returns Promise containing a base64 encoded image
 */
async function createCompositeImage(backgroundColor: string, iconPath: string): Promise<string> {
	const size = 72;

	// Create a blank image (defaults to black)
	const canvas = await new Jimp({ width: size, height: size });

	// Parse the background color (convert hex to ARGB integer)
	const hex = parseInt(`${backgroundColor.split("#")[1]}ff`, 16);

	// Fill with the background color
	canvas.scan(0, 0, size, size, (x, y, idx: number) => {
		canvas.bitmap.data.writeUInt32BE(hex, idx);
	});

	// Load and resize the icon
	const icon = await Jimp.read(`${iconPath}@2x.png`);
	await icon.resize({ w: 64 }); // maintain aspect ratio

	// Center the icon
	const offsetX = (size - icon.bitmap.width) / 2;
	const offsetY = (size - icon.bitmap.height) / 2;
	canvas.composite(icon, offsetX, offsetY);

	// Export as Base64 PNG
	const buffer = await canvas.getBuffer("image/png");
	return `data:image/png;base64,${buffer.toString("base64")}`;
}

/**
 * @param action Action object used to set the image for this instance
 * @param imagePath Path to the image we want to set
 * @param backgroundColor Hexadecimal string representing the background color
 */
function setCompositeImage(
	action: DialAction<JsonObject> | KeyAction<JsonObject>,
	imagePath: string,
	backgroundColor: string = "#12142D",
): void {
	const instance = instances.get(action.id);
	const bg = instance && instance.backgroundColor ? instance.backgroundColor : backgroundColor;
	createCompositeImage(bg, imagePath)
		.then((image64) => {
			action.setImage(image64);
		})
		.catch(() => {
			action.setImage(imagePath);
		});
}
