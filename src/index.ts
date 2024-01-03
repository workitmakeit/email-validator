import { StorageImplementation } from "./abstract_storage";
import * as storage_impls from "./storage_impl/@ALL";

import * as _v1_routes from "./routes/v1/@ALL";
import { MethodString, Route, ValidMethods } from "./types";


// push each routing version into a map
const routes = new Map<string, Map<string, Route>>();

// push v1 and get reference
const _v1_map = routes.set("v1", new Map()).get("v1")!;

for (const [key, route] of Object.entries(_v1_routes)) {
	_v1_map.set(key, route);
}

export interface Env {
	FROM_ADDRESS: string;

	MAILGUN_API_KEY: string;
	MAILGUN_API_BASE_URL: string;

	SECRET_SIGNATURE: string;

	STORAGE_IMPLEMENTATION: string;

	FORMS: KVNamespace;
	TIMEOUTS: KVNamespace;
	LINKS: KVNamespace;
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
				if (!env.FORMS || !env.TIMEOUTS || !env.LINKS) {
					console.error("Missing namespaces");
					return new Response("Worker not configured", { status: 500 });
				}

				storage_impl = new storage_impls.KVStorage({
					forms: env.FORMS,
					timeouts: env.TIMEOUTS,
					links: env.LINKS,
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

		// get last 2 path segments
		const path_segments = url.pathname.split("/");

		// if there are less than 2 segments, return 404
		if (path_segments.length < 2) {
			return new Response("Route not found", { status: 404 });
		}

		const [version, key] = path_segments.slice(-2); // e.g. ["v1", "verify_email"]

		// if they are requesting the root, show a status message
		if (version === "" || key === "") {
			return new Response("Worker OK", { status: 200 });
		}

		// check version exists
		if (!routes.has(version)) {
			return new Response("Version not found", { status: 404 });
		}

		// get route by key
		const route = routes.get(version)!.get(key);

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
