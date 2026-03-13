"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiError,
  getStoredAccessToken,
  loginCouple,
  setStoredAccessToken,
} from "@/lib/api";

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
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <section className="w-full rounded-lg border border-neutral-200 p-6">
        <h1 className="mb-2 text-2xl font-bold">Entrar</h1>
        <p className="mb-6 text-sm text-neutral-600">Acesso do casal ao Trip Archive.</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            placeholder="Usuário"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
            placeholder="Senha"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
