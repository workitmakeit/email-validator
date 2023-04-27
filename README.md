# Email Validation Worker (Mailgun)

Sits as middleware before a form submission to validate the email address.

You can use a service such as Formspree for getting form submissions, but you can't validate the email address before submitting the form. This worker sits in front of the form submission and validates the email address before submitting the form.

Set up the secret variables, using Cloudflare Dashboard, `wrangler secret put`, or .dev.vars file:

```
FROM_ADDRESS: The email address to send from (must match Mailgun domain, can have a name, e.g. "My Name <email@email.tld>" or just the email address)
MAILGUN_API_KEY: The API key for Mailgun
MAILGUN_API_BASE_URL: The base URL for the Mailgun API (not including the any path after or a trailing slash, e.g. `https://api.mailgun.net/v3/DOMAIN_HERE`)
FORM_KEYS_TO_URLS_JSON: A stringified JSON object mapping form "keys" to the form URL (to obscure the form URL from the client)
SECRET_SIGNATURE: A long, random string used in hashing to verify submissions (note: hashtags may truncate the string in dev vars)
```

Note: this doesn't filter spam. make sure to ratelimit properly and filter submissions on the server side.

Example HTML form:

```html
<form action="(worker url)/verify-email" method="post">
  <label for="email">Email address</label>
  <input name="Email" type="email">

  <button type="submit">Submit</button>

  <input name="EmailFieldName" value="Email" type="hidden">
  <input name="FormKey" value="my form name" type="hidden">
  <input name="VerifyRedirectTo" value="https://example.com" type="hidden"> <!-- optional -->
  <input name="SubmitRedirectTo" value="https://example.com" type="hidden"> <!-- optional -->
</form>
```
