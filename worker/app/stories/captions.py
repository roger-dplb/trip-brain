from __future__ import annotations

from typing import Any

from openai import OpenAI


def generate_day_caption(
    openai_client: OpenAI,
    day: Any,
    openai_model: str = "gpt-4o-mini",
) -> str:
    """
    Generate a short, evocative one-sentence caption for a trip day.

    Args:
        openai_client: Initialized OpenAI client.
        day: Day object with .day_number, .date, .city, .activities, .notes.
        openai_model: Model to use (default: gpt-4o-mini for cost efficiency).

    Returns:
        A single sentence in Portuguese, max ~120 characters.
    """
    activities_text = ", ".join(
        act.title for act in getattr(day, "activities", [])
        if getattr(act, "status", "") != "skipped"
    ) or "nenhuma atividade registrada"

    notes = getattr(day, "notes", None) or ""

    prompt = (
        f"Você está ajudando a criar um Stories de viagem.\n"
        f"Escreva UMA frase curta e evocativa em português (máximo 120 caracteres) "
        f"que capture a essência deste dia de viagem:\n\n"
        f"Cidade: {getattr(day, 'city', 'Desconhecida')}\n"
        f"Data: {getattr(day, 'date', 'Desconhecida')}\n"
        f"Atividades: {activities_text}\n"
        f"Notas: {notes or 'Nenhuma'}\n\n"
        f"Responda apenas com a frase, sem aspas, sem explicações."
    )

    response = openai_client.chat.completions.create(
        model=openai_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=60,
        temperature=0.8,
    )
    caption = response.choices[0].message.content or ""
    return caption.strip()[:150]
