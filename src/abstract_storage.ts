import { v4 as uuidv4 } from "uuid";

export interface FormReference {
    form_url: string;
    email_field_name?: string; // if undefined, will be set by form data
    redirects?: { // if undefined, will be set by form data (same for each key/url)
        verify?: string;
        success?: string;
    }
    from_address?: string; // if undefined, will fallback to env.FROM_ADDRESS
    mailgun_creds?: { // if undefined, will fallback to env.MAILGUN_API_KEY and env.MAILGUN_API_BASE_URL
        api_key?: string;
        api_base_url?: string;
    }
}

export enum EmailTimeoutReason {
    PENDING_VERIFICATION,
    TOO_MANY_ATTEMPTS,
    BANNED,
}

export interface EmailTimeout {
    reason: EmailTimeoutReason
    expires: Date;
}



export class FormNotFoundError extends Error {
    constructor(key: string) {
        super(`Form not found: ${key}`);
    }
}

export class EmailTimeoutShorterThanCurrentError extends Error {
    constructor(email: string) {
        super(`Email timeout shorter than current: ${email}`);
    }
}


export abstract class StorageImplementation {
    /**
     * Used to create a new form reference (not intended to be used in regular runtime).
     *
     * @abstract
     * @param {string} key - the key to store the form under
     * @param {FormReference} form - the form reference to store
     * @returns {Promise<void>}
     */
    abstract push_form(key: string, form: FormReference): Promise<void>;

    /**
     * Used to retrieve a form reference.
     *
     * @abstract
     * @param {string} key - the key to retrieve the form from
     * @returns {Promise<FormReference>} - the form reference
     * @throws {FormNotFoundError} - if the form is not found
     */
    abstract get_form(key: string): Promise<FormReference>;



    /**
     * Pushes an email timeout to the storage (prefer to use timeout_email for ease of use).
     * 
     * @abstract
     * @param {EmailTimeout} timeout - the timeout to push
     * @returns {Promise<void>}
     * @throws {EmailTimeoutShorterThanCurrentError} - if the timeout is shorter than the current timeout
     * 
     * @see {@link timeout_email}
     * @see {@link is_email_timed_out}
     */
    abstract push_email_timeout(email: string, timeout: EmailTimeout): Promise<void>;

    /**
     * Checks if an email is timed out.
     * 
     * @abstract
     * @param {string} email - the email to check
     * @returns {Promise<boolean>} - true if the email is timed out, false otherwise
     * 
     * @see {@link timeout_email}
     * @see {@link push_email_timeout}
     */
    abstract is_email_timed_out(email: string): Promise<boolean>;



    /**
     * Pushes a link id to the storage (prefer to use provision_link_id for ease of use).
     * 
     * @abstract
     * @param {string} link_id - the link id to push
     * @param {Date | null} expires_at - the date the link id expires at, or null if it never expires
     * @returns {Promise<void>}
     * 
     * @see {@link provision_link_id}
     * @see {@link is_link_id_valid}
     */
    abstract push_link_id(link_id: string, expires_at: Date | null): Promise<void>;

    /**
     * Checks if a link id is valid.
     * 
     * @abstract
     * @param {string} link_id - the link id to check
     * @returns {Promise<boolean>} - true if the link id is valid, false otherwise
     */
    abstract is_link_id_valid(link_id: string): Promise<boolean>;



    /**
     * Helper method to timeout an email.
     * 
     * @param {string} email - the email to timeout
     * @param {number} duration_s - the duration in seconds to timeout the email for
     * @param {EmailTimeoutReason} reason - the reason the email is being timed out
     * @returns {Promise<void>}
     * 
     * @see {@link push_email_timeout}
     * @see {@link is_email_timed_out}
     * @see {@link EmailTimeoutReason}
     */
    timeout_email(email: string, duration_s: number, reason: EmailTimeoutReason): Promise<void> {
        let expires = new Date();

        // add duration_s seconds to timeout
        expires.setSeconds(expires.getSeconds() + duration_s);

        return this.push_email_timeout(email, {
            reason,
            expires
        });
    }



    /**
     * Generates a secure link id.
     * 
     * @returns {string} - the generated link id
     */
    generate_link_id(): string {
        return uuidv4();
    }

    /**
     * Helper method to provision a link id.
     * 
     * @param {Date | null} expires_at - the date the link id expires at, or null if it never expires
     * @returns {Promise<string>} - the generated link id
     * 
     * @see {@link push_link_id}
     * @see {@link is_link_id_valid}
     */
    async provision_link_id(expires_at: Date | null): Promise<string> {
        const id = this.generate_link_id();
        await this.push_link_id(id, expires_at);
        return id;
    }
}
