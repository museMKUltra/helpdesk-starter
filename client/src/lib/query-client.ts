import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only network failures; an HTTP error (401/403/500) won't fix itself on retry.
      retry: (failureCount, error) =>
        failureCount < 2 && !(axios.isAxiosError(error) && error.response),
    },
  },
});
