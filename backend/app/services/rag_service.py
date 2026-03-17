import hashlib
import json
import logging
import uuid

from fastapi import HTTPException
from openai import OpenAI
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.activity import Activity
from app.models.day import Day
from app.models.memory import Memory
from app.models.trip import Trip
from app.repositories.activity_repository import ActivityRepository
from app.repositories.day_repository import DayRepository
from app.repositories.embedding_repository import EmbeddingRepository
from app.schemas.activity import ActivityCreate
from app.schemas.day import DayCreate
from app.schemas.rag import (
    ChatMessage,
    ChatResponse,
    ItineraryJobEnqueuedResponse,
    SemanticQueryMatch,
    SemanticQueryResponse,
)

logger = logging.getLogger("trip_archive.rag")


class RagService:
    def __init__(self, db: Session):
        self.db = db
        self.embedding_repository = EmbeddingRepository(db)
        self.openai_client = OpenAI(api_key=settings.openai_api_key)

    def ask_trip(
        self, trip_id: uuid.UUID, query: str, top_k: int
    ) -> SemanticQueryResponse:
        self._sync_trip_embeddings(trip_id)

        allowed_sources = self._allowed_sources_for_trip(trip_id)
        query_embedding = self._embed_text(query)
        results = self.embedding_repository.search_top_k(
            query_embedding=query_embedding,
            top_k=top_k,
            allowed_sources=allowed_sources,
        )

        if not results:
            return SemanticQueryResponse(
                answer=(
                    "Ainda não encontrei contexto suficiente nesta viagem para responder "
                    "com precisão. Registre mais atividades ou memórias e tente novamente."
                ),
                used_context=False,
                matches=[],
            )

        matches = [
            SemanticQueryMatch(
                source_type=embedding.source_type,
                source_id=embedding.source_id,
                content=embedding.content,
                score=max(0.0, 1.0 - distance),
            )
            for embedding, distance in results
        ]

        answer_lines = [
            "Encontrei estes pontos mais relevantes da viagem:",
            *[f"- {match.content}" for match in matches[:3]],
        ]

        return SemanticQueryResponse(
            answer="\n".join(answer_lines),
            used_context=True,
            matches=matches,
        )

    def chat_with_trip(
        self,
        trip_id: uuid.UUID,
        message: str,
        history: list[ChatMessage],
    ) -> ChatResponse:
        trip = self.db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Viagem não encontrada")

        self._sync_trip_embeddings(trip_id)

        allowed_sources = self._allowed_sources_for_trip(trip_id)
        query_embedding = self._embed_text(message)
        results = self.embedding_repository.search_top_k(
            query_embedding=query_embedding,
            top_k=8,
            allowed_sources=allowed_sources,
        )

        context_snippets = [embedding.content for embedding, _ in results]
        used_context = bool(context_snippets)

        destinations = (
            ", ".join(trip.destinations)
            if trip.destinations
            else "destino não informado"
        )
        period = (
            f"{trip.start_date} até {trip.end_date}"
            if trip.start_date and trip.end_date
            else "período não informado"
        )

        system_prompt = "\n".join(
            [
                "Você é um assistente de viagens inteligente e amigável para o TripBrain.",
                "Responda de forma conversacional, concisa e útil, sempre em português.",
                "Use o contexto da viagem abaixo para personalizar suas respostas.",
                "",
                f"Viagem: {trip.name}",
                f"Destinos: {destinations}",
                f"Período: {period}",
            ]
        )

        if trip.summary:
            system_prompt += f"\nResumo: {trip.summary}"

        if context_snippets:
            system_prompt += "\n\nContexto relevante desta viagem:\n" + "\n".join(
                f"- {snippet}" for snippet in context_snippets
            )
        else:
            system_prompt += (
                "\n\nAinda não há atividades ou memórias registradas nesta viagem. "
                "Responda com base nas informações gerais disponíveis."
            )

        openai_messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-20:]:  # cap at 20 prior messages
            openai_messages.append({"role": msg.role, "content": msg.content})
        openai_messages.append({"role": "user", "content": message})

        response = self.openai_client.chat.completions.create(
            model=settings.chat_model,
            messages=openai_messages,
        )

        answer = response.choices[0].message.content or ""

        return ChatResponse(answer=answer.strip(), used_context=used_context)

    def enqueue_itinerary_generation(
        self,
        trip_id: uuid.UUID,
        preferences: str | None,
        max_days: int,
    ) -> ItineraryJobEnqueuedResponse:
        trip = self.db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Viagem não encontrada")

        trip.status = "generating_itinerary"
        self.db.flush()

        payload = {"preferences": preferences, "max_days": max_days}
        payload_hash = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode()
        ).hexdigest()
        job_id = uuid.uuid4()

        result = self.db.execute(
            text("""
                INSERT INTO worker_jobs (
                    id, job_type, source_type, source_id,
                    status, payload, payload_hash, updated_at
                )
                VALUES (
                    :job_id, 'itinerary_generation', 'trip', :trip_id,
                    'pending', CAST(:payload AS JSONB), :payload_hash, NOW()
                )
                ON CONFLICT (job_type, source_type, source_id) DO UPDATE
                SET
                    status = 'pending',
                    attempt_count = 0,
                    available_at = NOW(),
                    payload = EXCLUDED.payload,
                    payload_hash = EXCLUDED.payload_hash,
                    last_error = NULL,
                    updated_at = NOW()
                RETURNING id
            """),
            {
                "job_id": job_id,
                "trip_id": trip_id,
                "payload": json.dumps(payload),
                "payload_hash": payload_hash,
            },
        )
        returned = result.fetchone()
        if returned:
            job_id = returned[0]

        self.db.commit()

        return ItineraryJobEnqueuedResponse(
            trip_id=trip_id,
            job_id=str(job_id),
            trip_status="generating_itinerary",
        )

    def _generate_structured_itinerary_with_openai(
        self,
        trip: Trip,
        days: list[Day],
        activities_by_day: dict[uuid.UUID, list[Activity]],
        preferences: str | None,
        max_days: int,
        template_itinerary: str,
    ) -> dict:
        prompt = self._build_itinerary_prompt(
            trip=trip,
            days=days,
            activities_by_day=activities_by_day,
            preferences=preferences,
            max_days=max_days,
            template_itinerary=template_itinerary,
        )

        logger.info("itinerary: prompt built, prompt_chars=%d", len(prompt))
        logger.info("itinerary: sending request to openai, this may take 15-30s...")

        response = self.openai_client.responses.create(
            model=settings.itinerary_model,
            input=prompt,
        )

        logger.info("itinerary: openai responded, extracting output_text")
        raw = (getattr(response, "output_text", "") or "").strip()
        logger.info(
            "itinerary: raw_response_chars=%d raw_preview=%r", len(raw), raw[:200]
        )

        if not raw:
            raise RuntimeError("Empty response from OpenAI")

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        logger.info("itinerary: parsing JSON response")
        parsed = json.loads(raw)
        logger.info(
            "itinerary: JSON parsed ok, days=%d markdown_chars=%d",
            len(parsed.get("days", [])),
            len(parsed.get("markdown", "")),
        )
        return parsed

    def _persist_itinerary(
        self,
        trip_id: uuid.UUID,
        structured_days: list[dict],
    ) -> tuple[int, int]:
        day_repo = DayRepository(self.db)
        activity_repo = ActivityRepository(self.db)
        days_created = 0
        activities_created = 0

        for day_data in structured_days:
            day_number = int(day_data.get("day_number", 0))
            if not day_number:
                continue

            existing = day_repo.find_by_trip_and_day_number(trip_id, day_number)
            if existing:
                day = existing
            else:
                day = day_repo.create(
                    DayCreate(
                        trip_id=trip_id,
                        day_number=day_number,
                        date=day_data.get("date") or None,
                        notes=day_data.get("notes") or None,
                    )
                )
                days_created += 1

            for act in day_data.get("activities", []):
                title = (act.get("title") or "").strip()
                if not title:
                    continue
                existing_activity = (
                    self.db.query(Activity)
                    .filter(
                        Activity.day_id == day.id,
                        func.lower(Activity.title) == func.lower(title),
                    )
                    .first()
                )
                if existing_activity:
                    continue
                activity_repo.create(
                    ActivityCreate(
                        day_id=day.id,
                        title=title,
                        location=act.get("location") or None,
                        notes=act.get("notes") or None,
                        status="planned",
                    )
                )
                activities_created += 1

        return days_created, activities_created

    def _build_itinerary_prompt(
        self,
        trip: Trip,
        days: list[Day],
        activities_by_day: dict[uuid.UUID, list[Activity]],
        preferences: str | None,
        max_days: int,
        template_itinerary: str,
    ) -> str:
        preferences_text = (preferences or "").strip() or "Sem preferências explícitas"
        summary_text = (trip.summary or "").strip() or "Sem resumo informado"

        day_lines: list[str] = []
        for day in days[:max_days]:
            line = f"Dia {day.day_number}"
            if day.date:
                line = f"{line} ({day.date})"
            activities = activities_by_day.get(day.id, [])
            if activities:
                line = f"{line}: " + "; ".join(
                    [
                        activity.title
                        + (f" @ {activity.location}" if activity.location else "")
                        for activity in activities[:6]
                    ]
                )
            elif day.notes:
                line = f"{line}: {day.notes}"
            day_lines.append(line)

        if not day_lines:
            day_lines = ["Sem dias planejados ainda"]

        return "\n".join(
            [
                "Você é um assistente de viagens para casal. Responda APENAS com um objeto JSON válido, sem texto adicional.",
                "",
                "O JSON deve seguir exatamente esta estrutura:",
                "{",
                '  "markdown": "<roteiro completo em Markdown com seções: visão geral, plano por dia, recomendações finais>",',
                '  "days": [',
                "    {",
                '      "day_number": 1,',
                '      "date": "YYYY-MM-DD ou null",',
                '      "notes": "resumo do dia em 1-2 frases ou null",',
                '      "activities": [',
                '        {"title": "nome da atividade", "location": "local ou null", "notes": "dica ou null"}',
                "      ]",
                "    }",
                "  ]",
                "}",
                "",
                "Regras:",
                "- Gere entre 1 e {max_days} dias".format(max_days=max_days),
                "- Cada dia deve ter entre 2 e 5 atividades",
                "- Não invente atrações muito específicas se não houver contexto",
                "- Use os dados da viagem abaixo como base",
                "- Se já existem atividades planejadas, inclua-as e complemente",
                "",
                f"Viagem: {trip.name}",
                f"Destinos: {', '.join(trip.destinations)}",
                f"Período: {trip.start_date} até {trip.end_date}",
                f"Resumo atual: {summary_text}",
                f"Preferências: {preferences_text}",
                "",
                "Contexto dos dias/atividades já existentes:",
                *[f"- {line}" for line in day_lines],
                "",
                "Rascunho base para referência de conteúdo:",
                template_itinerary,
            ]
        )

    def _sync_trip_embeddings(self, trip_id: uuid.UUID) -> None:
        activities = (
            self.db.query(Activity)
            .join(Day, Activity.day_id == Day.id)
            .filter(Day.trip_id == trip_id)
            .all()
        )
        memories = self.db.query(Memory).filter(Memory.trip_id == trip_id).all()

        for activity in activities:
            content = self._activity_content(activity)
            if not content:
                continue
            self.embedding_repository.upsert(
                source_type="activity",
                source_id=activity.id,
                content=content,
                embedding=self._embed_text(content),
            )

        for memory in memories:
            content = self._memory_content(memory)
            if not content:
                continue
            self.embedding_repository.upsert(
                source_type="memory",
                source_id=memory.id,
                content=content,
                embedding=self._embed_text(content),
            )

    def _allowed_sources_for_trip(
        self, trip_id: uuid.UUID
    ) -> dict[str, set[uuid.UUID]]:
        activity_ids = {
            activity_id
            for (activity_id,) in (
                self.db.query(Activity.id)
                .join(Day, Activity.day_id == Day.id)
                .filter(Day.trip_id == trip_id)
                .all()
            )
        }
        memory_ids = {
            memory_id
            for (memory_id,) in self.db.query(Memory.id)
            .filter(Memory.trip_id == trip_id)
            .all()
        }
        return {"activity": activity_ids, "memory": memory_ids}

    def _activity_content(self, activity: Activity) -> str:
        fields = [
            activity.title,
            activity.location,
            activity.notes,
            f"status={activity.status}",
        ]
        return " | ".join([value for value in fields if value]).strip()

    def _memory_content(self, memory: Memory) -> str:
        fields = [
            f"type={memory.memory_type}",
            memory.caption,
            memory.content_text,
        ]
        return " | ".join([value for value in fields if value]).strip()

    def _embed_text(self, text: str) -> list[float]:
        clean_text = text.strip()
        if not clean_text:
            return [0.0] * 1536

        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for embedding generation")

        response = self.openai_client.embeddings.create(
            model=settings.openai_embedding_model,
            input=clean_text,
        )
        return list(response.data[0].embedding)

    def _build_itinerary_markdown(
        self,
        trip: Trip,
        days: list[Day],
        activities_by_day: dict[uuid.UUID, list[Activity]],
        preferences: str | None,
        max_days: int,
    ) -> str:
        lines = [
            f"# Roteiro inicial · {trip.name}",
            "",
            f"Destinos: {', '.join(trip.destinations)}",
            f"Período: {trip.start_date} até {trip.end_date}",
            "",
        ]

        summary = (trip.summary or "").strip()
        if summary:
            lines.extend(["## Resumo da viagem", summary, ""])

        preferences_text = (preferences or "").strip()
        if preferences_text:
            lines.extend(["## Preferências consideradas", preferences_text, ""])

        lines.append("## Plano sugerido por dia")
        if not days:
            lines.extend(
                [
                    "- Dia 1: chegada, check-in e reconhecimento da região.",
                    "- Dia 2: atividade principal do destino e jantar especial.",
                    "- Dia 3: passeio leve e fechamento da viagem.",
                ]
            )
            return "\n".join(lines)

        for day in days[:max_days]:
            label = f"Dia {day.day_number}"
            if day.date:
                label = f"{label} ({day.date})"
            lines.append(f"### {label}")

            activities = activities_by_day.get(day.id, [])
            if not activities:
                lines.append("- Manhã: passeio livre com foco nos pontos essenciais.")
                lines.append("- Tarde: atividade cultural ou gastronômica local.")
                lines.append("- Noite: jantar e revisão do plano do próximo dia.")
            else:
                for activity in activities[:5]:
                    base = f"- {activity.title}"
                    if activity.location:
                        base = f"{base} · {activity.location}"
                    lines.append(base)

                if len(activities) > 5:
                    lines.append(
                        f"- +{len(activities) - 5} atividades já planejadas para este dia"
                    )

            if day.notes:
                lines.append(f"- Nota do dia: {day.notes}")
            lines.append("")

        lines.extend(
            [
                "## Recomendações gerais",
                "- Validar deslocamentos entre atividades para evitar correria.",
                "- Reservar atrações concorridas com antecedência.",
                "- Registrar memórias ao fim de cada dia para melhorar consultas futuras.",
            ]
        )

        return "\n".join(lines)
