import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  type Branch,
  type CostCenter,
  type Project,
  useListBranches,
  useListCostCenters,
  useListProjects,
} from "@workspace/api-client-react";
import { BriefcaseBusiness, Building2, GitBranch } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VALUE = "__all__";

export type DimensionFilterValues = {
  costCenterId: string;
  projectId: string;
  branchId: string;
};

export type DimensionFilterQuery = {
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

type Option = {
  id: string;
  code?: string | null;
  nameAr: string;
  nameEn?: string | null;
};

function optionLabel(option: Option, lang: string) {
  const name = lang.startsWith("ar")
    ? option.nameAr || option.nameEn || option.id
    : option.nameEn || option.nameAr || option.id;
  return option.code ? `${option.code} · ${name}` : name;
}

function toOptions(items: Array<CostCenter | Project | Branch>): Option[] {
  return items
    .filter((item) => item.isActive)
    .map((item) => ({
      id: item.id,
      code: item.code ?? null,
      nameAr: item.nameAr,
      nameEn: item.nameEn ?? null,
    }));
}

function FilterSelect({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
  options,
  lang,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  lang: string;
}) {
  return (
    <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <Icon className="pointer-events-none absolute start-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Select
          value={value || ALL_VALUE}
          onValueChange={(next) => onChange(next === ALL_VALUE ? "" : next)}
        >
          <SelectTrigger className="h-11 rounded-xl bg-background ps-10">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {optionLabel(option, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </label>
  );
}

export function DimensionFilters({
  value,
  onChange,
  onBack,
}: {
  value: DimensionFilterValues;
  onChange: (value: DimensionFilterValues) => void;
  /** Optional back navigation callback rendered as a link above the filters. */
  onBack?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: costCenters = [] } = useListCostCenters();
  const { data: projects = [] } = useListProjects();
  const { data: branches = [] } = useListBranches();

  return (
    <div className="rounded-3xl border border-border bg-card/90 p-4 shadow-sm no-print">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {t("dimensionFilters.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("dimensionFilters.subtitle")}
            </p>
          </div>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="inline-block rtl:rotate-180">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </span>
            {t("reportsPage.detail.backToReportsCenter")}
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <FilterSelect
          icon={Building2}
          label={t("dimensionFilters.costCenter")}
          placeholder={t("dimensionFilters.allCostCenters")}
          value={value.costCenterId}
          onChange={(costCenterId) => onChange({ ...value, costCenterId })}
          options={toOptions(costCenters as CostCenter[])}
          lang={lang}
        />
        <FilterSelect
          icon={BriefcaseBusiness}
          label={t("dimensionFilters.project")}
          placeholder={t("dimensionFilters.allProjects")}
          value={value.projectId}
          onChange={(projectId) => onChange({ ...value, projectId })}
          options={toOptions(projects as Project[])}
          lang={lang}
        />
        <FilterSelect
          icon={GitBranch}
          label={t("dimensionFilters.branch")}
          placeholder={t("dimensionFilters.allBranches")}
          value={value.branchId}
          onChange={(branchId) => onChange({ ...value, branchId })}
          options={toOptions(branches as Branch[])}
          lang={lang}
        />
      </div>
    </div>
  );
}
