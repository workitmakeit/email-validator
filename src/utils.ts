import type { Env } from "./index";


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


export const send_mail = (env: Env, data: EmailData) => {
	const dataUrlEncoded = url_encode_object(data);
	const opts = {
		method: "POST",
		headers: {
			Authorization: "Basic " + btoa("api:" + env.MAILGUN_API_KEY),
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": dataUrlEncoded.length.toString()
		},
		body: dataUrlEncoded,
	}

	return fetch(`${env.MAILGUN_API_BASE_URL}/messages`, opts);
}
// end credit


// TODO: method will be storage implementation specific later
export const get_form_url_from_key = (env: Env, key: string) => {
	// get the dictionary of form keys to urls
	const form_keys_to_urls = JSON.parse(env.FORM_KEYS_TO_URLS_JSON);

	// get the url from the dictionary
	const url = form_keys_to_urls[key];

	return url;
}