export interface Env {
	FROM_ADDRESS: string;
	MAILGUN_API_KEY: string;
	MAILGUN_API_BASE_URL: string;
	FORM_KEYS_TO_URLS_JSON: string;
	SECRET_SIGNATURE: string;
}

// credit: Guido Zuidhof https://dev.to/gzuidhof/sending-e-mails-from-cloudflare-workers-2abl
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


function url_encode_object(obj: { [s: string]: any }) {
	return Object.keys(obj)
		.map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
		.join("&");
}


export function send_mail(env: Env, data: EmailData) {
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

export function get_form_url_from_key(env: Env, key: string) {
	// get the dictionary of form keys to urls
	const form_keys_to_urls = JSON.parse(env.FORM_KEYS_TO_URLS_JSON);

	// get the url from the dictionary
	const url = form_keys_to_urls[key];

	return url;
}

export async function verify_email_route(req: Request, env: Env) {
	// check if body is form data
	if (req.headers.get("content-type") !== "application/x-www-form-urlencoded") {
		return new Response("Invalid content type", { status: 400 });
	}


	// copy x-www-form-urlencoded from the request body
	const form_data = await req.formData();

	if (!form_data) {
		return new Response("No form data", { status: 400 });
	}


	// get the field containing the email address from the form data
	const email_field_name = form_data.get("EmailFieldName");

	if (!email_field_name) {
		return new Response("No email field name specified", { status: 400 });
	}


	// get the email address from the form data
	const to = form_data.get(email_field_name);

	if (!to) {
		return new Response("No email address specified", { status: 400 });
	}


	// get the intended form key from the form data
	const form_key = form_data.get("FormKey");

	if (!form_key) {
		return new Response("No form key specified", { status: 400 });
	}

	// get verify redirect url for later
	const redirect_url = form_data.get("VerifyRedirectTo");

	// remove VerifyRedirectTo from the form data
	form_data.delete("VerifyRedirectTo");


	// convert to json
	const form_json = Object.fromEntries(form_data.entries());


	// get the url to the form
	let form_url: string;
	try {
		form_url = get_form_url_from_key(env, form_key);
	} catch (e) {
		console.error(e);
		return new Response("Form keys misconfigured", { status: 500 });
	}

	if (!form_url) {
		return new Response("Invalid form key", { status: 400 });
	}


	// generate a hash of the email address, data, form url, and secret signature
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(form_json) + form_url + env.SECRET_SIGNATURE));

	// convert the hash to a string
	const hash_string = Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");



	// generate the validation submission url from the same data and the hash
	const submit_url = new URL(req.url);
	submit_url.pathname = "/submit-form";

	submit_url.searchParams.set("data", JSON.stringify(form_json));
	submit_url.searchParams.set("hash", hash_string);

	// send the email
	const res = await send_mail(env, {
		from: env.FROM_ADDRESS,
		to,

		subject: "Verify email to submit form",

		text: `Hello! This email was entered into a form, which requires validation before submission.
		Please click the link below to validate your email address and submit the form.

		${submit_url.toString()}
		
		If you did not enter your email into a form, please ignore this email. Thank you!`,

		html: `<h1>Please verify your email</h1>
		<p>Hello! This email was entered into a form, which requires validation before submission.</p>
		<p>Please click the link below to validate your email address and submit the form.</p>
		<p><a href="${submit_url.toString()}">${submit_url.toString()}</a></p>
		<p>If you did not enter your email into a form, please ignore this email. Thank you!</p>`
	});


	// check if the email was sent successfully
	if (res.status !== 200) {
		console.error(res);
		return new Response("Failed to send email", { status: 500 });
	}


	if (redirect_url) {
		// redirect to the redirect url with a 302
		return new Response("Email sent", { status: 302, headers: { Location: redirect_url } });
	}


	return new Response("Form ready to submit. Please check your emails for a verification link to submit the form.", { status: 200 });
}

export async function submit_form_route(req: Request, env: Env) {
	// get url search params
	const url = new URL(req.url);
	const params = url.searchParams;

	// get the data from the url
	const data = params.get("data");

	if (!data) {
		return new Response("No form data specified", { status: 400 });
	}

	// get the hash from the url
	const provided_hash_string = params.get("hash");

	if (!provided_hash_string) {
		return new Response("No hash specified", { status: 400 });
	}


	// transform the form data string back to a form data object
	let data_json: { [key: string]: string };
	try {
		data_json = JSON.parse(data);
	} catch (e) {
		console.error(e);
		return new Response("Invalid form data", { status: 400 });
	}

	// convert the data to a form data object
	const form_data = new FormData();
	for (const key in data_json) {
		form_data.set(key, data_json[key]);
	}


	// get the form key from the form data
	const form_key = form_data.get("FormKey");

	if (!form_key) {
		return new Response("No form key specified", { status: 400 });
	}


	// get the url to the form
	let form_url: string;
	try {
		form_url = get_form_url_from_key(env, form_key);
	} catch (e) {
		console.error(e);
		return new Response("Form keys misconfigured", { status: 500 });
	}

	if (!form_url) {
		return new Response("Invalid form key", { status: 400 });
	}


	// get the email address from the form data
	const email_field_name = form_data.get("EmailFieldName");

	if (!email_field_name) {
		return new Response("No email field name specified", { status: 400 });
	}

	const to = form_data.get(email_field_name);

	if (!to) {
		return new Response("No email address specified", { status: 400 });
	}


	// get redirect url for later
	const redirect_url = form_data.get("SubmitRedirectTo");


	// generate a hash of the email address, data, form url, and secret signature
	const hash_check = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data + form_url + env.SECRET_SIGNATURE));

	// convert the hash to a string
	const hash_string = Array.from(new Uint8Array(hash_check))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");


	// check if the hash is correct
	if (hash_string !== provided_hash_string) {
		return new Response("Invalid hash", { status: 400 });
	}


	// remove EmailFieldName, FormKey, and SubmitRedirectTo from the form data
	form_data.delete("EmailFieldName");
	form_data.delete("FormKey");
	form_data.delete("SubmitRedirectTo");


	// send the form data to the form url
	const res = await fetch(form_url, {
		method: "POST",
		body: form_data
	});

	// check if the form was submitted successfully
	if (res.status !== 200) {
		console.error(res);
		return new Response("Failed to submit form", { status: 500 });
	}


	if (redirect_url) {
		// redirect to the redirect url with a 302
		return new Response("Form submitted", { status: 302, headers: { Location: redirect_url } });
	}


	return new Response("Form submitted", { status: 200 });
}

export default {
	async fetch(req: Request, env: Env, _ctx: ExecutionContext) {
		// check every field of env is defined
		if (!env.FROM_ADDRESS || !env.MAILGUN_API_KEY || !env.MAILGUN_API_BASE_URL || !env.FORM_KEYS_TO_URLS_JSON || !env.SECRET_SIGNATURE) {
			return new Response("Worker not configured", { status: 500 });
		}

		// get route from url
		const url = new URL(req.url);
		const route = url.pathname;

		// if this is the route for sending verification emails
		if (route === "/verify-email") {
			// check this is a post request
			if (req.method !== "POST") {
				return new Response("Invalid method", { status: 400 });
			}

			return verify_email_route(req, env);
		} else if (route === "/submit-form") {
			// check this is a GET request
			if (req.method !== "GET") {
				return new Response("Invalid method", { status: 400 });
			}

			return submit_form_route(req, env);
		} else {
			return new Response("Invalid route", { status: 404 });
		}
	}
};