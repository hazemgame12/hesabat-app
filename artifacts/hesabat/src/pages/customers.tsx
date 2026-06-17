import React, { useState } from "react";
import { Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useListAccounts,
  useGetCurrentUser,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import {
  PartyManager,
  type Party,
  type PartyPayload,
} from "@/components/parties/PartyManager";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";

export function Customers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data: paginatedCustomers, isLoading } = usePaginatedQuery<Party>("/api/customers", page);
  const customers = paginatedCustomers?.data ?? [];
  const { data: accounts = [] } = useListAccounts();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";

  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });

  return (
    <PartyManager
      config={{
        ns: "customers",
        icon: Users,
        defaultControlCode: "112",
        showCreditLimit: true,
      }}
      parties={customers}
      partiesLoading={isLoading}
      pagination={
        paginatedCustomers && paginatedCustomers.totalPages > 1
          ? { page, totalPages: paginatedCustomers.totalPages, total: paginatedCustomers.total, limit: paginatedCustomers.limit, onPageChange: setPage }
          : undefined
      }
      accounts={accounts}
      canCreate={hasCapability(role, "customers:create")}
      canUpdate={hasCapability(role, "customers:update")}
      canDelete={hasCapability(role, "customers:delete")}
      createMut={{
        mutate: (vars, handlers) =>
          createMut.mutate(vars as { data: PartyPayload }, handlers),
        isPending: createMut.isPending,
      }}
      updateMut={{
        mutate: (vars, handlers) =>
          updateMut.mutate(
            vars as { id: string; data: PartyPayload },
            handlers,
          ),
        isPending: updateMut.isPending,
      }}
      deleteMut={{
        mutate: (vars, handlers) => deleteMut.mutate(vars, handlers),
        mutateAsync: (vars) => deleteMut.mutateAsync(vars).then(() => {}),
        isPending: deleteMut.isPending,
      }}
      invalidate={invalidate}
    />
  );
}
