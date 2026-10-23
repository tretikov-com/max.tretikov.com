# Secret projects

`/projects/secret` is a password-gated reader and Markdown editor for private
GitHub repositories. The sign-in form displays "By logging in, I agree to the
Non-Disclosure Agreement (NDA)" with a link to the public Markdown agreement at
`/nda`. The link opens separately so credentials entered in the form are preserved.
After validating credentials, the browser records acceptance in the private
[`tretikov-com/nda-acceptances`](https://github.com/tretikov-com/nda-acceptances)
repository before opening the project index. A recording failure keeps the user
on the sign-in form with a retry message.

## Configure access

In the **max.tretikov.com** repository, open **Settings → Secrets and variables →
Actions** and create the repository secret **`SECRET_PROJECT_ACCESS`**. Its value
is a JSON object:

```json
{
  "token": "REPLACE_WITH_YOUR_SHARED_FINE_GRAINED_PAT",
  "acceptanceToken": "REPLACE_WITH_YOUR_SHARED_RECEIPT_PAT",
  "projects": [
    {
      "id": "research",
      "label": "Research",
      "owner": "YOUR_GITHUB_OWNER",
      "repo": "YOUR_PRIVATE_REPOSITORY",
      "ref": "main",
      "root": "docs",
      "exclude": [".obsidian"]
    }
  ],
  "users": [
    {
      "username": "collaborator",
      "password": "REPLACE_WITH_A_RANDOM_PASSWORD",
      "author": {
        "name": "Collaborator Name",
        "email": "collaborator@example.com"
      },
      "projects": ["research"]
    }
  ]
}
```

Each user lists the project IDs they can open. The project's `ref` must name an
existing branch. `root` is the directory to display and edit; use `""` for the
repository root. Repository details and author information are encrypted along
with the token. The public project index uses `src/vault/sources.js` independently.

To hide RfNA's supporting figures from the file browser, add this field to its
project object in `SECRET_PROJECT_ACCESS`:

```json
"hideFromTree": { "paths": ["figures"] }
```

Paths are relative to the configured `root`. This hides the folder and its contents
from navigation while keeping them loaded for Markdown embeds, Charts, direct links,
and PDF printing. Files stay in their repository locations, available to GitHub and
local Obsidian. To hide asset types throughout a project, use
`"hideFromTree": { "extensions": [".svg", ".png", ".html"] }`; both lists can be
combined. Keep supporting assets out of `exclude` and `.obsidian`. Rebuild and redeploy
after changing the access configuration.

Generate a unique random password for each person, for example with
`openssl rand -base64 24`. Passwords must have at least 16 characters. Usernames
are case-insensitive. Share the username and password privately with the intended
collaborator. The `author` object is optional: omit it if you do not know their
name or email. After their credentials are validated, the sign-in form asks them
to supply both before recording NDA acceptance or opening any projects. If you
configure `author`, include both their name and email.

The agreement's cover terms identify Max and that individual as the parties,
set confidentiality to three years per disclosure (with continuing trade-secret
protection), select California law and courts, and adapt the signature requirement
to sign-in acceptance. Review those terms before deployment. Edit the agreement
in `src/secret/nda.md` and keep its version and attribution accurate.

Configure Max's shared fine-grained personal access token once in the top-level
`token` field. Select only the private project repositories, with **Contents: Read
and write** and **Pull requests: Read and write**. Leave **Administration** and
unrelated permissions disabled. Repository deletion requires Administration write
access; the site does not need that permission.

Fine-grained tokens cover one resource owner. RfNA belongs to `MaxTretikov`, while
the receipt repository belongs to `tretikov-com`. For these owners, set the
top-level `acceptanceToken` to a second shared token with **Contents: Read and
write** only on `tretikov-com/nda-acceptances`. Approve the token in the organization
if its policy requires approval. The receipt repository must have an initialized
`main` branch. If all repositories share an owner and the primary token includes
the receipt repository, omit `acceptanceToken`.

Each invitation has its own username, password, and assigned project list. Name
and email come from its configured `author` or from the collaborator at sign-in.
All invitations unlock the same shared GitHub credentials, encrypted
separately with each invitation's password. GitHub operations run as the token
owner.

Run the **Deploy Max to GitHub Pages** workflow after changing the secret. Secret
updates alone do not redeploy the site. Without a configured secret, the route
shows a sign-in page with invitations unavailable.

For local development, set the same variable in an ignored `.env.local` file:

```dotenv
SECRET_PROJECT_ACCESS='{"projects":[],"users":[]}'
```

Replace the empty object values with your configuration and restart Vite after
changes. Keep the variable name exactly as shown: `VITE_` variables are public.

## Reading and editing

Sign in at `/projects/secret`. Only assigned projects appear. Notes, attachments,
links, and commit history use authenticated requests to `api.github.com`.
The browser saves the username, password, and contributor name and email in
localStorage after successful sign-in and receipt recording. Reloading or reopening
the browser automatically unlocks the latest access configuration with those credentials. Private notes and
GitHub tokens remain in page memory, with no private-content IndexedDB or
localStorage cache. Sign out to clear the saved login and in-memory session and
abort pending repository requests. If browser storage is unavailable, sign-in
works for the current page session.

The header provides **Sign out** beside the signed-in contributor. The document
toolbar's **Edit** action changes the selected Markdown file.
**New +** in the file-tree header creates a note at a relative path such as
`Research/New idea.md`. Add a commit message and choose
**Create pull request**. The browser creates a Git blob, tree, commit, and unique
`review/<username>/<uuid>` branch through GitHub's REST API, then opens a PR
against the configured branch. The commit starts at the snapshot being edited,
so concurrent changes are left for GitHub's normal PR merge checks. The editor
keeps its original snapshot while branch polling continues. Historical checkouts
are read-only.

GitHub records the shared token owner as the commit author and PR opener.
Project-edit and receipt commit messages include the signed-in collaborator's
name, email, and username, for example:

```text
Update Research/Idea.md

Submitted by Collaborator Name <collaborator@example.com> (collaborator).
```

If PR creation fails after the branch is saved, the editor preserves the branch
and offers a retry or a GitHub comparison link. Retrying checks for an existing
PR before creating one. Once merged, changes appear on the next branch refresh.

## Acceptance records

Receipts live at `acceptances/<account-sha256>/<agreement-sha256>.json`. Each
contains the username, name, and email; the exact Markdown agreement
and its version and SHA-256 hash; the notice and button text; a browser timestamp;
and the site origin. Tokens, passwords, and project lists are not included.

The browser creates the file through GitHub's Contents API without supplying an
existing file SHA, so the application never overwrites a receipt. Matching receipts
are reused on later sign-ins. A change to the account identity or agreement text
requires a new receipt. Simultaneous submissions recover the existing receipt.
The application's write omits commit dates, letting GitHub set the commit
timestamp. The `clientAcceptedAt` value inside the JSON is supplied by the browser.

The site remains entirely static. A person with decrypted credentials can bypass
the UI's logging step. Anyone holding a token with Contents write access to the
receipt repository can read, alter, or delete receipts through GitHub, and the
contributor identity is not independently verified. These records are an
audit aid rather than an immutable signing service.

## Access and revocation

The build emits `/secret-access.json`: a separate AES-256-GCM envelope for each
user, keyed with PBKDF2-SHA-256 at 600,000 iterations, with random salts and IVs.
Username hashes identify envelopes. No plaintext credentials or private notes
are included in the deployment.

Anyone can download the encrypted envelopes and attempt password guesses
offline. A signed-in collaborator can extract the shared tokens and use
all permissions it grants, including access beyond the configured `root` or
project list if the token permits it. The UI's PR workflow does not restrict
what someone can do directly with that token. Keep actual repository access
limited through the token's GitHub permissions.

Remove a collaborator's user entry and redeploy to stop issuing their invitation.
To revoke shared credentials they have already obtained, **revoke and replace the
shared GitHub tokens**, update the secret, and redeploy for the remaining users.
Changing a password or removing an envelope alone cannot revoke a token someone
has already obtained or one recoverable from an older deployment.
