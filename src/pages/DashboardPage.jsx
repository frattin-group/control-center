import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import {
    BarChart3, TrendingUp, DollarSign, Target, AlertTriangle,
    CheckCircle, Layers, Car, Sailboat, Caravan, Building2,
    ChevronRight, ChevronDown, Activity, Award, XCircle, ArrowUpDown, MapPin, Calendar, X, HelpCircle, PieChart, FileSignature, Check, SlidersHorizontal, Search, Filter, Wallet, Bell
} from 'lucide-react';
import toast from 'react-hot-toast';
import { KpiCard } from '../components/SharedComponents';
import { getTooltipContainerClass } from '../utils/chartTooltipStyles';
import { getDefaultDateFilter, PREDEFINED_DATE_PRESETS } from '../utils/dateFilters';
import {
    ResponsiveContainer,
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    Tooltip as RechartsTooltip,
    BarChart as RechartsBarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    ReferenceLine,
} from 'recharts';
import { getSectorColor } from '../constants/sectorColors';
import { loadFilterPresets, persistFilterPresets } from '../utils/filterPresets';
import { deriveBranchesForLineItem } from '../utils/branchAssignments';
import { DEFAULT_COST_DOMAIN } from '../constants/costDomains';

// ===== UTILITY FUNCTIONS =====
const formatCurrency = (number) => {
    if (typeof number !== 'number' || isNaN(number)) return '€ 0';
    return number.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
};

const formatDate = (value) => {
    if (!value) return 'N/D';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date)) return 'N/D';
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatLabel = (value, fallback = 'N/D') => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return fallback;
        const normalized = trimmed.toLowerCase();
        if (normalized === 'non definito' || normalized === 'non-definito' || normalized === 'undefined') {
            return fallback;
        }
        return trimmed;
    }
    return String(value);
};

const formatDateInput = (year, month, day) => new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];

const getSectorIcon = (sectorName, className = "w-5 h-5") => {
    const icons = {
        'Auto': <Car className={className} />,
        'Camper&Caravan': <Caravan className={className} />,
        'Yachting': <Sailboat className={className} />,
        'Frattin Group': <Building2 className={className} />,
        default: <DollarSign className={className} />
    };
    return icons[sectorName] || icons.default;
};

// ===== UI COMPONENTS =====

const InfoTooltip = ({ message }) => {
    const [open, setOpen] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const containerRef = useRef(null);
    const buttonRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('touchstart', handleClickOutside);
        window.addEventListener('scroll', () => setOpen(false), true); // Close on scroll
        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('touchstart', handleClickOutside);
            window.removeEventListener('scroll', () => setOpen(false), true);
        };
    }, [open]);

    const handleToggle = (event) => {
        event.stopPropagation();

        if (!open && buttonRef.current) {
            // Calculate fixed position based on button position
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipPosition({
                top: rect.bottom + 8, //  8px below button (mt-2)
                left: rect.left + rect.width / 2, // centered on button
            });
        }

        setOpen(prev => !prev);
    };

    return (
        <span ref={containerRef} className="relative inline-flex">
            <button
                ref={buttonRef}
                type="button"
                onClick={handleToggle}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                <HelpCircle className="w-3.5 h-3.5" />
            </button>
            {open && createPortal(
                <div
                    role="tooltip"
                    className="fixed z-[9999] w-max max-w-[260px] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl shadow-slate-900/25"
                    style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }}
                    onClick={event => event.stopPropagation()}
                >
                    {message}
                </div>,
                document.body
            )}
        </span>
    );
};

const TOP_SUPPLIERS_LIMIT = 8;

const SectorCard = React.memo(({ sector, onClick, includeProjections }) => {
    const futureProjections = sector.futureProjections || 0;
    const overdueProjections = sector.overdueProjections || 0;
    const totalProjections = includeProjections ? (futureProjections + overdueProjections) : 0;
    const totalValue = sector.spent + totalProjections;
    const displaySectorName = formatLabel(sector.name);
    const hasBudget = sector.budget > 0;
    const utilization = hasBudget ? (totalValue / sector.budget) * 100 : (totalValue > 0 ? Infinity : 0);
    const isOverBudget = !hasBudget ? totalValue > 0 : utilization > 100;
    const isWarning = hasBudget && utilization > 85 && !isOverBudget;

    const spendPercentage = hasBudget ? (sector.spent / sector.budget) * 100 : 0;
    const projectionPercentage = hasBudget ? (totalProjections / sector.budget) * 100 : 0;

    const statusStyles = isOverBudget
        ? 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200'
        : isWarning
            ? 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200'
            : 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200';

    const remainingBudget = hasBudget ? sector.budget - totalValue : null;

    return (
        <div
            onClick={onClick}
            className="group relative isolate overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-sm transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-2xl"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-slate-900/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute -right-16 -top-24 h-48 w-48 rounded-full bg-indigo-200/20 blur-3xl opacity-0 transition-all duration-500 group-hover:opacity-80 group-hover:-translate-y-4" />

            <div className="relative flex h-full flex-col gap-6 p-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 ring-4 ring-indigo-500/10">
                            {getSectorIcon(sector.name, "w-6 h-6")}
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                                Settore
                            </p>
                            <h3 className="text-lg font-black text-slate-900">
                                {displaySectorName}
                            </h3>
                        </div>
                    </div>
                    <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${statusStyles}`}>
                        {hasBudget || totalValue > 0 ? `${Math.min(utilization, 999).toFixed(0)}%` : 'N/D'}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                            Spesa effettiva
                            <InfoTooltip message="Importo già registrato come spesa per il settore nel periodo considerato." />
                        </div>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(sector.spent)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                            Budget annuo
                            <InfoTooltip message="Budget assegnato al settore per l'anno in corso (o il periodo filtrato)." />
                        </div>
                        <p className="mt-1 text-lg font-black text-slate-900">
                            {hasBudget ? formatCurrency(sector.budget) : 'N/D'}
                        </p>
                    </div>
                    {hasBudget && (
                        <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Residuo stimato
                                <InfoTooltip message="Budget annuo meno (spesa effettiva + proiezioni). Valore negativo indica superamento del budget." />
                            </div>
                            <p className={`mt-1 text-lg font-black ${remainingBudget >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatCurrency(remainingBudget || 0)}
                            </p>
                        </div>
                    )}
                    {includeProjections && totalProjections > 0 && (
                        <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Proiezioni totali
                                <InfoTooltip message={`Somma tra importi scaduti (${formatCurrency(overdueProjections)}) e residuo futuro (${formatCurrency(futureProjections)}) associati ai contratti del settore.`} />
                            </div>
                            <p className="mt-1 text-lg font-black text-slate-900">
                                {formatCurrency(totalProjections)}
                            </p>
                        </div>
                    )}
                </div>

                {includeProjections && totalProjections > 0 && (
                    <div className="flex flex-wrap gap-3">
                        {overdueProjections > 0 && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Scaduto</span>
                                <span className="font-black">{formatCurrency(overdueProjections)}</span>
                            </span>
                        )}
                        {futureProjections > 0 && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                                <TrendingUp className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Residuo Futuro</span>
                                <span className="font-black">{formatCurrency(futureProjections)}</span>
                            </span>
                        )}
                    </div>
                )}

                {hasBudget && (
                    <div className="mt-auto space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            <span>Avanzamento</span>
                            <span>{Math.min(utilization, 999).toFixed(0)}%</span>
                        </div>
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                            <div
                                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isOverBudget
                                    ? 'bg-gradient-to-r from-rose-500 via-rose-500 to-red-600'
                                    : isWarning
                                        ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500'
                                        : 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600'
                                    }`}
                                style={{ width: `${Math.min(spendPercentage + projectionPercentage, 100)}%` }}
                            />
                            <div
                                className="absolute inset-y-0 left-0 rounded-full bg-white/40"
                                style={{ width: `${Math.min(spendPercentage, 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

const SupplierRankItem = React.memo(({ supplier, rank, baselineCommitted, includeProjections }) => {
    const overdue = supplier.overdueProjections || 0;
    const future = supplier.futureProjections || 0;
    const projectionsTotal = overdue + future;
    const committed = supplier.spent + projectionsTotal;
    const displayCommitted = includeProjections ? committed : supplier.spent;
    const denominator = baselineCommitted > 0 ? baselineCommitted : 0;
    const percentage = denominator > 0 ? (displayCommitted / denominator) * 100 : 0;
    const supplierName = formatLabel(supplier.name);

    const progressTotal = includeProjections ? committed : supplier.spent;
    const safeTotal = progressTotal > 0 ? progressTotal : 1;
    const spentWidth = (supplier.spent / safeTotal) * 100;
    const overdueWidth = includeProjections && committed > 0 ? (overdue / committed) * 100 : 0;
    const futureWidth = includeProjections && committed > 0 ? (future / committed) * 100 : 0;

    return (
        <div className="group relative isolate flex h-full flex-col gap-5 rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-slate-900/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute -right-10 -top-16 h-32 w-32 rounded-full bg-indigo-200/20 blur-3xl opacity-0 transition-all duration-500 group-hover:opacity-80 group-hover:-translate-y-2" />

            <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black shadow-lg shadow-indigo-500/20 ring-4 ring-indigo-500/10">
                        {rank + 1}
                    </div>
                    <div className="space-y-1">
                        <p className="text-[11px] font-semibold tracking-[0.28em] text-slate-400">Fornitore</p>
                        <h4 className="max-w-[180px] truncate text-base font-black text-slate-900">{supplierName}</h4>
                    </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                    {percentage.toFixed(1)}%
                    <InfoTooltip message={includeProjections ? `Quota sul totale Top ${TOP_SUPPLIERS_LIMIT} calcolata su spesa effettiva + proiezioni.` : `Quota sul totale Top ${TOP_SUPPLIERS_LIMIT} calcolata sulla sola spesa effettiva.`} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                        Impegno totale
                        <InfoTooltip message="Spesa effettiva più proiezioni attive per il fornitore nel periodo." />
                    </div>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(displayCommitted)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                        Spesa effettiva
                        <InfoTooltip message="Importo già registrato come spesa per questo fornitore." />
                    </div>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(supplier.spent)}</p>
                </div>
            </div>

            {includeProjections && (
                <div className="flex flex-wrap gap-2 text-xs font-semibold tracking-[0.08em]">
                    {overdue > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Scaduto</span>
                            <span className="font-black">{formatCurrency(overdue)}</span>
                        </span>
                    )}
                    {future > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Residuo Futuro</span>
                            <span className="font-black">{formatCurrency(future)}</span>
                        </span>
                    )}
                </div>
            )}

            <div className="mt-auto space-y-2">
                <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                        className="absolute inset-y-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
                        style={{ left: '0%', width: `${Math.min(spentWidth, 100)}%` }}
                    />
                    {includeProjections && (
                        <>
                            <div
                                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-red-500"
                                style={{
                                    left: `${Math.min(spentWidth, 100)}%`,
                                    width: `${Math.max(0, Math.min(overdueWidth, Math.max(0, 100 - Math.min(spentWidth, 100))))}%`
                                }}
                            />
                            <div
                                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-500 to-purple-500"
                                style={{
                                    left: `${Math.min(spentWidth + overdueWidth, 100)}%`,
                                    width: `${Math.max(0, Math.min(futureWidth, Math.max(0, 100 - Math.min(spentWidth + overdueWidth, 100))))}%`
                                }}
                            />
                        </>
                    )}
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.16em] text-slate-400">
                    <span className="text-emerald-500">Spesa</span>
                    {includeProjections ? (
                        <>
                            <span className="text-rose-500">Scaduto</span>
                            <span className="text-indigo-500">Residuo</span>
                        </>
                    ) : (
                        <span className="text-slate-400">Proiezioni escluse</span>
                    )}
                </div>
            </div>
        </div>
    );
});

const BranchItem = React.memo(({ branch, rank, onClick, totalCommitted, includeProjections }) => {
    const overdue = branch.overdueProjections || 0;
    const future = branch.futureProjections || 0;
    const projectionsTotal = overdue + future;
    const committed = branch.spent + projectionsTotal;
    const displayCommitted = includeProjections ? committed : branch.spent;
    const denominator = totalCommitted > 0 ? totalCommitted : 0;
    const percentage = denominator > 0 ? (displayCommitted / denominator) * 100 : 0;
    const branchName = formatLabel(branch.name);

    const progressTotal = includeProjections ? committed : branch.spent;
    const safeTotal = progressTotal > 0 ? progressTotal : 1;
    const spentWidth = (branch.spent / safeTotal) * 100;
    const overdueWidth = includeProjections && committed > 0 ? (overdue / committed) * 100 : 0;
    const futureWidth = includeProjections && committed > 0 ? (future / committed) * 100 : 0;

    return (
        <div
            onClick={onClick}
            className="group relative isolate flex h-full flex-col gap-5 rounded-3xl border border-slate-200/60 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl cursor-pointer"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-slate-900/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute -right-10 -top-16 h-32 w-32 rounded-full bg-blue-200/20 blur-3xl opacity-0 transition-all duration-500 group-hover:opacity-80 group-hover:-translate-y-2" />

            <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-black shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10">
                        {rank + 1}
                    </div>
                    <div className="space-y-1">
                        <p className="text-[11px] font-semibold tracking-[0.28em] text-slate-400">Filiale</p>
                        <h4 className="max-w-[180px] truncate text-base font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                            {branchName}
                        </h4>
                    </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                    {percentage.toFixed(1)}%
                    <InfoTooltip message={includeProjections ? 'Quota sul totale filiali calcolata su spesa + proiezioni.' : 'Quota calcolata sulla sola spesa effettiva.'} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                        Impegno totale
                        <InfoTooltip message="Spesa effettiva più proiezioni attive della filiale." />
                    </div>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(displayCommitted)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                        Spesa effettiva
                        <InfoTooltip message="Importo già registrato come spesa per la filiale." />
                    </div>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(branch.spent)}</p>
                </div>
            </div>

            {includeProjections && (
                <div className="flex flex-wrap gap-2 text-xs font-semibold tracking-[0.08em]">
                    {overdue > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Scaduto</span>
                            <span className="font-black">{formatCurrency(overdue)}</span>
                        </span>
                    )}
                    {future > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Residuo Futuro</span>
                            <span className="font-black">{formatCurrency(future)}</span>
                        </span>
                    )}
                </div>
            )}

            <div className="mt-auto space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <span>Composizione</span>
                    <span>{formatCurrency(displayCommitted)}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                        className="absolute inset-y-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
                        style={{ left: '0%', width: `${Math.min(spentWidth, 100)}%` }}
                    />
                    {includeProjections && (
                        <>
                            <div
                                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-red-500"
                                style={{
                                    left: `${Math.min(spentWidth, 100)}%`,
                                    width: `${Math.max(0, Math.min(overdueWidth, Math.max(0, 100 - Math.min(spentWidth, 100))))}%`
                                }}
                            />
                            <div
                                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-500 to-purple-500"
                                style={{
                                    left: `${Math.min(spentWidth + overdueWidth, 100)}%`,
                                    width: `${Math.max(0, Math.min(futureWidth, Math.max(0, 100 - Math.min(spentWidth + overdueWidth, 100))))}%`
                                }}
                            />
                        </>
                    )}
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.16em] text-slate-400">
                    <span className="text-emerald-500">Spesa</span>
                    {includeProjections ? (
                        <>
                            <span className="text-rose-500">Scaduto</span>
                            <span className="text-indigo-500">Residuo</span>
                        </>
                    ) : (
                        <span className="text-slate-400">Proiezioni escluse</span>
                    )}
                </div>
            </div>

            <div className="absolute right-5 top-5 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:-translate-y-1">
                <ChevronRight className="w-5 h-5 text-indigo-500" />
            </div>
        </div>
    );
});

// ===== MAIN COMPONENT =====
export default function DashboardPage({ navigate, user }) {
    const { getToken } = useAuth();
    const [allExpenses, setAllExpenses] = useState([]);
    const [allContracts, setAllContracts] = useState([]);
    const [sectorBudgets, setSectorBudgets] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [branches, setBranches] = useState([]);
    const [marketingChannels, setMarketingChannels] = useState([]);
    const [channelCategories, setChannelCategories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSector, setSelectedSector] = useState('all');
    const [showProjections, setShowProjections] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState('all');
    const marketingExpenses = useMemo(
        () =>
            allExpenses.filter(
                expense => (expense.costDomain || DEFAULT_COST_DOMAIN) === DEFAULT_COST_DOMAIN
            ),
        [allExpenses]
    );
    const otherPresetsRef = useRef([]);
    const [filterPresets, setFilterPresets] = useState(() => {
        const stored = loadFilterPresets() || [];
        const scoped = [];
        const others = [];
        stored.forEach((preset) => {
            const { scope, showProjections: presetShowProjections = true, ...rest } = preset;
            if (!scope || scope === 'dashboard') {
                scoped.push({
                    ...rest,
                    showProjections: presetShowProjections,
                    searchTerm: rest.searchTerm || '',
                });
            } else {
                others.push(preset);
            }
        });
        otherPresetsRef.current = others;
        return scoped;
    });
    const [presetName, setPresetName] = useState('');
    const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [isUncategorizedModalOpen, setIsUncategorizedModalOpen] = useState(false);
    const [uncategorizedExpensesList, setUncategorizedExpensesList] = useState([]);

    // Initialize with last 12 months instead of current year only
    const [startDate, setStartDate] = useState(() => getDefaultDateFilter().startDate);
    const [endDate, setEndDate] = useState(() => getDefaultDateFilter().endDate);

    const [year, setYear] = useState(() => new Date().getFullYear());

    // ✅ CORREZIONE: defaultStartDate e defaultEndDate corretti
    const defaultStartDate = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 0, 1);
    }, []);

    const defaultEndDate = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 11, 31);
    }, []);

    const hasCustomDateRange = useMemo(
        () => startDate !== defaultStartDate || endDate !== defaultEndDate,
        [startDate, endDate, defaultStartDate, defaultEndDate]
    );

    const [filtersLoaded, setFiltersLoaded] = useState(false);

    const trimmedSearchTerm = searchTerm.trim();
    const hasActiveFilters = useMemo(() => {
        return (
            trimmedSearchTerm !== '' ||
            selectedSector !== 'all' ||
            selectedBranch !== 'all' ||
            hasCustomDateRange ||
            showProjections !== true
        );
    }, [trimmedSearchTerm, hasCustomDateRange, selectedSector, selectedBranch, showProjections]);

    useEffect(() => {
        const endYear = new Date(endDate).getFullYear();
        if (endYear !== year) {
            setYear(endYear);
        }
    }, [endDate, year]);


    useEffect(() => {
        if (!filtersLoaded) {
            setFiltersLoaded(true);
            return;
        }
        const scopedPresets = filterPresets.map(preset => ({
            ...preset,
            scope: 'dashboard'
        }));
        persistFilterPresets([
            ...otherPresetsRef.current,
            ...scopedPresets
        ]);
    }, [filterPresets]);
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const token = await getToken();
                const headers = { Authorization: `Bearer ${token}` };

                const [dataRes, expensesRes] = await Promise.all([
                    axios.get('/api/data/initial-data', { headers }),
                    axios.get('/api/expenses', { headers })
                ]);

                const data = dataRes.data;
                const expensesData = expensesRes.data;

                setSectors(data.sectors);
                setBranches(data.branches);
                setSuppliers(data.suppliers);
                setMarketingChannels(data.marketingChannels);
                setChannelCategories(data.channelCategories);
                setAllContracts(data.contracts);
                setSectorBudgets(data.sectorBudgets);

                // Filter expenses based on user role/channels if needed
                // The backend returns all expenses, frontend filtering for collaborators happens here or in metrics
                // But wait, the previous code had:
                // if (user.role === 'collaborator' && user.assignedChannels && user.assignedChannels.length > 0) ...
                // We should probably filter `expensesData` here if we want to mimic that, 
                // OR rely on the backend to filter (which is better security).
                // For now, I'll filter here to match previous behavior if the backend returns everything.
                // Actually, let's just set all expenses and let the metrics logic handle it?
                // The previous logic filtered the QUERY.

                let filteredExpenses = expensesData;
                let filteredContracts = data.contracts;

                if (user?.role === 'collaborator' && user?.assignedChannels?.length > 0) {
                    // Simple frontend filtering for now
                    filteredExpenses = expensesData.filter(e => user.assignedChannels.includes(e.supplierId));
                    filteredContracts = data.contracts.filter(c => user.assignedChannels.includes(c.supplierId));
                }

                setAllExpenses(filteredExpenses);
                // setAllContracts(filteredContracts); // Actually data.contracts is all contracts, maybe we should filter?
                // The previous code filtered contracts query too.
                setAllContracts(filteredContracts);
                setFiltersLoaded(true);
            } catch (error) {
                console.error("Error fetching initial data:", error);
                toast.error("Errore nel caricamento dei dati");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [getToken, user]); // Re-fetch if user changes (unlikely) or year changes? 
    // Previous code depended on `year`. API returns ALL expenses. 
    // Filtering by year happens in `metrics` (lines 773: if (!expenseDate || expenseDate < filterStartDate ...)).
    // So we don't need to re-fetch on year change.

    const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
    const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);
    const sectorNameToId = useMemo(() => new Map(sectors.map(s => [s.name, s.id])), [sectors]);
    const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);

    const orderedSectors = useMemo(() => {
        const order = ['Auto', 'Camper&Caravan', 'Yachting', 'Frattin Group'];
        return [...sectors].sort((a, b) => {
            const indexA = order.indexOf(a.name);
            const indexB = order.indexOf(b.name);
            if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    }, [sectors]);

    const orderedBranches = useMemo(() => {
        return [...branches].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [branches]);

    const metrics = useMemo(() => {
        try {
            if (isLoading) return {
                spesaSostenuta: 0,
                spesaPrevista: 0,
                spesaPrevistaTotale: 0,
                spesaPrevistaFutura: 0,
                spesaPrevistaScaduta: 0,
                budgetTotale: 0,
                currentSectorBudget: 0,
                monthlyData: [],
                sectorData: [],
                topSuppliers: [],
                allBranches: [],
                isFullYear: true,
                annualBudgetTotal: 0,
                totalSuppliersSpent: 0,
                totalBranchesSpent: 0,
                overdueEntries: [],
                categoryData: [] // Added categoryData
            };

            const dayMs = 24 * 60 * 60 * 1000;

            const normalizeDate = (value) => {
                if (!value) return null;
                const d = new Date(value);
                if (isNaN(d)) return null;
                d.setHours(0, 0, 0, 0);
                return d;
            };

            const filterStartDate = normalizeDate(startDate) || new Date(startDate);
            const filterEndDate = normalizeDate(endDate) || new Date(endDate);
            if (filterEndDate) {
                filterEndDate.setHours(23, 59, 59, 999);
            }
            const today = normalizeDate(new Date()) || new Date();

            const totals = { bySupplier: {}, bySector: {}, byBranch: {}, byCategory: {} }; // Added byCategory
            const monthlyTotals = Array.from({ length: 12 }, () => ({ real: 0, projected: 0 }));

            const supplierProjectionsTotal = {};
            const supplierFutureProjections = {};
            const supplierOverdueProjections = {};

            const sectorProjectionsTotal = {};
            const sectorFutureProjections = {};
            const sectorOverdueProjections = {};

            const branchProjectionsTotal = {};
            const branchFutureProjections = {};
            const branchOverdueProjections = {};

            let spesaSostenuta = 0;
            let spesaPrevistaTotale = 0;
            let spesaPrevistaTotaleInFilter = 0;
            let spesaPrevistaFutura = 0;
            let spesaPrevistaScaduta = 0;

            const genericoBranchId = branches.find(b => b.name.toLowerCase() === 'generico')?.id;

            const branchesPerSector = new Map();
            sectors.forEach(sector => {
                const sectorBranches = branches.filter(b =>
                    b.associatedSectors?.includes(sector.id) &&
                    b.id !== genericoBranchId
                );
                branchesPerSector.set(sector.id, sectorBranches);
            });

            const normalizeSectorId = (value) => {
                if (!value) return null;
                if (sectorMap.has(value)) return value;
                const mapped = sectorNameToId.get(value);
                return mapped || null;
            };

            // Maps for quick lookup for categories
            const channelMap = new Map(marketingChannels.map(c => [c.id, c]));
            const categoryMap = new Map(channelCategories.map(c => [c.id, c.name]));

            // Helper to get category name from channel ID
            const getCategoryName = (channelId) => {
                if (!channelId) return 'Non categorizzato';
                const channel = channelMap.get(channelId);
                if (!channel || !channel.categoryId) return 'Non categorizzato';
                return categoryMap.get(channel.categoryId) || 'Non categorizzato';

            };

            // Processa spese
            marketingExpenses.forEach((expense) => {
                const supplierId = expense.supplierId || expense.supplierld || expense.channelId || expense.channelld;
                const expenseSectorId = normalizeSectorId(expense.sectorId || expense.sectorld);

                const expenseDate = expense.date ? new Date(expense.date) : null;
                if (!expenseDate || expenseDate < filterStartDate || expenseDate > filterEndDate) return;

                (expense.lineItems || []).forEach(item => {
                    const itemAmount = item.amount || 0;
                    const itemSectorId = normalizeSectorId(item.sectorId || expenseSectorId);
                    if (selectedSector !== 'all' && itemSectorId !== selectedSector) return;
                    const sectorName = itemSectorId ? (sectorMap.get(itemSectorId) || 'Sconosciuto') : 'Sconosciuto';
                    const associatedBranches = deriveBranchesForLineItem({
                        expense,
                        item,
                        sectorId: itemSectorId,
                        branchMap,
                        branchesPerSector
                    });
                    const matchesBranchFilter = selectedBranch === 'all' || associatedBranches.includes(selectedBranch);
                    if (!matchesBranchFilter) return;

                    const branchShareFactor = selectedBranch === 'all'
                        ? 1
                        : (associatedBranches.length > 0 ? 1 / associatedBranches.length : 0);
                    if (branchShareFactor === 0) return;

                    const processAmount = (amount, date) => {
                        if (date >= filterStartDate && date <= filterEndDate) {
                            spesaSostenuta += amount;
                            monthlyTotals[date.getMonth()].real += amount;
                            if (supplierId) totals.bySupplier[supplierId] = (totals.bySupplier[supplierId] || 0) + amount;
                            totals.bySector[sectorName] = (totals.bySector[sectorName] || 0) + amount;
                            // Category aggregation
                            const categoryName = getCategoryName(item.marketingChannelId || expense.marketingChannelId);
                            totals.byCategory[categoryName] = (totals.byCategory[categoryName] || 0) + amount;
                        }
                    };

                    const processBranchAmount = (amount, date, branchesList) => {
                        if (date >= filterStartDate && date <= filterEndDate) {
                            let targetBranches = branchesList;
                            if (!Array.isArray(targetBranches) || targetBranches.length === 0) return;
                            if (selectedBranch !== 'all') {
                                targetBranches = targetBranches.filter(id => id === selectedBranch);
                            }
                            if (targetBranches.length === 0) return;
                            const amountPerBranch = amount / targetBranches.length;
                            targetBranches.forEach(branchId => {
                                totals.byBranch[branchId] = (totals.byBranch[branchId] || 0) + amountPerBranch;
                            });
                        }
                    };

                    if (expense.isAmortized && expense.amortizationStartDate && expense.amortizationEndDate) {
                        const startDate = new Date(expense.amortizationStartDate);
                        const endDate = new Date(expense.amortizationEndDate);
                        const durationDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24) + 1);
                        const dailyAmount = itemAmount / durationDays;

                        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                            const currentDate = new Date(d);
                            const adjustedAmount = dailyAmount * branchShareFactor;
                            processAmount(adjustedAmount, currentDate);
                            processBranchAmount(adjustedAmount, currentDate, associatedBranches);
                        }
                    } else {
                        const adjustedAmount = itemAmount * branchShareFactor;
                        processAmount(adjustedAmount, expenseDate);
                        processBranchAmount(adjustedAmount, expenseDate, associatedBranches);
                    }
                });
            });

            const overdueEntries = [];

            // Calcolo quote contrattuali attese e residui per contratto
            const contractLineItemsMeta = new Map();
            allContracts.forEach(contract => {
                const normalizedLineItems = (contract.lineItems || [])
                    .map(lineItem => {
                        const lineItemId = lineItem.id || lineItem.lineItemId || lineItem._key || null;
                        if (!lineItemId) return null;
                        const total = parseFloat(lineItem.totalAmount) || 0;
                        const startDate = normalizeDate(lineItem.startDate);
                        const endDate = normalizeDate(lineItem.endDate);
                        const supplierId = lineItem.supplierId || contract.supplierId || lineItem.supplierld || contract.supplierld || null;
                        const sectorId = normalizeSectorId(lineItem.sectorId || contract.sectorId || lineItem.sectorld || contract.sectorld || null);
                        const branchId = lineItem.branchId || contract.branchId || lineItem.branchld || contract.branchld || null;
                        const marketingChannelId = lineItem.marketingChannelId || contract.marketingChannelId || null; // Added marketingChannelId
                        return {
                            ...lineItem,
                            lineItemId,
                            total,
                            startDate,
                            endDate,
                            supplierId,
                            sectorId,
                            branchId,
                            marketingChannelId, // Added marketingChannelId
                            description: lineItem.description || 'N/D'
                        };
                    })
                    .filter(Boolean)
                    .sort((a, b) => {
                        const startA = a.startDate ? a.startDate.getTime() : 0;
                        const startB = b.startDate ? b.startDate.getTime() : 0;
                        return startA - startB;
                    });
                contractLineItemsMeta.set(contract.id, normalizedLineItems);
            });

            const lineItemSpentTotal = new Map();
            const lineItemSpentInFilter = new Map();
            const lineItemSpentInFilterUpToToday = new Map();
            const lineItemSpentLifetime = new Map();

            const addSpendToMaps = (contractId, lineItemId, amount, referenceDate) => {
                if (!contractId || !lineItemId || !amount) return;
                const key = `${contractId}| ${lineItemId} `;
                lineItemSpentTotal.set(key, (lineItemSpentTotal.get(key) || 0) + amount);

                const date = normalizeDate(referenceDate);
                if (!date) return;

                if (date <= today) {
                    lineItemSpentLifetime.set(key, (lineItemSpentLifetime.get(key) || 0) + amount);
                }

                if (date >= filterStartDate && date <= filterEndDate) {
                    lineItemSpentInFilter.set(key, (lineItemSpentInFilter.get(key) || 0) + amount);
                    if (date <= today) {
                        lineItemSpentInFilterUpToToday.set(key, (lineItemSpentInFilterUpToToday.get(key) || 0) + amount);
                    }
                }
            };

            const allocateAmountToLineItems = (contractId, amount, referenceDate) => {
                if (!contractId || !amount) return;
                const lineItems = contractLineItemsMeta.get(contractId);
                if (!lineItems || lineItems.length === 0) return;

                const date = normalizeDate(referenceDate);
                let targets = lineItems;
                if (date) {
                    // Robust date comparison using YYYY-MM-DD strings
                    const dateStr = date.toISOString().slice(0, 10);
                    const active = lineItems.filter(li => {
                        if (!li.startDate || !li.endDate) return false;
                        const startStr = li.startDate.toISOString().slice(0, 10);
                        const endStr = li.endDate.toISOString().slice(0, 10);
                        return dateStr >= startStr && dateStr <= endStr;
                    });
                    if (active.length > 0) targets = active;
                }

                const totalActive = targets.reduce((sum, li) => sum + (li.total || 0), 0);
                targets.forEach(li => {
                    const proportion = totalActive > 0 ? (li.total || 0) / totalActive : 1 / targets.length;
                    const share = amount * proportion;
                    addSpendToMaps(contractId, li.lineItemId, share, referenceDate);
                });
            };

            marketingExpenses.forEach(expense => {
                const lineItems = expense.lineItems || [];
                if (lineItems.length > 0) {
                    lineItems.forEach(item => {
                        if (!item.contractId) return;
                        const amount = parseFloat(item.amount) || 0;
                        if (amount === 0) return;
                        const itemSectorId = normalizeSectorId(item.sectorId || expense.sectorId || expense.sectorld);
                        const associatedBranches = deriveBranchesForLineItem({
                            expense,
                            item,
                            sectorId: itemSectorId,
                            branchMap,
                            branchesPerSector
                        });
                        const branchShareFactor = selectedBranch === 'all'
                            ? 1
                            : (associatedBranches.length > 0 ? 1 / associatedBranches.length : 0);
                        if (branchShareFactor === 0) return;
                        const adjustedAmount = amount * branchShareFactor;

                        // Try to find target line item
                        let targetLineItemId = item.relatedLineItemId;

                        // SMART LINKING FALLBACK
                        if (!targetLineItemId && item.contractId && item.description) {
                            const contractItems = contractLineItemsMeta.get(item.contractId);
                            if (contractItems) {
                                const cleanDesc = item.description.trim().toLowerCase();
                                const matched = contractItems.find(li => {
                                    const liDesc = (li.description || '').trim().toLowerCase();
                                    return liDesc && (liDesc.includes(cleanDesc) || cleanDesc.includes(liDesc));
                                });
                                if (matched) {
                                    targetLineItemId = matched.lineItemId;
                                }
                            }
                        }

                        if (targetLineItemId) {
                            addSpendToMaps(item.contractId, targetLineItemId, adjustedAmount, expense.date);
                        } else {
                            allocateAmountToLineItems(item.contractId, adjustedAmount, expense.date);
                        }
                    });
                }
                if (expense.relatedContractId && lineItems.length === 0) {
                    const amount = parseFloat(expense.amount) || 0;
                    if (amount !== 0) {
                        const branchId = expense.branchId || expense.branchld || null;
                        let branchShareFactor = 1;
                        if (selectedBranch !== 'all') {
                            if (branchId && branchMap.has(branchId)) {
                                branchShareFactor = branchId === selectedBranch ? 1 : 0;
                            } else if (expense.sectorId || expense.sectorld) {
                                const sectorBranches = branchesPerSector.get(normalizeSectorId(expense.sectorId || expense.sectorld)) || [];
                                branchShareFactor = sectorBranches.length > 0 && sectorBranches.some(b => b.id === selectedBranch)
                                    ? 1 / sectorBranches.length
                                    : 0;
                            } else {
                                branchShareFactor = 0;
                            }
                        }
                        if (branchShareFactor > 0) {
                            allocateAmountToLineItems(expense.relatedContractId, amount * branchShareFactor, expense.date);
                        }
                    }
                }
            });

            if (showProjections) {
                allContracts.forEach(contract => {
                    const lineItems = contractLineItemsMeta.get(contract.id) || [];
                    // console.log(`DEBUG: Contract ${contract.id} has ${lineItems.length} line items`);
                    lineItems.forEach(lineItem => {
                        const { lineItemId, total, startDate, endDate, supplierId, sectorId, branchId, description, marketingChannelId } = lineItem; // Destructure marketingChannelId
                        if (!supplierId || total <= 0 || !startDate || !endDate || startDate > endDate) return;
                        if (selectedSector !== 'all' && sectorId !== selectedSector) return;

                        const contractBranches = (() => {
                            const ids = new Set();
                            if (branchId && branchMap.has(branchId)) {
                                ids.add(branchId);
                            }
                            if (!branchId && sectorId) {
                                const sectorBranches = branchesPerSector.get(sectorId) || [];
                                sectorBranches.forEach(branch => ids.add(branch.id));
                            }
                            if (!ids.size) {
                                const contractLevelBranch = contract.branchId || contract.branchld;
                                if (contractLevelBranch && branchMap.has(contractLevelBranch)) {
                                    ids.add(contractLevelBranch);
                                }
                            }
                            return Array.from(ids);
                        })();

                        if (selectedBranch !== 'all' && !contractBranches.includes(selectedBranch)) {
                            return;
                        }

                        const branchShareFactor = selectedBranch === 'all'
                            ? 1
                            : (contractBranches.length > 0 ? 1 / contractBranches.length : 0);
                        if (branchShareFactor === 0) return;

                        const overlapStart = new Date(Math.max(startDate.getTime(), filterStartDate.getTime()));
                        overlapStart.setHours(0, 0, 0, 0);
                        const overlapEnd = new Date(Math.min(endDate.getTime(), filterEndDate.getTime()));
                        overlapEnd.setHours(0, 0, 0, 0);
                        if (overlapStart > overlapEnd) return;

                        const fullDurationDays = Math.max(1, Math.round((endDate - startDate) / dayMs) + 1);
                        const dailyCost = total / fullDurationDays;

                        const daysOverlap = Math.max(1, Math.round((overlapEnd - overlapStart) / dayMs) + 1);
                        const todayClamped = new Date(Math.min(today.getTime(), overlapEnd.getTime()));
                        let daysElapsed = 0;
                        if (todayClamped >= overlapStart) {
                            daysElapsed = Math.min(daysOverlap, Math.round((todayClamped - overlapStart) / dayMs) + 1);
                        }
                        const daysFuture = Math.max(0, daysOverlap - daysElapsed);

                        const expectedTotalInFilter = dailyCost * daysOverlap;
                        const expectedOverdue = dailyCost * daysElapsed;
                        const expectedFuture = expectedTotalInFilter - expectedOverdue;

                        const key = `${contract.id}| ${lineItemId} `;
                        const spentTotal = lineItemSpentTotal.get(key) || 0;
                        const spentInFilter = lineItemSpentInFilter.get(key) || 0;
                        const spentInFilterUpToToday = lineItemSpentInFilterUpToToday.get(key) || 0;
                        const spentLifetime = lineItemSpentLifetime.get(key) || 0;

                        const spentFutureInFilter = Math.max(0, spentInFilter - spentInFilterUpToToday);

                        const lineRemaining = Math.max(0, total - spentTotal);
                        if (lineRemaining <= 0) return;

                        // Calculate Lifetime Overdue (Start -> Today) for KPI
                        const overdueEnd = new Date(Math.min(endDate.getTime(), today.getTime()));
                        const daysOverdueLifetime = startDate > overdueEnd ? 0 : Math.max(0, Math.round((overdueEnd - startDate) / dayMs) + 1);
                        const expectedOverdueLifetime = dailyCost * daysOverdueLifetime;

                        // Calculate In-Filter Overdue (OverlapStart -> Today) for Chart
                        const overdueEndInFilter = new Date(Math.min(overlapEnd.getTime(), today.getTime()));
                        const daysOverdueInFilter = overlapStart > overdueEndInFilter ? 0 : Math.max(0, Math.round((overdueEndInFilter - overlapStart) / dayMs) + 1);
                        const expectedOverdueInFilter = dailyCost * daysOverdueInFilter;

                        // Calculate Future in Filter (Tomorrow/FilterStart -> FilterEnd)
                        const tomorrow = new Date(today);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(0, 0, 0, 0);

                        const futureStart = new Date(Math.max(overlapStart.getTime(), tomorrow.getTime()));
                        const futureEnd = overlapEnd;

                        const daysFutureInFilter = futureStart > futureEnd ? 0 : Math.max(0, Math.round((futureEnd - futureStart) / dayMs) + 1);
                        const expectedFutureInFilter = dailyCost * daysFutureInFilter;

                        // Shortfalls for KPI (using Lifetime Overdue)
                        const overdueShortfallLifetime = Math.max(0, expectedOverdueLifetime - spentLifetime);

                        // Shortfalls for Chart (using In-Filter values)
                        const overdueShortfallInFilter = Math.max(0, expectedOverdueInFilter - spentInFilterUpToToday);
                        const futureShortfallInFilter = Math.max(0, expectedFutureInFilter - spentFutureInFilter);

                        // Use Lifetime for KPI calculations
                        const overdueAmount = Math.min(lineRemaining, overdueShortfallLifetime);
                        const futureAmount = Math.min(Math.max(0, lineRemaining - overdueAmount), futureShortfallInFilter);

                        if (overdueAmount <= 0 && futureAmount <= 0) return;

                        const adjustedOverdueAmount = overdueAmount * branchShareFactor;
                        const adjustedFutureAmount = futureAmount * branchShareFactor;
                        const adjustedTotalAmount = adjustedOverdueAmount + adjustedFutureAmount;

                        // For Chart distribution, use In-Filter shortfalls
                        const overdueAmountInFilter = Math.min(lineRemaining, overdueShortfallInFilter);
                        const futureAmountInFilter = Math.min(Math.max(0, lineRemaining - overdueAmountInFilter), futureShortfallInFilter);
                        const adjustedOverdueAmountInFilter = overdueAmountInFilter * branchShareFactor;
                        const adjustedFutureAmountInFilter = futureAmountInFilter * branchShareFactor;

                        if (adjustedTotalAmount > 0) {
                            // Projection calculated
                        }

                        const adjustedTotalAmountInFilter = adjustedOverdueAmountInFilter + adjustedFutureAmountInFilter;

                        spesaPrevistaTotale += adjustedTotalAmount;
                        spesaPrevistaTotaleInFilter += adjustedTotalAmountInFilter;
                        spesaPrevistaScaduta += adjustedOverdueAmount;
                        spesaPrevistaFutura += adjustedFutureAmount;

                        const addToBranchTotals = (amount, targetMap) => {
                            if (!amount || amount <= 0) return;
                            let targetBranches = contractBranches;
                            if (!Array.isArray(targetBranches) || targetBranches.length === 0) return;
                            if (selectedBranch !== 'all') {
                                targetBranches = targetBranches.filter(id => id === selectedBranch);
                            }
                            if (targetBranches.length === 0) return;
                            const share = amount / targetBranches.length;
                            targetBranches.forEach(id => {
                                targetMap[id] = (targetMap[id] || 0) + share;
                            });
                        };

                        supplierProjectionsTotal[supplierId] = (supplierProjectionsTotal[supplierId] || 0) + adjustedTotalAmount;
                        if (adjustedOverdueAmount > 0) {
                            supplierOverdueProjections[supplierId] = (supplierOverdueProjections[supplierId] || 0) + adjustedOverdueAmount;
                        }
                        if (adjustedFutureAmount > 0) {
                            supplierFutureProjections[supplierId] = (supplierFutureProjections[supplierId] || 0) + adjustedFutureAmount;
                        }

                        if (sectorId) {
                            sectorProjectionsTotal[sectorId] = (sectorProjectionsTotal[sectorId] || 0) + adjustedTotalAmount;
                            if (adjustedOverdueAmount > 0) {
                                sectorOverdueProjections[sectorId] = (sectorOverdueProjections[sectorId] || 0) + adjustedOverdueAmount;
                            }
                            if (adjustedFutureAmount > 0) {
                                sectorFutureProjections[sectorId] = (sectorFutureProjections[sectorId] || 0) + adjustedFutureAmount;
                            }
                        }

                        addToBranchTotals(adjustedTotalAmount, branchProjectionsTotal);
                        addToBranchTotals(adjustedOverdueAmount, branchOverdueProjections);
                        addToBranchTotals(adjustedFutureAmount, branchFutureProjections);

                        const distributeToMonths = (amount, baseDate, daysCount) => {
                            if (!amount || amount <= 0 || daysCount <= 0) return;
                            const dailyShare = amount / daysCount;
                            for (let i = 0; i < daysCount; i++) {
                                const current = new Date(baseDate);
                                current.setDate(current.getDate() + i);
                                if (current < overlapStart || current > overlapEnd) continue;
                                if (current.getMonth() >= 0 && current.getMonth() < 12) {
                                    monthlyTotals[current.getMonth()].projected += dailyShare;
                                }
                            }
                        };

                        if (adjustedOverdueAmountInFilter > 0 && daysOverdueInFilter > 0) {
                            distributeToMonths(adjustedOverdueAmountInFilter, overlapStart, daysOverdueInFilter);
                        }
                        if (adjustedFutureAmountInFilter > 0 && daysFutureInFilter > 0) {
                            distributeToMonths(adjustedFutureAmountInFilter, futureStart, daysFutureInFilter);
                        }

                        if (adjustedOverdueAmount > 0) {
                            overdueEntries.push({
                                contractId: contract.id,
                                contractDescription: contract.description || 'N/D',
                                supplierId,
                                supplierName: supplierMap.get(supplierId) || 'N/D',
                                lineItemDescription: description,
                                sectorName: sectorId ? (sectorMap.get(sectorId) || 'N/D') : 'N/D',
                                branchName: branchId ? (branchMap.get(branchId) || 'N/D') : (sectorId ? 'Generico' : 'N/D'),
                                startDate: overlapStart.toISOString(),
                                endDate: overlapEnd.toISOString(),
                                lineTotal: expectedTotalInFilter * branchShareFactor,
                                lineSpent: spentInFilterUpToToday * branchShareFactor,
                                overdueAmount: adjustedOverdueAmount,
                                futureAmount: adjustedFutureAmount,
                                remainingAmount: Math.max(0, (lineRemaining - overdueAmount - futureAmount) * branchShareFactor)
                            });
                        }
                    });
                });
            }
            const annualBudgetTotal = sectorBudgets.reduce((sum, sb) => sum + (sb.amount || 0), 0);
            let currentSectorBudget = annualBudgetTotal;
            if (selectedSector !== 'all') {
                const sectorBudgetInfo = sectorBudgets.find(sb => sb.sectorId === selectedSector);
                currentSectorBudget = sectorBudgetInfo?.amount || 0;
            }

            let budgetTotale = 0;
            const numberOfDays = (filterEndDate - filterStartDate) / (1000 * 60 * 60 * 24) + 1;
            const isFullYear = numberOfDays > 360;

            if (selectedSector === 'all') {
                budgetTotale = isFullYear ? annualBudgetTotal : (annualBudgetTotal / 365) * numberOfDays;
            } else {
                const sectorBudgetInfo = sectorBudgets.find(sb => sb.sectorId === selectedSector);
                const annualSectorBudget = sectorBudgetInfo?.amount || 0;
                budgetTotale = isFullYear ? annualSectorBudget : (annualSectorBudget / 365) * numberOfDays;
            }

            const monthlyData = monthlyTotals.map((data, i) => ({
                mese: new Date(new Date().getFullYear(), i).toLocaleString('it-IT', { month: 'short' }),
                real: data.real,
                projected: data.projected,
            }));

            const sectorData = orderedSectors.map(sector => {
                const budgetInfo = sectorBudgets.find(sb => sb.sectorId === sector.id);
                const spent = totals.bySector[sector.name] || 0;
                const projections = sectorProjectionsTotal[sector.id] || 0;
                const future = sectorFutureProjections[sector.id] || 0;
                const overdue = sectorOverdueProjections[sector.id] || 0;
                let budget = budgetInfo?.amount || 0;
                if (!isFullYear) {
                    budget = (budget / 365) * numberOfDays;
                }
                return { id: sector.id, name: sector.name, spent, budget, projections, futureProjections: future, overdueProjections: overdue };
            }).filter(s => s.budget > 0 || s.spent > 0 || s.projections > 0);

            const supplierIds = new Set([
                ...Object.keys(totals.bySupplier),
                ...Object.keys(supplierProjectionsTotal)
            ]);

            const suppliersWithTotals = Array.from(supplierIds).map(supplierId => ({
                id: supplierId,
                name: supplierMap.get(supplierId) || 'N/D',
                spent: totals.bySupplier[supplierId] || 0,
                projections: supplierProjectionsTotal[supplierId] || 0,
                futureProjections: supplierFutureProjections[supplierId] || 0,
                overdueProjections: supplierOverdueProjections[supplierId] || 0
            }));

            const sortedSuppliers = suppliersWithTotals
                .filter(s => s.name !== 'N/D' && (s.spent > 0 || s.projections > 0))
                .sort((a, b) => (b.spent + b.projections) - (a.spent + a.projections));

            const allSuppliersTotal = sortedSuppliers.reduce((sum, supplier) => sum + supplier.spent + supplier.projections, 0);
            const topSuppliers = sortedSuppliers.slice(0, TOP_SUPPLIERS_LIMIT);
            const topSuppliersTotal = topSuppliers.reduce((sum, supplier) => sum + supplier.spent + supplier.projections, 0);
            const topSuppliersSpentOnly = topSuppliers.reduce((sum, supplier) => sum + supplier.spent, 0);

            const allBranches = Object.entries(totals.byBranch)
                .map(([branchId, spent]) => ({
                    id: branchId,
                    name: branchMap.get(branchId) || 'N/D',
                    spent,
                    projections: branchProjectionsTotal[branchId] || 0,
                    futureProjections: branchFutureProjections[branchId] || 0,
                    overdueProjections: branchOverdueProjections[branchId] || 0
                }))
                .filter(b => b.name !== 'N/D')
                .sort((a, b) => (b.spent + (b.projections || 0)) - (a.spent + (a.projections || 0)));
            const totalBranchesSpent = allBranches.reduce((sum, b) => sum + b.spent + (b.projections || 0), 0);

            const categoryData = Object.entries(totals.byCategory).map(([name, spent]) => ({
                name,
                spent
            })).sort((a, b) => b.spent - a.spent);

            return {
                spesaSostenuta,
                spesaPrevista: spesaPrevistaTotale,
                spesaPrevistaTotale,
                spesaPrevistaTotaleInFilter,
                spesaPrevistaFutura,
                spesaPrevistaScaduta,
                budgetTotale,
                monthlyData,
                sectorData,
                topSuppliers,
                allBranches,
                isFullYear,
                annualBudgetTotal,
                currentSectorBudget,
                totalSuppliersSpent: topSuppliersTotal,
                topSuppliersSpentOnly,
                suppliersGlobalCommitment: allSuppliersTotal,
                totalBranchesSpent,
                overdueEntries,
                categoryData // Added categoryData
            };
        } catch (error) {
            console.error("CRITICAL ERROR in DashboardPage metrics calculation:", error);
            return {
                spesaSostenuta: 0,
                spesaPrevista: 0,
                spesaPrevistaTotale: 0,
                spesaPrevistaTotaleInFilter: 0,
                spesaPrevistaFutura: 0,
                spesaPrevistaScaduta: 0,
                budgetTotale: 0,
                currentSectorBudget: 0,
                monthlyData: [],
                sectorData: [],
                topSuppliers: [],
                allBranches: [],
                isFullYear: true,
                annualBudgetTotal: 0,
                totalSuppliersSpent: 0,
                totalBranchesSpent: 0,
                overdueEntries: [],
                categoryData: []
            };
        }
    }, [isLoading, marketingExpenses, allContracts, sectorBudgets, startDate, endDate, selectedSector, selectedBranch, sectors, branches, showProjections, supplierMap, sectorMap, sectorNameToId, branchMap, orderedSectors, marketingChannels, channelCategories]);

    const overdueList = useMemo(() => {
        return (metrics.overdueEntries || []).slice().sort((a, b) => (b.overdueAmount || 0) - (a.overdueAmount || 0));
    }, [metrics.overdueEntries]);

    const overdueSummary = useMemo(() => {
        if (!overdueList.length) {
            return { supplierCount: 0, futureTotal: 0, spentTotal: 0, preview: [] };
        }

        const supplierIds = new Set();
        let futureTotal = 0;
        let spentTotal = 0;

        overdueList.forEach(entry => {
            if (entry.supplierId) {
                supplierIds.add(entry.supplierId);
            }
            futureTotal += entry.futureAmount || 0;
            spentTotal += entry.lineSpent || 0;
        });

        return {
            supplierCount: supplierIds.size,
            futureTotal,
            spentTotal,
            preview: overdueList.slice(0, 3)
        };
    }, [overdueList]);

    const totalForecast = metrics.spesaSostenuta + (showProjections ? metrics.spesaPrevistaTotaleInFilter : 0);
    const remainingBudget = metrics.budgetTotale - totalForecast;
    const isOverBudgetRisk = totalForecast > metrics.budgetTotale;
    const topSuppliersProjections = Math.max(0, (metrics.totalSuppliersSpent || 0) - (metrics.topSuppliersSpentOnly || 0));
    const branchesSpentOnly = useMemo(
        () => metrics.allBranches.reduce((sum, branch) => sum + (branch.spent || 0), 0),
        [metrics.allBranches]
    );
    const branchesProjectionsTotal = useMemo(
        () => metrics.allBranches.reduce((sum, branch) => sum + (branch.projections || 0), 0),
        [metrics.allBranches]
    );
    const branchesBaselineCommitted = showProjections ? metrics.totalBranchesSpent : branchesSpentOnly;

    const priorityInsights = useMemo(() => {
        const items = [];
        if (isOverBudgetRisk) {
            items.push({
                id: 'budget-risk',
                label: 'Budget',
                title: 'Rischio di sforamento',
                description: 'Allinea budget e contratti attivi.',
                value: formatCurrency(Math.abs(remainingBudget)),
                tone: 'rose',
                actionLabel: 'Apri Budget',
                onClick: () => navigate && navigate('budget'),
                icon: AlertTriangle,
            });
        }
        if (overdueList.length > 0) {
            items.push({
                id: 'overdue',
                label: 'Contratti',
                title: 'Impegni scaduti',
                description: `${overdueSummary.supplierCount} fornitori coinvolti`,
                value: formatCurrency(metrics.spesaPrevistaScaduta || 0),
                tone: 'amber',
                actionLabel: 'Apri contratti',
                onClick: () => navigate && navigate('contracts'),
                icon: FileSignature,
            });
        }
        if (topSuppliersProjections > 0) {
            items.push({
                id: 'supplier-projections',
                label: 'Fornitori',
                title: 'Quote da confermare',
                description: 'Proiezioni ancora da convertire in spesa.',
                value: formatCurrency(topSuppliersProjections),
                tone: 'indigo',
                actionLabel: 'Gestisci fornitori',
                onClick: () => navigate && navigate('contracts'),
                icon: Wallet,
            });
        }
        return items.slice(0, 3);
    }, [isOverBudgetRisk, remainingBudget, overdueList.length, overdueSummary.supplierCount, metrics.spesaPrevistaScaduta, topSuppliersProjections, navigate]);
    const hasPriorityInsights = priorityInsights.length > 0;
    const notificationCount = priorityInsights.length;

    const monthlyTrendStats = useMemo(() => {
        const chartData = metrics.monthlyData.map((month = {}, index) => {
            const real = Number(month.real) || 0;
            const projected = showProjections ? Number(month.projected) || 0 : 0;
            return {
                ...month,
                mese: month.mese || month.month || `M${index + 1} `,
                real,
                projected,
                total: real + projected,
            };
        });

        const monthlyAvgBudget = metrics.currentSectorBudget / 12;
        const totalForecastYear = chartData.reduce((sum, item) => sum + item.total, 0);
        const maxEntry = chartData.reduce(
            (prev, curr) => (curr.total > prev.total ? curr : prev),
            chartData[0] || { total: 0, mese: 'N/D' }
        );

        const currentCalendar = new Date();
        const sameYear = new Date(endDate).getFullYear() === currentCalendar.getFullYear();
        const currentMonthIndex = sameYear ? currentCalendar.getMonth() : null;
        const currentMonthData =
            currentMonthIndex !== null ? chartData[currentMonthIndex] : null;

        const summaryCards = [
            { label: 'Totale anno', value: formatCurrency(totalForecastYear) },
            { label: 'Budget medio', value: formatCurrency(monthlyAvgBudget) },
            {
                label: `Picco · ${maxEntry?.mese || 'N/D'} `,
                value: formatCurrency(maxEntry?.total || 0),
            },
            {
                label: currentMonthData
                    ? `Mese corrente · ${currentMonthData.mese} `
                    : 'Mese corrente',
                value: currentMonthData ? formatCurrency(currentMonthData.total) : '—',
            },
        ];

        const hasData = chartData.some(item => item.total > 0);

        return {
            chartData,
            monthlyAvgBudget,
            summaryCards,
            hasData,
        };
    }, [metrics.monthlyData, metrics.currentSectorBudget, showProjections, endDate]);

    const renderMonthlyBudgetLabel = useCallback(({ viewBox }) => {
        if (!viewBox) return null;
        const { x = 0, width = 0, y = 0 } = viewBox;
        const chipWidth = 120;
        const chipHeight = 24;
        const cornerRadius = 14;
        const labelX = x + width - chipWidth - 16;
        const labelY = y - chipHeight - 10;

        return (
            <g pointerEvents="none">
                <defs>
                    <linearGradient id="budget-label-bg" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#FDF2F8" stopOpacity="0.92" />
                    </linearGradient>
                </defs>
                <rect
                    x={labelX}
                    y={labelY}
                    width={chipWidth}
                    height={chipHeight}
                    rx={cornerRadius}
                    fill="url(#budget-label-bg)"
                    stroke="rgba(244,63,94,0.4)"
                    strokeWidth={1}
                />
                <text
                    x={labelX + chipWidth / 2}
                    y={labelY + chipHeight / 2 + 4}
                    textAnchor="middle"
                    fill="#F43F5E"
                    fontSize={11}
                    fontWeight={700}
                >
                    Budget medio
                </text>
            </g>
        );
    }, []);

    const categoryDistribution = useMemo(() => {
        // Filter out 'affitto' and 'sconosciuto'
        const usableCategories = (metrics.categoryData || [])
            .filter(cat => {
                const lowerName = (cat.name || '').toLowerCase();
                return lowerName !== 'sconosciuto' && lowerName !== 'affitto' && (cat.spent || 0) > 0;
            })
            .map(cat => ({ name: cat.name, amount: cat.spent }));

        const total = usableCategories.reduce((sum, cat) => sum + cat.amount, 0);
        if (total <= 0) {
            return { total: 0, segments: [] };
        }

        // Sort by amount descending
        usableCategories.sort((a, b) => b.amount - a.amount);

        let segments = [];
        if (usableCategories.length > 6) {
            const top5 = usableCategories.slice(0, 5);
            const others = usableCategories.slice(5);
            const othersAmount = others.reduce((sum, cat) => sum + cat.amount, 0);

            segments = top5.map((cat, idx) => ({
                id: idx,
                name: cat.name,
                amount: cat.amount,
                percent: cat.amount / total,
                color: getSectorColor(cat.name, idx)
            }));

            segments.push({
                id: 5,
                name: 'Altre Categorie',
                amount: othersAmount,
                percent: othersAmount / total,
                color: '#94a3b8', // Slate-400 for "Others"
                isOthers: true,
                othersBreakdown: others.map(cat => ({
                    name: cat.name,
                    value: cat.amount
                }))
            });
        } else {
            segments = usableCategories.map((cat, idx) => ({
                id: idx,
                name: cat.name,
                amount: cat.amount,
                percent: cat.amount / total,
                color: getSectorColor(cat.name, idx)
            }));
        }

        return { total, segments };
    }, [metrics.categoryData]);
    const handlePieClick = useCallback((data, index) => {
        if (data && (data.name === 'Non categorizzato' || data.name === 'Altro')) {

            const normalizeDate = (value) => {
                if (!value) return null;
                const d = new Date(value);
                if (isNaN(d)) return null;
                d.setHours(0, 0, 0, 0);
                return d;
            };

            const normalizeSectorId = (value) => {
                if (!value) return null;
                if (sectorMap.has(value)) return value;
                const mapped = sectorNameToId.get(value);
                return mapped || null;
            };

            const filterStartDate = normalizeDate(startDate);
            const filterEndDate = normalizeDate(endDate);

            // Maps for quick lookup
            const channelMap = new Map(marketingChannels.map(c => [c.id, c]));
            const categoryMap = new Map(channelCategories.map(c => [c.id, c.name]));
            const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));

            // Prepare helpers for branch derivation
            const genericoBranchId = branches.find(b => b.name.toLowerCase() === 'generico')?.id;
            const branchesPerSector = new Map();
            sectors.forEach(sector => {
                const sectorBranches = branches.filter(b =>
                    b.associatedSectors?.includes(sector.id) &&
                    b.id !== genericoBranchId
                );
                branchesPerSector.set(sector.id, sectorBranches);
            });

            const getCategoryName = (channelId) => {
                if (!channelId) return 'Non categorizzato';
                const channel = channelMap.get(channelId);
                if (!channel || !channel.categoryId) return 'Non categorizzato';
                return categoryMap.get(channel.categoryId) || 'Non categorizzato';
            };

            const relevantExpenses = [];

            marketingExpenses.forEach((expense) => {
                const expenseDate = expense.date ? new Date(expense.date) : null;
                // Initial date check is removed here because amortized expenses might be outside but overlap

                const expenseSectorId = normalizeSectorId(expense.sectorId || expense.sectorld);

                (expense.lineItems || []).forEach(item => {
                    const itemAmount = parseFloat(item.amount) || 0;
                    const itemSectorId = normalizeSectorId(item.sectorId || expenseSectorId);

                    // Correctly call deriveBranchesForLineItem with object argument
                    const associatedBranches = deriveBranchesForLineItem({
                        expense,
                        item,
                        sectorId: itemSectorId,
                        branchMap,
                        branchesPerSector
                    });

                    const matchesBranchFilter = selectedBranch === 'all' || associatedBranches.includes(selectedBranch);
                    if (!matchesBranchFilter) return;

                    const branchShareFactor = selectedBranch === 'all'
                        ? 1
                        : (associatedBranches.length > 0 ? 1 / associatedBranches.length : 0);

                    if (branchShareFactor === 0) return;

                    let contributedAmount = 0;

                    if (expense.isAmortized && expense.amortizationStartDate && expense.amortizationEndDate) {
                        const amortStart = new Date(expense.amortizationStartDate);
                        const amortEnd = new Date(expense.amortizationEndDate);
                        const durationDays = Math.max(1, (amortEnd - amortStart) / (1000 * 60 * 60 * 24) + 1);
                        const dailyAmount = itemAmount / durationDays;

                        // Calculate overlap
                        const overlapStart = new Date(Math.max(amortStart, filterStartDate));
                        const overlapEnd = new Date(Math.min(amortEnd, filterEndDate));

                        if (overlapStart <= overlapEnd) {
                            const overlapDays = Math.max(0, (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24) + 1);
                            contributedAmount = dailyAmount * overlapDays * branchShareFactor;
                        }
                    } else {
                        if (expenseDate && expenseDate >= filterStartDate && expenseDate <= filterEndDate) {
                            contributedAmount = itemAmount * branchShareFactor;
                        }
                    }

                    if (contributedAmount > 0) {
                        let isSectorMatch = true;
                        if (selectedSector !== 'all') {
                            isSectorMatch = itemSectorId === selectedSector;
                        }

                        if (isSectorMatch) {
                            const categoryName = getCategoryName(item.marketingChannelId || expense.marketingChannelId);
                            if (categoryName === data.name) {
                                relevantExpenses.push({
                                    ...item,
                                    date: expense.date,
                                    supplierName: supplierMap.get(expense.supplierId) || 'Sconosciuto',
                                    expenseDescription: expense.description,
                                    amount: contributedAmount, // Show the amount contributed to this period/filter
                                    originalAmount: itemAmount
                                });
                            }
                        }
                    }
                });
            });

            setUncategorizedExpensesList(relevantExpenses.sort((a, b) => b.amount - a.amount));
            setIsUncategorizedModalOpen(true);
        }
    }, [marketingExpenses, startDate, endDate, selectedSector, selectedBranch, marketingChannels, channelCategories, suppliers, branches, sectors, branchMap, sectorMap, sectorNameToId]);

    const renderMonthlyTrendTooltip = useCallback(
        ({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const currentData = payload[0]?.payload;
            const monthLabel = currentData?.mese || '';

            // Find current month index
            const monthIndex = monthlyTrendStats.chartData.findIndex(m => m.mese === monthLabel);
            const prevMonthData = monthIndex > 0 ? monthlyTrendStats.chartData[monthIndex - 1] : null;

            const currentTotal = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
            const prevTotal = prevMonthData ? (prevMonthData.real || 0) + (prevMonthData.projected || 0) : null;

            let changePercent = null;
            let changeDirection = null;
            if (prevTotal && prevTotal > 0) {
                changePercent = ((currentTotal - prevTotal) / prevTotal * 100).toFixed(1);
                changeDirection = currentTotal > prevTotal ? 'up' : currentTotal < prevTotal ? 'down' : 'same';
            }

            const rows = [
                {
                    id: 'total',
                    label: 'Totale',
                    value: currentTotal,
                    color: '#6366F1',
                },
            ];

            const realEntry = payload.find(item => item.dataKey === 'real');
            if (realEntry) {
                rows.push({
                    id: 'real',
                    label: 'Spesa effettiva',
                    value: Number(realEntry.value) || 0,
                    color: '#F97316',
                });
            }

            if (showProjections) {
                const projEntry = payload.find(item => item.dataKey === 'projected');
                if (projEntry && Number(projEntry.value) > 0) {
                    rows.push({
                        id: 'projected',
                        label: 'Proiezioni',
                        value: Number(projEntry.value) || 0,
                        color: '#8B5CF6',
                    });
                }
            }

            rows.push({
                id: 'budget',
                label: 'Budget medio',
                value: monthlyTrendStats.monthlyAvgBudget || 0,
                color: '#F43F5E',
            });

            return (
                <div className={getTooltipContainerClass('indigo')}>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900">{monthLabel}</p>
                        {changePercent !== null && (
                            <span className={`text - xs font - semibold ${changeDirection === 'up' ? 'text-rose-600' : changeDirection === 'down' ? 'text-emerald-600' : 'text-slate-500'} `}>
                                {changeDirection === 'up' && '↑'}
                                {changeDirection === 'down' && '↓'}
                                {changeDirection === 'same' && '→'}
                                {' '}{Math.abs(parseFloat(changePercent))}%
                            </span>
                        )}
                    </div>
                    <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                        {rows.map(row => (
                            <div key={`${monthLabel} -${row.id} `} className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-2 text-slate-600">
                                    <span
                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: row.color }}
                                    />
                                    {row.label}
                                </span>
                                <span>{formatCurrency(row.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        },
        [monthlyTrendStats.chartData, monthlyTrendStats.monthlyAvgBudget, showProjections]
    );
    const renderCategoryTooltip = useCallback(({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={getTooltipContainerClass('indigo')}>
                    <p className="text-sm font-bold text-slate-900">{data.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                        {formatCurrency(data.amount)} · {(data.percent * 100).toFixed(1)}%
                    </p>
                    {data.isOthers && data.othersBreakdown && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                            {data.othersBreakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">{item.name}</span>
                                    <span className="font-medium text-slate-700">{formatCurrency(item.value)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    }, []);

    const resetFilters = () => {
        const defaultDates = getDefaultDateFilter();
        setStartDate(defaultDates.startDate);
        setEndDate(defaultDates.endDate);
        setSelectedSector('all');
        setSelectedBranch('all');
        setSearchTerm('');
        setShowProjections(true);
        setPresetName('');
        setIsPresetPanelOpen(false);
        setIsAdvancedPanelOpen(false);
        setIsDateDropdownOpen(false);
        toast.success("Filtri resettati!");
    };

    const savePreset = () => {
        const name = presetName.trim();
        if (!name) {
            toast.error('Inserisci un nome per il preset');
            return;
        }
        const preset = {
            id: Date.now(),
            name,
            searchTerm: trimmedSearchTerm,
            startDate,
            endDate,
            selectedSector,
            selectedBranch,
            showProjections
        };
        setFilterPresets(prev => {
            const withoutDuplicates = prev.filter(p => p.name.toLowerCase() !== name.toLowerCase());
            return [...withoutDuplicates, preset];
        });
        setPresetName('');
        toast.success('Preset salvato');
    };

    const applyPreset = (preset) => {
        // Handle predefined presets (with getFilter function)
        if (preset.isPredefined && preset.getFilter) {
            const dateRange = preset.getFilter();
            setStartDate(dateRange.startDate);
            setEndDate(dateRange.endDate);
            toast.success(`Filtro \"${preset.name}\" applicato`);
            return;
        }

        // Handle custom saved presets
        setStartDate(preset.startDate || defaultStartDate);
        setEndDate(preset.endDate || defaultEndDate);
        setSelectedSector(preset.selectedSector || 'all');
        setSelectedBranch(preset.selectedBranch || 'all');
        setShowProjections(preset.showProjections === undefined ? true : preset.showProjections);
        setSearchTerm(preset.searchTerm || '');
        toast.success(`Preset \"${preset.name}\" applicato`);
    };

    const deletePreset = (id) => {
        setFilterPresets(prev => prev.filter(p => p.id !== id));
        toast.success('Preset eliminato');
    };

    const dateLabel = (startDate && endDate)
        ? `${formatDate(startDate)} → ${formatDate(endDate)} `
        : 'Seleziona periodo';
    const visibleSectors = useMemo(() => metrics.sectorData.slice(0, 4), [metrics.sectorData]);
    const visibleBranches = useMemo(() => metrics.allBranches.slice(0, 4), [metrics.allBranches]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div className="text-xl font-semibold text-gray-700">Caricamento dashboard...</div>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
            <div className="relative p-4 lg:p-8 space-y-6">

                {/* HEADER */}
                <div className="space-y-6">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white shadow-2xl border border-white/20 p-6 lg:p-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_55%)]" />
                        <div className="relative flex flex-col gap-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-indigo-900/30 ring-4 ring-white/25">
                                        <BarChart3 className="w-7 h-7 lg:w-8 lg:h-8" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">Dashboard</p>
                                        <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">
                                            Control Center
                                        </h1>
                                    </div>
                                </div>
                                <div className="relative self-start">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsNotificationsPanelOpen(prev => !prev);
                                            setIsPresetPanelOpen(false);
                                            setIsAdvancedPanelOpen(false);
                                            setIsDateDropdownOpen(false);
                                        }}
                                        className={`inline-flex items-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition-all opacity-100 filter-none ${hasPriorityInsights ? 'bg-white/15 text-white' : 'bg-white/10 text-white/70 hover:text-white'
                                            }`}
                                        aria-expanded={isNotificationsPanelOpen}
                                    >
                                        <Bell className="w-4 h-4" />
                                        Notifiche
                                        {notificationCount > 0 && (
                                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-bold text-indigo-600">
                                                {notificationCount}
                                            </span>
                                        )}
                                    </button>
                                    {isNotificationsPanelOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setIsNotificationsPanelOpen(false)}
                                            />
                                            <div className="fixed right-4 top-28 z-[120] w-[calc(100vw-3rem)] max-w-sm rounded-3xl border border-indigo-100 bg-white p-3 shadow-2xl shadow-indigo-900/25 lg:right-10 lg:top-32">
                                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                                    <div>
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500">
                                                            Notifiche operative
                                                        </p>
                                                        <p className="text-xs font-semibold text-slate-900">
                                                            {hasPriorityInsights ? 'Azioni consigliate' : 'Nessuna priorità in sospeso'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto pr-1 text-xs">
                                                    {priorityInsights.length > 0 ? (
                                                        priorityInsights.map(item => {
                                                            const Icon = item.icon;
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    className="flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-white px-3 py-3 text-xs shadow-sm shadow-indigo-100/60"
                                                                >
                                                                    <div className="flex items-start gap-2">
                                                                        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                                                                            <Icon className="h-4 w-4" />
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
                                                                                {item.label}
                                                                            </span>
                                                                            <p className="text-sm font-black text-slate-900">{item.title}</p>
                                                                            <p className="text-[11px] text-slate-500">{item.description}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-base font-black text-indigo-600">{item.value}</span>
                                                                        {item.actionLabel && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setIsNotificationsPanelOpen(false);
                                                                                    item.onClick && item.onClick();
                                                                                }}
                                                                                className="rounded-full border border-indigo-100 px-3 py-1 text-[11px] font-semibold text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-50"
                                                                            >
                                                                                {item.actionLabel}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <p className="text-sm font-semibold text-slate-500">
                                                            Nessuna azione richiesta al momento.
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsNotificationsPanelOpen(false)}
                                                    className="mt-3 w-full rounded-2xl border border-indigo-100 bg-indigo-50 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-100"
                                                >
                                                    Chiudi notifiche
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm lg:text-base text-white/85 max-w-3xl">
                                Monitora budget, spese e proiezioni in tempo reale. I filtri selezionati vengono condivisi con tutte le sezioni della piattaforma per mantenere la stessa vista analitica.
                            </p>
                        </div>
                    </div>

                </div>

                <section className="relative z-20 rounded-3xl border border-white/80 bg-gradient-to-r from-slate-300/95 via-slate-100/90 to-white/90 px-4 py-5 backdrop-blur-2xl overflow-visible">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -top-16 left-12 h-32 w-32 rounded-full bg-indigo-100/45 blur-3xl" />
                        <div className="absolute -bottom-20 right-10 h-36 w-36 rounded-full bg-slate-200/50 blur-3xl" />
                    </div>
                    <div className="relative z-10 flex flex-wrap lg:flex-nowrap items-center justify-center gap-3 lg:gap-4 w-full max-w-6xl mx-auto">
                        <div className="flex min-w-[220px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <Search className="h-4 w-4 text-slate-700" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Ricerca libera"
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 placeholder:text-slate-600 focus:outline-none"
                            />
                        </div>
                        <div className="relative">
                            {isDateDropdownOpen && (
                                <div className="fixed inset-0 z-[120]" onClick={() => setIsDateDropdownOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsDateDropdownOpen(prev => !prev);
                                    setIsPresetPanelOpen(false);
                                    setIsAdvancedPanelOpen(false);
                                }}
                                aria-expanded={isDateDropdownOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 opacity-100 filter-none ${hasCustomDateRange ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <Calendar className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">{dateLabel}</span>
                                <ArrowUpDown
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isDateDropdownOpen ? 'rotate-180' : ''
                                        }`}
                                />
                            </button>
                            {isDateDropdownOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                Intervallo temporale
                                            </p>
                                            <p className="text-xs font-medium text-slate-500">
                                                Imposta il periodo condiviso con le altre pagine.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                                Da
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(event) => setStartDate(event.target.value)}
                                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                                />
                                            </label>
                                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                                A
                                                <input
                                                    type="date"
                                                    value={endDate}
                                                    onChange={(event) => setEndDate(event.target.value)}
                                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                                />
                                            </label>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStartDate(defaultStartDate);
                                                    setEndDate(defaultEndDate);
                                                }}
                                                className="text-xs font-semibold text-indigo-500 transition hover:text-rose-500"
                                            >
                                                Pulisci
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsDateDropdownOpen(false)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-100"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                                Chiudi
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur">
                            <Layers className="h-4 w-4 text-slate-500" />
                            <select
                                value={selectedSector}
                                onChange={(event) => setSelectedSector(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                <option value="all">Tutti i settori</option>
                                {orderedSectors.map(sector => (
                                    <option key={sector.id} value={sector.id}>
                                        {sector.name || 'N/D'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur">
                            <MapPin className="h-4 w-4 text-slate-500" />
                            <select
                                value={selectedBranch}
                                onChange={(event) => setSelectedBranch(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                <option value="all">Tutte le filiali</option>
                                {orderedBranches.map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name || 'N/D'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="relative">
                            {isAdvancedPanelOpen && (
                                <div className="fixed inset-0 z-[120]" onClick={() => setIsAdvancedPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdvancedPanelOpen(prev => !prev);
                                    setIsPresetPanelOpen(false);
                                    setIsDateDropdownOpen(false);
                                }}
                                aria-expanded={isAdvancedPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${!showProjections ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <Filter className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">Filtri avanzati</span>
                                <ArrowUpDown
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isAdvancedPanelOpen ? 'rotate-180' : ''
                                        }`}
                                />
                            </button>
                            {isAdvancedPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                Visualizzazione dati
                                            </p>
                                            <p className="text-xs font-medium text-slate-500">
                                                Includi o escludi le proiezioni contrattuali.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { key: true, label: 'Con proiezioni' },
                                                { key: false, label: 'Solo spesa registrata' }
                                            ].map(option => {
                                                const active = showProjections === option.key;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`projection-${option.label}`}
                                                        onClick={() => setShowProjections(option.key)}
                                                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${active
                                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
                                                            : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => setShowProjections(true)}
                                                className="text-xs font-semibold text-indigo-500 transition hover:text-rose-500"
                                            >
                                                Pulisci
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsAdvancedPanelOpen(false)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-100"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                                Chiudi
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="relative">
                            {isPresetPanelOpen && (
                                <div className="fixed inset-0 z-[120]" onClick={() => setIsPresetPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPresetPanelOpen(prev => !prev);
                                    setIsAdvancedPanelOpen(false);
                                    setIsDateDropdownOpen(false);
                                }}
                                aria-expanded={isPresetPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 opacity-100 filter-none ${isPresetPanelOpen ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                Preset
                            </button>
                            {isPresetPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur sm:w-80 space-y-3">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            Preset salvati
                                        </p>
                                        <p className="text-xs font-medium text-slate-500">
                                            Salva e applica rapidamente le combinazioni preferite.
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="text"
                                            value={presetName}
                                            onChange={(event) => setPresetName(event.target.value)}
                                            placeholder="Nome preset (es. Board Q1)"
                                            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                savePreset();
                                                setIsPresetPanelOpen(false);
                                            }}
                                            disabled={!presetName.trim()}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                            Salva
                                        </button>
                                    </div>
                                    {filterPresets.length > 0 ? (
                                        <div className="space-y-2">
                                            {filterPresets.map(preset => (
                                                <div
                                                    key={preset.id}
                                                    className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-100/60"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            applyPreset(preset);
                                                            setIsPresetPanelOpen(false);
                                                        }}
                                                        className="flex-1 text-left transition-colors hover:text-indigo-600"
                                                    >
                                                        {preset.name}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deletePreset(preset.id)}
                                                        className="text-slate-300 transition-colors hover:text-rose-500"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs font-medium text-slate-400">
                                            Nessun preset salvato.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm shadow-rose-100/60 transition hover:border-rose-300 whitespace-nowrap"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                Resetta filtri
                            </button>
                        )}
                    </div>
                    {/* Predefined Date Presets */}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Filtri rapidi
                        </span>
                        {PREDEFINED_DATE_PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm shadow-indigo-100/60 transition-all hover:border-indigo-300 hover:from-indigo-100 hover:to-purple-100 hover:shadow-md"
                            >
                                <Calendar className="h-3.5 w-3.5" />
                                {preset.name}
                            </button>
                        ))}
                    </div>
                    {filterPresets.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Preset rapidi
                            </span>
                            {filterPresets.map(preset => (
                                <div
                                    key={`quick-${preset.id}`}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-100/60"
                                >
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        className="transition-colors hover:text-indigo-600"
                                    >
                                        {preset.name}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => deletePreset(preset.id)}
                                        className="text-slate-300 transition-colors hover:text-rose-500"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
                {
                    selectedBranch === 'all' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <KpiCard
                                title={metrics.isFullYear ? "Budget totale anno" : "Budget del periodo"}
                                value={formatCurrency(metrics.budgetTotale)}
                                subtitle={`${metrics.sectorData.length} settori attivi`}
                                icon={<Target />}
                                gradient="from-emerald-500 to-green-600"
                                tooltip="Budget complessivo assegnato per il periodo selezionato."
                            />
                            <KpiCard
                                title="Spesa effettiva"
                                value={formatCurrency(metrics.spesaSostenuta)}
                                subtitle="Importo registrato"
                                icon={<DollarSign />}
                                gradient="from-orange-500 to-amber-600"
                                tooltip="Totale delle spese registrate e fatturate nel periodo."
                            />
                            <KpiCard
                                title="Proiezioni contratti"
                                value={formatCurrency(showProjections ? metrics.spesaPrevistaTotaleInFilter : 0)}
                                subtitle={showProjections ? "Quote future incluse" : "Proiezioni disattivate"}
                                icon={<TrendingUp />}
                                gradient="from-teal-500 to-cyan-500"
                                tooltip="Stima dei costi futuri basata sui contratti attivi."
                            />
                            <KpiCard
                                title={isOverBudgetRisk ? "Sforamento previsto" : "Budget residuo"}
                                value={formatCurrency(Math.abs(remainingBudget))}
                                subtitle={isOverBudgetRisk ? "Attenzione richiesta" : "Disponibile"}
                                icon={isOverBudgetRisk ? <AlertTriangle /> : <CheckCircle />}
                                gradient={isOverBudgetRisk ? "from-rose-500 to-red-600" : "from-slate-600 to-slate-800"}
                                tooltip="Differenza tra budget totale e spesa (effettiva + proiezioni)."
                            />
                        </div>
                    )
                }


                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -top-40 right-0 h-80 w-80 rounded-full bg-indigo-200/35 blur-3xl" />
                            <div className="absolute bottom-[-35%] left-1/4 h-72 w-72 rounded-full bg-blue-200/25 blur-3xl" />
                        </div>
                        <div className="relative z-10 flex flex-col">
                            <div className="flex flex-col gap-1 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5 text-white">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Trend mensile
                                </p>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-black text-white">Andamento spesa mensile</h2>
                                    <InfoTooltip message="Confronto mensile tra spesa realizzata, proiezioni e budget medio assegnato." />
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-col px-6 pb-6 pt-6 bg-white">
                                {monthlyTrendStats.hasData ? (
                                    <>
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsBarChart
                                                    data={monthlyTrendStats.chartData}
                                                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                                                >
                                                    <defs>
                                                        <linearGradient id="monthly-real-gradient" x1="0" y1="1" x2="0" y2="0">
                                                            <stop offset="0%" stopColor="#F97316" stopOpacity={1} />
                                                            <stop offset="100%" stopColor="#FDBA74" stopOpacity={1} />
                                                        </linearGradient>
                                                        <linearGradient id="monthly-projected-gradient" x1="0" y1="1" x2="0" y2="0">
                                                            <stop offset="0%" stopColor="#818CF8" stopOpacity={1} />
                                                            <stop offset="100%" stopColor="#A855F7" stopOpacity={1} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis
                                                        dataKey="mese"
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                                                    />
                                                    <YAxis hide />
                                                    <RechartsTooltip
                                                        content={renderMonthlyTrendTooltip}
                                                        cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                                                    />
                                                    {monthlyTrendStats.monthlyAvgBudget > 0 && (
                                                        <ReferenceLine
                                                            y={monthlyTrendStats.monthlyAvgBudget}
                                                            stroke="#F43F5E"
                                                            strokeDasharray="6 4"
                                                            strokeWidth={2}
                                                            label={renderMonthlyBudgetLabel}
                                                        />
                                                    )}
                                                    <Bar
                                                        dataKey="real"
                                                        stackId="spend"
                                                        fill="url(#monthly-real-gradient)"
                                                        maxBarSize={32}
                                                    >
                                                        {monthlyTrendStats.chartData.map((entry, index) => {
                                                            const hasProjected = showProjections && entry.projected > 0;
                                                            return (
                                                                <Cell
                                                                    key={`monthly - real - ${entry.mese} -${index} `}
                                                                    radius={hasProjected ? [0, 0, 0, 0] : [8, 8, 0, 0]}
                                                                />
                                                            );
                                                        })}
                                                    </Bar>
                                                    {showProjections && (
                                                        <Bar
                                                            dataKey="projected"
                                                            stackId="spend"
                                                            fill="url(#monthly-projected-gradient)"
                                                            radius={[8, 8, 0, 0]}
                                                            maxBarSize={32}
                                                        />
                                                    )}
                                                </RechartsBarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="mt-6">
                                            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {monthlyTrendStats.summaryCards.map(card => (
                                                    <li
                                                        key={card.label}
                                                        className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 shadow-sm"
                                                    >
                                                        <span className="text-sm font-medium text-slate-600">{card.label}</span>
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            {card.value}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex h-72 items-center justify-center text-sm font-semibold text-slate-500">
                                        Nessun dato disponibile per il periodo selezionato.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {categoryDistribution.segments.length > 0 && selectedSector === 'all' && (
                        <section className="relative flex flex-col overflow-visible rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-200/35 blur-3xl" />
                                <div className="absolute bottom-[-35%] right-1/4 h-56 w-56 rounded-full bg-purple-200/25 blur-3xl" />
                            </div>
                            <div className="relative flex flex-col gap-1 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5 z-10 text-white">
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Composizione categorie
                                </p>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-black text-white">Distribuzione per categorie</h2>
                                    <InfoTooltip message="Analisi della spesa effettiva suddivisa per categorie di marketing." />
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-col px-6 pb-6 pt-6 bg-white">
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <RechartsTooltip content={renderCategoryTooltip} />
                                            <Pie
                                                data={categoryDistribution.segments}
                                                dataKey="amount"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="55%"
                                                outerRadius="80%"
                                                paddingAngle={4}
                                                strokeWidth={0}
                                                onClick={handlePieClick}
                                                className="cursor-pointer"
                                            >
                                                {categoryDistribution.segments.map(segment => (
                                                    <Cell
                                                        key={`category - segment - ${segment.id} `}
                                                        fill={segment.color}
                                                        className="transition-all duration-300 hover:opacity-80 stroke-white hover:stroke-2"
                                                    />
                                                ))}
                                            </Pie>
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-6">
                                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {categoryDistribution.segments.map(segment => (
                                            <li
                                                key={segment.id}
                                                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: segment.color }}
                                                    />
                                                    <span className="text-sm font-medium text-slate-600 truncate max-w-[100px]" title={segment.name}>
                                                        {segment.name}
                                                    </span>
                                                </div>
                                                <span className="text-sm font-semibold text-slate-900">
                                                    {formatCurrency(segment.amount)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* PERFORMANCE SETTORI */}
                {
                    selectedSector === 'all' && selectedBranch === 'all' && (
                        <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-200/35 blur-3xl" />
                                <div className="absolute bottom-[-35%] right-1/4 h-56 w-56 rounded-full bg-purple-200/25 blur-3xl" />
                            </div>
                            <div className="relative z-10 flex flex-col">
                                <div className="flex flex-wrap items-center justify-between gap-4 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5 text-white">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                            Performance settori
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-black text-white">Utilizzo per business unit</h2>
                                            <InfoTooltip message="Panoramica dell'utilizzo budget dei settori e consigli operativi per le business unit." />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate && navigate('expenses')}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/30 backdrop-blur transition hover:border-white/80 hover:bg-white/30"
                                    >
                                        Vedi tutte le spese
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="relative z-10 space-y-6 px-6 pb-6 pt-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
                                        <div className="rounded-2xl border border-indigo-100 bg-slate-50/50 px-4 py-3 shadow-sm flex flex-col justify-between">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Budget attivo
                                                <InfoTooltip message="Budget complessivo disponibile per i settori nel periodo selezionato." />
                                            </div>
                                            <p className="mt-2 text-lg font-black text-slate-900">
                                                {formatCurrency(metrics.budgetTotale)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-indigo-100 bg-slate-50/50 px-4 py-3 shadow-sm">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Spesa effettiva
                                                <InfoTooltip message="Somma delle spese già registrate nei settori attivi." />
                                            </div>
                                            <p className="mt-2 text-lg font-black text-slate-900">
                                                {formatCurrency(metrics.spesaSostenuta)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-indigo-100 bg-slate-50/50 px-4 py-3 shadow-sm">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Proiezioni attive
                                                <InfoTooltip message="Quote future o scadute legate ai contratti dei settori. Visibili solo se le proiezioni sono abilitate." />
                                            </div>
                                            <p className={`mt-2 text-lg font-black ${showProjections ? 'text-slate-900' : 'text-slate-300'}`}>
                                                {showProjections ? formatCurrency(metrics.spesaPrevistaTotaleInFilter) : '—'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 lg:gap-6">
                                        {visibleSectors.map(sector => (
                                            <SectorCard
                                                key={sector.id}
                                                sector={sector}
                                                includeProjections={showProjections}
                                                onClick={() => {
                                                    setSelectedSector(sector.id);
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                            />
                                        ))}
                                    </div>
                                    {metrics.sectorData.length > visibleSectors.length && (
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => navigate && navigate('budget')}
                                                className="inline-flex items-center rounded-2xl border border-indigo-200/70 bg-white/30 px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm shadow-indigo-100 backdrop-blur transition hover:bg-white/60"
                                            >
                                                Vedi tutti i settori
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )
                }

                {/* TOP FORNITORI */}
                {
                    metrics.topSuppliers.length > 0 && (
                        <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                            <div className="relative z-10 flex flex-col">
                                <div className="flex flex-wrap items-center justify-between gap-4 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5 text-white">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                            Top fornitori
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-black text-white">Partner principali</h2>
                                            <InfoTooltip message="Monitoraggio dei fornitori con maggiore esposizione economica nel periodo filtrato." />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate && navigate('contracts')}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/30 backdrop-blur transition hover:border-white/80 hover:bg-white/30"
                                    >
                                        Vedi tutti i fornitori
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="relative z-10 space-y-6 px-6 pb-6 pt-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Impegno Top {TOP_SUPPLIERS_LIMIT}
                                                <InfoTooltip message={showProjections ? `Somma di spesa effettiva e proiezioni per i primi ${TOP_SUPPLIERS_LIMIT} fornitori.` : `Somma della sola spesa effettiva per i primi ${TOP_SUPPLIERS_LIMIT} fornitori.`} />
                                            </div>
                                            <p className="mt-auto text-lg font-black text-slate-900">
                                                {formatCurrency(showProjections ? metrics.totalSuppliersSpent : metrics.topSuppliersSpentOnly)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Spesa effettiva
                                                <InfoTooltip message={`Totale della spesa già registrata per i fornitori Top ${TOP_SUPPLIERS_LIMIT}.`} />
                                            </div>
                                            <p className="mt-auto text-lg font-black text-slate-900">
                                                {formatCurrency(metrics.topSuppliersSpentOnly)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Proiezioni attive
                                                <InfoTooltip message={`Quote contrattuali future o scadute ancora da coprire per i fornitori Top ${TOP_SUPPLIERS_LIMIT}.`} />
                                            </div>
                                            <p className={`mt-auto text-lg font-black ${showProjections ? 'text-slate-900' : 'text-slate-300'}`}>
                                                {showProjections ? formatCurrency(topSuppliersProjections) : '—'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        {metrics.topSuppliers.slice(0, 4).map((supplier, index) => (
                                            <SupplierRankItem
                                                key={supplier.id}
                                                supplier={supplier}
                                                rank={index}
                                                baselineCommitted={showProjections ? metrics.totalSuppliersSpent : metrics.topSuppliersSpentOnly}
                                                includeProjections={showProjections}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )
                }

                {/* CLASSIFICA FILIALI */}
                {
                    metrics.allBranches.length > 0 && selectedBranch === 'all' && (
                        <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -top-24 left-1/3 h-64 w-64 rounded-full bg-indigo-100/40 blur-3xl" />
                                <div className="absolute bottom-[-25%] right-0 h-72 w-72 rounded-full bg-purple-100/35 blur-3xl" />
                            </div>
                            <div className="relative z-10 flex flex-col">
                                <div className="flex flex-wrap items-center justify-between gap-4 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5 text-white">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                            Classifica filiali
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-black text-white">Performance filiali</h2>
                                            <InfoTooltip message="Tutte le sedi aziendali ordinate per spesa effettiva e proiezioni attive." />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate && navigate('expenses')}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/30 backdrop-blur transition hover:border-white/80 hover:bg-white/30"
                                    >
                                        Vedi tutte le filiali
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="relative z-10 space-y-6 px-6 pb-6 pt-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex h-full flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Impegno filiali
                                                <InfoTooltip message="Somma di spesa e proiezioni di tutte le filiali attive." />
                                            </div>
                                            <p className="mt-auto pt-2 text-lg font-black text-slate-900">
                                                {formatCurrency(showProjections ? metrics.totalBranchesSpent : branchesSpentOnly)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex h-full flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Spesa effettiva
                                                <InfoTooltip message="Importo contabile già registrato sulle filiali." />
                                            </div>
                                            <p className="mt-auto pt-2 text-lg font-black text-slate-900">
                                                {formatCurrency(branchesSpentOnly)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm flex h-full flex-col">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
                                                Proiezioni attive
                                                <InfoTooltip message="Residuo futuro e importi scaduti dei contratti associati alle filiali." />
                                            </div>
                                            <p className={`mt-auto pt-2 text-lg font-black ${showProjections ? 'text-slate-900' : 'text-slate-300'}`}>
                                                {showProjections ? formatCurrency(branchesProjectionsTotal) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        {visibleBranches.map((branch, index) => (
                                            <BranchItem
                                                key={branch.id}
                                                branch={branch}
                                                rank={index}
                                                onClick={() => {
                                                    if (navigate) {
                                                        navigate('expenses', { branchId: branch.id });
                                                    }
                                                }}
                                                totalCommitted={branchesBaselineCommitted}
                                                includeProjections={showProjections}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )
                }


            </div >

            {/* Uncategorized Expenses Modal */}
            {
                isUncategorizedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setIsUncategorizedModalOpen(false)}>
                        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            <div className="bg-slate-900 px-6 py-5 flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-xl font-black text-white">Spese Non Categorizzate</h3>
                                    <p className="text-slate-400 text-sm">
                                        Totale: {formatCurrency(uncategorizedExpensesList.reduce((sum, item) => sum + item.amount, 0))}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsUncategorizedModalOpen(false)}
                                    className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="overflow-y-auto p-6 space-y-4">
                                {uncategorizedExpensesList.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500">
                                        Nessuna spesa trovata in questa categoria.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {uncategorizedExpensesList.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                                                <div className="flex-1 min-w-0 mr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{formatDate(item.date)}</span>
                                                        <span className="text-slate-300">•</span>
                                                        <span className="text-xs font-semibold text-indigo-600">{item.supplierName}</span>
                                                    </div>
                                                    <p className="font-semibold text-slate-900 truncate">{item.description || item.expenseDescription}</p>
                                                    <p className="text-xs text-slate-500 mt-1 truncate">
                                                        Canale: {item.marketingChannelId ? 'ID: ' + item.marketingChannelId : 'Nessun canale assegnato'}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-black text-slate-900">{formatCurrency(item.amount)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
