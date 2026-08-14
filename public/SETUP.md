# Point your agent at my brief

My brief is the file at https://max.tretikov.com/AGENTS.md

It says who I am and how I like to work. I want my agent to read it at the
start of every chat. I edit the brief often, so the agent must pull it fresh
each time. A saved copy goes stale.

Most agents cannot load a web page as their instructions. They can only load
files. So we use a hook. A hook is a small program the agent runs by itself
when a chat starts. Our hook fetches the brief and hands it to the agent.

## Step 1: save the script

Save this as `~/.claude/operator-brief.sh`:

```sh
#!/bin/sh
URL="https://max.tretikov.com/AGENTS.md"
CACHE="$HOME/.claude/AGENTS.md"

if curl -fsSL --max-time 5 "$URL" -o "$CACHE.tmp" && [ -s "$CACHE.tmp" ]; then
  mv "$CACHE.tmp" "$CACHE"
else
  rm -f "$CACHE.tmp"
fi

[ -f "$CACHE" ] && cat "$CACHE"
exit 0
```

It gets the brief and prints it. It also keeps a copy. If the network is down,
it prints the copy instead. That way a chat never starts with nothing.

Make it runnable:

```sh
chmod +x ~/.claude/operator-brief.sh
```

## Step 2: tell the agent to run it

**Claude Code.** Add this to `~/.claude/settings.json`. Keep any settings that
are already in the file.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "/Users/me/.claude/operator-brief.sh" }
        ]
      }
    ]
  }
}
```

Use your real home path, not `/Users/me`. The `*` means every kind of start.
That includes a fresh chat, a resumed chat, and a chat that ran out of room and
was squeezed. The brief comes back each time.

**Codex.** Add this to `~/.codex/config.toml`:

```toml
[[hooks.SessionStart]]
matcher = "^startup$"

[[hooks.SessionStart.hooks]]
type = "command"
command = "/Users/me/.claude/operator-brief.sh"
additionalContextLimit = 16000
```

The same script works for both. Only the setup file is different. Codex cuts
off long text, so `additionalContextLimit` must be larger than the brief.

## Step 3: check that it works

Run the script by hand. You should see the brief:

```sh
~/.claude/operator-brief.sh | head -5
```

Then start a new chat and ask the agent what it knows about you. If it can
answer, the hook worked.

## Changing the brief

Edit `max/public/AGENTS.md` in the site repo and push. The site rebuilds, and
the next chat picks up the new text. There is nothing to update on your
machine.

The same file is served at https://max.tretikov.com/CLAUDE.md for tools that
look for that name.

## One warning

Your agent now runs instructions from a web page. Anyone who can change that
page can change what your agent is told to do. Keep the site repo locked down.
