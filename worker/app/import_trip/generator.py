import base64
import json


def describe_activity_from_photos(openai_client, model, photo_bytes_list):
    """
    Call GPT-4o Vision with up to 3 photos encoded as base64 data URIs.
    photo_bytes_list: list of bytes (JPEG/PNG image data).
    Returns { title: str, notes: str|None }.
    On any failure or JSON parse error, returns a safe default.
    """
    if not photo_bytes_list:
        return {"title": "Atividade", "notes": None}

    try:
        content = [
            {
                "type": "text",
                "text": (
                    "Veja estas fotos de viagem. Descreva em poucas palavras qual atividade está acontecendo. "
                    'Responda APENAS com JSON: {"title": "...", "notes": "..."}'
                ),
            }
        ]
        for img_bytes in photo_bytes_list[:3]:
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                }
            )

        response = openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            max_tokens=200,
        )

        raw = (response.choices[0].message.content or "").strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)
        return {
            "title": (result.get("title") or "Atividade").strip() or "Atividade",
            "notes": (result.get("notes") or None),
        }

    except Exception:
        return {"title": "Atividade", "notes": None}


def generate_trip_metadata(openai_client, model, days_summary):
    """
    Generate trip name, destinations list, and summary from a days_summary.
    days_summary: [{ "date": "2024-01-05", "activities": ["...", ...], "location": "Paris, França" }]
    Returns { name: str, destinations: list[str], summary: str|None }.
    On any failure, returns safe defaults.
    """
    if not days_summary:
        return {"name": "Minha Viagem", "destinations": [], "summary": None}

    days_text = "\n".join(
        f"- {d['date']}: {', '.join(d['activities']) if d['activities'] else 'sem atividades'} em {d['location']}"
        for d in days_summary
    )

    prompt = (
        "Você é um assistente de viagens. Com base nos dias de viagem abaixo, "
        "gere um nome criativo para a viagem, uma lista de destinos únicos visitados e um resumo breve em português.\n\n"
        f"Dias da viagem:\n{days_text}\n\n"
        'Responda APENAS com JSON: {"name": "...", "destinations": ["...", ...], "summary": "..."}'
    )

    try:
        response = openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
        )

        raw = (response.choices[0].message.content or "").strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)
        return {
            "name": (result.get("name") or "Minha Viagem").strip() or "Minha Viagem",
            "destinations": list(result.get("destinations") or []),
            "summary": (result.get("summary") or None),
        }

    except Exception:
        return {"name": "Minha Viagem", "destinations": [], "summary": None}
