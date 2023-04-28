import { StorageImplementation, FormReference, EmailTimeout, FormNotFoundError, EmailTimeoutShorterThanCurrentError, LinkIDInUseError, LinkIDNotFoundError } from "../abstract_storage";

export interface NSObject {
    forms: KVNamespace;
    timeouts: KVNamespace;
    link_ids: KVNamespace;
};

class KVStorageImpl extends StorageImplementation {
    _ns: NSObject;

    constructor(namespaces: NSObject) {
        super();

        this._ns = namespaces;
    }



    async push_form(key: string, form: FormReference): Promise<void> {
        await this._ns.forms.put(key, JSON.stringify(form));
    }

    async get_form(key: string): Promise<FormReference> {
        let form = await this._ns.forms.get(key);
        if (!form) {
            throw new FormNotFoundError(key);
        }

        return JSON.parse(form);
    }



    async push_email_timeout(email: string, timeout: EmailTimeout): Promise<void> {
        // if this timeout is longer than the current timeout, replace it
        let current_timeout = await this._ns.timeouts.get(email);

        if (current_timeout) {
            let current_timeout_obj = JSON.parse(current_timeout);
            if (current_timeout_obj.expires > timeout.expires) {
                throw new EmailTimeoutShorterThanCurrentError(email);
            }
        }

        await this._ns.timeouts.put(email, JSON.stringify(timeout));
    }

    async is_email_timed_out(email: string): Promise<boolean> {
        let timeout = await this._ns.timeouts.get(email);
        if (!timeout) {
            return false;
        }

        let timeout_obj = JSON.parse(timeout);
        return timeout_obj.expires < new Date();
    }



    async push_link_id(link_id: string, expires_at: Date | null): Promise<void> {
        // check if the link id already exists (unlikely event unless purposeful)
        if (await this._ns.link_ids.get(link_id) !== null) {
            throw new LinkIDInUseError(link_id);
        }

        // push the link id, using the expiration if it exists (time past epoch in seconds)
        // NOTE: current, value is not used, only for manual inspection. this may be changed to hold form data later on.
        if (expires_at) {
            await this._ns.link_ids.put(link_id, `(expires at ${expires_at.toISOString()})`, { expiration: (expires_at.getTime() / 1000) });
        } else {
            await this._ns.link_ids.put(link_id, "(never expires)");
        }
    }

    async is_link_id_valid(link_id: string): Promise<boolean> {
        return await this._ns.link_ids.get(link_id) !== null;
    }

    async destroy_link_id(link_id: string): Promise<void> {
        // check if the link id exists
        if (await this._ns.link_ids.get(link_id) === null) {
            throw new LinkIDNotFoundError(link_id);
        }

        await this._ns.link_ids.delete(link_id);
    }
}

export default KVStorageImpl;
