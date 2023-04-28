import type { Env } from "./index";

export const ValidMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type MethodString = typeof ValidMethods[number];

export type RouteHandler = (req: Request, env: Env) => Promise<Response>;
export interface Route {
    handle: RouteHandler;
    methods: MethodString[];
}
