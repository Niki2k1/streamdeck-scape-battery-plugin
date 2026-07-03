import { config } from "@elgato/eslint-config";

export default [
	{
		ignores: ["com.fresh.scape-battery.sdPlugin/**", "*.config.js", "*.config.mjs"],
	},
	...config.recommended,
];
