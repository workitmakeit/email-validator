import { readSync } from "fs";

import { createInterface } from "readline";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

import { FormReference } from "../abstract_storage";


const get_char = () => {
    // allocate a single character buffer
    const buf = Buffer.alloc(1);

    // read a single character from stdin
    readSync(0, buf, 0, 1, null);

    // return the single character as a unicode string
    return buf.toString("utf-8");
};

const async_question = (question: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};



const main = async () => {
    console.log("Email Validation Worker - Form Reference JSON Tool");
    console.log("--------------------------------------------------\n\n");

    console.log("What would you like to do?");
    console.log("==========================");
    console.log("1. Create a new form from scratch");
    console.log("2. Edit an existing form");
    console.log("\n0. Exit");

    console.log("\n\nPress the corresponding number.\n");

    // take numeric input from user
    while (true) {
        const c = get_char();

        if (c === "1") {
            console.log("Creating a new form from scratch...");
            await create_new_form();
            break;
        } else if (c === "2") {
            console.log("Editing an existing form...");
            await edit_existing_form();
            break;
        } else if (c === "0") {
            console.log("Exiting...");
            process.exit(0);
        } else {
            // invalid input, make ascii bell sound
            process.stdout.write("\u0007");
        }
    }
};


const validation_funcs: { [key: string]: (value: any) => boolean } = {
    form_url: (value: string) => {
        // validate the URL
        try {
            new URL(value);
        } catch (e) {
            console.log("Invalid form URL: " + e?.message || e);
            return false;
        }

        return true;
    },
    email_field_name: (value: string) => {
        // validate the email field name
        if (typeof value !== "string") {
            console.log("Invalid email field name: not a string");
            return false;
        }

        if (value.length === 0) {
            console.log("Invalid email field name: empty string");
            return false;
        }

        return true;
    },
    redirects: (value: { [key: string]: string }) => {
        // validate the redirects
        if (value instanceof Object !== true) {
            console.log("Invalid redirects: not an object");
            return false;
        }

        // check each redirect
        for (const [name, redirect] of Object.entries(value)) {
            if (name !== "verify" && name !== "submit") {
                console.log("Invalid redirect name: " + name);
                return false;
            }

            if (typeof redirect !== "string") {
                console.log("Invalid redirect URL: " + redirect);
                return false;
            }

            // validate the URL
            try {
                new URL(redirect);
            } catch (e) {
                console.log("Invalid redirect URL: " + e?.message || e);
                return false;
            }
        }

        return true;
    },
    from_address: (value: string) => {
        // check from address is format user@domain.tld or Name <user@domain.tld>
        if (typeof value !== "string") {
            console.log("Invalid from address: not a string");
            return false;
        }

        // check the from address is valid
        if (!/^[^<]+<[^@]+@[^@]+>$/.test(value) && !/^[^@]+@[^@]+$/.test(value)) {
            console.log("Invalid from address: not in email address format");
            return false;
        }

        return true;
    },
    mailgun_creds: (value: { [key: string]: string }) => {
        // check mailgun creds is an object
        if (value instanceof Object !== true) {
            console.log("Invalid mailgun creds: not an object");
            return false;
        }

        // check each field
        for (const [name, cred] of Object.entries(value)) {
            if (name !== "api_base_url" && name !== "api_key") {
                console.log("Invalid mailgun cred name: " + name);
                return false;
            }

            validation_funcs["mailgun_creds." + name](cred);
        }

        return true;
    },
    "mailgun_creds.api_base_url": (value: string) => {
        // check no trailing slash
        if (value.endsWith("/")) {
            console.log("Invalid API base URL: should not end with /");
            return false;
        }

        // validate the URL
        let url = new URL(value);

        // check domain is (eu).mailgun.net
        if (!url.hostname.endsWith(".mailgun.net")) {
            console.log("Invalid API base URL: domain is not (eu).mailgun.net");
            return false;
        }

        // check last pathname is not messages
        if (url.pathname.endsWith("/messages")) {
            console.log("Invalid API base URL: should not end with /messages");
            return false;
        }

        return true;
    },
    "mailgun_creds.api_key": (value: string) => {
        // check the api key is a string
        if (typeof value !== "string") {
            console.log("Invalid mailgun api_key: not a string");
            return false;
        }

        return true;
    },
    subject: (value: string) => {
        // check the subject is a string
        if (typeof value !== "string") {
            console.log("Invalid subject: not a string");
            return false;
        }

        // check if the subject is not too long for an email
        if (value.length > 78) {
            console.log("Invalid subject: too long for an email");
            return false;
        }

        return true;
    },
    msg_text: (value: string) => {
        // check the message text is a string
        if (typeof value !== "string") {
            console.log("Invalid message text: not a string");
            return false;
        }

        // check the message text contains $LINK$ at least once
        if (!value.includes("$LINK$")) {
            console.log("Invalid message text: does not contain $LINK$");
            return false;
        }

        return true;
    },
    msg_html: (value: string) => {
        // check the message html is a string
        if (typeof value !== "string") {
            console.log("Invalid message html: not a string");
            return false;
        }

        // check the message html contains $LINK$ at least once
        if (!value.includes("$LINK$")) {
            console.log("Invalid message html: does not contain $LINK$");
            return false;
        }

        return true;
    },
};

const validate_form = (form_ref: { [key: string]: any }): boolean => {
    // check required field exists
    if (!form_ref.hasOwnProperty("form_url")) {
        console.log("Invalid form: missing form_url");
        return false;
    }

    // check each field against the schema
    for (const entry of Object.entries(form_ref)) {
        if (validation_funcs.hasOwnProperty(entry[0])) {
            validation_funcs[entry[0]](entry[1]);
        } else {
            console.log("Invalid form: unknown field " + entry[0]);
            return false;
        }
    }

    // all checks passed
    return true;
}


const create_new_form = async () => {
    const form_url = await async_question("Enter the URL of the final form: ");

    // validate the URL
    try {
        new URL(form_url);
    } catch (e) {
        console.log("Invalid form URL: " + e?.message || e);
        create_new_form();
        return;
    }

    // build initial form reference
    const form_ref: FormReference = {
        form_url,
    };

    // continue flow
    form_edit_flow(form_ref);
};


const edit_existing_form = async () => {
    const existing_form_ref = await async_question("Enter the existing content of the form reference (JSON): ");

    // parse the JSON
    let form_ref: { [key: string]: any };
    try {
        form_ref = JSON.parse(existing_form_ref);
    } catch (e) {
        console.log("Invalid JSON: " + e?.message || e);
        edit_existing_form();
        return;
    }

    // validate the form reference
    if (!validate_form(form_ref)) {
        edit_existing_form();
        return;
    }

    console.log("\nForm reference validated successfully.");

    // continue flow
    form_edit_flow(form_ref as FormReference);
};


const form_edit_header = (form_ref: FormReference) => {
    console.log("\nWhich field would you like to edit?");
    console.log("===================================");
    console.log(`1. Form URL: ${form_ref.form_url}`);
    console.log(`2. Email Field Name: ${form_ref.email_field_name}`);
    console.log("3. Redirects");
    console.log(`4. From Address Override: ${form_ref.from_address}`)
    console.log("5. Mailgun Credentials Override");
    console.log(`6. Subject Override: ${form_ref.subject}`);
    console.log(`7. Message Text Override: ${form_ref.msg_text?.slice(0, 20)}...`);
    console.log(`8. Message HTML Override: ${form_ref.msg_html?.slice(0, 20)}...`);
    console.log("\n9. Validate Form Reference");
    console.log("\n0. Finish");

    console.log("\n\nPress the corresponding number.\n");
};

const form_edit_flow = async (form_ref: FormReference) => {
    // take numeric input from user and update header each time
    while (true) {
        form_edit_header(form_ref);

        const c = get_char();

        switch (c) {
            case "1":
                const new_url = await async_question("Enter the new form URL: ");

                // validate the URL
                if (!validation_funcs.form_url(new_url)) {
                    break;
                }

                // update the form reference
                form_ref.form_url = new_url;
                break;
            case "2":
                const new_email_field_name = await async_question("Enter the new email field name or enter nothing to undefine it: ");

                if (new_email_field_name === "") {
                    delete form_ref.email_field_name;
                    break;
                }

                // validate the email field name
                validation_funcs.email_field_name(new_email_field_name);

                // update the form reference
                form_ref.email_field_name = new_email_field_name;

                break;
            case "3":
                console.log("Editing redirects...");
                // TODO
                break;
            case "4":
                const new_from_email = await async_question("Enter the new from address (email address part only): ");

                // validate the from address
                if (typeof new_from_email !== "string") {
                    console.log("Invalid from address: not a string");
                    break;
                }

                const new_name = await async_question("Enter a display name for the email address or leave blank for none: ");

                // validate the name
                if (typeof new_name !== "string") {
                    console.log("Invalid name: not a string");
                    break;
                }

                // build the from address
                let new_from_address: string;
                if (new_name === "") {
                    new_from_address = new_from_email;
                } else {
                    new_from_address = `${new_name} <${new_from_email}>`;
                }

                // validate the from address
                if (!validation_funcs.from_address(new_from_address)) {
                    break;
                }

                // update the form reference
                form_ref.from_address = new_from_address;
                break;
            case "5":
                console.log("WARNING: it is not recommended to override mailgun creds in the form reference as the security of the credentials in the storage is not guaranteed");
                console.log("If you need to override the credentials (e.g. for a separate email domain), consider establishing a separate worker instance where the credentials are set in the env/secrets");

                console.log("\nWhich field would you like to edit?");
                console.log("===================================");
                console.log(`1. API Base URL: ${form_ref.mailgun_creds?.api_base_url !== undefined ? "defined (secret)" : "undefined"}`);
                console.log(`2. API Key: ${form_ref.mailgun_creds?.api_key !== undefined ? "defined (secret)" : "undefined"}`);

                console.log("\nAny other key to cancel");

                console.log("\n\nPress the corresponding number.\n");

                const c2 = get_char();

                switch (c2) {
                    case "1":
                        let new_api_base_url = await async_question("Enter the new API base URL: ");

                        if (typeof new_api_base_url !== "string") {
                            console.log("Invalid API base URL: not a string");
                            break;
                        }

                        if (new_api_base_url === "") {
                            if (form_ref.mailgun_creds === undefined) {
                                break;
                            }

                            form_ref.mailgun_creds.api_base_url = undefined;
                            break;
                        }

                        // if it ends with slash, remove it
                        if (new_api_base_url.endsWith("/")) {
                            new_api_base_url = new_api_base_url.slice(0, -1);
                        }

                        // validate the API base URL
                        if (!validation_funcs["mailgun_creds.api_base_url"](new_api_base_url)) {
                            break;
                        }

                        // update the form reference
                        if (form_ref.mailgun_creds === undefined) {
                            form_ref.mailgun_creds = {};
                        }

                        form_ref.mailgun_creds.api_base_url = new_api_base_url;
                        break;
                    case "2":
                        let new_api_key = await async_question("Enter the new API key: ");

                        if (new_api_key === "") {
                            if (form_ref.mailgun_creds === undefined) {
                                break;
                            }

                            form_ref.mailgun_creds.api_key = undefined;
                            break;
                        }

                        // validate the API key
                        if (!validation_funcs["mailgun_creds.api_key"](new_api_key)) {
                            break;
                        }

                        // update the form reference
                        if (form_ref.mailgun_creds === undefined) {
                            form_ref.mailgun_creds = {};
                        }

                        form_ref.mailgun_creds.api_key = new_api_key;
                        break;
                    default:
                    // exit
                }

                // validate the mailgun creds
                if (form_ref.mailgun_creds && !validation_funcs.mailgun_creds(form_ref.mailgun_creds)) {
                    console.log("Invalid mailgun creds");
                    break;
                }

                break;
            case "6":
                const new_subject_line = await async_question("Enter the new subject line or leave blank to undefine it: ");

                if (new_subject_line === "") {
                    delete form_ref.subject;
                    break;
                }

                // validate the subject line
                if (!validation_funcs.subject(new_subject_line)) {
                    break;
                }

                // update the form reference
                form_ref.subject = new_subject_line;
                break;
            case "7":
                // TODO: could DRY with HTML entry
                console.log("Enter the new email body (plaintext) line-by-line.");
                console.log("Use $LINK$ as a placeholder or the link (e.g. \"Click $LINK$\" becomes \"Click https://verificationlink...\").");
                console.log("Enter a blank line to finish. Enter only \\n to add a blank line without finishing.");
                console.log("Enter nothing to undefine it.\n");

                let new_email_body = "";

                while (true) {
                    const line = await async_question("> ");

                    if (line === "") {
                        break;
                    }

                    // replace \n with newline
                    if (line === "\\n") {
                        new_email_body += "\n";
                        continue;
                    }

                    new_email_body += `${line}\n`;
                }

                if (new_email_body === "") {
                    delete form_ref.msg_text;
                    break;
                }

                // remove the last newline
                new_email_body = new_email_body.slice(0, -1);

                // validate the email body
                if (!validation_funcs.msg_text(new_email_body)) {
                    break;
                }

                // update the form reference
                form_ref.msg_text = new_email_body;
                break;
            case "8":
                console.log("Enter the new email body (HTML) line-by-line.");
                console.log("Use $LINK$ as a placeholder or the link (e.g. \"Click $LINK$\" becomes \"Click https://verificationlink...\").");
                console.log("Enter a blank line to finish. Enter only \\n to add a blank line without finishing.");
                console.log("Enter nothing to undefine it.\n");

                let new_email_body_html = "";

                while (true) {
                    const line = await async_question("> ");

                    if (line === "") {
                        break;
                    }

                    // replace \n with newline
                    if (line === "\\n") {
                        new_email_body_html += "\n";
                        continue;
                    }

                    new_email_body_html += `${line}\n`;
                }

                if (new_email_body_html === "") {
                    delete form_ref.msg_html;
                    break;
                }

                // remove the last newline
                new_email_body_html = new_email_body_html.slice(0, -1);

                // validate the email body
                if (!validation_funcs.msg_html(new_email_body_html)) {
                    break;
                }

                // update the form reference
                form_ref.msg_html = new_email_body_html;
                break;
            case "9":
                console.log("Validating form reference...");

                if (validate_form(form_ref)) {
                    console.log("Form reference validated successfully.");
                } else {
                    console.log("Form reference validation failed.");
                }

                break;
            case "0":
                console.log("Validating form reference...");

                if (validate_form(form_ref)) {
                    console.log("Form reference validated successfully.");
                } else {
                    console.log("Form reference validation failed.");
                    form_edit_flow(form_ref);
                    return;
                }

                // output the form reference
                console.log("\n\nFinal form reference JSON:\n\n");
                console.log(JSON.stringify(form_ref));

                process.exit(0);
            default:
                // invalid input, make ascii bell sound
                process.stdout.write("\u0007");
        }
    }
}


main();
