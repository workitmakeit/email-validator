import type { Route } from "../types";
import type { Env } from "../index";

import { FormNotFoundError, FormReference, StorageImplementation } from "../abstract_storage";


// TODO: decompose this function into smaller functions
const submit_form_route = async (req: Request, env: Env, storage_impl: StorageImplementation) => {
	// get url search params
	const url = new URL(req.url);
	const params = url.searchParams;


	// validate the link id
	const link_id = params.get("link_id");

	if (!link_id) {
		return new Response("No link ID specified", { status: 400 });
	}

	const id_valid = await storage_impl.is_link_id_valid(link_id);

	if (!id_valid) {
		return new Response("Link ID invalid. Either this link is malformed, has already been used, or hasn't been propagated to your region yet. Try again shortly.", { status: 400 });
	}

	// destroy the link id
	// don't bother to await this, we know it exists and we don't need to wait for it to be destroyed
	storage_impl.destroy_link_id(link_id);


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


	// get the form
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

	// get the form url
	const form_url = form_ref.form_url;


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


	
	// get submit redirect url for later (check form reference, then form data, then undefined)
	const redirect_url = form_ref.redirects?.submit || form_data.get("SubmitRedirectTo") || undefined;
	


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
