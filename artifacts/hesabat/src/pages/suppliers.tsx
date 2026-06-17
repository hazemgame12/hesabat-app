import React, { useState } from "react";
import { Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useListAccounts,
  useGetCurrentUser,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import {
  PartyManager,
  type Party,
  type PartyPayload,
} from "@/components/parties/PartyManager";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";

export function Suppliers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data: paginatedSuppliers, isLoading } = usePaginatedQuery<Party>("/api/suppliers", page);
  const suppliers = paginatedSuppliers?.data ?? [];
  const { data: accounts = [] } = useListAccounts();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";

  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });

  return (
    <PartyManager
      config={{
        ns: "suppliers",
        icon: Receipt,
        defaultControlCode: "211",
        showCreditLimit: false,
      }}
      parties={suppliers}
      partiesLoading={isLoading}
      pagination={
        paginatedSuppliers && paginatedSuppliers.totalPages > 1
          ? { page, totalPages: paginatedSuppliers.totalPages, total: paginatedSuppliers.total, limit: paginatedSuppliers.limit, onPageChange: setPage }
          : undefined
      }
      accounts={accounts}
      canCreate={hasCapability(role, "suppliers:create")}
      canUpdate={hasCapability(role, "suppliers:update")}
      canDelete={hasCapability(role, "suppliers:delete")}
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
