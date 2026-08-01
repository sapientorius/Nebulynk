# Browser Security Guidance

Before making a Nebulynk instance public, validate browser-facing behavior in
an environment that matches the intended HTTPS deployment.

## Verify

- Authentication, logout, and session refresh work with the deployed cookie
  and proxy configuration.
- Browser security headers, Content Security Policy, CORS, and framing policy
  match the deployment's allowed origins.
- User-supplied markdown and profile content cannot execute script.
- Authorized upload, download, avatar, and media flows work without exposing
  storage credentials or unrestricted object paths.
- Realtime and voice features connect only to the configured public origins.

Run the relevant end-to-end tests and inspect browser console and network
errors before release. Keep deployment URLs, test records, and unresolved
findings in private operator records.
