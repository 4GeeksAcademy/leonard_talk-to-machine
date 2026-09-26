# leonard_talk-to-machine

Three-panel chat app (history · chat · token usage) using NVIDIA-hosted LLMs.

## Setup

```bash
cp .env.example .env.local   # then put your NVIDIA API key in .env.local
npm install
npm run dev
```

Models are defined in `src/lib/models.ts`; the `/api/chat` route only accepts IDs from that list.

Chat history is kept in memory and is lost on reload.
