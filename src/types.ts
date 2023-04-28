import { StorageImplementation } from "./abstract_storage";
import type { Env } from "./index";

export const ValidMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type MethodString = typeof ValidMethods[number];

export type RouteHandler = (req: Request, env: Env, storage_impl: StorageImplementation) => Promise<Response>;
export interface Route {
    handle: RouteHandler;
    methods: MethodString[];
}
