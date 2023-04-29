import { readSync } from "fs";
import { spawn } from "child_process";

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


const validate_form = (form_ref: { [key: string]: any }): boolean => {
    // check required field exists
    if (!form_ref.hasOwnProperty("form_url")) {
        console.log("Invalid form: missing form_url");
        return false;
    }

    // check each field against the schema
    for (const entry of Object.entries(form_ref)) {
        switch (entry[0]) {
            case "form_url":
                // validate the URL
                try {
                    new URL(entry[1]);
                } catch (e) {
                    console.log("Invalid form URL: " + e?.message || e);
                    return false;
                }
                break;
            case "email_field_name":
                // validate the email field name
                if (typeof entry[1] !== "string") {
                    console.log("Invalid email field name: not a string");
                    return false;
                }
                break;
            case "redirects":
                // validate the redirects
                if (entry[1] instanceof Object !== true) {
                    console.log("Invalid redirects: not an object");
                    return false;
                }

                // check each redirect
                for (const [name, redirect] of Object.entries(entry[1])) {
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

                break;
            case "from_address":
                // check from address is format user@domain.tld or Name <user@domain.tld>
                if (typeof entry[1] !== "string") {
                    console.log("Invalid from address: not a string");
                    return false;
                }

                // check the from address is valid
                if (!/^[^<]+<[^@]+@[^@]+>$/.test(entry[1]) && !/^[^@]+@[^@]+$/.test(entry[1])) {
                    console.log("Invalid from address: not in email address format");
                    return false;
                }

                break;
            case "mailgun_creds":
                // check mailgun creds is an object
                if (entry[1] instanceof Object !== true) {
                    console.log("Invalid mailgun creds: not an object");
                    return false;
                }

                // check each field
                for (const [name, value] of Object.entries(entry[1])) {
                    if (name !== "api_base_url" && name !== "api_key") {
                        console.log("Invalid mailgun cred name: " + name);
                        return false;
                    }

                    if (typeof value !== "string") {
                        console.log("Invalid mailgun creds value: " + value);
                        return false;
                    }

                    // if this is api_base_url, validate the URL
                    if (name === "api_base_url") {
                        try {
                            new URL(value);
                        } catch (e) {
                            console.log("Invalid mailgun api_base_url: " + e?.message || e);
                            return false;
                        }
                    }
                }

                break;
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
                try {
                    new URL(new_url);
                } catch (e) {
                    console.log("Invalid form URL: " + e?.message || e);
                    break;
                }

                // update the form reference
                form_ref.form_url = new_url;
                break;
            case "2":
                const new_email_field_name = await async_question("Enter the new email field name or enter nothing to undefine it: ");

                // validate the email field name
                if (typeof new_email_field_name !== "string") {
                    console.log("Invalid email field name: not a string");
                    break;
                }

                // update the form reference
                if (new_email_field_name === "") {
                    delete form_ref.email_field_name;
                } else {
                    form_ref.email_field_name = new_email_field_name;
                }
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
                if (!/^[^<]+<[^@]+@[^@]+>$/.test(new_from_address) && !/^[^@]+@[^@]+$/.test(new_from_address)) {
                    console.log("Invalid from address: not in email address format");
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

                        // if it ends with slash, remove it
                        if (new_api_base_url.endsWith("/")) {
                            new_api_base_url = new_api_base_url.slice(0, -1);
                        }

                        // validate the API base URL
                        try {
                            let url = new URL(new_api_base_url);

                            // check domain is (eu).mailgun.net
                            if (!url.hostname.endsWith(".mailgun.net")) {
                                console.log("Invalid API base URL: domain is not (eu).mailgun.net");
                                break;
                            }

                            // check last pathname is not messages
                            if (url.pathname.endsWith("/messages")) {
                                console.log("Invalid API base URL: should not end with /messages");
                                break;
                            }
                        } catch (e) {
                            console.log("Invalid API base URL: " + e?.message || e);
                            break;
                        }

                        // update the form reference
                        if (form_ref.mailgun_creds === undefined) {
                            form_ref.mailgun_creds = {};
                        }

                        form_ref.mailgun_creds.api_base_url = new_api_base_url;
                        break;
                    case "2":
                        let new_api_key = await async_question("Enter the new API base URL: ");

                        if (typeof new_api_key !== "string") {
                            console.log("Invalid API base URL: not a string");
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
