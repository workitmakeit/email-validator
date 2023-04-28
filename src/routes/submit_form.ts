import type { Route } from "../types";
import type { Env } from "../index";

import { get_form_url_from_key } from "../utils";
import { StorageImplementation } from "../abstract_storage";


// TODO: decompose this function into smaller functions
const submit_form_route = async (req: Request, env: Env, storage_impl: StorageImplementation) => {
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
	handle: submit_form_route,
	methods: ["GET"],
} as Route;
