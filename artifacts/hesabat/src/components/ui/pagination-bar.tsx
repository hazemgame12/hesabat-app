import React from "react";
import { useTranslation } from "react-i18next";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from "./pagination";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  className,
}: PaginationBarProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("flex items-center justify-between gap-4 px-4 py-3 border-t bg-muted/30", className)}>
      <span className="text-xs text-muted-foreground font-sans tabular-nums">
        {from}–{to} / {total}
      </span>

      <Pagination className="w-auto mx-0">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink
              size="icon"
              onClick={(e) => { e.preventDefault(); if (page > 1) onPageChange(page - 1); }}
              aria-disabled={page <= 1}
              className={cn("cursor-pointer", page <= 1 && "pointer-events-none opacity-40")}
            >
              <PrevIcon className="h-4 w-4" />
            </PaginationLink>
          </PaginationItem>

          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === page}
                  onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationLink
              size="icon"
              onClick={(e) => { e.preventDefault(); if (page < totalPages) onPageChange(page + 1); }}
              aria-disabled={page >= totalPages}
              className={cn("cursor-pointer", page >= totalPages && "pointer-events-none opacity-40")}
            >
              <NextIcon className="h-4 w-4" />
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
