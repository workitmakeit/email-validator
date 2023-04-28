import { readSync } from "fs";

import * as readline from "readline";

const rl = readline.createInterface({
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
            rl.close();
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
                if (!/^[^<]+<[^@]+@[^@]+>$/.test(entry[1])) {
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


const form_edit_flow = (form_ref: FormReference) => {
    console.log("\nWhich field would you like to edit?");
    console.log("===================================");
    console.log("1. Form URL");
    console.log("2. Email Field Name");
    console.log("3. Redirects");
    console.log("4. From Address");
    console.log("5. Mailgun Credentials");
    console.log("\n9. Validate Form Reference");
    console.log("\n0. Finish");

    console.log("\n\nPress the corresponding number.\n");

    // take numeric input from user
    // TODO: implement each option
    while (true) {
        const c = get_char();

        switch (c) {
            case "1":
                console.log("Editing form URL...");
                break;
            case "2":
                console.log("Editing email field name...");
                break;
            case "3":
                console.log("Editing redirects...");
                break;
            case "4":
                console.log("Editing from address...");
                break;
            case "5":
                console.log("Editing mailgun credentials...");
                break;
            case "9":
                console.log("Validating form reference...");
                break;
            case "0":
                console.log("Exiting...");
                // TODO: validate and output result
                process.exit(0);
            default:
                // invalid input, make ascii bell sound
                process.stdout.write("\u0007");
        }
}


main();
