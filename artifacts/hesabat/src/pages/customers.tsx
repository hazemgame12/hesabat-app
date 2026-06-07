import React from "react";
import { Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCustomers,
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

export function Customers() {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading } = useListCustomers();
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
      parties={customers as Party[]}
      partiesLoading={isLoading}
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
        isPending: deleteMut.isPending,
      }}
      invalidate={invalidate}
    />
  );
}
