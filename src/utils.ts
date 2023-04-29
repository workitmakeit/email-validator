import type { Env } from "./index";
import { KVFieldMarker, SmartFormJSON } from "./types";


// credit: Guido Zuidhof https://dev.to/gzuidhof/sending-e-mails-from-cloudflare-workers-2abl (modified)
export interface EmailData {
	from: string;
	to: string;
	subject: string;
	text: string;
	html: string
	cc?: string;
	bcc?: string;
	"h-Reply-To"?: string;
	"o:testmode"?: boolean;
}


const url_encode_object = (obj: { [s: string]: any }) => {
	return Object.keys(obj)
		.map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
		.join("&");
}


export const send_mail = (creds: {
	api_key: string;
	api_base_url: string;
}, data: EmailData) => {
	const dataUrlEncoded = url_encode_object(data);
	const opts = {
		method: "POST",
		headers: {
			Authorization: "Basic " + btoa("api:" + creds.api_key),
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": dataUrlEncoded.length.toString()
		},
		body: dataUrlEncoded,
	}

	return fetch(`${creds.api_base_url}/messages`, opts);
}
// end credit


export class InvalidKVFieldMarkerError extends Error {
	constructor(marker: number) {
		super(`Invalid KVFieldMarker: ${marker}`);
	}
}

/**
 * Converts FormData into a smart JSON object, retaining Blob data as base64 strings.
 *
 * @async
 * @param {FormData} form_data
 * @returns {Promise<SmartFormJSON>} JSON object
 * 
 * @see {@link json_to_form_data}
 */
export const form_data_to_json = async (form_data: FormData) => {
	const json: SmartFormJSON = {};

	for (const [key, value] of form_data.entries()) {
		let cast_val = value as string | Blob;

		if (cast_val instanceof Blob) {
			const buf = Buffer.from(await cast_val.text());
			json[key] = {
				marker: KVFieldMarker.B64_BLOB,
				value: buf.toString("base64"),
				metadata: {
					type: cast_val.type,
				}
			};
		} else {
			json[key] = {
				marker: KVFieldMarker.STRING,
				value: cast_val
			};
		}
	}

	return json;
}

/**
 * Converts a smart JSON object into FormData, converting base64 strings into Blobs.
 * 
 * @param {SmartFormJSON} json
 * @returns {FormData} FormData object
 * @throws {InvalidKVFieldMarkerError} if the KVFieldMarker is invalid
 * 
 * @see {@link form_data_to_json}
 */
export const json_to_form_data = (json: SmartFormJSON) => {
	const form_data = new FormData();

	for (const [key, value] of Object.entries(json)) {
		switch (value.marker) {
			case KVFieldMarker.STRING:
				form_data.append(key, value.value);
				break;
			case KVFieldMarker.B64_BLOB:
				const type = value.metadata?.type ?? "application/octet-stream";
				const blob = new Blob([Buffer.from(value.value, "base64")], { type });

				form_data.append(key, blob);
				break;
			default:
				throw new InvalidKVFieldMarkerError(value.marker);
		}
	}

	return form_data;
}
