"use client";

import { useEffect, useRef, useState } from "react";

import { ChatMessage, chatWithTrip } from "@/lib/api";

const SUGGESTED_PROMPTS = [
  "O que tenho planejado para amanhã?",
  "Quais são as melhores atividades desta viagem?",
  "Me ajuda a lembrar onde ficamos hospedados",
  "Qual foi o dia mais movimentado?",
];

function SendIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-[#ff6b6b] opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

type PageProps = {
  params: { tripId: string };
};

export default function ChatPage({ params }: PageProps) {
  const { tripId } = params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await chatWithTrip(tripId, trimmed, messages);
      setMessages([...nextHistory, { role: "assistant", content: res.answer }]);
    } catch {
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on mobile (no shift); Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-grow up to ~3 lines
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-[rgba(0,0,0,0.06)] bg-white">
        <h1 className="text-lg font-semibold text-[#242424]">Chat da viagem</h1>
        <p className="text-xs text-[#8b8b8b] mt-0.5">
          Pergunte sobre suas atividades, planos e memórias
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-4 pt-8">
            <div className="w-14 h-14 rounded-full bg-[#fff0ef] flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ff6b6b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-[#8b8b8b] text-sm text-center">
              Pergunte qualquer coisa sobre sua viagem
            </p>
            <div className="w-full grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white text-[#242424] hover:bg-[#f3ece8] hover:border-[#ff6b6b]/30 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#ff6b6b] text-white rounded-tl-2xl rounded-bl-2xl rounded-tr-sm rounded-br-2xl"
                  : "bg-white text-[#242424] rounded-tr-2xl rounded-br-2xl rounded-tl-sm rounded-bl-2xl shadow-sm border border-[rgba(0,0,0,0.06)]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-tr-2xl rounded-br-2xl rounded-tl-sm rounded-bl-2xl shadow-sm">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-white border-t border-[rgba(0,0,0,0.06)]">
        <div className="flex items-end gap-2 bg-[#f7f3f1] rounded-2xl px-4 py-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem..."
            inputMode="text"
            enterKeyHint="send"
            disabled={loading}
            className="flex-1 bg-transparent resize-none text-sm text-[#242424] placeholder-[#b0a8a4] outline-none py-1.5 max-h-24"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            aria-label="Enviar"
            className="shrink-0 mb-1 w-9 h-9 flex items-center justify-center rounded-full bg-[#ff6b6b] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
