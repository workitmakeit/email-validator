import { StorageImplementation } from "./abstract_storage";
import * as storage_impls from "./storage_impl/@ALL";

import * as _routes from "./routes/@ALL";
import { MethodString, Route, ValidMethods } from "./types";

// convert _routes to a map of routes
const routes: Map<string, Route> = new Map(Object.entries(_routes));

export interface Env {
	FROM_ADDRESS: string;

	MAILGUN_API_KEY: string;
	MAILGUN_API_BASE_URL: string;

	SECRET_SIGNATURE: string;

	STORAGE_IMPLEMENTATION: string;

	FORMS: KVNamespace;
	TIMEOUTS: KVNamespace;
	LINK_IDS: KVNamespace;
}


export default {
	async fetch(req: Request, env: Env, _ctx: ExecutionContext) {
		// check every field of env is defined
		if (!env.FROM_ADDRESS || !env.MAILGUN_API_KEY || !env.MAILGUN_API_BASE_URL || !env.SECRET_SIGNATURE || !env.STORAGE_IMPLEMENTATION) {
			console.error("Missing environment/secret variables");
			return new Response("Worker not configured", { status: 500 });
		}


		// create storage implementation
		let storage_impl: StorageImplementation;
		switch (env.STORAGE_IMPLEMENTATION.toLowerCase()) {
			case "kv":
				// check all namespaces are defined
				if (!env.FORMS || !env.TIMEOUTS || !env.LINK_IDS) {
					console.error("Missing namespaces");
					return new Response("Worker not configured", { status: 500 });
				}

				storage_impl = new storage_impls.KVStorage({
					forms: env.FORMS,
					timeouts: env.TIMEOUTS,
					link_ids: env.LINK_IDS,
				});
				break;
			default:
				console.error("Invalid storage implementation");
				return new Response("Worker not configured", { status: 500 });
		}


		// assert method is allowed to be a MethodString
		if (!ValidMethods.includes(req.method as any)) {
			return new Response("Method not known", { status: 405 });
		}

		// cast method to MethodString
		const method = req.method as MethodString;


		// get pathname from url without slashes to resolve route
		const url = new URL(req.url);
		const key = url.pathname.replace(/^\/+|\/+$/g, "");

		const route = routes.get(key);


		// check route exists
		if (!route) {
			return new Response("Route not found", { status: 404 });
		}

		// check method is allowed
		if (!route.methods.includes(method)) {
			return new Response("Method not allowed", { status: 405 });
		}

		// handle the request
		return await route.handle(req, env, storage_impl);
	}
};
