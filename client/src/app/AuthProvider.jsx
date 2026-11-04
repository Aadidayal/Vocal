import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loginAccount, logoutAccount, registerAccount, restoreSession } from "../api/client.js";

const AuthContext = createContext(null);
const SESSION_KEY = ["auth", "session"];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: restoreSession,
    retry: false,
    staleTime: 0,
  });

  const loginMutation = useMutation({
    mutationFn: loginAccount,
    onSuccess: (user) => queryClient.setQueryData(SESSION_KEY, user),
  });
  const registerMutation = useMutation({
    mutationFn: registerAccount,
    onSuccess: (user) => queryClient.setQueryData(SESSION_KEY, user),
  });
  const logoutMutation = useMutation({
    mutationFn: logoutAccount,
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({ queryKey: ["tasks"] });
    },
  });

  const value = {
    user: sessionQuery.data || null,
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    authPending: loginMutation.isPending || registerMutation.isPending || logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
