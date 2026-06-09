import React from "react";
import { useParams, useLocation } from "wouter";
import { VoucherDocument } from "@/components/print/VoucherDocument";

export default function PrintPaymentPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const id = params.id ?? "";
  if (!id) return null;
  return (
    <VoucherDocument
      paymentId={id}
      onBack={() => {
        if (window.history.length > 1) window.history.back();
        else navigate("/invoices/sales");
      }}
    />
  );
}
