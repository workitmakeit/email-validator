import { v4 as uuidv4 } from "uuid";

export interface FormReference {
    form_url: string;

    email_field_name?: string; // if undefined, will be set by form data (EmailFieldName)

    redirects?: { // if undefined, will be set by form data (VerifyRedirectTo & SubmitRedirectTo)
        verify?: string;
        submit?: string;
    }

    mailgun_creds?: { // if undefined, will fallback to env.MAILGUN_API_KEY and env.MAILGUN_API_BASE_URL
        api_key?: string;
        api_base_url?: string;
    }
    // WARNING: it is not recommended to override mailgun creds in the form reference as the security of the credentials in the storage is not guaranteed
    // if you need to override the credentials (e.g. for a separate email domain), consider establishing a separate worker instance where the credentials are set in the env/secrets


    from_address?: string; // if undefined, will fallback to env.FROM_ADDRESS

    subject?: string; // if undefined, will fallback to "Verify email to submit form".
    msg_text?: string; // use $LINK$ as a placeholder for the link (e.g. "Click $LINK$" becomes "Click https://verificationlink..."). if undefined, will fallback to a reasonable default plain text message.
    msg_html?: string; // use $LINK$ as a placeholder for the link (e.g. "Click $LINK$" becomes "Click https://verificationlink..."). if undefined, will fallback to a reasonable default html message.
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

export class LinkIDInUseError extends Error {
    constructor(link_id: string) {
        super(`Link ID in use: ${link_id}`);
    }
}

export class LinkIDNotFoundError extends Error {
    constructor(link_id: string) {
        super(`Link ID not found: ${link_id}`);
    }
}

export class InvalidFormField extends Error {
    constructor(field_name: string) {
        super(`Invalid form field: ${field_name}`);
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
     * Pushes a link (ID and form data) to the storage (prefer to use provision_link for ease of use).
     * 
     * @abstract
     * @param {string} link_id - the link id to push
     * @param {FormData} form_data - the form data to push
     * @param {Date | null} expires_at - the date the link id expires at, or null if it never expires
     * @returns {Promise<void>}
     * @throws {LinkIDInUseError} - if the link id is already in use
     * 
     * @see {@link provision_link}
     * @see {@link is_link_valid}
     */
    abstract push_link(link_id: string, form_data: FormData, expires_at: Date | null): Promise<void>;

    /**
     * Checks if a link is valid.
     * 
     * @abstract
     * @param {string} link_id - the link id to check
     * @returns {Promise<boolean>} - true if the link id is valid, false otherwise
     */
    abstract is_link_valid(link_id: string): Promise<boolean>;

    /**
     * Retrieves the form data for a link ID.
     * 
     * @abstract
     * @param {string} link_id - the link id to retrieve the form data for
     * @returns {Promise<FormData>} - the form data
     * @throws {LinkIDNotFoundError} - if the link id is not found
     * @throws {InvalidFormField} - if the form data contains an invalid form field (i.e. not a string or Blob)
     * 
     * @see {@link push_link}
     * @see {@link is_link_valid}
     * @see {@link destroy_link}
     * @see {@link provision_link}
     */
    abstract get_link_form_data(link_id: string): Promise<FormData>;

    /**
     * Destroys a link id.
     * 
     * @abstract
     * @param {string} link_id - the link id to destroy
     * @returns {Promise<void>}
     * @throws {LinkIDNotFoundError} - if the link id is not found
     * 
     * @see {@link push_link}
     * @see {@link is_link_valid}
     * @see {@link provision_link}
     */
    abstract destroy_link(link_id: string): Promise<void>;



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
     * @see {@link push_link}
     * @see {@link is_link_valid}
     */
    async provision_link(form_data: FormData, expires_at: Date | null): Promise<string> {
        const id = this.generate_link_id();
        await this.push_link(id, form_data, expires_at);
        return id;
    }
}
