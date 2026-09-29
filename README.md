# Meme Studio

Search the Twetch Meme Library, caption templates on a canvas, and post
finished memes on-chain through the bsvOS wallet. A bundled runner app for
[bsv-os](https://github.com/auxon/bsv-os): the page holds no keys — every
spend is policy-gated by the wallet daemon.

![captioned in Meme Studio](https://twetch.com/t/72a4751a99c2357c7f8cb49d97e3b4e07ad8a85778929a8f95b15b0a6f052c78)

The first meme born here: captioned and posted entirely inside the app —
`SHIPPED A MEME APP / MY JOB HERE IS DONE`, on-chain as
`72a4751a…052c78`.

## How it works

1. **Pick a template** — fuzzy search over the Meme Library (`twetchMemes`
   RPC). Folders and tags do not filter server-side upstream, so search is
   the way in; blank templates surface under queries like “meme template”.
2. **Caption it** — classic top/bottom white-on-black text, auto-shrunk to
   fit, live on a `<canvas>`. Animated templates post as stills.
3. **Export or post** — download is free; **Post to Twetch** writes the
   image on-chain (~1 sat/byte) through `twetchPost`, so the fee line shows
   the estimate against your balance first. Posting is two-step: the first
   click arms (`Confirm post (~X sats)`), the second click within 10s
   fires; any edit or the timeout disarms.

Posting needs an imported Twetch posting key and a fresh Twetch session —
the app says which is missing instead of failing obscurely.

## Running it

Meme Studio is served by `bsv-walletd` from its own origin
(`https://localhost:2121/memestudio/`, sharing the localhost slot with the
other bundled apps) and talks to the daemon over same-origin JSON-RPC:

| RPC | Use |
| --- | --- |
| `twetchMemes` | template search (`q`, `format`, `sort`, `cursor`, `limit`) |
| `twetchStatus` | account key + session freshness gating |
| `balance` | fee estimate vs confirmed balance |
| `twetchPost` | post text + base64 media (`origin: "memestudio"`) |

Install from a bsvOS machine:

```bash
bsv app install https://localhost:2121/memestudio/
bsv app open localhost   # sandboxed window with wallet access
```

## Developing

`caption.js` is DOM-free on purpose — text wrapping, font fitting, caption
geometry, the fee estimate, and the two-step confirm machine all live there
and are unit-tested without a browser:

```bash
npm test   # node --test, no dependencies
```

`app.js` (canvas, RPC, UI state) is verified against the running daemon in
headless Chromium, driving only the app's own UI.

## License

Open BSV License, same as bsv-os.
