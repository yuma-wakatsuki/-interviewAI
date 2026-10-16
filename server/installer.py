"""One-time per-user Native Messaging installation for InterviewAI."""
from __future__ import annotations

import ctypes

from server.native_host import install


def message(text: str, title: str, flags: int) -> None:
    ctypes.windll.user32.MessageBoxW(None, text, title, flags)


def main() -> None:
    try:
        install()
    except Exception as error:
        message(f"InterviewAI の初期設定に失敗しました。\n\n{error}", "InterviewAI", 0x10)
        raise
    message(
        "初期設定が完了しました。\n\nChrome で InterviewAI 拡張機能を読み込んでください。\n以後は拡張機能の開始時に認識サーバーが自動起動します。",
        "InterviewAI",
        0x40,
    )


if __name__ == "__main__":
    main()
