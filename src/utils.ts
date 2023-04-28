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
