import json
from pathlib import Path

from app.main import create_app


def main():
    target = Path("openapi.json")
    target.write_text(
        json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Exported {target}")


if __name__ == "__main__":
    main()
