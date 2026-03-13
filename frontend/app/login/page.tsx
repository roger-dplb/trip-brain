"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiError,
  getStoredAccessToken,
  loginCouple,
  setStoredAccessToken,
} from "@/lib/api";

function HeartSolid() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const inputClass =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredAccessToken()) {
      router.replace("/trips");
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await loginCouple({ username, password });
      setStoredAccessToken(response.access_token);
      router.push("/trips");
    } catch (rawError) {
      if (rawError instanceof ApiError && rawError.status === 401) {
        setError("Usuário ou senha inválidos.");
      } else if (rawError instanceof ApiError && rawError.status === 503) {
        setError("Login ainda não foi configurado no backend.");
      } else {
        setError("Não foi possível efetuar login.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff9f6] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <span className="text-[#ff6b6b]">
            <HeartSolid />
          </span>
          <span className="text-2xl font-bold text-[#ff6b6b]">Roger e Ana</span>
        </div>

        {/* Card */}
        <section className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-8">
          <h1 className="text-2xl font-bold text-[#242424] mb-1">Bem-vindos de volta</h1>
          <p className="text-sm text-[#8b8b8b] mb-6">Acesse o diário de viagem do casal.</p>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">Usuário</label>
              <input
                className={inputClass}
                placeholder="Digite o usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#242424] mb-1.5">Senha</label>
              <input
                className={inputClass}
                placeholder="Digite a senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              className="w-full rounded-lg bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60 mt-2"
              disabled={loading}
              type="submit"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
