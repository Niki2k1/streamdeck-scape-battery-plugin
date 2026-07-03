import { config } from "@elgato/eslint-config";

export default [
	{
		ignores: ["dev.niki2k1.scape-battery.sdPlugin/**", "*.config.js", "*.config.mjs"],
	},
	...config.recommended,
];
