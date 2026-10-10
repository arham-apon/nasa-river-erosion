import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../theme/ThemeContext.jsx";

const client = new QueryClient({
  defaultOptions: {
    // The bundle is a fixed snapshot: fetch each file once per visit.
    queries: { staleTime: Infinity, gcTime: 30 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
