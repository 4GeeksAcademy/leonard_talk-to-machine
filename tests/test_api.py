from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src import main


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset_store():
    main.tasks.clear()
    main.next_task_id = 1
    yield
    main.tasks.clear()


def test_task_crud_flow():
    created = client.post("/tasks", json={"title": "Buy groceries"})
    assert created.status_code == 201
    assert created.json() == {"id": 1, "title": "Buy groceries", "done": False}

    listed = client.get("/tasks")
    assert listed.status_code == 200
    assert listed.json() == [created.json()]

    patched = client.patch("/tasks/1", json={"done": True})
    assert patched.status_code == 200
    assert patched.json()["done"] is True

    replaced = client.put("/tasks/1", json={"title": "Get milk", "done": False})
    assert replaced.status_code == 200
    assert replaced.json() == {"id": 1, "title": "Get milk", "done": False}

    deleted = client.delete("/tasks/1")
    assert deleted.status_code == 200
    assert deleted.json() == {"message": "Task 1 deleted"}
    assert client.get("/tasks").json() == []


def test_ids_are_not_reused_after_delete():
    client.post("/tasks", json={"title": "First"})
    client.delete("/tasks/1")

    created = client.post("/tasks", json={"title": "Second"})

    assert created.json()["id"] == 2


def test_invalid_updates_and_missing_tasks_return_errors():
    assert client.patch("/tasks/99", json={"done": True}).status_code == 404
    client.post("/tasks", json={"title": "Existing"})
    assert client.patch("/tasks/1", json={}).status_code == 422
    assert client.patch("/tasks/1", json={"title": None}).status_code == 422
    assert client.put("/tasks/1", json={"title": "Incomplete"}).status_code == 422


def test_instruction_returns_validated_nvidia_route(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            content = '{"endpoint":"/tasks","method":"POST","params":{"title":"Buy groceries"}}'
            return {"choices": [{"message": {"content": content}}]}

    class FakeClient:
        def __init__(self, timeout):
            assert timeout == 120

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, headers, json):
            assert url == main.NVIDIA_CHAT_URL
            assert headers["Authorization"] == "Bearer test-key"
            assert json["response_format"] == {"type": "json_object"}
            assert json["temperature"] == 0
            return FakeResponse()

    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeClient)

    response = client.post(
        "/instruction",
        json={"transcription": "add buy groceries to my list"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "endpoint": "/tasks",
        "method": "POST",
        "params": {"title": "Buy groceries"},
    }


def test_instruction_requires_api_key(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

    response = client.post("/instruction", json={"transcription": "show my tasks"})

    assert response.status_code == 503


def test_cors_preflight_is_allowed():
    response = client.options(
        "/tasks",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"