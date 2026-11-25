# my-agent

Forti's chief of staff: a private web chat that follows [RULEBOOK.md](RULEBOOK.md).

- `public/index.html`: the chat page.
- `netlify/functions/chat.mts`: the backend. It checks the password, adds the rule book as the system prompt and streams Claude's answer.
- `scripts/build-rulebook.mjs`: copies RULEBOOK.md into the function at build time, so edits to the rule book go live on the next deploy.

Netlify environment variables (never in this repo):
- `CHAT_PASSWORD` (required): the sign-in password.
- `ANTHROPIC_API_KEY`: only needed if Netlify AI Gateway is not active on the team.
- `CHAT_MODEL` (optional): defaults to `claude-sonnet-5-5`.

This version is chat only: it drafts and plans but cannot read or act on mail or calendar.
