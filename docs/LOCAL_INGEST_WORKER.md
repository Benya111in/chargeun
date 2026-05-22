# Local YouTube Ingest Worker

GitHub Pages cannot keep an OpenAI API key, and Render/AWS/GCP style data-center IPs are often blocked by YouTube. The production-safe demo path is:

1. GitHub Pages shows the URL generator page.
2. Render stores a generation job and serves generated files.
3. This MacBook runs a local worker.
4. The worker downloads YouTube locally, runs the GPT-5.5 generation pipeline, uploads `source.mp4` and `scenario.json` to Render, and marks the job complete.
5. The browser polls Render and opens the generated practice page.

## Render Environment

Set these on the Render service:

```bash
GENERATOR_ACCESS_CODES=dlcmaldlcmal
GENERATOR_WORKER_TOKEN=<same-secret-or-longer-worker-secret>
PUBLIC_GENERATOR_API_BASE=https://chargeun.onrender.com
OPENAI_GENERATION_MODEL=gpt-5.5
```

`OPENAI_API_KEY` is only needed on Render if you still use the old synchronous API. In the worker flow, the key can stay on the MacBook.

## MacBook Worker

Create local env values in `.env.local` or export them in the shell:

```bash
OPENAI_API_KEY=...
GENERATOR_WORKER_TOKEN=<same value as Render>
WORKER_API_BASE=https://chargeun.onrender.com
PUBLIC_GENERATOR_API_BASE=https://chargeun.onrender.com
```

Then keep the worker running:

```bash
caffeinate -dimsu pnpm api:worker
```

For one-shot local testing:

```bash
LOCAL_WORKER_ONCE=1 pnpm api:worker
```

## Limits

- The MacBook must be awake and online for new YouTube links to finish.
- Render’s file system is not durable storage. A Render restart can remove generated videos. Cloudflare R2 can replace Render local storage later without changing the browser flow.
- This only makes practice materials for videos the operator is allowed to process.
