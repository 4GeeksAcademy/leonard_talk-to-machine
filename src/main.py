import json
import os
import re
from typing import Any, Dict, List, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError


load_dotenv()

app = FastAPI(title="Voice Command API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Task(BaseModel):
    id: int
    title: str
    done: bool = False


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    done: bool = False


class TaskReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    done: bool


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1)
    done: Optional[bool] = None


class InstructionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcription: str = Field(min_length=1)


class RouteInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    params: Dict[str, Any]


tasks: List[Dict[str, Any]] = []
next_task_id = 1

SYSTEM_PROMPT = """You route spoken task-list commands to a REST API.
Respond with exactly one JSON object and no markdown, explanation, or extra text:
{"endpoint":"/tasks","method":"POST","params":{"title":"Buy groceries"}}

Available operations:
- List all tasks: GET /tasks with params {}.
- Create a task: POST /tasks with params {"title": string, "done": boolean}. Omit done unless the user specifies it.
- Replace a task completely: PUT /tasks/<integer id> with params containing title and done.
- Update a task: PATCH /tasks/<integer id> with params containing title and/or done.
- Delete a task: DELETE /tasks/<integer id> with params {}.

Put task IDs in the endpoint path, never in params. Use PATCH with {"done":true} for commands such as "finish task 2". Preserve the user's task title without conversational filler. Never invent a task ID. If the user asks for an unsupported action or omits information required by an operation, return {"endpoint":"/tasks","method":"GET","params":{}}. Output valid JSON only."""
NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


def find_task(task_id: int) -> Dict[str, Any]:
    for task in tasks:
        if task["id"] == task_id:
            return task
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/tasks", response_model=List[Task])
def list_tasks() -> List[Dict[str, Any]]:
    return tasks


@app.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate) -> Dict[str, Any]:
    global next_task_id

    task = {"id": next_task_id, **payload.model_dump()}
    next_task_id += 1
    tasks.append(task)
    return task


@app.put("/tasks/{task_id}", response_model=Task)
def replace_task(task_id: int, payload: TaskReplace) -> Dict[str, Any]:
    task = find_task(task_id)
    task.clear()
    task.update({"id": task_id, **payload.model_dump()})
    return task


@app.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: int, payload: TaskUpdate) -> Dict[str, Any]:
    changes = payload.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Provide a non-null title and/or done value",
        )
    task = find_task(task_id)
    task.update(changes)
    return task


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int) -> Dict[str, str]:
    task = find_task(task_id)
    tasks.remove(task)
    return {"message": f"Task {task_id} deleted"}


def validate_route(instruction: RouteInstruction) -> None:
    match = re.fullmatch(r"/tasks(?:/(\d+))?", instruction.endpoint)
    if match is None:
        raise ValueError("Unknown endpoint")

    has_task_id = match.group(1) is not None
    if instruction.method in {"GET", "POST"} and has_task_id:
        raise ValueError("GET and POST must target /tasks")
    if instruction.method in {"PUT", "PATCH", "DELETE"} and not has_task_id:
        raise ValueError(f"{instruction.method} requires a task ID")


@app.post("/instruction", response_model=RouteInstruction)
async def parse_instruction(payload: InstructionRequest) -> RouteInstruction:
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NVIDIA_API_KEY is not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                NVIDIA_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": os.getenv("NVIDIA_MODEL", "google/gemma-4-31b-it"),
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": payload.transcription},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content:
            raise ValueError("NVIDIA returned an empty response")
        instruction = RouteInstruction.model_validate(json.loads(content))
        validate_route(instruction)
        return instruction
    except (json.JSONDecodeError, ValidationError, ValueError, IndexError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NVIDIA returned an invalid routing instruction",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not process the instruction with NVIDIA",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not process the instruction with NVIDIA",
        ) from exc