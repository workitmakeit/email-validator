import * as _routes from "./routes/@ALL";
import { MethodString, Route, ValidMethods } from "./types";

// give a type to the routes object
const routes: { [key: string]: Route } = _routes;


export interface Env {
	FROM_ADDRESS: string;
	MAILGUN_API_KEY: string;
	MAILGUN_API_BASE_URL: string;
	FORM_KEYS_TO_URLS_JSON: string;
	SECRET_SIGNATURE: string;
}


export default {
	async fetch(req: Request, env: Env, _ctx: ExecutionContext) {
		// check every field of env is defined
		if (!env.FROM_ADDRESS || !env.MAILGUN_API_KEY || !env.MAILGUN_API_BASE_URL || !env.FORM_KEYS_TO_URLS_JSON || !env.SECRET_SIGNATURE) {
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

		// prevent prototype pollution
		if (key.includes("__proto__") || key.includes("constructor") || key.includes("prototype")) {
			return new Response("Disallowed route name", { status: 400 });
		}

		const route = routes[key];


		// check route exists
		if (!route) {
			return new Response("Route not found", { status: 404 });
		}

		// check method is allowed
		if (!route.methods.includes(method)) {
			return new Response("Method not allowed", { status: 405 });
		}

		// handle the request
		return await route.handle(req, env);
	}
};
