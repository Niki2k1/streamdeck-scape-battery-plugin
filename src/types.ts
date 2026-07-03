/**
 * User defined settings for a monitor action instance.
 */
export type MonitorSettings = {
	/**
	 * Charging percentage value.
	 */
	value?: number;
	/**
	 * The name shown above the percentage.
	 */
	name?: string;
	/**
	 * The ID of the device (HID path of the Scape dongle).
	 */
	device: string;

	/**
	 * Hexadecimal string for the background color.
	 */
	bg: string;

	/**
	 * Number of line breaks between title and percentage.
	 */
	spacing: number;
};

/**
 * Parsed f1 21 status poll response from the headset.
 */
export type HeadsetStatus = {
	/**
	 * Whether the headset is connected to the dongle (byte 18 of the status blob).
	 */
	connected: boolean;
	/**
	 * Battery percentage 0-100 (byte 14 of the status blob).
	 */
	percentage: number;
	/**
	 * Whether the headset is powered on (byte 20 of the status blob).
	 */
	powerOn: boolean;
	/**
	 * Whether the boom mic is muted (byte 4 of the status blob).
	 */
	muted: boolean;
};

/**
 * Represents a selectable device shown in the Property Inspector dropdown.
 */
export type Device = {
	/**
	 * HID path of the dongle's vendor collection.
	 */
	id: string;
	/**
	 * The displayed name of the device. Human readable.
	 */
	displayName: string;
};

/**
 * The specific Streamdeck contextual instance.
 * Ie, which 'button' is being updated.
 */
export type Instance = {
	/**
	 * The device assigned to this instance.
	 * Set through the menu dropdown.
	 */
	deviceId: string;
	/**
	 * Custom title, if any.
	 * Set through the menu.
	 */
	name: string;
	/**
	 * The current charged percentage of the device.
	 */
	percentage: number;

	/**
	 * Hexadecimal string for the icon's background color.
	 */
	backgroundColor: string;
	/**
	 * How many line breaks between the title and the percentage shown.
	 */
	spacing: number;
};
