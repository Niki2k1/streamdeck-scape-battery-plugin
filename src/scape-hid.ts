/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { EventEmitter } from "node:events";
import HID from "node-hid";

import type { Device, HeadsetStatus } from "./types";

// Fractal Design Scape USB identifiers.
// Protocol reference: https://github.com/charlietran/scapectl (reverse-engineered
// from Fractal's Adjust web app at adjust.fractal-design.com).
const VENDOR_ID = 0x36bc;
const DONGLE_PRODUCT_ID = 0x0001;
const VENDOR_USAGE_PAGE = 0xff00;

const REPORT_ID = 0x02;
const REPORT_SIZE = 64; // report ID byte + 63 byte payload

const CMD_STATUS_POLL = [0xf1, 0x21];
const CMD_KEEPALIVE = [0xa4, 0x0e, 0x99];

const POLL_INTERVAL_MS = 1500;
const RESPONSE_TIMEOUT_MS = 800; // headset relay round-trip is ~60ms; timeout means headset is off

/**
 * Events emitted by the ScapeDongle monitor.
 */
export type ScapeEvents = {
	/**
	 * Fired after every status poll with the parsed headset state.
	 */
	status: [status: HeadsetStatus];
	/**
	 * Fired when the dongle is found and opened, or lost (unplugged).
	 */
	dongle: [present: boolean];
};

/**
 * A pending sendAndReceive call awaiting its echo response.
 */
type PendingResponse = {
	/**
	 * Resolves the sendAndReceive promise with the response payload, or null on timeout.
	 */
	resolve: (data: Buffer | null) => void;
	/**
	 * Timeout handle for the response deadline.
	 */
	timer: NodeJS.Timeout;
};

/**
 * Maintains a persistent HID connection to the Scape wireless dongle and polls
 * the headset status (battery, connection, power) every POLL_INTERVAL_MS.
 *
 * The dongle relays f1-prefixed commands to the headset over 2.4GHz; when the
 * headset is off the poll times out, which is reported as {connected: false}.
 */
export class ScapeDongle extends EventEmitter<ScapeEvents> {
	/**
	 * The in-flight status poll waiting for its echo response, if any.
	 */
	private awaitingResponse: PendingResponse | null = null;
	/**
	 * Open HID handle to the dongle's vendor collection.
	 */
	private device: HID.HID | null = null;
	/**
	 * Interval driving the poll loop.
	 */
	private pollTimer: NodeJS.Timeout | null = null;
	/**
	 * Guards against overlapping poll cycles.
	 */
	private polling = false;

	/**
	 * Lists the connected Scape dongles (vendor collection only).
	 * @returns List of matching devices with their HID path as id.
	 */
	static listDevices(): Device[] {
		return HID.devices()
			.filter(
				(d) =>
					d.vendorId === VENDOR_ID &&
					d.productId === DONGLE_PRODUCT_ID &&
					d.usagePage === VENDOR_USAGE_PAGE &&
					d.usage === 1 &&
					d.path,
			)
			.map((d) => ({ id: d.path!, displayName: d.product ?? "Fractal Scape" }));
	}

	/**
	 * Starts monitoring: opens the dongle (retrying until found) and begins the poll loop.
	 */
	start(): void {
		if (this.pollTimer) return;
		this.pollTimer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
		void this.tick();
	}

	/**
	 * Stops monitoring and closes the HID connection.
	 */
	stop(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.closeDevice();
	}

	/**
	 * Closes the HID device and notifies listeners.
	 */
	private closeDevice(): void {
		if (this.awaitingResponse) {
			clearTimeout(this.awaitingResponse.timer);
			this.awaitingResponse.resolve(null);
			this.awaitingResponse = null;
		}
		if (this.device) {
			try {
				this.device.close();
			} catch {
				// already closed
			}
			this.device = null;
			this.emit("dongle", false);
		}
	}

	/**
	 * Handles an incoming HID input report. Responses echo the 2 command bytes;
	 * unsolicited dongle reports (11 21) are discarded.
	 * @param data Raw input report. On some platforms the report ID (0x02) is prepended.
	 */
	private handleData(data: Buffer): void {
		const payload = data[0] === REPORT_ID ? data.subarray(1) : data;
		if (!this.awaitingResponse) return;
		if (payload[0] === CMD_STATUS_POLL[0] && payload[1] === CMD_STATUS_POLL[1]) {
			clearTimeout(this.awaitingResponse.timer);
			this.awaitingResponse.resolve(payload);
			this.awaitingResponse = null;
		}
	}

	/**
	 * Attempts to find and open the dongle's vendor HID collection.
	 * @returns Whether the device was opened.
	 */
	private openDevice(): boolean {
		const [dongle] = ScapeDongle.listDevices();
		if (!dongle) return false;

		try {
			this.device = new HID.HID(dongle.id);
		} catch {
			return false;
		}

		this.device.on("data", (data: Buffer) => this.handleData(data));
		this.device.on("error", () => this.closeDevice());
		this.emit("dongle", true);
		return true;
	}

	/**
	 * Writes a command as a 64-byte output report (report ID + zero-padded payload).
	 * @param cmd Command bytes to send.
	 */
	private send(cmd: number[]): void {
		if (!this.device) throw new Error("device not open");
		const buf = Buffer.alloc(REPORT_SIZE);
		buf[0] = REPORT_ID;
		buf.set(cmd, 1);
		this.device.write(buf);
	}

	/**
	 * Sends a command and waits for the matching echo response.
	 * @param cmd Command bytes to send.
	 * @returns The response payload, or null on timeout (headset offline).
	 */
	private sendAndReceive(cmd: number[]): Promise<Buffer | null> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.awaitingResponse = null;
				resolve(null);
			}, RESPONSE_TIMEOUT_MS);
			this.awaitingResponse = { resolve, timer };
			try {
				this.send(cmd);
			} catch (err) {
				clearTimeout(timer);
				this.awaitingResponse = null;
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	/**
	 * Single poll cycle: ensure the dongle is open, poll status, send keepalive.
	 */
	private async tick(): Promise<void> {
		if (this.polling) return; // previous cycle still in flight
		this.polling = true;
		try {
			if (!this.device && !this.openDevice()) return;

			const response = await this.sendAndReceive(CMD_STATUS_POLL);
			this.emit("status", parseStatus(response));

			// The Adjust web app sends this heartbeat after each successful poll.
			if (response) this.send(CMD_KEEPALIVE);
		} catch {
			// Write failed — dongle likely unplugged. Close and re-enumerate next tick.
			this.closeDevice();
		} finally {
			this.polling = false;
		}
	}
}

/**
 * Parses the f1 21 status blob into a HeadsetStatus.
 * Byte layout (payload offsets, report ID stripped):
 * [3] boom mic, [4] muted, [14] battery %, [18] connected, [20] power state.
 * @param payload Response payload starting with the f1 21 echo, or null if the poll timed out.
 * @returns Parsed status; a timeout is reported as disconnected.
 */
function parseStatus(payload: Buffer | null): HeadsetStatus {
	if (!payload || payload.length < 21) {
		return { connected: false, percentage: 0, powerOn: false, muted: false };
	}
	const connected = payload[18] === 0x01;
	return {
		connected,
		percentage: connected ? payload[14] : 0,
		powerOn: payload[20] === 0x01,
		muted: payload[4] !== 0x00,
	};
}
