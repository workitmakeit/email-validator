import type { Route } from "../types";
import type { Env } from "../index";

import { send_mail } from "../utils";
import { FormNotFoundError, FormReference, StorageImplementation } from "../abstract_storage";


// TODO: decompose this function into smaller functions
const verify_email_route = async (req: Request, env: Env, storage_impl: StorageImplementation) => {
	// check if body is form data
	if (req.headers.get("content-type") !== "application/x-www-form-urlencoded") {
		return new Response("Invalid content type", { status: 400 });
	}


	// copy x-www-form-urlencoded from the request body
	const form_data = await req.formData();

	if (!form_data) {
		return new Response("No form data", { status: 400 });
	}


	// get the intended form key from the form data
	const form_key = form_data.get("FormKey");

	if (!form_key) {
		return new Response("No form key specified", { status: 400 });
	}

	// get the form reference from the key
	let form_ref: FormReference;
	try {
		form_ref = await storage_impl.get_form(form_key);
	} catch (e) {
		if (e instanceof FormNotFoundError) {
			return new Response("Form key invalid", { status: 400 });
		}

		console.error(e);
		return new Response("Internal server error", { status: 500 });
	}



	// get the field containing the email address (check form reference, then form data, then undefined)
	const email_field_name = form_ref.email_field_name || form_data.get("EmailFieldName") || undefined;

	if (!email_field_name) {
		return new Response("No email field name specified", { status: 400 });
	}


	// get the email address from the form data
	const to = form_data.get(email_field_name);

	if (!to) {
		return new Response("No email address specified", { status: 400 });
	}


	// get verify redirect url for later (check form reference, then form data, then undefined)
	const redirect_url = form_ref.redirects?.verify || form_data.get("VerifyRedirectTo") || undefined;

	// remove VerifyRedirectTo from the form data if it exists
	form_data.delete("VerifyRedirectTo");


	// convert to json
	const form_json = Object.fromEntries(form_data.entries());

	// get the form url
	const form_url = form_ref.form_url;


	// generate a hash of the email address, data, form url, and secret signature
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(form_json) + form_url + env.SECRET_SIGNATURE));

	// convert the hash to a string
	const hash_string = Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");


	// provision a link ID with no expiration
	// TODO: add confgurable expiration
	const link_id = await storage_impl.provision_link_id(null);


	// generate the validation submission url from the same data and the hash
	const submit_url = new URL(req.url);
	submit_url.pathname = "/submit_form";

	submit_url.searchParams.set("data", JSON.stringify(form_json));
	submit_url.searchParams.set("hash", hash_string);
	submit_url.searchParams.set("link_id", link_id);


	// get the mailgun creds (check form reference, then add whatever is missing from env, cannot be undefined)
	const mailgun_creds = form_ref.mailgun_creds || {};

	if (mailgun_creds.api_key === undefined) {
		mailgun_creds.api_key = env.MAILGUN_API_KEY;
	}
	
	if(mailgun_creds.api_base_url === undefined) {
		mailgun_creds.api_base_url = env.MAILGUN_API_BASE_URL;
	}

	// send the email
	/* @ts-ignore-next-line */ // for some reason, even though it is impossible for each cred to be undefined, typescript thinks it is possible
	const res = await send_mail(mailgun_creds, {
		// select the from address from the form reference, then the env, cannot be undefined
		from: form_ref.from_address || env.FROM_ADDRESS,
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
		console.error(`Failed to send email: ${res.status} ${res.statusText}`);
		return new Response("Failed to send email", { status: 500 });
	}


	if (redirect_url) {
		// redirect to the redirect url with a 302
		return new Response("Email sent", { status: 302, headers: { Location: redirect_url } });
	}


	return new Response("Form ready to submit. Please check your emails for a verification link to submit the form.", { status: 200 });
}


export default {
	handle: verify_email_route,
	methods: ["POST"],
} as Route;
