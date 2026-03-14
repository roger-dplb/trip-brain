"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createTrip, generateItinerary } from "@/lib/api";
import { DateRangePicker } from "@/components/date-range-picker";
import { DestinationInput } from "@/components/destination-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";

function HeartSolid() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z" />
      <path d="M5 18l.75 2.25L8 21l-2.25.75L5 24l-.75-2.25L2 21l2.25-.75z" />
    </svg>
  );
}

const inputClass =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

function SelectTimeInput({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder: string }) {
  // Gera horários de meia em meia hora: "00:00", "00:30", ..., "23:30"
  const times = Array.from({ length: 48 }).map((_, i) => {
    const hour = Math.floor(i / 2).toString().padStart(2, "0");
    const min = (i % 2 === 0 ? "00" : "30");
    return `${hour}:${min}`;
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full rounded-lg border-[rgba(0,0,0,0.12)] bg-white px-3 py-5 text-sm text-[#242424] focus:ring-1 focus:ring-[#ff6b6b] focus:border-[#ff6b6b] shadow-none">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#8b8b8b]" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[250px] bg-white border border-[rgba(0,0,0,0.12)] shadow-lg rounded-xl z-50">
        {times.map(t => (
          <SelectItem key={t} value={t} className="focus:bg-[#fff0ed] focus:text-[#ff6b6b] cursor-pointer rounded-lg m-1">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function tripDurationDays(start: string, end: string): number {
  if (!start || !end) return 7;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(diff, 21));
}

export default function NewTripPage() {
  const router = useRouter();
  
  // Step 1: Trip info
  const [name, setName] = useState("");
  const [destinations, setDestinations] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState("");
  
  // Step 2: AI Itinerary info
  const [step, setStep] = useState<"info" | "ai">("info");
  const [wantAI, setWantAI] = useState(false);
  const [preferences, setPreferences] = useState("");
  
  // New AI specific fields
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [pace, setPace] = useState<"tranquilo" | "equilibrado" | "intenso" | "">("");
  const [styles, setStyles] = useState<string[]>([]);

  const availableStyles = [
    { id: "historia", label: "🏛️ Museus e História" },
    { id: "gastronomia", label: "🍔 Gastronomia" },
    { id: "natureza", label: "🌳 Natureza e Parques" },
    { id: "compras", label: "🛍️ Compras" },
    { id: "noturna", label: "🥂 Vida Noturna" },
    { id: "pontos_turisticos", label: "📸 Principais Atrações" },
  ];

  function toggleStyle(id: string) {
    setStyles(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function handleNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate) {
      setError("Selecione o período da viagem.");
      return;
    }
    if (destinations.length === 0) {
      setError("Adicione pelo menos um destino.");
      return;
    }
    setError(null);
    setStep("ai");
  }

  async function handleCreateTrip(generateAiItinerary: boolean) {
    setError(null);
    setLoadingStep("Criando viagem...");

    try {
      const trip = await createTrip({
        name,
        destinations,
        start_date: startDate,
        end_date: endDate,
        summary,
        status: generateAiItinerary ? "generating_itinerary" : "planned",
      });

      if (generateAiItinerary) {
        const maxDays = tripDurationDays(startDate, endDate);

        const compiledPreferences = [
          arrivalTime ? `Horário que chegaremos no destino (dia 1): ${arrivalTime}` : "",
          departureTime ? `Horário que iremos embora (último dia): ${departureTime}` : "",
          pace ? `Ritmo de viagem desejado: ${pace === "tranquilo" ? "Sem pressa, com muito tempo livre" : pace === "equilibrado" ? "Tempo para ver o principal mas com pausas" : "Intenso, para ver a maior quantidade de coisas possíveis"}` : "",
          styles.length > 0 ? `Focos principais da viagem: ${styles.map(s => availableStyles.find(as => as.id === s)?.label).join(", ")}` : "",
          preferences ? `Observações extras: ${preferences.trim()}` : ""
        ].filter(Boolean).join(". ");

        try {
          await generateItinerary({
            trip_id: trip.id.toString(),
            preferences: compiledPreferences || "Sem preferências específicas fornecidas.",
            max_days: maxDays,
          });
        } catch {
          // enqueue failed — trip was created, proceed to /trips anyway
        }
      }

      router.push("/trips");
    } catch {
      setError("Não foi possível criar a viagem. Tente novamente.");
      setLoadingStep("");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleCreateTrip(wantAI);
  }

  return (
    <div className="min-h-screen bg-[#fff9f6]">
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#ff6b6b]">
              <HeartSolid />
            </span>
            <span className="text-lg sm:text-xl font-bold text-[#ff6b6b]">Roger e Ana</span>
          </div>
          <Link
            href="/trips"
            className="flex items-center gap-1.5 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
          >
            <ArrowLeft />
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-[#242424]">Nova viagem</h1>
          <p className="text-sm text-[#8b8b8b] mt-1">Planeje mais uma aventura juntos</p>
        </div>

        <section className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-5 sm:p-6">
          {step === "info" && (
            <form className="space-y-5" onSubmit={handleNext}>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  Nome da viagem
                </label>
                <input
                  className={inputClass}
                  placeholder="Ex: Aventura Ibérica a Dois"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">Destinos</label>
                <DestinationInput
                  destinations={destinations}
                  onChange={setDestinations}
                  error={destinations.length === 0 && error?.includes("destino") ? error : undefined}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  Período da viagem
                </label>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#242424] mb-1.5">
                  Resumo{" "}
                  <span className="text-[#8b8b8b] font-normal">(opcional)</span>
                </label>
                <textarea
                  className={inputClass}
                  placeholder="Uma breve descrição da viagem..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                className="w-full rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                type="submit"
              >
                Próximo passo
              </button>
            </form>
          )}

          {step === "ai" && (
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center p-3 bg-[#ff6b6b]/10 text-[#ff6b6b] rounded-full mb-2">
                    <SparkleIcon />
                  </div>
                  <h3 className="text-lg font-semibold text-[#242424]">
                    Gostaria de gerar um roteiro com IA?
                  </h3>
                  <p className="text-sm text-[#8b8b8b]">
                    Nossa IA pode sugerir atividades diárias personalizadas para <strong>{destinations.join(" · ")}</strong> de {startDate} até {endDate}.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setWantAI(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all text-sm font-semibold text-center ${
                      wantAI
                        ? "bg-[#ff6b6b] text-white shadow ring-2 ring-[#ff6b6b] ring-offset-2"
                        : "bg-[#fff0ed] text-[#ff6b6b] hover:bg-[#ffe4de]"
                    }`}
                  >
                    <SparkleIcon />
                    Sim, gerar roteiro
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWantAI(false);
                      handleCreateTrip(false);
                    }}
                    disabled={!!loadingStep}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#f5f5f5] text-[#4a4a4a] hover:bg-[#e8e8e8] transition-colors text-sm font-semibold text-center disabled:opacity-60"
                  >
                    Não, apenas criar a viagem
                  </button>
                </div>

                {wantAI && (
                  <div className="animate-in fade-in slide-in-from-top-2 pt-4 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#242424] mb-1.5">
                          Horário de chegada (Dia 1)
                        </label>
                        <SelectTimeInput
                          value={arrivalTime}
                          onChange={setArrivalTime}
                          placeholder="Selecione..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#242424] mb-1.5">
                          Horário de partida (Último dia)
                        </label>
                        <SelectTimeInput
                          value={departureTime}
                          onChange={setDepartureTime}
                          placeholder="Selecione..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#242424] mb-2">
                        Qual o ritmo da viagem?
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => setPace("tranquilo")}
                          className={`p-3 rounded-lg border text-sm text-left transition-all ${
                            pace === "tranquilo"
                              ? "border-[#ff6b6b] bg-[#fff0ed] text-[#ff6b6b]"
                              : "border-[rgba(0,0,0,0.12)] text-[#4a4a4a] hover:bg-gray-50"
                          }`}
                        >
                          <div className="font-semibold mb-1">🚶 Tranquilo</div>
                          <div className="text-xs text-[#8b8b8b] leading-tight">Relaxar. Sem acordar tão cedo.</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPace("equilibrado")}
                          className={`p-3 rounded-lg border text-sm text-left transition-all ${
                            pace === "equilibrado"
                              ? "border-[#ff6b6b] bg-[#fff0ed] text-[#ff6b6b]"
                              : "border-[rgba(0,0,0,0.12)] text-[#4a4a4a] hover:bg-gray-50"
                          }`}
                        >
                          <div className="font-semibold mb-1">⚖️ Equilibrado</div>
                          <div className="text-xs text-[#8b8b8b] leading-tight">Ver o principal, mas com pausas.</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPace("intenso")}
                          className={`p-3 rounded-lg border text-sm text-left transition-all ${
                            pace === "intenso"
                              ? "border-[#ff6b6b] bg-[#fff0ed] text-[#ff6b6b]"
                              : "border-[rgba(0,0,0,0.12)] text-[#4a4a4a] hover:bg-gray-50"
                          }`}
                        >
                          <div className="font-semibold mb-1">🏃 Intenso</div>
                          <div className="text-xs text-[#8b8b8b] leading-tight">Explorar tudo ao máximo.</div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#242424] mb-2">
                        O que não pode faltar nessa viagem? (Pode marcar vários)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {availableStyles.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => toggleStyle(style.id)}
                            className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                              styles.includes(style.id)
                                ? "bg-[#ff6b6b] text-white border-[#ff6b6b]"
                                : "bg-white text-[#4a4a4a] border-[rgba(0,0,0,0.12)] hover:border-[#ff6b6b] hover:text-[#ff6b6b]"
                            }`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#242424] mb-1.5">
                        Mais alguma observação? <span className="text-[#8b8b8b] font-normal">(opcional)</span>
                      </label>
                      <textarea
                        className={`${inputClass} resize-none`}
                        rows={3}
                        placeholder="Ex: A Ana é vegetariana, odiamos lugares muito cheios, precisamos ir no restaurante X no 2º dia..."
                        value={preferences}
                        onChange={(e) => setPreferences(e.target.value)}
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        className="w-full rounded-lg bg-[#ff6b6b] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex justify-center items-center gap-2"
                        disabled={!!loadingStep}
                        type="submit"
                      >
                        {loadingStep && (
                          <svg className="animate-spin text-white shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                        )}
                        {loadingStep ? loadingStep : "Criar Viagem e Gerar Roteiro"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Removido o block final de form vazio que tinha sobrado */}
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
