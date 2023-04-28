import type { Route } from "../types";
import type { Env } from "../index";

import { send_mail, get_form_url_from_key } from "../utils";


// TODO: decompose this function into smaller functions
const verify_email_route = async (req: Request, env: Env) => {
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
	submit_url.pathname = "/submit_form";

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
