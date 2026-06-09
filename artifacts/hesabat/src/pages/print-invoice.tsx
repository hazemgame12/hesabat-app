import React from "react";
import { useParams, useLocation } from "wouter";
import { InvoiceDocument } from "@/components/print/InvoiceDocument";

export default function PrintInvoicePage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const id = params.id ?? "";
  if (!id) return null;
  return (
    <InvoiceDocument
      invoiceId={id}
      onBack={() => {
        if (window.history.length > 1) window.history.back();
        else navigate("/invoices/sales");
      }}
    />
  );
}
