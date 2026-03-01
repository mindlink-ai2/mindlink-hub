"use client"

import { type ReactNode, useId, useMemo, useState } from "react"
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type ProspectionStatusKey = "todo" | "pending" | "connected" | "sent"
export type ProspectionSegmentKey = "all" | ProspectionStatusKey
export type ProspectionInvitationKey = "accepted" | "sent" | "none"
export type ProspectionContactKey = "email" | "phone"
export type ProspectionDatePreset = "all" | "7d" | "30d" | "90d"

export type ProspectionDesktopFilters = {
  segment: ProspectionSegmentKey
  statuses: ProspectionStatusKey[]
  invitations: ProspectionInvitationKey[]
  contacts: ProspectionContactKey[]
  datePreset: ProspectionDatePreset
}

type SegmentOption = {
  key: ProspectionSegmentKey
  label: string
  count: number
}

type ProspectionFilterBarProps = {
  className?: string
  searchValue: string
  onSearchChange: (value: string) => void
  resultsCount: number
  activeFiltersCount: number
  currentFilters: ProspectionDesktopFilters
  onChange: (next: ProspectionDesktopFilters) => void
  onReset: () => void
  segmentOptions: SegmentOption[]
  actions?: ReactNode
}

const STATUS_OPTIONS: Array<{ value: ProspectionStatusKey; label: string }> = [
  { value: "todo", label: "À faire" },
  { value: "pending", label: "En attente" },
  { value: "connected", label: "Connecté" },
  { value: "sent", label: "Envoyé" },
]

const INVITATION_OPTIONS: Array<{ value: ProspectionInvitationKey; label: string }> = [
  { value: "accepted", label: "Connecté" },
  { value: "sent", label: "Invitation envoyée" },
  { value: "none", label: "Sans invitation" },
]

const CONTACT_OPTIONS: Array<{ value: ProspectionContactKey; label: string }> = [
  { value: "email", label: "Avec email" },
  { value: "phone", label: "Avec téléphone" },
]

const DATE_OPTIONS: Array<{ value: ProspectionDatePreset; label: string }> = [
  { value: "all", label: "Toutes les dates" },
  { value: "7d", label: "7 derniers jours" },
  { value: "30d", label: "30 derniers jours" },
  { value: "90d", label: "90 derniers jours" },
]

function toggleSelection<T extends string>(values: T[], value: T): T[] {
  if (values.includes(value)) return values.filter((item) => item !== value)
  return [...values, value]
}

function getChipLabel(baseLabel: string, labels: string[]): string {
  if (labels.length === 0) return baseLabel
  if (labels.length === 1) return `${baseLabel}: ${labels[0]}`
  return `${baseLabel}: ${labels[0]} (${labels.length})`
}

function labelForDatePreset(value: ProspectionDatePreset): string {
  const option = DATE_OPTIONS.find((entry) => entry.value === value)
  return option?.label ?? "Toutes les dates"
}

function FilterOptionRow({
  checked,
  label,
  onChange,
  type = "checkbox",
  name,
}: {
  checked: boolean
  label: string
  onChange: () => void
  type?: "checkbox" | "radio"
  name?: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-transparent px-2.5 py-2 text-sm text-[#334155] transition hover:border-[#dbe8ff] hover:bg-[#f5f9ff]">
      <span className="inline-flex items-center gap-2">
        <input
          type={type}
          checked={checked}
          name={name}
          onChange={onChange}
          className="h-4 w-4 rounded border-[#bcd0ea] text-[#1f5eff] focus:ring-[#bfd8ff]"
        />
        {label}
      </span>
      {checked ? <Check className="h-3.5 w-3.5 text-[#1f5eff]" aria-hidden="true" /> : null}
    </label>
  )
}

function ChipTriggerButton({
  label,
  expanded,
  controlsId,
  active,
}: {
  label: string
  expanded: boolean
  controlsId: string
  active: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={expanded}
      aria-controls={controlsId}
      className={cn(
        "h-9 rounded-full border-[#c8d6ea] bg-[#f9fcff] px-3 text-xs text-[#2f4a6d] transition-colors hover:bg-[#eef5ff]",
        active ? "border-[#91b6f8] bg-[#edf4ff] text-[#1f4f96]" : ""
      )}
    >
      {label}
      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
    </Button>
  )
}

export default function ProspectionFilterBar({
  className,
  searchValue,
  onSearchChange,
  resultsCount,
  activeFiltersCount,
  currentFilters,
  onChange,
  onReset,
  segmentOptions,
  actions,
}: ProspectionFilterBarProps) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [invitationOpen, setInvitationOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  const searchInputId = useId()
  const statusContentId = useId()
  const dateContentId = useId()
  const invitationContentId = useId()
  const contactContentId = useId()
  const dateRadioName = useId()

  const statusLabels = useMemo(
    () =>
      STATUS_OPTIONS.filter((option) => currentFilters.statuses.includes(option.value)).map(
        (option) => option.label
      ),
    [currentFilters.statuses]
  )
  const invitationLabels = useMemo(
    () =>
      INVITATION_OPTIONS.filter((option) =>
        currentFilters.invitations.includes(option.value)
      ).map((option) => option.label),
    [currentFilters.invitations]
  )
  const contactLabels = useMemo(
    () =>
      CONTACT_OPTIONS.filter((option) => currentFilters.contacts.includes(option.value)).map(
        (option) => option.label
      ),
    [currentFilters.contacts]
  )

  const hasActiveFilters = activeFiltersCount > 0

  return (
    <section
      className={cn(
        "sticky top-[66px] z-30 hidden md:block",
        className
      )}
      aria-label="Barre de filtres desktop prospection"
    >
      <div className="rounded-2xl border border-[#c8d6ea] bg-[#f7fbff]/95 p-3 shadow-[0_14px_32px_-30px_rgba(15,23,42,0.55)] backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor={searchInputId} className="sr-only">
              Rechercher un lead
            </label>
            <div className="relative max-w-[560px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6a7f9f]" />
              <Input
                id={searchInputId}
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Rechercher (nom, entreprise, poste, ville, email, téléphone)…"
                className="h-9 rounded-full border-[#c8d6ea] bg-white pl-9 text-sm text-[#0b1c33] placeholder:text-[#90a4bf]"
              />
            </div>
            <Badge
              variant="outline"
              className="h-8 rounded-full border-[#c8d6ea] bg-white px-3 text-[11px] font-medium text-[#476383]"
            >
              {resultsCount} résultat(s)
            </Badge>
            {hasActiveFilters ? (
              <Badge
                variant="outline"
                className="h-8 rounded-full border-[#9ebef3] bg-[#ecf4ff] px-3 text-[11px] font-medium text-[#1f4f96]"
              >
                {activeFiltersCount} filtre(s) actif(s)
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">{actions}</div>
        </div>

        <Separator className="my-3 bg-[#dbe5f3]" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Segments de prospection"
          >
            {segmentOptions.map((segment) => {
              const active = currentFilters.segment === segment.key
              return (
                <Button
                  key={segment.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onChange({ ...currentFilters, segment: segment.key })}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs transition-colors",
                    active
                      ? "bg-[#1f5eff] text-white hover:bg-[#1a4fd6]"
                      : "text-[#3f587a] hover:bg-[#edf4ff]"
                  )}
                >
                  {segment.label}
                  <span className="tabular-nums opacity-80">{segment.count}</span>
                </Button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Popover modal open={statusOpen} onOpenChange={setStatusOpen}>
              <div className="inline-flex items-center gap-1">
                <PopoverTrigger asChild>
                  <ChipTriggerButton
                    label={getChipLabel("Statut", statusLabels)}
                    active={statusLabels.length > 0}
                    expanded={statusOpen}
                    controlsId={statusContentId}
                  />
                </PopoverTrigger>
                {statusLabels.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Effacer le filtre de statut"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onChange({ ...currentFilters, statuses: [] })
                    }}
                    className="rounded-full border border-[#c8d6ea] bg-white text-[#51627b] hover:bg-[#f3f7ff]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              <PopoverContent
                id={statusContentId}
                align="end"
                className="w-[300px]"
                aria-label="Filtrer par statut"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                  Statut
                </p>
                <div className="space-y-1">
                  {STATUS_OPTIONS.map((option) => (
                    <FilterOptionRow
                      key={option.value}
                      checked={currentFilters.statuses.includes(option.value)}
                      label={option.label}
                      onChange={() =>
                        onChange({
                          ...currentFilters,
                          statuses: toggleSelection(currentFilters.statuses, option.value),
                        })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...currentFilters, statuses: [] })}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Effacer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setStatusOpen(false)}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Appliquer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover modal open={dateOpen} onOpenChange={setDateOpen}>
              <div className="inline-flex items-center gap-1">
                <PopoverTrigger asChild>
                  <ChipTriggerButton
                    label={getChipLabel(
                      "Date",
                      currentFilters.datePreset === "all"
                        ? []
                        : [labelForDatePreset(currentFilters.datePreset)]
                    )}
                    active={currentFilters.datePreset !== "all"}
                    expanded={dateOpen}
                    controlsId={dateContentId}
                  />
                </PopoverTrigger>
                {currentFilters.datePreset !== "all" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Effacer le filtre de date"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onChange({ ...currentFilters, datePreset: "all" })
                    }}
                    className="rounded-full border border-[#c8d6ea] bg-white text-[#51627b] hover:bg-[#f3f7ff]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              <PopoverContent id={dateContentId} align="end" aria-label="Filtrer par date">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                  Date de création
                </p>
                <div className="space-y-1">
                  {DATE_OPTIONS.map((option) => (
                    <FilterOptionRow
                      key={option.value}
                      type="radio"
                      name={dateRadioName}
                      checked={currentFilters.datePreset === option.value}
                      label={option.label}
                      onChange={() =>
                        onChange({
                          ...currentFilters,
                          datePreset: option.value,
                        })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setDateOpen(false)}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Appliquer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover modal open={invitationOpen} onOpenChange={setInvitationOpen}>
              <div className="inline-flex items-center gap-1">
                <PopoverTrigger asChild>
                  <ChipTriggerButton
                    label={getChipLabel("LinkedIn", invitationLabels)}
                    active={invitationLabels.length > 0}
                    expanded={invitationOpen}
                    controlsId={invitationContentId}
                  />
                </PopoverTrigger>
                {invitationLabels.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Effacer le filtre LinkedIn"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onChange({ ...currentFilters, invitations: [] })
                    }}
                    className="rounded-full border border-[#c8d6ea] bg-white text-[#51627b] hover:bg-[#f3f7ff]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              <PopoverContent
                id={invitationContentId}
                align="end"
                aria-label="Filtrer par connexion LinkedIn"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                  Connexion LinkedIn
                </p>
                <div className="space-y-1">
                  {INVITATION_OPTIONS.map((option) => (
                    <FilterOptionRow
                      key={option.value}
                      checked={currentFilters.invitations.includes(option.value)}
                      label={option.label}
                      onChange={() =>
                        onChange({
                          ...currentFilters,
                          invitations: toggleSelection(
                            currentFilters.invitations,
                            option.value
                          ),
                        })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...currentFilters, invitations: [] })}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Effacer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setInvitationOpen(false)}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Appliquer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover modal open={contactOpen} onOpenChange={setContactOpen}>
              <div className="inline-flex items-center gap-1">
                <PopoverTrigger asChild>
                  <ChipTriggerButton
                    label={getChipLabel("Contact", contactLabels)}
                    active={contactLabels.length > 0}
                    expanded={contactOpen}
                    controlsId={contactContentId}
                  />
                </PopoverTrigger>
                {contactLabels.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Effacer le filtre de contact"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onChange({ ...currentFilters, contacts: [] })
                    }}
                    className="rounded-full border border-[#c8d6ea] bg-white text-[#51627b] hover:bg-[#f3f7ff]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
              <PopoverContent id={contactContentId} align="end" aria-label="Filtrer par contact">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                  Contact disponible
                </p>
                <div className="space-y-1">
                  {CONTACT_OPTIONS.map((option) => (
                    <FilterOptionRow
                      key={option.value}
                      checked={currentFilters.contacts.includes(option.value)}
                      label={option.label}
                      onChange={() =>
                        onChange({
                          ...currentFilters,
                          contacts: toggleSelection(currentFilters.contacts, option.value),
                        })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...currentFilters, contacts: [] })}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Effacer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setContactOpen(false)}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Appliquer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full border-[#c8d6ea] bg-[#f9fcff] px-3 text-xs text-[#2f4a6d] hover:bg-[#eef5ff]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Tous les filtres
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filtres avancés</SheetTitle>
                  <SheetDescription>
                    Ajustez vos filtres desktop, puis appliquez.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-5 space-y-6">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                      Statut
                    </p>
                    <div className="space-y-1">
                      {STATUS_OPTIONS.map((option) => (
                        <FilterOptionRow
                          key={`sheet-status-${option.value}`}
                          checked={currentFilters.statuses.includes(option.value)}
                          label={option.label}
                          onChange={() =>
                            onChange({
                              ...currentFilters,
                              statuses: toggleSelection(currentFilters.statuses, option.value),
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                      Connexion LinkedIn
                    </p>
                    <div className="space-y-1">
                      {INVITATION_OPTIONS.map((option) => (
                        <FilterOptionRow
                          key={`sheet-linkedin-${option.value}`}
                          checked={currentFilters.invitations.includes(option.value)}
                          label={option.label}
                          onChange={() =>
                            onChange({
                              ...currentFilters,
                              invitations: toggleSelection(
                                currentFilters.invitations,
                                option.value
                              ),
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                      Contact
                    </p>
                    <div className="space-y-1">
                      {CONTACT_OPTIONS.map((option) => (
                        <FilterOptionRow
                          key={`sheet-contact-${option.value}`}
                          checked={currentFilters.contacts.includes(option.value)}
                          label={option.label}
                          onChange={() =>
                            onChange({
                              ...currentFilters,
                              contacts: toggleSelection(currentFilters.contacts, option.value),
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#58708f]">
                      Date
                    </p>
                    <div className="space-y-1">
                      {DATE_OPTIONS.map((option) => (
                        <FilterOptionRow
                          key={`sheet-date-${option.value}`}
                          type="radio"
                          name={`${dateRadioName}-sheet`}
                          checked={currentFilters.datePreset === option.value}
                          label={option.label}
                          onChange={() =>
                            onChange({
                              ...currentFilters,
                              datePreset: option.value,
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <SheetFooter>
                  {hasActiveFilters ? (
                    <Button type="button" variant="ghost" onClick={onReset}>
                      Reset
                    </Button>
                  ) : null}
                  <SheetClose asChild>
                    <Button type="button">Appliquer</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-9 rounded-full border border-[#d4e2f4] bg-white px-3 text-xs text-[#4a6282] hover:bg-[#f4f8ff]"
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
