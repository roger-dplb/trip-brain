import uuid

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.activity import Activity
from app.models.day import Day
from app.models.memory import Memory
from app.models.trip import Trip
from app.repositories.embedding_repository import EmbeddingRepository
from app.schemas.rag import (
    ItineraryGenerationResponse,
    SemanticQueryMatch,
    SemanticQueryResponse,
)


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

    def generate_itinerary(
        self,
        trip_id: uuid.UUID,
        preferences: str | None,
        max_days: int,
    ) -> ItineraryGenerationResponse:
        trip = self.db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip:
            return ItineraryGenerationResponse(
                itinerary_markdown="# Roteiro inicial\n\nViagem não encontrada.",
                provider=settings.itinerary_provider,
                model=settings.itinerary_model,
                prompt_strategy=settings.itinerary_prompt_strategy,
                used_summary=False,
            )

        days = (
            self.db.query(Day)
            .filter(Day.trip_id == trip_id)
            .order_by(Day.day_number.asc())
            .all()
        )
        day_ids = [day.id for day in days]

        activities_by_day: dict[uuid.UUID, list[Activity]] = {
            day.id: [] for day in days
        }
        if day_ids:
            activities = (
                self.db.query(Activity)
                .filter(Activity.day_id.in_(day_ids))
                .order_by(Activity.created_at.asc())
                .all()
            )
            for activity in activities:
                activities_by_day.setdefault(activity.day_id, []).append(activity)

        template_itinerary = self._build_itinerary_markdown(
            trip=trip,
            days=days,
            activities_by_day=activities_by_day,
            preferences=preferences,
            max_days=max_days,
        )

        used_summary = bool((trip.summary or "").strip())

        if settings.itinerary_provider.lower() != "openai":
            return ItineraryGenerationResponse(
                itinerary_markdown=template_itinerary,
                provider="template",
                model="template-fallback-v1",
                prompt_strategy=settings.itinerary_prompt_strategy,
                used_summary=used_summary,
            )

        if not settings.openai_api_key:
            return ItineraryGenerationResponse(
                itinerary_markdown=template_itinerary,
                provider="template",
                model="template-fallback-v1",
                prompt_strategy=settings.itinerary_prompt_strategy,
                used_summary=used_summary,
            )

        try:
            itinerary_from_openai = self._generate_itinerary_with_openai(
                trip=trip,
                days=days,
                activities_by_day=activities_by_day,
                preferences=preferences,
                max_days=max_days,
                template_itinerary=template_itinerary,
            )

            return ItineraryGenerationResponse(
                itinerary_markdown=itinerary_from_openai,
                provider="openai",
                model=settings.itinerary_model,
                prompt_strategy=settings.itinerary_prompt_strategy,
                used_summary=used_summary,
            )
        except Exception:
            return ItineraryGenerationResponse(
                itinerary_markdown=template_itinerary,
                provider="template",
                model="template-fallback-v1",
                prompt_strategy=settings.itinerary_prompt_strategy,
                used_summary=used_summary,
            )

    def _generate_itinerary_with_openai(
        self,
        trip: Trip,
        days: list[Day],
        activities_by_day: dict[uuid.UUID, list[Activity]],
        preferences: str | None,
        max_days: int,
        template_itinerary: str,
    ) -> str:
        prompt = self._build_itinerary_prompt(
            trip=trip,
            days=days,
            activities_by_day=activities_by_day,
            preferences=preferences,
            max_days=max_days,
            template_itinerary=template_itinerary,
        )

        response = self.openai_client.responses.create(
            model=settings.itinerary_model,
            input=prompt,
        )

        itinerary = (getattr(response, "output_text", "") or "").strip()
        if not itinerary:
            raise RuntimeError("Empty itinerary returned by OpenAI")
        return itinerary

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
                "Você é um assistente de viagens para casal e deve responder em português do Brasil.",
                "Gere um roteiro em Markdown, objetivo e prático, seguindo estritamente os dados abaixo.",
                "Inclua seções: visão geral, plano por dia, recomendações finais.",
                "Não invente atrações muito específicas se não houver contexto.",
                "",
                f"Viagem: {trip.name}",
                f"Destino: {trip.destination}",
                f"Período: {trip.start_date} até {trip.end_date}",
                f"Resumo atual: {summary_text}",
                f"Preferências: {preferences_text}",
                f"Máximo de dias na resposta: {max_days}",
                "",
                "Contexto dos dias/atividades:",
                *[f"- {line}" for line in day_lines],
                "",
                "Rascunho base (use como fallback de conteúdo, mas melhore quando possível):",
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
            f"Destino: {trip.destination}",
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
