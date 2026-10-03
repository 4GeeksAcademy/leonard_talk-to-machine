# Voice Command API

A FastAPI backend that turns natural-language task commands into structured API calls with NVIDIA. Tasks are stored in memory and reset whenever the server restarts.

## Backend setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `NVIDIA_API_KEY` in `.env`, then start the API:

```bash
uvicorn src.main:app --reload
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/tasks` | List all tasks |
| `POST` | `/tasks` | Create a task |
| `PUT` | `/tasks/{task_id}` | Replace a task |
| `PATCH` | `/tasks/{task_id}` | Update a task title or completion state |
| `DELETE` | `/tasks/{task_id}` | Delete a task |
| `POST` | `/instruction` | Convert a transcription into a task API route |

For example, this request:

```bash
curl -X POST http://127.0.0.1:8000/instruction \
	-H 'Content-Type: application/json' \
	-d '{"transcription":"add buy groceries to my list"}'
```

returns routing JSON shaped like:

```json
{
	"endpoint": "/tasks",
	"method": "POST",
	"params": { "title": "Buy groceries" }
}
```

The frontend should then make the returned request, using `params` as its JSON body. CORS is enabled for browser clients.

## Tests

```bash
pytest -q
```

The existing Next.js chat interface remains available with `npm run dev`; it is separate from the FastAPI assignment backend.
