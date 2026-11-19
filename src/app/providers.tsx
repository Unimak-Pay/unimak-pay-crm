"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, isApiError } from "@/api/errors";
import { AuthProvider } from "@/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MockGate } from "@/mocks/mock-gate";

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      // Mutations show their own inline errors when they set meta.inlineError; otherwise toast.
      onError: (err, _v, _c, mutation) => {
        if (mutation.meta?.inlineError) return;
        toast.error(errorMessage(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (isApiError(err) && err.status > 0 && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { inlineError?: boolean };
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MockGate>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            <AuthProvider>{children}</AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </MockGate>
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}
