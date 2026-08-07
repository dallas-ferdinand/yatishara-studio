"use client";

import { ArrowDown, Search } from "lucide-react";
import { Icon } from "@/desk/components/Icons";
import { Fragment, useState } from "react";
import {
  NETWORK_OPTION_FILTERS,
  NETWORK_PRICE_PRESETS,
  useCreativeNetwork,
} from "./StudioCreativeNetworkContext";
import "./public-offers.css";
import "./studio-creative-network.css";

function FilterSection({
  title,
  activeCount,
  open,
  onToggle,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`public-offers-filter-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="public-offers-filter-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        {activeCount > 0 ? (
          <em className="public-offers-filter-active">{activeCount}</em>
        ) : null}
        <ArrowDown className="public-offers-filter-caret" aria-hidden="true" />
      </button>
      {open ? <div className="public-offers-filter-options">{children}</div> : null}
    </section>
  );
}

function FilterOption({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      className={`public-offers-filter-btn${active ? " is-active" : ""}${count === 0 && !active ? " is-empty" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined ? <em>{count}</em> : null}
    </button>
  );
}

/** Catalog filters for Network browse — lives in the main pane (left rail is Messages). */
export function StudioCreativeNetworkFilters() {
  const cn = useCreativeNetwork();
  const [open, setOpen] = useState(false);
  const offers = (cn.offers ?? []) as Array<{
    category?: string | null;
    deliveryDays: number;
    priceCents: number;
  }>;

  return (
    <div className="studio-cn-main-filters">
      <div className="studio-cn-main-filters-bar">
        <label className="studio-cn-rail-search studio-cn-main-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={cn.search}
            onChange={(event) => cn.setSearch(event.target.value)}
            placeholder="Search services"
            aria-label="Search services"
          />
        </label>
        <button
          type="button"
          className={`studio-cn-filters-toggle${open || cn.hasFilters ? " is-active" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="sliders" size={14} />
          Filters
          {cn.hasFilters ? <em>{cn.activeChips.length}</em> : null}
        </button>
      </div>

      {open ? (
        <div className="studio-cn-main-filters-panel public-offers-rail-body">
          <FilterSection
            title="Price (TTD)"
            activeCount={cn.priceMin || cn.priceMax ? 1 : 0}
            open={!cn.closedSections.price}
            onToggle={() => cn.toggleSection("price")}
          >
            <div className="public-offers-range">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Min"
                value={cn.priceMin}
                onChange={(event) => cn.setPriceMin(event.target.value)}
                aria-label="Minimum price in TTD"
              />
              <span aria-hidden="true">–</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Max"
                value={cn.priceMax}
                onChange={(event) => cn.setPriceMax(event.target.value)}
                aria-label="Maximum price in TTD"
              />
            </div>
            <div className="public-offers-presets">
              {NETWORK_PRICE_PRESETS.map((preset) => {
                const active =
                  cn.priceMin === preset.min && cn.priceMax === preset.max;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`public-offers-preset${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      cn.setPriceMin(active ? "" : preset.min);
                      cn.setPriceMax(active ? "" : preset.max);
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          {NETWORK_OPTION_FILTERS.map((def) => {
            const options = def.getOptions(offers);
            const value = cn.valueFor(def);
            const counts = cn.facets?.get(def.id);
            const limit = def.visibleLimit ?? Infinity;
            const expanded = cn.expandedSections[def.id] ?? false;
            const visible =
              expanded || options.length <= limit
                ? options
                : options.slice(0, limit);
            return (
              <Fragment key={def.id}>
                <FilterSection
                  title={def.label}
                  activeCount={value === def.anyValue ? 0 : 1}
                  open={!cn.closedSections[def.id]}
                  onToggle={() => cn.toggleSection(def.id)}
                >
                  <FilterOption
                    active={value === def.anyValue}
                    onClick={() => cn.setValueFor(def.id, def.anyValue)}
                    label={def.anyLabel}
                    count={counts?.get(def.anyValue)}
                  />
                  {visible.map((option) => (
                    <FilterOption
                      key={option.value}
                      active={value === option.value}
                      onClick={() => cn.setValueFor(def.id, option.value)}
                      label={option.label}
                      count={counts?.get(option.value)}
                    />
                  ))}
                  {options.length > limit ? (
                    <button
                      type="button"
                      className="public-offers-filter-more"
                      onClick={() =>
                        cn.setExpandedSections((prev) => ({
                          ...prev,
                          [def.id]: !expanded,
                        }))
                      }
                    >
                      {expanded
                        ? "Show less"
                        : `Show ${options.length - limit} more`}
                    </button>
                  ) : null}
                </FilterSection>
              </Fragment>
            );
          })}

          {cn.hasFilters ? (
            <button
              type="button"
              className="public-offers-btn is-quiet public-offers-rail-clear"
              onClick={cn.clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
