"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getStoredAccessToken } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredAccessToken();
    router.replace(token ? "/trips" : "/login");
  }, [router]);

  return null;
}
