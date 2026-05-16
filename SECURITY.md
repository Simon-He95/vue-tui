# Security Policy

## Supported Versions

Security fixes are prioritized for `1.0.x` and active release candidates.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories:

https://github.com/Simon-He95/vue-tui/security/advisories/new

If private advisories are unavailable, open a minimal GitHub issue asking for a security contact. Do not include exploit details, private URLs, tokens, or proof-of-concept payloads in a public issue.

Useful reports include:

- Affected `@simon_he/vue-tui` version or commit SHA.
- Renderer target: DOM, stdout, or headless.
- Relevant boundary: terminal hyperlinks, OSC8, OSC52 clipboard, file URLs, path providers, markdown links, input handling, or generated ANSI output.
- Minimal reproduction steps and expected impact.

## Scope

The package treats these as security boundaries:

- Markdown and link sanitization.
- OSC8 terminal hyperlinks.
- OSC52 clipboard providers.
- File URL and path providers.
- CLI input handling.
- Browser DOM renderer escaping.

Out of scope:

- Consumer-provided unsafe renderers.
- Intentional opt-in file or path access.
- Host applications that bypass documented sanitizers or permission providers.

External links, clipboard writes, file URLs, path providers, and terminal control sequences should stay opt-in where documented and should not silently widen during patch or release candidate work.
