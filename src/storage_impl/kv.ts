import { StorageImplementation, FormReference, EmailTimeout, FormNotFoundError, EmailTimeoutShorterThanCurrentError } from "../abstract_storage";

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
        // set the expiration to years in the future if it's null
        let expiration_date = expires_at ?? new Date(253402300000000);

        // convert to seconds past epoch
        let expiration = Math.floor(expiration_date.getTime() / 1000);

        await this._ns.link_ids.put(link_id, "", { expiration });
    }

    async is_link_id_valid(link_id: string): Promise<boolean> {
        return await this._ns.link_ids.get(link_id) !== null;
    }
}

export default KVStorageImpl;
