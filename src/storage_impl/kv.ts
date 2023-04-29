import { StorageImplementation, FormReference, EmailTimeout, FormNotFoundError, EmailTimeoutShorterThanCurrentError, LinkIDInUseError, LinkIDNotFoundError, InvalidFormField } from "../abstract_storage";
import { form_data_to_json, json_to_form_data } from "../utils";

export interface NSObject {
    forms: KVNamespace;
    timeouts: KVNamespace;
    links: KVNamespace;
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



    async push_link(link_id: string, form_data: FormData, expires_at: Date | null): Promise<void> {
        // check if the link id already exists (unlikely event unless purposeful)
        if (await this._ns.links.get(link_id) !== null) {
            throw new LinkIDInUseError(link_id);
        }

        // convert the form data to a JSON string
        const form_data_smart = await form_data_to_json(form_data);
        const form_data_str = JSON.stringify(form_data_smart);

        // push the link and data, using the expiration if it exists (time past epoch in seconds)
        if (expires_at) {
            await this._ns.links.put(link_id, form_data_str, { expiration: (expires_at.getTime() / 1000) });
        } else {
            await this._ns.links.put(link_id, form_data_str);
        }
    }

    async is_link_valid(link_id: string): Promise<boolean> {
        return await this._ns.links.get(link_id) !== null;
    }

    async get_link_form_data(link_id: string): Promise<FormData> {
        const link_data = await this._ns.links.get(link_id);

        if (link_data === null) {
            throw new LinkIDNotFoundError(link_id);
        }

        // parse the link data
        const link_data_obj = JSON.parse(link_data);

        // convert the form data to a FormData object
        const form_data = json_to_form_data(link_data_obj);

        return form_data;
    }

    async destroy_link(link_id: string): Promise<void> {
        // check if the link id exists
        if (await this._ns.links.get(link_id) === null) {
            throw new LinkIDNotFoundError(link_id);
        }

        await this._ns.links.delete(link_id);
    }
}

export default KVStorageImpl;
