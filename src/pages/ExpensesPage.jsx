import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import useSWR, { useSWRConfig } from 'swr';
import axios from 'axios';
import {
    PlusCircle, Search, Wallet, Car, Sailboat, Caravan, Building2, Layers, MapPin,
    DollarSign, FileText, Paperclip, Copy, Pencil, Trash2, AlertTriangle, CheckCircle2,
    SlidersHorizontal, Activity, ArrowUpDown, TrendingDown,
    FileSignature, X, XCircle, Check, Calendar, Filter, Bell
} from 'lucide-react';
import ExpenseFormModal from '../components/ExpenseFormModal';
import toast from 'react-hot-toast';
import { MultiSelect, KpiCard } from '../components/SharedComponents';
import { loadFilterPresets, persistFilterPresets } from '../utils/filterPresets';
import { getDefaultDateFilter, PREDEFINED_DATE_PRESETS } from '../utils/dateFilters';
import { deriveBranchesForLineItem, computeExpenseBranchShares } from '../utils/branchAssignments';
import { COST_DOMAINS, DEFAULT_COST_DOMAIN } from '../constants/costDomains';
import { getSectorColor } from '../constants/sectorColors';
import EmptyState from '../components/EmptyState';
import { getTooltipContainerClass } from '../utils/chartTooltipStyles';
import SortIndicatorIcon from '../components/SortIndicatorIcon';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    PieChart,
    Pie,
} from 'recharts';



const MONTHS = [
    { id: '01', label: 'Gennaio' },
    { id: '02', label: 'Febbraio' },
    { id: '03', label: 'Marzo' },
    { id: '04', label: 'Aprile' },
    { id: '05', label: 'Maggio' },
    { id: '06', label: 'Giugno' },
    { id: '07', label: 'Luglio' },
    { id: '08', label: 'Agosto' },
    { id: '09', label: 'Settembre' },
    { id: '10', label: 'Ottobre' },
    { id: '11', label: 'Novembre' },
    { id: '12', label: 'Dicembre' },
];

const EXCLUDED_BRANCH_NAMES = new Set(['rossano yachting']);

const branchColorPalette = [
    '#6366F1',
    '#EC4899',
    '#F97316',
    '#10B981',
    '#0EA5E9',
    '#F59E0B',
];

const TARGET_BRANCH_NAMES = ['Filiale Vicenza', 'Filiale Garbagnate', 'Filiale Altivole', 'Rossano Camper&Caravan'];

const normalizeBranchLabel = (value = '') =>
    value
        .toLowerCase()
        .replace(/filiale/g, '')
        .replace(/[^a-z0-9]/g, '');

const buildNonOperationsTrendData = ({
    processedExpenses = [],
    selectedYear = new Date().getFullYear(),
    isOperationsDomain,
    branchMap,
    sectorMap,
    selectedBranch = 'all',
}) => {
    if (isOperationsDomain) {
        return {
            monthlyTrendData: [],
            monthlyBranchKeys: [],
            hasMonthlyTrendData: false,
            sectorSplitData: [],
            hasSectorSplitData: false,
        };
    }

    const monthlyBase = MONTHS.map((month) => ({
        monthId: month.id,
        monthLabel: month.label.slice(0, 3),
        total: 0,
    }));
    const monthlyMap = new Map(monthlyBase.map((entry) => [entry.monthId, entry]));
    const monthlyBranchBuckets = new Map(monthlyBase.map((entry) => [entry.monthId, new Map()]));
    const branchTotals = new Map();
    const sectorTotals = new Map();

    processedExpenses.forEach((expense) => {
        if (!expense?.date) return;
        const expenseDate = new Date(expense.date);
        if (Number.isNaN(expenseDate.getTime())) return;
        if (expenseDate.getFullYear() !== selectedYear) return;

        const monthId = String(expenseDate.getMonth() + 1).padStart(2, '0');
        const monthEntry = monthlyMap.get(monthId);
        const branchBucket = monthlyBranchBuckets.get(monthId);
        if (!monthEntry || !branchBucket) return;

        const totalAmount = expense.displayAmount || expense.amount || 0;
        if (totalAmount <= 0) return;

        monthEntry.total += totalAmount;

        const shares = expense.branchShares || {};
        const shareEntries = Object.entries(shares).filter(([, value]) => (value || 0) > 0);
        if (shareEntries.length > 0) {
            shareEntries.forEach(([branchId, value]) => {
                const safeId = branchId || 'unassigned';
                const amount = value || 0;
                branchBucket.set(safeId, (branchBucket.get(safeId) || 0) + amount);
                branchTotals.set(safeId, (branchTotals.get(safeId) || 0) + amount);
            });
        } else {
            const fallbackId = expense.branchId || expense.branchld || 'unassigned';
            branchBucket.set(fallbackId, (branchBucket.get(fallbackId) || 0) + totalAmount);
            branchTotals.set(fallbackId, (branchTotals.get(fallbackId) || 0) + totalAmount);
        }

        const sectorId = expense.sectorId || expense.lineItems?.[0]?.sectorId || 'unassigned';
        const sectorName = sectorMap?.get(sectorId) || 'Altro';

        if (sectorName === 'Altro') {
            console.warn('Found Altro expense:', {
                id: expense.id,
                amount: totalAmount,
                sectorId: expense.sectorId,
                lineItemSectorId: expense.lineItems?.[0]?.sectorId,
                computedSectorId: sectorId,
                sectorMapHasIt: sectorMap?.has(sectorId)
            });
        }

        sectorTotals.set(sectorName, (sectorTotals.get(sectorName) || 0) + totalAmount);
    });

    const orderedBranchTotals = Array.from(branchTotals.entries())
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);

    const topBranchCount = branchColorPalette.length;
    const rawPrimaryEntries = orderedBranchTotals.slice(0, topBranchCount).map(([branchId, totalValue], index) => ({
        id: branchId || 'unassigned',
        key: `nonops-branch-${branchId || 'unassigned'}`,
        name:
            branchMap?.get(branchId) ||
            (branchId === 'unassigned' ? 'Non assegnata' : branchId || 'Filiale'),
        color: branchColorPalette[index % branchColorPalette.length],
        total: totalValue || 0,
        isOthers: false,
    }));

    let excludedPrimaryTotal = 0;
    const primaryBranchEntries = rawPrimaryEntries.filter(entry => {
        const normalizedName = (entry.name || '').trim().toLowerCase();
        if (EXCLUDED_BRANCH_NAMES.has(normalizedName)) {
            excludedPrimaryTotal += entry.total || 0;
            return false;
        }
        return true;
    });

    const remainingTotal =
        orderedBranchTotals.slice(topBranchCount).reduce((sum, [, value]) => sum + value, 0) +
        excludedPrimaryTotal;
    const includeOthers = remainingTotal > 0;
    const monthlyBranchKeys = includeOthers
        ? [
            ...primaryBranchEntries,
            {
                id: '__others__',
                key: 'nonops-branch-others',
                name: 'Altre filiali',
                color: '#CBD5F5',
                total: remainingTotal,
                isOthers: true,
            },
        ]
        : primaryBranchEntries;

    // Filter branches if a specific branch is selected
    const filteredMonthlyBranchKeys = selectedBranch && selectedBranch !== 'all'
        ? monthlyBranchKeys.filter(branch => branch.id === selectedBranch)
        : monthlyBranchKeys;

    const primaryBranchIdSet = new Set(primaryBranchEntries.map((branch) => branch.id));

    const monthlyTrendData = monthlyBase.map((entry) => {
        const branchBucket = monthlyBranchBuckets.get(entry.monthId) || new Map();
        const totalForMonth = Array.from(branchBucket.values()).reduce((sum, value) => sum + value, 0);
        const dataPoint = {
            ...entry,
            total: totalForMonth,
            othersBreakdown: [],
        };

        let topBranchKey = null;

        filteredMonthlyBranchKeys.forEach((branch) => {
            let branchValue = 0;
            if (branch.id === '__others__') {
                const breakdownEntries = Array.from(branchBucket.entries()).filter(([branchId]) => !primaryBranchIdSet.has(branchId));
                branchValue = breakdownEntries.reduce((sum, [, value]) => sum + value, 0);
                dataPoint.othersBreakdown = breakdownEntries
                    .filter(([, value]) => value > 0)
                    .map(([branchId, value]) => ({
                        branchId,
                        name:
                            branchMap?.get(branchId) ||
                            (branchId === 'unassigned' ? 'Non assegnata' : branchId || 'Filiale'),
                        value,
                    }))
                    .sort((a, b) => b.value - a.value);
            } else {
                branchValue = branchBucket.get(branch.id) || 0;
            }
            dataPoint[branch.key] = branchValue;
            if (branchValue > 0) {
                topBranchKey = branch.key;
            }
        });

        dataPoint.topBranchKey = topBranchKey;
        return dataPoint;
    });

    const hasMonthlyTrendData = monthlyTrendData.some((entry) =>
        monthlyBranchKeys.some((branch) => (entry[branch.key] || 0) > 0)
    );

    const sectorSplitData = Array.from(sectorTotals.entries())
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], index) => ({
            id: `sector-${name || index}`,
            name: name || 'Altro',
            value,
            color: getSectorColor(name, index),
        }));

    const hasSectorSplitData = sectorSplitData.some((entry) => entry.value > 0);

    return {
        monthlyTrendData,
        monthlyBranchKeys: filteredMonthlyBranchKeys,
        hasMonthlyTrendData,
        sectorSplitData,
        hasSectorSplitData,
    };
};

const formatCurrency = (number) => {
    if (typeof number !== 'number' || isNaN(number)) return '€ 0,00';
    return number.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/D';
    try {
        const d = new Date(dateString);
        // If dateString is just YYYY-MM-DD, new Date() might treat it as UTC or Local depending on browser.
        // But if it's ISO, it works.
        // The previous code appended T00:00:00 which broke ISO strings.

        if (isNaN(d.getTime())) {
            // Try appending time if it failed (maybe it was just YYYY-MM-DD and browser is strict?)
            // But usually YYYY-MM-DD works.
            // Let's just return original if fail, or N/D
            return 'N/D';
        }
        return d.toLocaleDateString('it-IT', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    } catch (e) {
        return 'N/D';
    }
};

const formatDateInput = (year, month, day) => new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];

// Use centralized date filter functions
const getDefaultStartDate = () => getDefaultDateFilter().startDate;
const getDefaultEndDate = () => getDefaultDateFilter().endDate;

// Progress Bar universale con gestione sforamenti
const ProgressBar = ({ value, max, showOverrun = true }) => {
    const percentage = max > 0 ? Math.round((value / max) * 1000) / 10 : 0;
    const displayPercentage = Math.min(percentage, 100);

    const getGradient = () => {
        if (percentage > 100) return 'from-red-500 to-rose-600';
        if (percentage >= 100) return 'from-emerald-500 to-green-600';
        if (percentage >= 85) return 'from-amber-500 to-orange-600';
        if (percentage > 0) return 'from-orange-400 to-amber-500';
        return 'from-gray-300 to-gray-400';
    };

    return (
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden relative">
            <div
                className={`h-full rounded-full bg-gradient-to-r ${getGradient()} transition-all duration-700 relative overflow-hidden`}
                style={{ width: `${displayPercentage}%` }}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer"></div>
            </div>
            {showOverrun && percentage > 100 && (
                <div className="absolute inset-0 flex items-center justify-end pr-2">
                    <span className="text-[10px] font-bold text-red-700 drop-shadow-lg">
                        +{(percentage - 100).toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    );
};

const ExpensesDateRangeDropdown = ({
    isOpen,
    setIsOpen,
    startDate,
    endDate,
    onChange,
    hasActiveRange,
    onClear,
    onToggle,
    variant = 'card'
}) => {
    const formatDateLabel = (value) => {
        if (!value) return '—';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const label = (startDate && endDate)
        ? `${formatDateLabel(startDate)} → ${formatDateLabel(endDate)}`
        : 'Seleziona periodo';

    const isHeroVariant = variant === 'hero';
    const baseButtonClasses = isHeroVariant
        ? 'inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 shadow-lg shadow-orange-900/30 backdrop-blur-sm transition hover:border-white/60 hover:bg-white/20'
        : 'inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600';
    const ringClass = hasActiveRange
        ? isHeroVariant
            ? 'ring-2 ring-white/60'
            : 'ring-2 ring-indigo-100'
        : '';
    const calendarIconClass = isHeroVariant ? 'h-4 w-4 text-white/80' : 'h-4 w-4 text-slate-500';
    const arrowIconClass = isHeroVariant ? 'h-4 w-4 text-white/60' : 'h-4 w-4 text-slate-400';

    return (
        <div className="relative">
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <button
                type="button"
                onClick={() => {
                    if (onToggle) {
                        onToggle();
                    }
                    setIsOpen(prev => !prev);
                }}
                aria-expanded={isOpen}
                className={`${baseButtonClasses} ${ringClass}`}
            >
                <Calendar className={calendarIconClass} />
                <span className="whitespace-nowrap">{label}</span>
                <ArrowUpDown
                    className={`${arrowIconClass} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Intervallo temporale
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                                Imposta il periodo di analisi condiviso con Budget e Contratti.
                            </p>
                        </div>
                        <div className="space-y-3">
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                Da
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(event) =>
                                        onChange({
                                            startDate: event.target.value,
                                            endDate
                                        })
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                A
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(event) =>
                                        onChange({
                                            startDate,
                                            endDate: event.target.value
                                        })
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                />
                            </label>
                        </div>
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={onClear}
                                className="text-xs font-semibold text-indigo-500 transition hover:text-rose-500"
                            >
                                Pulisci
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
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
    );
};

const ExpensesAdvancedFiltersDropdown = ({
    isOpen,
    setIsOpen,
    invoiceFilter,
    setInvoiceFilter,
    contractFilter,
    setContractFilter,
    selectedCategory,
    setSelectedCategory,
    channelCategories,
    onClear,
    onToggle,
    variant = 'card'
}) => {
    const hasAdvancedFilters = invoiceFilter !== '' || contractFilter !== '' || selectedCategory !== 'all';
    const isHeroVariant = variant === 'hero';
    const buttonClasses = isHeroVariant
        ? 'inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 shadow-lg shadow-orange-900/30 backdrop-blur-sm transition hover:border-white/60 hover:bg-white/20'
        : 'inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600';
    const ringClass = hasAdvancedFilters
        ? isHeroVariant
            ? 'ring-2 ring-white/60'
            : 'ring-2 ring-indigo-100'
        : '';
    const iconClass = isHeroVariant ? 'h-4 w-4 text-white/80' : 'h-4 w-4 text-slate-500';
    const arrowClass = isHeroVariant ? 'h-4 w-4 text-white/60' : 'h-4 w-4 text-slate-400';

    return (
        <div className="relative">
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <button
                type="button"
                onClick={() => {
                    if (onToggle) {
                        onToggle();
                    }
                    setIsOpen(prev => !prev);
                }}
                aria-expanded={isOpen}
                className={`${buttonClasses} ${ringClass}`}
            >
                <Filter className={iconClass} />
                <span className="whitespace-nowrap">Filtri Avanzati</span>
                <ArrowUpDown
                    className={`${arrowClass} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Stato documentale
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                                Limita l’elenco in base a fatture e contratti caricati.
                            </p>
                        </div>
                        <div className="space-y-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Stato fattura
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: '', label: 'Tutte' },
                                    { key: 'present', label: 'Con fattura' },
                                    { key: 'missing', label: 'Senza fattura' },
                                ].map(option => {
                                    const active = invoiceFilter === option.key;
                                    return (
                                        <button
                                            key={`invoice-${option.key || 'all'}`}
                                            type="button"
                                            onClick={() => setInvoiceFilter(option.key)}
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
                        </div>
                        <div className="space-y-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Stato contratto
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: '', label: 'Tutti' },
                                    { key: 'present', label: 'Con contratto' },
                                    { key: 'missing', label: 'Senza contratto' },
                                ].map(option => {
                                    const active = contractFilter === option.key;
                                    return (
                                        <button
                                            key={`contract-${option.key || 'all'}`}
                                            type="button"
                                            onClick={() => setContractFilter(option.key)}
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
                        </div>
                        <div className="space-y-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Categoria
                            </span>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    key="category-all"
                                    type="button"
                                    onClick={() => setSelectedCategory('all')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${selectedCategory === 'all'
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                                        }`}
                                >
                                    Tutte
                                </button>
                                {channelCategories
                                    .filter(cat => cat.name !== 'Affitto')
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(category => {
                                        const active = selectedCategory === category.id;
                                        return (
                                            <button
                                                key={`category-${category.id}`}
                                                type="button"
                                                onClick={() => setSelectedCategory(category.id)}
                                                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${active
                                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
                                                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                                                    }`}
                                            >
                                                {category.name}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={onClear}
                                className="text-xs font-semibold text-indigo-500 transition hover:text-rose-500"
                            >
                                Pulisci filtri
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
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
    );
};

// Status Badge aggiornato con supporto requiresContract
// Vista Tabella
const ExpenseTableView = React.memo(({
    expenses,
    sectorMap,
    supplierMap,
    branchMap,
    contractMap,
    marketingChannels,
    channelCategories,
    onEdit,
    onDelete,
    onDuplicate,
    canEditOrDelete,
    showDocuments = true,
    splitByBranch = false,
    limitBranchId = null,
    actionVariant = 'default',
}) => {
    const [sortState, setSortState] = useState({ column: null, direction: null });

    const sortedExpenses = useMemo(() => {
        if (!sortState.column) return expenses;
        const sorted = [...expenses];
        const { column, direction } = sortState;
        sorted.sort((a, b) => {
            let valueA;
            let valueB;
            switch (column) {
                case 'supplier':
                    valueA = supplierMap.get(a.supplierId) || '';
                    valueB = supplierMap.get(b.supplierId) || '';
                    return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
                case 'date':
                    valueA = new Date(a.date || 0).getTime();
                    valueB = new Date(b.date || 0).getTime();
                    return direction === 'asc' ? valueA - valueB : valueB - valueA;
                case 'amount':
                    valueA = a.displayAmount || a.amount || 0;
                    valueB = b.displayAmount || b.amount || 0;
                    return direction === 'asc' ? valueA - valueB : valueB - valueA;
                default:
                    return 0;
            }
        });
        return sorted;
    }, [expenses, sortState, supplierMap]);

    const handleSort = (column) => {
        setSortState(prev => {
            if (prev.column === column) {
                const nextDirection = prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? null : 'asc';
                return { column: nextDirection ? column : null, direction: nextDirection };
            }
            return { column, direction: 'asc' };
        });
    };

    const renderSortIndicator = (column) => (
        <SortIndicatorIcon
            active={sortState.column === column}
            direction={sortState.direction || 'asc'}
        />
    );

    const buildBranchName = (expense) => {
        const branchIds = new Set();
        if (expense.lineItems && expense.lineItems.length > 0) {
            expense.lineItems.forEach(item => {
                (item.assignedBranches || []).forEach(id => branchIds.add(id));
            });
        } else if (expense.branchId) {
            branchIds.add(expense.branchId);
        }

        if (branchIds.size === 0) {
            return '—';
        }
        if (branchIds.size === 1) {
            const [branchId] = branchIds;
            return branchMap.get(branchId) || '—';
        }
        return 'Più Filiali';
    };

    const getBranchSegments = (expense) => {
        if (!splitByBranch) {
            return [{
                key: expense.id,
                branchId: expense.branchId || expense.branchld || 'unassigned',
                branchName: buildBranchName(expense),
                amount: expense.displayAmount || expense.amount || 0,
            }];
        }

        const shares = expense.branchShares || {};
        const entries = Object.entries(shares);

        if (entries.length === 0) {
            return [{
                key: `${expense.id}-unassigned`,
                branchId: 'unassigned',
                branchName: 'Non assegnata',
                amount: expense.displayAmount || expense.amount || 0,
            }];
        }

        return entries.map(([branchId, value]) => ({
            key: `${expense.id}-${branchId}`,
            branchId,
            branchName: branchMap.get(branchId) || 'Filiale non assegnata',
            amount: value,
        }));
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-white/40 bg-white/90 shadow-xl shadow-orange-200/60">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-slate-700">
                    <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white uppercase text-[11px] font-black tracking-[0.16em]">
                        <tr>
                            <th className="px-4 py-3 text-left w-[25%] min-w-[200px]">
                                <button type="button" onClick={() => handleSort('supplier')} className="inline-flex items-center gap-2">
                                    FORNITORE
                                    {renderSortIndicator('supplier')}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left hidden lg:table-cell w-[15%]">CATEGORIA</th>
                            <th className="px-4 py-3 text-left hidden xl:table-cell w-[10%]">SETTORE</th>
                            <th className="px-4 py-3 text-left hidden xl:table-cell w-[10%]">FILIALE</th>
                            <th className="px-4 py-3 text-left w-[120px]">
                                <button type="button" onClick={() => handleSort('date')} className="inline-flex items-center gap-2">
                                    DATA
                                    {renderSortIndicator('date')}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-right w-[120px]">
                                <button type="button" onClick={() => handleSort('amount')} className="inline-flex items-center gap-2">
                                    IMPORTO
                                    {renderSortIndicator('amount')}
                                </button>
                            </th>
                            {showDocuments && <th className="px-4 py-3 text-center w-[100px]">DOCUMENTI</th>}
                            <th className="px-4 py-3 text-center w-[100px]">AZIONI</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedExpenses.flatMap((expense) => {
                            const sectorIdentifier = expense.sectorId || expense.lineItems?.[0]?.sectorId || null;
                            const sectorName = sectorMap.get(sectorIdentifier) || '—';
                            const hasInvoice = !!expense.invoicePdfUrl;
                            const hasContract = expense.isContractSatisfied;
                            const requiresContract = expense.requiresContract !== false;
                            const supplierName = supplierMap.get(expense.supplierId) || 'N/D';

                            // Get category name from expense line items
                            let categoryName = '—';
                            if (expense.lineItems && expense.lineItems.length > 0) {
                                const categoryIds = new Set();
                                expense.lineItems.forEach(item => {
                                    if (item.marketingChannelId) {
                                        const channel = marketingChannels.find(ch => ch.id === item.marketingChannelId);
                                        if (channel && channel.categoryId) {
                                            categoryIds.add(channel.categoryId);
                                        }
                                    }
                                });

                                if (categoryIds.size === 1) {
                                    const categoryId = Array.from(categoryIds)[0];
                                    const category = channelCategories.find(cat => cat.id === categoryId);
                                    categoryName = category ? category.name : '—';
                                } else if (categoryIds.size > 1) {
                                    categoryName = 'Categorie Multiple';
                                }
                            }

                            const segments = getBranchSegments(expense);
                            const filteredSegments = limitBranchId
                                ? segments.filter((segment) => (segment.branchId || 'unassigned') === limitBranchId)
                                : segments;

                            if (limitBranchId && filteredSegments.length === 0) {
                                return [];
                            }

                            return filteredSegments.map((segment, index) => {
                                const rowKey = segment.key || `${expense.id}-${index}`;
                                const branchLabel = segment.branchName ?? buildBranchName(expense);
                                const amountValue = segment.amount ?? expense.displayAmount ?? expense.amount ?? 0;
                                const isPrimaryRow = !splitByBranch || index === 0;

                                return (
                                    <tr key={rowKey} className="bg-white/85 hover:bg-orange-50/60 transition-colors">
                                        <td className="px-4 py-3">
                                            {isPrimaryRow ? (
                                                <p className="font-semibold text-slate-900 truncate max-w-[220px]">
                                                    {supplierName}
                                                </p>
                                            ) : (
                                                <div className="pl-8 text-xs font-semibold text-slate-400 uppercase tracking-[0.18em]">
                                                    ↳ {supplierName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            {isPrimaryRow ? (
                                                <p className="text-sm text-slate-600 truncate max-w-xs">
                                                    {categoryName}
                                                </p>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-400">Quota filiale</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden xl:table-cell text-sm text-slate-600">
                                            {sectorName}
                                        </td>
                                        <td className="px-4 py-3 hidden xl:table-cell text-sm text-slate-600">
                                            {branchLabel}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                                            {formatDate(expense.date)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                                            {formatCurrency(amountValue)}
                                        </td>
                                        {showDocuments && (
                                            <td className="px-4 py-3">
                                                {isPrimaryRow ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        {hasInvoice ? (
                                                            <a
                                                                href={expense.invoicePdfUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 text-orange-600 hover:border-orange-200 hover:bg-orange-50"
                                                                title="Apri fattura"
                                                            >
                                                                <FileText className="w-4 h-4" />
                                                            </a>
                                                        ) : (
                                                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300">
                                                                <FileText className="w-4 h-4" />
                                                            </span>
                                                        )}
                                                        {requiresContract && (
                                                            hasContract ? (
                                                                <a
                                                                    href={expense.contractPdfUrl || contractMap.get(expense.relatedContractId)?.contractPdfUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 text-orange-600 hover:border-orange-200 hover:bg-orange-50"
                                                                    title="Apri contratto"
                                                                >
                                                                    <FileSignature className="w-4 h-4" />
                                                                </a>
                                                            ) : (
                                                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300">
                                                                    <FileSignature className="w-4 h-4" />
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center">
                                                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-200">
                                                            —
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-4 py-3">
                                            {isPrimaryRow && canEditOrDelete(expense) ? (
                                                actionVariant === 'icon' ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        {onDuplicate && (
                                                            <button
                                                                onClick={() => onDuplicate(expense)}
                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-600 transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                                                                title="Duplica spesa"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => onEdit(expense)}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-600 transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                                                            title="Modifica spesa"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(expense)}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-600 transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                                                            title="Elimina spesa"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {onDuplicate && (
                                                            <button
                                                                onClick={() => onDuplicate(expense)}
                                                                className="inline-flex items-center gap-2 rounded-xl border border-orange-100 px-3 py-1 text-xs font-semibold text-orange-600 bg-white hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-all"
                                                                title="Duplica spesa"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                                Duplica
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => onEdit(expense)}
                                                            className="inline-flex items-center gap-2 rounded-xl border border-orange-100 px-3 py-1 text-xs font-semibold text-orange-600 bg-white hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-all"
                                                            title="Modifica spesa"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                            Modifica
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(expense)}
                                                            className="inline-flex items-center gap-2 rounded-xl border border-orange-100 px-3 py-1 text-xs font-semibold text-orange-600 bg-white hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-all"
                                                            title="Elimina spesa"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Elimina
                                                        </button>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="flex items-center justify-center h-9">
                                                    <span className="text-slate-200 text-xs font-semibold">{splitByBranch ? '—' : ''}</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

// ===== MAIN COMPONENT - EXPENSES PAGE =====
export default function ExpensesPage({
    user,
    initialFilters,
    costDomain = DEFAULT_COST_DOMAIN,
    domainConfigs = COST_DOMAINS,
}) {
    const location = useLocation();

    // Stati principali
    const [rawExpenses, setRawExpenses] = useState([]);
    const [branches, setBranches] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [marketingChannels, setMarketingChannels] = useState([]);
    const [channelCategories, setChannelCategories] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [geographicAreas, setGeographicAreas] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [sectorBudgets, setSectorBudgets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Stati UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);

    const { getToken } = useAuth();
    // Stati filtri
    const [searchTerm, setSearchTerm] = useState('');
    const [supplierFilter, setSupplierFilter] = useState([]);
    const [dateFilter, setDateFilter] = useState(() => ({
        startDate: getDefaultStartDate(),
        endDate: getDefaultEndDate()
    }));
    const [selectedSector, setSelectedSector] = useState('all');
    const [selectedBranch, setSelectedBranch] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [invoiceFilter, setInvoiceFilter] = useState('');
    const [contractFilter, setContractFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState([]);
    const [sortOrder, setSortOrder] = useState('date_desc');
    const [statusFilter, setStatusFilter] = useState('all');
    const [filterPresets, setFilterPresets] = useState(() => loadFilterPresets());
    const [presetName, setPresetName] = useState('');
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false);
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);

    const resolvedCostDomain = useMemo(
        () => (domainConfigs[costDomain] ? costDomain : DEFAULT_COST_DOMAIN),
        [costDomain, domainConfigs]
    );
    const currentDomainConfig = domainConfigs[resolvedCostDomain] || domainConfigs[DEFAULT_COST_DOMAIN];
    const isOperationsDomain = resolvedCostDomain === 'operations';
    const domainOptions = useMemo(
        () => Object.values(domainConfigs).map(config => ({ id: config.id, label: config.label })),
        [domainConfigs]
    );
    const canChangeDomain = user.role === 'admin' || user.role === 'manager';
    const heroBadge = currentDomainConfig?.shortLabel || 'Spese';
    const heroTitle = isOperationsDomain ? 'Controllo Costi Sedi' : 'Centro di Controllo Spese';
    const newExpenseLabel = isOperationsDomain ? 'Nuovo costo sede' : 'Nuova spesa';
    const heroDescription = useMemo(() => {
        const suffix = ' Salva preset per riutilizzarli rapidamente nelle altre sezioni.';
        if (currentDomainConfig?.description) {
            return `${currentDomainConfig.description}${suffix}`;
        }
        return 'Analizza e controlla le spese con gli stessi filtri condivisi della dashboard. Salva preset per riutilizzarli rapidamente nelle altre sezioni.';
    }, [currentDomainConfig]);

    // Debounce search per performance
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Map per lookup rapidi con memoizzazione aggressiva
    const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);
    const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
    const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
    const marketingChannelMap = useMemo(() => new Map(marketingChannels.map(mc => [mc.id, mc.name])), [marketingChannels]);
    const contractMap = useMemo(() => new Map(contracts.map(c => [c.id, c])), [contracts]);
    const defaultStartDate = useMemo(() => getDefaultStartDate(), []);
    const defaultEndDate = useMemo(() => getDefaultEndDate(), []);

    // Ordinamento settori
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

    // ID filiale "Generico" memoizzato
    const genericoBranchId = useMemo(() =>
        branches.find(b => b.name.toLowerCase() === 'generico')?.id,
        [branches]
    );

    // Cache filiali per settore
    const branchesPerSector = useMemo(() => {
        const cache = new Map();
        sectors.forEach(sector => {
            const sectorBranches = branches.filter(b =>
                b.associatedSectors?.includes(sector.id) &&
                b.id !== genericoBranchId
            );
            cache.set(sector.id, sectorBranches);
        });
        return cache;
    }, [sectors, branches, genericoBranchId]);

    const effectiveBranchFilter = useMemo(() => {
        const combined = new Set(branchFilter);
        if (selectedBranch !== 'all') {
            combined.add(selectedBranch);
        }
        return Array.from(combined);
    }, [branchFilter, selectedBranch]);

    const orderedBranches = useMemo(() => {
        return [...branches].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [branches]);

    // Budget per fornitore/settore
    const budgetInfoMap = useMemo(() => {
        const map = new Map();
        const currentYear = new Date().getFullYear();

        budgets.forEach(budget => {
            if (budget.year === currentYear && budget.allocations) {
                budget.allocations.forEach(allocation => {
                    const key = `${budget.supplierId}-${allocation.sectorId}`;
                    map.set(key, {
                        budget: allocation.budgetAmount || 0,
                        spent: 0
                    });
                });
            }
        });

        return map;
    }, [budgets]);

    // Inizializzazione filtri da props/location
    useEffect(() => {
        const filters = initialFilters || location.state;
        if (filters && Object.keys(filters).length > 0) {
            if (filters.branchFilter) {
                setBranchFilter(filters.branchFilter);
            }
        }
    }, [initialFilters, location.state]);

    const hasMounted = useRef(false);
    useEffect(() => {
        if (hasMounted.current) {
            persistFilterPresets(filterPresets);
        } else {
            hasMounted.current = true;
        }
    }, [filterPresets]);

    // Caricamento dati da Firebase


    // Caricamento dati da API

    const { mutate } = useSWRConfig();

    const fetcher = useCallback(async (url) => {
        const token = await getToken();
        if (!token) throw new Error("Token mancante");
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        return res.data;
    }, [getToken]);

    const { data: initialData, error: initialDataError } = useSWR('/api/data/initial-data', fetcher);
    const { data: expensesData, error: expensesError } = useSWR('/api/expenses', fetcher);

    // Sync state with SWR data
    useEffect(() => {
        if (initialData) {
            setSectors(initialData.sectors);
            setBranches(initialData.branches);
            setSuppliers(initialData.suppliers);
            setMarketingChannels(initialData.marketingChannels);
            setChannelCategories(initialData.channelCategories);
            setGeographicAreas(initialData.geographicAreas);
            setContracts(initialData.contracts);
            setBudgets(initialData.budgets);
            setSectorBudgets(initialData.sectorBudgets);
        }
        if (expensesData) {
            setRawExpenses(expensesData);
            setIsLoading(false);
        }
    }, [initialData, expensesData]);

    // Handle errors
    useEffect(() => {
        if (initialDataError || expensesError) {
            console.error("Error fetching data:", initialDataError || expensesError);
            toast.error(`Errore caricamento: ${initialDataError?.message || expensesError?.message}`);
            setIsLoading(false);
        }
    }, [initialDataError, expensesError]);

    // Handle refresh trigger
    useEffect(() => {
        if (refreshTrigger > 0) {
            mutate('/api/expenses');
            mutate('/api/data/initial-data');
        }
    }, [refreshTrigger, mutate]);

    const filteredExpenses = useMemo(() => {
        return rawExpenses.filter(expense => {
            const expenseDomain = expense.costDomain || DEFAULT_COST_DOMAIN;
            // Strict filtering: only show expenses that match the current domain
            return expenseDomain === resolvedCostDomain;
        });
    }, [rawExpenses, resolvedCostDomain]);

    // PROCESSAMENTO SPESE OTTIMIZZATO con memoizzazione aggressiva
    const processedExpenses = useMemo(() => {
        // 1. NORMALIZZAZIONE
        let normalized = filteredExpenses.map(expense => {
            // Normalizza IDs
            let supplierId = expense.supplierId || expense.supplierld || expense.channelId || expense.channelld;
            let sectorId = expense.sectorId || expense.sectorld;

            // Fallback sectorId from lineItems if missing on parent
            if (!sectorId && Array.isArray(expense.lineItems) && expense.lineItems.length > 0) {
                const firstItem = expense.lineItems[0];
                sectorId = firstItem.sectorId || firstItem.sectorld;
            }

            // Prepara lineItems
            let lineItems = [];
            if (Array.isArray(expense.lineItems) && expense.lineItems.length > 0) {
                lineItems = expense.lineItems.map((item, index) => {
                    const normalizedItem = {
                        ...item,
                        assignmentId: item.assignmentId || item.assignmentid || item.branchld || expense.branchId || expense.branchld || "",
                        assignmentType: item.assignmentType || item.assignmenttype,
                        marketingChannelId: item.marketingChannelId || item.marketingChannelld || "",
                        sectorId: item.sectorId || item.sectorld || sectorId,
                        amount: parseFloat(item.amount) || 0,
                        _key: `${expense.id}-${index}`
                    };
                    const assignedBranches = deriveBranchesForLineItem({
                        expense,
                        item: normalizedItem,
                        sectorId: normalizedItem.sectorId,
                        branchMap,
                        branchesPerSector
                    });
                    return {
                        ...normalizedItem,
                        assignedBranches,
                        branchNames: assignedBranches.length
                            ? assignedBranches.map(id => branchMap.get(id) || 'N/D').join(', ')
                            : 'N/D'
                    };
                });
            } else {
                const fallbackItem = {
                    description: expense.description || 'Voce principale',
                    amount: parseFloat(expense.amount) || 0,
                    marketingChannelId: expense.marketingChannelId || expense.marketingChannelld || "",
                    assignmentId: expense.branchId || expense.branchld || "",
                    sectorId: sectorId,
                    _key: `${expense.id}-0`
                };
                const assignedBranches = deriveBranchesForLineItem({
                    expense,
                    item: fallbackItem,
                    sectorId: fallbackItem.sectorId,
                    branchMap,
                    branchesPerSector
                });
                lineItems.push({
                    ...fallbackItem,
                    assignedBranches,
                    branchNames: assignedBranches.length
                        ? assignedBranches.map(id => branchMap.get(id) || 'N/D').join(', ')
                        : 'N/D'
                });
            }

            // Calcola totale
            const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
            const { branchTotals, itemTotals, itemBranchTotals } = computeExpenseBranchShares({
                expense,
                lineItems,
                branchMap,
                branchesPerSector,
                filterStartDate: dateFilter.startDate,
                filterEndDate: dateFilter.endDate,
                activeSectorId: selectedSector
            });

            const branchShares = Object.fromEntries(branchTotals);
            const lineItemsWithAllocation = lineItems.map(item => {
                const itemKey = item._key;
                const branchBreakdownMap = itemBranchTotals.get(itemKey) || new Map();
                return {
                    ...item,
                    amountInFilter: itemTotals.get(itemKey) ?? 0,
                    branchBreakdown: Object.fromEntries(branchBreakdownMap)
                };
            });

            // Processa lineItems per display
            const processedLineItems = [];
            const processedGroupIds = new Set();

            lineItemsWithAllocation.forEach(item => {
                if (item.splitGroupId && !processedGroupIds.has(item.splitGroupId)) {
                    const groupItems = lineItemsWithAllocation.filter(li => li.splitGroupId === item.splitGroupId);
                    const totalGroupAmount = groupItems.reduce((sum, gi) => sum + gi.amount, 0);
                    const totalGroupAllocated = groupItems.reduce((sum, gi) => sum + (gi.amountInFilter || 0), 0);
                    const uniqueBranchNames = new Set();
                    const combinedBreakdown = new Map();
                    groupItems.forEach(gi => {
                        (gi.assignedBranches || []).forEach(branchId => {
                            uniqueBranchNames.add(branchMap.get(branchId) || 'N/D');
                        });
                        Object.entries(gi.branchBreakdown || {}).forEach(([branchId, value]) => {
                            combinedBreakdown.set(branchId, (combinedBreakdown.get(branchId) || 0) + value);
                        });
                    });
                    const branchNames = uniqueBranchNames.size
                        ? Array.from(uniqueBranchNames).join(', ')
                        : 'N/D';

                    processedLineItems.push({
                        _key: item.splitGroupId,
                        isGroup: true,
                        description: item.description,
                        amount: totalGroupAmount,
                        amountInFilter: totalGroupAllocated,
                        displayAmount: totalGroupAmount,
                        marketingChannelId: item.marketingChannelId,
                        branchNames: branchNames,
                        branchCount: groupItems.length,
                        branchBreakdown: Object.fromEntries(combinedBreakdown)
                    });
                    processedGroupIds.add(item.splitGroupId);
                } else if (!item.splitGroupId) {
                    processedLineItems.push({
                        ...item,
                        displayAmount: item.amount,
                        branchCount: item.assignedBranches?.length || 0,
                        branchBreakdown: item.branchBreakdown || {}
                    });
                }
            });

            // Aggiungi info budget
            const budgetKey = `${supplierId}-${sectorId}`;
            const budgetInfo = budgetInfoMap.get(budgetKey);

            const hasTopLevelContract = !!expense.contractPdfUrl || !!expense.relatedContractId;
            const allLineItemsHaveContract = lineItems.length > 0 && lineItems.every(li => !!li.contractId || !!li.relatedContractId);
            const isContractSatisfied = hasTopLevelContract || allLineItemsHaveContract;

            return {
                ...expense,
                isContractSatisfied,
                supplierId,
                sectorId,
                amount: totalAmount,
                lineItems: lineItemsWithAllocation,
                processedLineItems,
                displayAmount: totalAmount,
                budgetInfo,
                requiresContract: expense.requiresContract !== undefined ? expense.requiresContract : true,
                branchShares
            };
        });

        // 2. FILTRAGGIO

        // Filtro per settore
        if (selectedSector !== 'all') {
            normalized = normalized.filter(exp => {
                // Check if any amount was allocated to this sector
                const totalAllocated = exp.lineItems.reduce((sum, item) => sum + (item.amountInFilter || 0), 0);
                return totalAllocated > 0;
            });
        }

        // Filtro per categoria
        if (selectedCategory !== 'all') {
            normalized = normalized.filter(exp => {
                // Get category from marketing channel
                if (exp.lineItems && exp.lineItems.length > 0) {
                    return exp.lineItems.some(item => {
                        const channel = marketingChannels.find(ch => ch.id === item.marketingChannelId);
                        return channel && channel.categoryId === selectedCategory;
                    });
                }
                return false;
            });
        }

        // Filtro per fornitore (multi-selezione)
        if (supplierFilter.length > 0) {
            normalized = normalized.filter(exp => supplierFilter.includes(exp.supplierId));
        }

        // Filtro per date
        if (dateFilter.startDate && dateFilter.endDate) {
            const start = new Date(dateFilter.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(dateFilter.endDate);
            end.setHours(23, 59, 59, 999);

            normalized = normalized.filter(exp => {
                const expDate = exp.date ? new Date(exp.date) : null;
                return expDate && expDate >= start && expDate <= end;
            });
        }

        // Filtro stato
        if (statusFilter === 'complete') {
            normalized = normalized.filter(exp => {
                const requiresContract = exp.requiresContract !== false;
                return exp.invoicePdfUrl && (!requiresContract || exp.contractPdfUrl || exp.relatedContractId);
            });
        } else if (statusFilter === 'incomplete') {
            normalized = normalized.filter(exp => {
                const requiresContract = exp.requiresContract !== false;
                return !exp.invoicePdfUrl || (requiresContract && !exp.isContractSatisfied);
            });
        } else if (statusFilter === 'amortized') {
            normalized = normalized.filter(exp => exp.isAmortized);
        }

        // Altri filtri esistenti...
        if (invoiceFilter === 'present') {
            normalized = normalized.filter(exp => !!exp.invoicePdfUrl);
        } else if (invoiceFilter === 'missing') {
            normalized = normalized.filter(exp => !exp.invoicePdfUrl);
        }

        if (contractFilter === 'present') {
            normalized = normalized.filter(exp => !!exp.contractPdfUrl || !!exp.relatedContractId);
        } else if (contractFilter === 'missing') {
            normalized = normalized.filter(exp => !exp.contractPdfUrl && !exp.relatedContractId);
        }

        // Filtro filiale con calcolo distribuito
        if (effectiveBranchFilter.length > 0) {
            normalized = normalized.filter(exp => {
                return effectiveBranchFilter.some(branchId => (exp.branchShares?.[branchId] || 0) > 0);
            });

            const isSingleBranchFilter = effectiveBranchFilter.length === 1;

            normalized = normalized.map(exp => {
                const shares = exp.branchShares || {};
                const processedItems = exp.processedLineItems || [];

                let displayAmount = 0;
                const distributedDetails = [];
                let hasDistributedAmount = false;

                let filteredLineItems = [];

                if (isSingleBranchFilter) {
                    const branchId = effectiveBranchFilter[0];
                    const branchShareTotal = shares[branchId] || 0;
                    displayAmount = branchShareTotal;

                    filteredLineItems = processedItems
                        .map(item => {
                            const branchBreakdown = item.branchBreakdown || {};
                            const branchShare = branchBreakdown[branchId] || 0;
                            if (branchShare <= 0) {
                                return null;
                            }

                            const totalItemAmount = item.amountInFilter ?? item.amount ?? 0;

                            const otherBranches = Math.max(0, Object.keys(branchBreakdown).length - 1);
                            if (otherBranches > 0) {
                                hasDistributedAmount = true;
                                const othersLabel = otherBranches === 1
                                    ? '1 altra filiale'
                                    : `${otherBranches} altre filiali`;
                                distributedDetails.push(`${formatCurrency(branchShare)} assegnati a questa filiale su ${formatCurrency(totalItemAmount)} totali (condivisa con ${othersLabel})`);
                            }

                            return {
                                ...item,
                                displayAmount: branchShare,
                                filteredAmount: branchShare,
                                branchShare
                            };
                        })
                        .filter(Boolean);
                } else {
                    displayAmount = effectiveBranchFilter.reduce(
                        (sum, branchId) => sum + (shares[branchId] || 0),
                        0
                    );

                    filteredLineItems = processedItems
                        .map(item => {
                            const branchBreakdown = item.branchBreakdown || {};
                            const filteredAmount = effectiveBranchFilter.reduce(
                                (sum, branchId) => sum + (branchBreakdown[branchId] || 0),
                                0
                            );

                            if ((item.assignedBranches || []).length > 1 && filteredAmount > 0) {
                                hasDistributedAmount = true;
                                distributedDetails.push(
                                    `${formatCurrency(filteredAmount)} totale sulle filiali selezionate (voce condivisa)`
                                );
                            }

                            return {
                                ...item,
                                displayAmount: filteredAmount,
                                filteredAmount
                            };
                        })
                        .filter(item => (item.filteredAmount || 0) > 0.00001);
                }

                const uniqueDetails = distributedDetails.length > 0
                    ? Array.from(new Set(distributedDetails))
                    : [];

                return {
                    ...exp,
                    displayAmount,
                    hasDistributedAmount,
                    distributedInfo: hasDistributedAmount ? { details: uniqueDetails.join(' + ') } : null,
                    processedLineItems: filteredLineItems
                };
            });
        }

        // Debug: log branch allocations when a single branch filter is active
        if (effectiveBranchFilter.length === 1) {
            const branchId = effectiveBranchFilter[0];
            const branchName = branchMap.get(branchId) || branchId;
            console.table(normalized
                .filter(exp => (exp.branchShares?.[branchId] || 0) > 0)
                .map(exp => ({
                    id: exp.id,
                    supplier: supplierMap.get(exp.supplierId) || 'N/D',
                    amount: exp.amount,
                    displayAmount: exp.displayAmount,
                    branchShare: exp.branchShares?.[branchId] || 0,
                    lineItems: (exp.lineItems || []).length,
                    breakdown: exp.lineItems?.map(item => item.branchBreakdown?.[branchId] || 0).join(', ')
                }))
                , [`Filiale: ${branchName}`]);
        }

        // Filtro ricerca testuale con debounce
        if (debouncedSearchTerm.trim()) {
            const lowerSearch = debouncedSearchTerm.toLowerCase();
            normalized = normalized.filter(exp => {
                const supplierName = supplierMap.get(exp.supplierId) || '';
                const channelNames = exp.lineItems?.map(item =>
                    marketingChannelMap.get(item.marketingChannelId) || ''
                ).join(' ');

                return exp.description?.toLowerCase().includes(lowerSearch) ||
                    supplierName.toLowerCase().includes(lowerSearch) ||
                    channelNames?.toLowerCase().includes(lowerSearch) ||
                    exp.lineItems?.some(item => item.description?.toLowerCase().includes(lowerSearch));
            });
        }

        // 3. ORDINAMENTO
        normalized.sort((a, b) => {
            switch (sortOrder) {
                case 'amount_desc':
                    return b.displayAmount - a.displayAmount;
                case 'amount_asc':
                    return a.displayAmount - b.displayAmount;
                case 'date_desc':
                    return new Date(b.date || 0) - new Date(a.date || 0);
                case 'date_asc':
                    return new Date(a.date || 0) - new Date(b.date || 0);
                case 'name_asc':
                    return (supplierMap.get(a.supplierId) || '').localeCompare(supplierMap.get(b.supplierId) || '');
                case 'name_desc':
                    return (supplierMap.get(b.supplierId) || '').localeCompare(supplierMap.get(a.supplierId) || '');
                default:
                    return 0;
            }
        });

        return normalized;
    }, [
        filteredExpenses,
        selectedSector,
        selectedCategory,
        supplierFilter,
        dateFilter,
        statusFilter,
        invoiceFilter,
        contractFilter,
        effectiveBranchFilter,
        debouncedSearchTerm,
        sortOrder,
        supplierMap,
        marketingChannelMap,
        marketingChannels,
        branchMap,
        branchesPerSector,
        budgetInfoMap
    ]);

    const expenseAlerts = useMemo(() => {
        if (isOperationsDomain) return [];
        if (processedExpenses.length === 0) return [];

        const alerts = [];

        const missingInvoices = processedExpenses.filter(exp => !exp.invoicePdfUrl);
        if (missingInvoices.length > 0) {
            const totalMissingInvoice = missingInvoices.reduce((sum, exp) => sum + (exp.displayAmount || exp.amount || 0), 0);
            alerts.push({
                key: 'missingInvoices',
                type: 'critical',
                title: `${missingInvoices.length} spese senza fattura`,
                description: 'Carica la documentazione fiscale per completare il ciclo di approvazione.',
                totalLabel: 'Importo senza fattura',
                totalAmount: totalMissingInvoice,
                items: missingInvoices
                    .sort((a, b) => (b.displayAmount || b.amount || 0) - (a.displayAmount || a.amount || 0))
                    .slice(0, 6)
                    .map(exp => ({
                        id: exp.id,
                        name: supplierMap.get(exp.supplierId) || exp.description || 'N/D',
                        amount: exp.displayAmount || exp.amount || 0,
                        subtitle: formatDate(exp.date)
                    }))
            });
        }

        const contractIssues = processedExpenses.filter(exp => {
            const requiresContract = exp.requiresContract !== false;
            return requiresContract && !exp.isContractSatisfied;
        });
        if (contractIssues.length > 0) {
            const totalContractIssues = contractIssues.reduce((sum, exp) => sum + (exp.displayAmount || exp.amount || 0), 0);
            alerts.push({
                key: 'contractIssues',
                type: 'warning',
                title: `${contractIssues.length} spese con contratto mancante`,
                description: 'Collega un contratto valido per completare la rendicontazione.',
                totalLabel: 'Importo non coperto da contratto',
                totalAmount: totalContractIssues,
                items: contractIssues
                    .sort((a, b) => (b.displayAmount || b.amount || 0) - (a.displayAmount || a.amount || 0))
                    .slice(0, 6)
                    .map(exp => ({
                        id: exp.id,
                        name: supplierMap.get(exp.supplierId) || exp.description || 'N/D',
                        amount: exp.displayAmount || exp.amount || 0,
                        subtitle: formatDate(exp.date)
                    }))
            });
        }

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            const searchResults = processedExpenses.filter(exp => {
                const supplierName = supplierMap.get(exp.supplierId)?.toLowerCase() || '';
                const description = exp.description?.toLowerCase() || '';
                return supplierName.includes(lowerTerm) || description.includes(lowerTerm);
            });

            if (searchResults.length > 0) {
                alerts.push({
                    key: 'searchResults',
                    type: 'info',
                    title: `Risultati ricerca: ${searchResults.length} spese`,
                    description: `Hai cercato "${searchTerm}"`,
                    totalLabel: 'Totale ricerca',
                    totalAmount: searchResults.reduce((sum, exp) => sum + (exp.displayAmount || exp.amount || 0), 0),
                    items: searchResults
                        .slice(0, 6)
                        .map(exp => ({
                            id: exp.id,
                            name: supplierMap.get(exp.supplierId) || exp.description || 'N/D',
                            amount: exp.displayAmount || exp.amount || 0,
                            subtitle: formatDate(exp.date)
                        }))
                });
            }
        }
        const unassignedBranchExpenses = processedExpenses.filter(exp => {
            const lineItems = exp.lineItems || [];
            if (lineItems.length > 0) {
                return lineItems.some(item => !item.assignedBranches || item.assignedBranches.length === 0);
            }
            return !exp.branchId || !branchMap.has(exp.branchId);
        });
        if (unassignedBranchExpenses.length > 0) {
            const totalUnassigned = unassignedBranchExpenses.reduce((sum, exp) => sum + (exp.displayAmount || exp.amount || 0), 0);
            alerts.push({
                key: 'unassignedBranches',
                type: 'info',
                title: `${unassignedBranchExpenses.length} spese senza filiale associata`,
                description: 'Completa l’assegnazione per migliorare il controllo per territorio.',
                totalLabel: 'Importo senza filiale',
                totalAmount: totalUnassigned,
                items: unassignedBranchExpenses
                    .sort((a, b) => (b.displayAmount || b.amount || 0) - (a.displayAmount || a.amount || 0))
                    .slice(0, 6)
                    .map(exp => ({
                        id: exp.id,
                        name: supplierMap.get(exp.supplierId) || exp.description || 'N/D',
                        amount: exp.displayAmount || exp.amount || 0,
                        subtitle: formatDate(exp.date)
                    }))
            });
        }

        return alerts;
    }, [isOperationsDomain, processedExpenses, supplierMap, branchMap]);

    const notificationCount = expenseAlerts.length;
    const totalNotificationsAmount = useMemo(
        () => expenseAlerts.reduce((sum, alert) => sum + (alert.totalAmount || 0), 0),
        [expenseAlerts]
    );

    useEffect(() => {
        if (notificationCount === 0 && isNotificationsPanelOpen) {
            setIsNotificationsPanelOpen(false);
        }
    }, [notificationCount, isNotificationsPanelOpen]);

    // Calcolo KPI ottimizzato
    const kpiData = useMemo(() => {
        const total = processedExpenses.length;
        const totalSpend = effectiveBranchFilter.length > 0
            ? processedExpenses.reduce((sum, exp) => sum + (exp.displayAmount || 0), 0)
            : processedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        const withInvoice = processedExpenses.filter(exp => exp.invoicePdfUrl).length;
        const withContract = processedExpenses.filter(exp => exp.contractPdfUrl || exp.relatedContractId).length;
        const complete = processedExpenses.filter(exp => {
            const requiresContract = exp.requiresContract !== false;
            return exp.invoicePdfUrl && (!requiresContract || exp.isContractSatisfied);
        }).length;
        const incomplete = processedExpenses.filter(exp => {
            const requiresContract = exp.requiresContract !== false;
            return !exp.invoicePdfUrl || (requiresContract && !exp.isContractSatisfied);
        }).length;

        // Calcola budget totale per spese visualizzate
        let totalBudget = 0;
        if (selectedSector === 'all') {
            totalBudget = sectorBudgets.reduce((sum, sb) => sum + (sb.amount || 0), 0);
        } else {
            const sectorBudget = sectorBudgets.find(sb => sb.sectorId === selectedSector);
            totalBudget = sectorBudget?.amount || 0;
        }

        const budgetUtilization = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

        return {
            totalExpenses: total,
            totalSpend,
            totalBudget,
            budgetUtilization,
            withInvoicePercentage: total > 0 ? ((withInvoice / total) * 100).toFixed(1) : 0,
            withContractPercentage: total > 0 ? ((withContract / total) * 100).toFixed(1) : 0,
            complete,
            completePercentage: total > 0 ? ((complete / total) * 100).toFixed(1) : 0,
            incomplete
        };
    }, [processedExpenses, effectiveBranchFilter, sectorBudgets, selectedSector]);


    // Callbacks ottimizzati

    const operationsBranchSummary = useMemo(() => {
        if (!isOperationsDomain) return [];
        const totals = new Map();

        processedExpenses.forEach(exp => {
            const shares = exp.branchShares || {};
            const entries = Object.entries(shares);
            if (entries.length > 0) {
                entries.forEach(([branchId, value]) => {
                    totals.set(branchId, (totals.get(branchId) || 0) + value);
                });
            } else {
                const fallbackBranch = exp.branchId || exp.branchld || 'unassigned';
                const amount = exp.displayAmount || exp.amount || 0;
                totals.set(fallbackBranch, (totals.get(fallbackBranch) || 0) + amount);
            }
        });

        return Array.from(totals.entries())
            .map(([branchId, amount]) => ({
                branchId,
                name: branchMap.get(branchId) || (branchId === 'unassigned' ? 'Non assegnata' : 'Filiale non assegnata'),
                amount,
            }))
            .sort((a, b) => b.amount - a.amount);
    }, [isOperationsDomain, processedExpenses, branchMap]);

    const operationsTotalSpend = useMemo(() => {
        if (!isOperationsDomain) return 0;
        return operationsBranchSummary.reduce((sum, item) => sum + (item.amount || 0), 0);
    }, [isOperationsDomain, operationsBranchSummary]);

    const operationsAveragePerBranch = useMemo(() => {
        if (!isOperationsDomain || operationsBranchSummary.length === 0) return 0;
        return operationsTotalSpend / operationsBranchSummary.length;
    }, [isOperationsDomain, operationsTotalSpend, operationsBranchSummary]);

    const selectedOperationsYear = useMemo(() => {
        if (!isOperationsDomain) return new Date().getFullYear();
        if (dateFilter?.startDate) {
            const year = new Date(`${dateFilter.startDate}T00:00:00`).getFullYear();
            if (!Number.isNaN(year)) return year;
        }
        if (dateFilter?.endDate) {
            const year = new Date(`${dateFilter.endDate}T00:00:00`).getFullYear();
            if (!Number.isNaN(year)) return year;
        }
        return new Date().getFullYear();
    }, [isOperationsDomain, dateFilter?.startDate, dateFilter?.endDate]);

    const operationsTopBranches = useMemo(
        () => (isOperationsDomain ? operationsBranchSummary.slice(0, 4) : []),
        [isOperationsDomain, operationsBranchSummary]
    );

    const operationsTopBranchKeys = useMemo(
        () =>
            operationsTopBranches.map((branch, index) => ({
                id: branch.branchId || `branch-${index}`,
                key: branch.branchId || 'unassigned',
                name: branch.name,
                color: branchColorPalette[index % branchColorPalette.length],
            })),
        [operationsTopBranches]
    );

    const operationsMonthlyBranchData = useMemo(() => {
        if (!isOperationsDomain || operationsTopBranchKeys.length === 0) return [];

        const monthBase = MONTHS.map((month) => {
            const entry = {
                monthId: month.id,
                monthLabel: month.label.slice(0, 3),
            };
            operationsTopBranchKeys.forEach((branch) => {
                entry[branch.key] = 0;
            });
            return entry;
        });

        const monthMap = new Map(monthBase.map((entry) => [entry.monthId, entry]));
        const branchKeySet = new Set(operationsTopBranchKeys.map((branch) => branch.key));

        processedExpenses.forEach((expense) => {
            if (!expense.date) return;
            const expenseDate = new Date(expense.date);
            if (Number.isNaN(expenseDate.getTime())) return;
            if (expenseDate.getFullYear() !== selectedOperationsYear) return;
            const monthId = String(expenseDate.getMonth() + 1).padStart(2, '0');
            const entry = monthMap.get(monthId);
            if (!entry) return;

            const shares = expense.branchShares;
            let handled = false;
            if (shares && typeof shares === 'object') {
                Object.entries(shares).forEach(([branchId, amount]) => {
                    const key = branchId || 'unassigned';
                    if (branchKeySet.has(key)) {
                        entry[key] += amount || 0;
                        handled = true;
                    }
                });
            }
            if (!handled) {
                const fallbackKey = expense.branchId || 'unassigned';
                if (branchKeySet.has(fallbackKey)) {
                    entry[fallbackKey] += expense.displayAmount || expense.amount || 0;
                }
            }
        });

        monthBase.forEach((entry) => {
            let topBranchKey = null;
            operationsTopBranchKeys.forEach((branch) => {
                if ((entry[branch.key] || 0) > 0) {
                    topBranchKey = branch.key;
                }
            });
            entry.topBranchKey = topBranchKey;
        });

        return monthBase;
    }, [isOperationsDomain, operationsTopBranchKeys, processedExpenses, selectedOperationsYear]);

    const hasOperationsMonthlyData = useMemo(
        () =>
            operationsMonthlyBranchData.some((entry) =>
                operationsTopBranchKeys.some((branch) => (entry[branch.key] || 0) > 0)
            ),
        [operationsMonthlyBranchData, operationsTopBranchKeys]
    );

    const operationsBranchDonutData = useMemo(() => {
        if (!isOperationsDomain) return [];
        return operationsBranchSummary.map((branch, index) => ({
            id: branch.branchId || `branch-${index}`,
            name: branch.name,
            value: branch.amount || 0,
            color: branchColorPalette[index % branchColorPalette.length],
        }));
    }, [isOperationsDomain, operationsBranchSummary]);

    const operationsBranchDonutSummary = useMemo(
        () => operationsBranchDonutData.slice(0, 4),
        [operationsBranchDonutData]
    );

    const hasOperationsDonutData = useMemo(
        () => operationsBranchDonutData.some((entry) => entry.value > 0),
        [operationsBranchDonutData]
    );

    const renderOperationsMonthlyTooltip = useCallback(
        ({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const monthId = payload[0]?.payload?.monthId;
            const monthLabelRaw = payload[0]?.payload?.monthLabel;
            const monthEntry = monthId
                ? MONTHS.find((month) => month.id === monthId)
                : MONTHS.find((month) => month.label.startsWith(monthLabelRaw || ''));
            const title = monthEntry ? monthEntry.label : monthLabelRaw || 'Mese';

            const rows = payload
                .map((item) => {
                    if (!item || Number(item.value) <= 0) return null;
                    const branchMeta = operationsTopBranchKeys.find((branch) => branch.key === item.dataKey);
                    if (!branchMeta) return null;
                    return {
                        id: branchMeta.key,
                        name: branchMeta.name,
                        value: item.value,
                        color: branchMeta.color,
                    };
                })
                .filter(Boolean);

            if (rows.length === 0) return null;

            return (
                <div className={getTooltipContainerClass('indigo')}>
                    <p className="text-sm font-bold text-slate-900">{title}</p>
                    <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                        {rows.map((row) => (
                            <div key={row.id} className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-2 text-slate-600">
                                    <span
                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: row.color }}
                                    />
                                    {row.name}
                                </span>
                                <span>{formatCurrency(row.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        },
        [operationsTopBranchKeys]
    );

    const renderBranchDonutTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const entry = payload[0]?.payload;
        if (!entry) return null;

        return (
            <div className={getTooltipContainerClass('indigo')}>
                <p className="text-sm font-bold text-slate-900">{entry.name || 'Filiale'}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                    Totale {selectedOperationsYear}
                </p>
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.value || 0)}</p>
            </div>
        );
    }, [selectedOperationsYear]);

    const operationsBranchSections = useMemo(() => {
        if (!isOperationsDomain) return [];

        return TARGET_BRANCH_NAMES.map((label) => {
            const normalizedLabel = normalizeBranchLabel(label);

            const branchMeta =
                branches.find(
                    (branch) => normalizeBranchLabel(branch.name || '') === normalizedLabel
                ) || null;

            const summary = branchMeta
                ? operationsBranchSummary.find((item) => item.branchId === branchMeta.id)
                : operationsBranchSummary.find(
                    (item) => normalizeBranchLabel(item.name || '') === normalizedLabel
                );

            if (!summary) {
                if (!branchMeta?.id) return null;
                return {
                    branchId: branchMeta.id,
                    key: branchMeta.id,
                    name: branchMeta.name || label,
                    displayName: (branchMeta.name || label)
                        .replace(/^filiale\s*-\s*/i, '')
                        .replace(/^filiale\s*/i, ''),
                    totalAmount: 0,
                };
            }

            const displayName = (summary.name || label)
                .replace(/^filiale\s*-\s*/i, '')
                .replace(/^filiale\s*/i, '');

            return {
                branchId: summary.branchId,
                key: summary.branchId,
                name: summary.name || branchMeta?.name || label,
                displayName,
                totalAmount: summary.amount || 0,
            };
        }).filter(Boolean);
    }, [isOperationsDomain, branches, operationsBranchSummary]);


    const canEditOrDelete = useCallback((expense) => {
        return user.role === 'manager' || user.role === 'admin' || expense.authorId === user.uid;
    }, [user.role, user.uid]);

    const handleOpenAddModal = useCallback(() => {
        setEditingExpense(null);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingExpense(null);
    }, []);

    const handleOpenEditModal = useCallback((expense) => {
        if (!canEditOrDelete(expense)) {
            return toast.error("Non hai i permessi per modificare questa spesa.");
        }
        setEditingExpense(expense);
        setIsModalOpen(true);
    }, [canEditOrDelete]);

    const handleSaveExpense = useCallback(async (expenseData, invoiceFileArg, contractFileArg) => {
        const isEditing = !!expenseData.id;
        const toastId = toast.loading(isEditing ? 'Aggiornamento...' : 'Salvataggio...');
        const effectiveInvoiceFile = invoiceFileArg || expenseData?.invoiceFile || null;
        const effectiveContractFile = contractFileArg || expenseData?.contractFile || null;

        try {
            // Generate UUID for new expenses to use in storage path
            const expenseId = isEditing ? expenseData.id : crypto.randomUUID();
            let invoiceURL = expenseData.invoicePdfUrl || "";
            let contractURL = expenseData.contractPdfUrl || "";

            if (effectiveInvoiceFile) {
                const formData = new FormData();
                formData.append('file', effectiveInvoiceFile);
                const token = await getToken();
                const uploadRes = await axios.post('/api/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });
                invoiceURL = uploadRes.data.url;
            }

            if (effectiveContractFile) {
                const formData = new FormData();
                formData.append('file', effectiveContractFile);
                const token = await getToken();
                const uploadRes = await axios.post('/api/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });
                contractURL = uploadRes.data.url;
            }

            const safeLineItems = (expenseData.lineItems || []).map(item => ({
                ...item,
                amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
            }));

            const primarySectorId =
                expenseData.sectorId ||
                safeLineItems.find(item => item.sectorId)?.sectorId ||
                null;

            const dataToSave = {
                id: expenseId, // Send ID for creation if we want to enforce it, or let server handle it (but we used it for storage)
                // Note: Server createExpense might ignore ID if it auto-generates, but we need it for storage consistency.
                // If server auto-generates, we might have a mismatch if we don't send it.
                // My Prisma schema says @default(uuid()), so it auto-generates if not provided.
                // But I can provide it.
                date: expenseData.date,
                description: expenseData.description,
                sectorId: primarySectorId,
                supplierId: expenseData.supplierId,
                totalAmount: safeLineItems.reduce((sum, item) => sum + (item.amount || 0), 0),
                lineItems: safeLineItems,
                invoicePdfUrl: invoiceURL,
                contractPdfUrl: contractURL,
                relatedContractId: expenseData.relatedContractId || null,
                requiresContract: expenseData.requiresContract !== undefined ? expenseData.requiresContract : true,
                isAmortized: expenseData.isAmortized || false,
                amortizationStartDate: expenseData.isAmortized ? expenseData.amortizationStartDate : null,
                amortizationEndDate: expenseData.isAmortized ? expenseData.amortizationEndDate : null,
                costDomain: expenseData.costDomain || resolvedCostDomain,
            };

            const token = await getToken();
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            if (isEditing) {
                await axios.put(`/api/expenses/${expenseId}`, dataToSave, { headers });
            } else {
                await axios.post('/api/expenses', dataToSave, { headers });
            }

            toast.success(isEditing ? 'Spesa aggiornata!' : 'Spesa creata!', { id: toastId });
            handleCloseModal();

            // Trigger refresh? The useEffect will not auto-trigger unless we add a refresh trigger.
            // I should probably add a refresh function to the context or just reload the page for now, 
            // or better, re-fetch data.
            // I'll add a simple window.location.reload() for now or just re-fetch if I can access the fetch function.
            // Since fetchData is inside useEffect, I can't call it.
            // I will add a dependency to useEffect to trigger refresh.
            // For now, I'll just reload the page to be safe and simple.
            setRefreshTrigger(prev => prev + 1);

        } catch (error) {
            console.error("Errore nel salvare la spesa:", error);
            toast.error(error.message || 'Errore imprevisto.', { id: toastId });
        }
    }, [getToken, handleCloseModal, resolvedCostDomain]);

    const handleDeleteExpense = useCallback(async (expense) => {
        if (!canEditOrDelete(expense)) {
            return toast.error("Non hai i permessi per eliminare questa spesa.");
        }

        if (!window.confirm(`Sei sicuro di voler eliminare la spesa "${expense.description}"?`)) return;

        const toastId = toast.loading("Eliminazione in corso...");

        try {
            if (expense.invoicePdfUrl) {
                const fileRef = ref(storage, expense.invoicePdfUrl);
                await deleteObject(fileRef).catch(err => console.warn("File non trovato:", err));
            }

            if (expense.contractPdfUrl) {
                const fileRef = ref(storage, expense.contractPdfUrl);
                await deleteObject(fileRef).catch(err => console.warn("File non trovato:", err));
            }



            const token = await getToken();
            await axios.delete(`/api/expenses/${expense.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            toast.success("Spesa eliminata!", { id: toastId });
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Errore durante l'eliminazione della spesa:", error);
            toast.error("Errore durante l'eliminazione.", { id: toastId });
        }
    }, [canEditOrDelete]);

    const handleDuplicateExpense = useCallback((expense) => {
        const {
            id: _ID,
            invoicePdfUrl: _INVOICE_PDF_URL,
            contractPdfUrl: _CONTRACT_PDF_URL,
            createdAt: _CREATED_AT,
            updatedAt: _UPDATED_AT,
            authorId: _AUTHOR_ID,
            authorName: _AUTHOR_NAME,
            ...rest
        } = expense;
        setEditingExpense({
            ...rest,
            description: `${expense.description || ''} (Copia)`,
            date: new Date().toISOString().split('T')[0]
        });
        setIsModalOpen(true);
    }, []);

    const savePreset = useCallback(() => {
        const name = presetName.trim();
        if (!name) {
            toast.error('Inserisci un nome per il preset');
            return;
        }
        const preset = {
            id: Date.now(),
            name,
            startDate: dateFilter.startDate,
            endDate: dateFilter.endDate,
            selectedSector,
            selectedBranch,
            selectedCategory,
            supplierFilter,
            branchFilter,
            statusFilter,
            invoiceFilter,
            contractFilter,
            sortOrder
        };
        setFilterPresets(prev => {
            const withoutDuplicates = prev.filter(p => p.name.toLowerCase() !== name.toLowerCase());
            return [...withoutDuplicates, preset];
        });
        setPresetName('');
        toast.success('Preset salvato');
    }, [presetName, dateFilter.startDate, dateFilter.endDate, selectedSector, selectedBranch, selectedCategory, supplierFilter, branchFilter, statusFilter, invoiceFilter, contractFilter, sortOrder]);

    const applyPreset = useCallback((preset) => {
        // Handle predefined presets (with getFilter function)
        if (preset.isPredefined && preset.getFilter) {
            const dateRange = preset.getFilter();
            setDateFilter({
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            });
            toast.success(`Filtro \"${preset.name}\" applicato`);
            return;
        }

        // Handle custom saved presets
        setDateFilter({
            startDate: preset.startDate || getDefaultStartDate(),
            endDate: preset.endDate || getDefaultEndDate()
        });
        if (Array.isArray(preset.supplierFilter)) {
            setSupplierFilter(preset.supplierFilter);
        }
        if (Array.isArray(preset.branchFilter)) {
            setBranchFilter(preset.branchFilter);
        }
        setSelectedSector(preset.selectedSector || 'all');
        setSelectedBranch(preset.selectedBranch || 'all');
        setSelectedCategory(preset.selectedCategory || 'all');
        setInvoiceFilter(preset.invoiceFilter || '');
        setContractFilter(preset.contractFilter || '');
        setSortOrder(preset.sortOrder || 'date_desc');
        setStatusFilter(preset.statusFilter || 'all');
        toast.success(`Preset \"${preset.name}\" applicato`);
    }, [getDefaultStartDate, getDefaultEndDate]);

    const deletePreset = useCallback((id) => {
        setFilterPresets(prev => prev.filter(p => p.id !== id));
        toast.success('Preset eliminato');
    }, []);

    const resetFilters = useCallback(() => {
        setSearchTerm('');
        setSupplierFilter([]);
        setDateFilter({ startDate: defaultStartDate, endDate: defaultEndDate });
        setSelectedSector('all');
        setSelectedBranch('all');
        setInvoiceFilter('');
        setContractFilter('');
        setBranchFilter([]);
        setStatusFilter('all');
        setSortOrder('date_desc');
        setPresetName('');
        setIsPresetPanelOpen(false);
        setIsDateDropdownOpen(false);
        setIsAdvancedPanelOpen(false);
        setIsNotificationsPanelOpen(false);
        toast.success("Filtri resettati!");
    }, [defaultStartDate, defaultEndDate]);



    // Check filtri attivi
    const hasCustomDateRange = Boolean(
        (dateFilter.startDate && dateFilter.startDate !== defaultStartDate) ||
        (dateFilter.endDate && dateFilter.endDate !== defaultEndDate)
    );

    const hasActiveFilters = Boolean(
        (searchTerm && searchTerm.trim().length > 0) ||
        supplierFilter.length > 0 ||
        hasCustomDateRange ||
        selectedSector !== 'all' ||
        selectedBranch !== 'all' ||
        invoiceFilter ||
        contractFilter ||
        branchFilter.length > 0 ||
        statusFilter !== 'all' ||
        sortOrder !== 'date_desc'
    );

    const nonOperationsTrendData = buildNonOperationsTrendData({
        processedExpenses,
        selectedYear: selectedOperationsYear,
        isOperationsDomain,
        branchMap,
        sectorMap,
        selectedBranch,
    });
    const nonOpsSectorTotal = useMemo(
        () => nonOperationsTrendData.sectorSplitData.reduce((sum, entry) => sum + (entry.value || 0), 0),
        [nonOperationsTrendData.sectorSplitData]
    );
    const renderNonOpsMonthlyTooltip = useCallback(
        ({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const dataPoint = payload[0]?.payload;
            const monthId = dataPoint?.monthId;
            const monthLabelRaw = dataPoint?.monthLabel;
            const monthEntry = monthId
                ? MONTHS.find((month) => month.id === monthId)
                : MONTHS.find((month) => month.label.startsWith(monthLabelRaw || ''));
            const title = monthEntry ? monthEntry.label : monthLabelRaw || 'Mese';

            const rows = payload
                .map((item) => {
                    if (!item || Number(item.value) <= 0) return null;
                    const branchMeta = nonOperationsTrendData.monthlyBranchKeys.find(
                        (branch) => branch.key === item.dataKey
                    );
                    if (!branchMeta) return null;
                    return {
                        id: branchMeta.key,
                        name: branchMeta.name,
                        value: item.value,
                        color: branchMeta.color,
                        isOthers: branchMeta.isOthers,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => (b.value || 0) - (a.value || 0));

            if (rows.length === 0) return null;

            return (
                <div className={getTooltipContainerClass('orange')}>
                    <p className="text-sm font-bold text-slate-900">{title}</p>
                    <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                        {rows.map((row) => (
                            <div key={row.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-6">
                                    <span className="flex items-center gap-2 text-slate-600">
                                        <span
                                            className="inline-block h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: row.color }}
                                        />
                                        {row.name}
                                    </span>
                                    <span>{formatCurrency(row.value)}</span>
                                </div>
                                {row.isOthers && dataPoint?.othersBreakdown?.length > 0 && (
                                    <div className="space-y-0.5 pl-4 text-[11px] font-medium text-slate-500">
                                        {dataPoint.othersBreakdown.slice(0, 4).map((child) => (
                                            <div
                                                key={`${row.id}-${child.branchId || child.name}`}
                                                className="flex items-center justify-between gap-4"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                                                    {child.name}
                                                </span>
                                                <span className="text-slate-600">{formatCurrency(child.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            );
        },
        [nonOperationsTrendData.monthlyBranchKeys]
    );
    const renderNonOpsSectorTooltip = useCallback(
        ({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const entry = payload[0]?.payload;
            if (!entry) return null;
            const percentage =
                nonOpsSectorTotal > 0 ? ((entry.value / nonOpsSectorTotal) * 100).toFixed(1) : '0.0';

            return (
                <div className={getTooltipContainerClass('orange')}>
                    <p className="text-sm font-bold text-slate-900">{entry.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                        {formatCurrency(entry.value)} · {percentage}%
                    </p>
                </div>
            );
        },
        [nonOpsSectorTotal]
    );

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-orange-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div className="text-xl font-semibold text-gray-700">Caricamento spese...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-orange-100 relative">
            <div className="relative p-4 lg:p-8">
                <div className="space-y-6">
                    {/* HERO & FILTERS */}
                    <div className="relative rounded-3xl bg-gradient-to-br from-orange-600 via-orange-600 to-orange-600 text-white shadow-2xl border border-white/20 p-6 lg:p-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]" />
                        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-4 lg:max-w-3xl">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-orange-900/30 ring-4 ring-white/20">
                                        <Wallet className="w-7 h-7 lg:w-8 lg:h-8" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">{heroBadge}</p>
                                        <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">
                                            {heroTitle}
                                        </h1>
                                    </div>
                                </div>
                                <p className="text-sm lg:text-base text-white/85">
                                    {heroDescription}
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-4 lg:w-auto">
                                {notificationCount > 0 && (
                                    <div className="flex flex-wrap items-center justify-end gap-3">
                                        <div className="relative">
                                            {isNotificationsPanelOpen && (
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setIsNotificationsPanelOpen(false)}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setIsNotificationsPanelOpen(prev => !prev)}
                                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-lg shadow-orange-900/30 backdrop-blur-sm transition-all bg-white/15 text-white hover:bg-white/25"
                                            >
                                                <Bell className="w-4 h-4" />
                                                Notifiche
                                                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-bold text-orange-600">
                                                    {notificationCount}
                                                </span>
                                            </button>
                                            {isNotificationsPanelOpen && (
                                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/40 bg-white/95 p-5 shadow-2xl shadow-orange-900/30 backdrop-blur space-y-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-500">
                                                                Notifiche attive
                                                            </p>
                                                            <h3 className="text-sm font-black text-slate-900">
                                                                {notificationCount} alert
                                                            </h3>
                                                        </div>
                                                        <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-600">
                                                            {formatCurrency(totalNotificationsAmount)}
                                                        </span>
                                                    </div>
                                                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                                        {expenseAlerts.map((alert) => (
                                                            <div
                                                                key={alert.key}
                                                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                                                            >
                                                                <p className="text-xs font-bold text-slate-900">{alert.title}</p>
                                                                <p className="text-[11px] text-slate-500">{alert.description}</p>
                                                                <p className="mt-1 text-[11px] font-semibold text-slate-600">
                                                                    {alert.totalLabel}: {formatCurrency(alert.totalAmount)}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsNotificationsPanelOpen(false)}
                                                        className="w-full rounded-xl border border-orange-200 bg-orange-50 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 transition hover:bg-orange-100"
                                                    >
                                                        Chiudi notifiche
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={handleOpenAddModal}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-900/30 backdrop-blur-sm transition-all hover:bg-white/25"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        {newExpenseLabel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>



                    {/* Sezione Filtri */}
                    <section className="relative z-20 rounded-3xl border border-white/80 bg-gradient-to-r from-slate-300/95 via-slate-100/90 to-white/90 px-4 py-5 backdrop-blur-2xl overflow-visible">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -top-16 left-12 h-32 w-32 rounded-full bg-indigo-100/35 blur-3xl" />
                            <div className="absolute -bottom-20 right-10 h-36 w-36 rounded-full bg-slate-200/55 blur-3xl" />
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
                            <ExpensesDateRangeDropdown
                                isOpen={isDateDropdownOpen}
                                setIsOpen={setIsDateDropdownOpen}
                                startDate={dateFilter.startDate}
                                endDate={dateFilter.endDate}
                                hasActiveRange={hasCustomDateRange}
                                onChange={({ startDate, endDate }) =>
                                    setDateFilter(prev => ({ ...prev, startDate, endDate }))
                                }
                                onClear={() => setDateFilter({ startDate: defaultStartDate, endDate: defaultEndDate })}
                                onToggle={() => {
                                    setIsPresetPanelOpen(false);
                                    setIsAdvancedPanelOpen(false);
                                }}
                            />
                            <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                                <Layers className="h-4 w-4 text-slate-600" />
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
                            <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                                <MapPin className="h-4 w-4 text-slate-600" />
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
                            <ExpensesAdvancedFiltersDropdown
                                isOpen={isAdvancedPanelOpen}
                                setIsOpen={setIsAdvancedPanelOpen}
                                invoiceFilter={invoiceFilter}
                                setInvoiceFilter={setInvoiceFilter}
                                contractFilter={contractFilter}
                                setContractFilter={setContractFilter}
                                selectedCategory={selectedCategory}
                                setSelectedCategory={setSelectedCategory}
                                channelCategories={channelCategories}
                                onClear={() => {
                                    setInvoiceFilter('');
                                    setContractFilter('');
                                    setSelectedCategory('all');
                                }}
                                onToggle={() => {
                                    setIsPresetPanelOpen(false);
                                    setIsDateDropdownOpen(false);
                                }}
                            />
                            <div className="relative flex items-center gap-3">
                                {isPresetPanelOpen && (
                                    <div className="fixed inset-0 z-[210]" onClick={() => setIsPresetPanelOpen(false)} />
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsPresetPanelOpen(prev => !prev);
                                        setIsAdvancedPanelOpen(false);
                                        setIsDateDropdownOpen(false);
                                    }}
                                    aria-expanded={isPresetPanelOpen}
                                    className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${isPresetPanelOpen ? 'ring-2 ring-indigo-100' : ''
                                        }`}
                                >
                                    <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                    Preset
                                </button>
                                {hasActiveFilters && (
                                    <button
                                        onClick={resetFilters}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm shadow-rose-100/60 transition hover:border-rose-300 whitespace-nowrap"
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Resetta filtri
                                    </button>
                                )}
                                {isPresetPanelOpen && (
                                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-[20rem] rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                    Preset salvati
                                                </p>
                                                <p className="text-xs font-medium text-slate-500">
                                                    Salva e riutilizza combinazioni di filtri condivise.
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <input
                                                    type="text"
                                                    value={presetName}
                                                    onChange={(event) => setPresetName(event.target.value)}
                                                    placeholder="Nome preset (es. Q1 Board)"
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
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs font-medium text-slate-400">
                                                    Non hai ancora salvato preset.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Predefined Date Presets */}
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600">
                                Filtri rapidi
                            </span>
                            {PREDEFINED_DATE_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 px-3 py-1.5 text-xs font-semibold text-orange-700 shadow-sm shadow-orange-100/60 transition-all hover:border-orange-300 hover:from-orange-100 hover:to-amber-100 hover:shadow-md"
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
                                        key={preset.id}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-100/60"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            className="flex-1 text-left transition-colors hover:text-indigo-600"
                                        >
                                            {preset.name}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deletePreset(preset.id)}
                                            className="text-slate-300 transition-colors hover:text-rose-500"
                                        >
                                            <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-6">
                        <KpiCard
                            title="Spese Totali"
                            value={kpiData.totalExpenses.toString()}
                            subtitle={isOperationsDomain ? 'Voci registrate per le sedi' : `${processedExpenses.length} spese filtrate`}
                            icon={<FileText className="w-6 h-6" />}
                            gradient="from-orange-500 to-amber-600"
                            tooltip="Numero totale di voci di spesa filtrate."
                        />
                        <KpiCard
                            title="Importo Totale"
                            value={formatCurrency(kpiData.totalSpend)}
                            subtitle={isOperationsDomain ? 'Ripartite automaticamente per filiale' : `Budget: ${formatCurrency(kpiData.totalBudget)}`}
                            icon={<DollarSign className="w-6 h-6" />}
                            gradient="from-orange-600 to-amber-700"
                            tooltip="Somma degli importi di tutte le spese filtrate."
                        />
                        {isOperationsDomain ? (
                            <>
                                <KpiCard
                                    title="Filiali Attive"
                                    value={operationsBranchSummary.length.toString()}
                                    subtitle="Con costi registrati"
                                    icon={<MapPin className="w-6 h-6" />}
                                    gradient="from-orange-500 to-orange-600"
                                    tooltip="Numero di filiali con almeno una spesa assegnata."
                                />
                                <KpiCard
                                    title="Spesa Media"
                                    value={formatCurrency(operationsAveragePerBranch || 0)}
                                    subtitle="Per filiale attiva"
                                    icon={<Layers className="w-6 h-6" />}
                                    gradient="from-orange-500 to-orange-600"
                                    tooltip="Importo medio speso per filiale attiva."
                                />
                            </>
                        ) : (
                            <>
                                <KpiCard
                                    title="Con Fattura"
                                    value={`${kpiData.withInvoicePercentage}%`}
                                    subtitle="Documenti fiscali"
                                    icon={<CheckCircle2 className="w-6 h-6" />}
                                    gradient="from-amber-400 to-yellow-500"
                                    tooltip="Percentuale di spese con fattura allegata."
                                />
                                <KpiCard
                                    title="Complete"
                                    value={`${kpiData.completePercentage}%`}
                                    subtitle="Tutti i documenti"
                                    icon={<Activity className="w-6 h-6" />}
                                    gradient="from-orange-400 to-amber-500"
                                    tooltip="Percentuale di spese con tutta la documentazione richiesta (fattura e contratto)."
                                />
                            </>
                        )}
                    </div>



                    {!isOperationsDomain && (
                        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                                <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                    <div className="relative z-10 flex flex-col gap-1 px-6 py-5 text-white">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                            Andamento
                                        </p>
                                        <h2 className="text-lg font-black text-white">
                                            Spesa mensile {selectedOperationsYear}
                                        </h2>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white px-6 py-6">
                                    {nonOperationsTrendData.hasMonthlyTrendData ? (
                                        <>
                                            <ResponsiveContainer width="100%" height={320}>
                                                <AreaChart
                                                    data={nonOperationsTrendData.monthlyTrendData}
                                                    stackOffset="none"
                                                    margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
                                                >
                                                    <defs>
                                                        {nonOperationsTrendData.monthlyBranchKeys.length > 0 ? (
                                                            nonOperationsTrendData.monthlyBranchKeys.map((branch) => (
                                                                <linearGradient
                                                                    key={`non-ops-monthly-gradient-${branch.key}`}
                                                                    id={`non-ops-monthly-gradient-${branch.key}`}
                                                                    x1="0"
                                                                    y1="0"
                                                                    x2="0"
                                                                    y2="1"
                                                                >
                                                                    <stop offset="0%" stopColor={branch.color} stopOpacity={0.9} />
                                                                    <stop offset="100%" stopColor={branch.color} stopOpacity={0.35} />
                                                                </linearGradient>
                                                            ))
                                                        ) : (
                                                            <linearGradient
                                                                id="non-ops-monthly-gradient-fallback"
                                                                x1="0"
                                                                y1="0"
                                                                x2="0"
                                                                y2="1"
                                                            >
                                                                <stop offset="0%" stopColor="#fb923c" stopOpacity={0.95} />
                                                                <stop offset="100%" stopColor="#f97316" stopOpacity={0.35} />
                                                            </linearGradient>
                                                        )}
                                                    </defs>
                                                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis
                                                        dataKey="monthLabel"
                                                        tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        tickFormatter={(value) => {
                                                            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                                                            if (value >= 1000) return `${Math.round(value / 1000)}k`;
                                                            return value.toFixed(0);
                                                        }}
                                                        tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <Tooltip
                                                        cursor={{ stroke: '#fb923c', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                        content={renderNonOpsMonthlyTooltip}
                                                    />
                                                    {nonOperationsTrendData.monthlyBranchKeys.length > 0 ? (
                                                        nonOperationsTrendData.monthlyBranchKeys.map((branch) => (
                                                            <Area
                                                                key={`non-ops-monthly-area-${branch.key}`}
                                                                type="monotone"
                                                                dataKey={branch.key}
                                                                name={branch.name}
                                                                stackId="non-ops-monthly"
                                                                stroke={branch.color}
                                                                strokeWidth={2}
                                                                fill={`url(#non-ops-monthly-gradient-${branch.key})`}
                                                                fillOpacity={1}
                                                                activeDot={{ r: 4, strokeWidth: 0 }}
                                                                isAnimationActive={false}
                                                            />
                                                        ))
                                                    ) : (
                                                        <Area
                                                            type="monotone"
                                                            dataKey="total"
                                                            name="Spesa"
                                                            stroke="#fb923c"
                                                            strokeWidth={3}
                                                            fill="url(#non-ops-monthly-gradient-fallback)"
                                                            fillOpacity={1}
                                                            activeDot={{ r: 4, strokeWidth: 0 }}
                                                            isAnimationActive={false}
                                                        />
                                                    )}
                                                </AreaChart>
                                            </ResponsiveContainer>
                                            {nonOperationsTrendData.monthlyBranchKeys.length > 0 && (
                                                <div className="mt-6">
                                                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                        {nonOperationsTrendData.monthlyBranchKeys.map((branch) => (
                                                            <li
                                                                key={`non-ops-monthly-legend-${branch.key}`}
                                                                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                                            >
                                                                <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                                    <span
                                                                        className="inline-flex h-2.5 w-2.5 rounded-full"
                                                                        style={{ backgroundColor: branch.color }}
                                                                    />
                                                                    {branch.name}
                                                                </span>
                                                                <span className="text-sm font-semibold text-slate-900">
                                                                    {formatCurrency(branch.total || 0)}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <EmptyState
                                                icon={TrendingDown}
                                                title="Nessun dato disponibile"
                                                message="Registra alcune spese o modifica i filtri per vedere l'andamento mensile."
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                                <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                    <div className="relative z-10 flex flex-col gap-1 px-6 py-5 text-white">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                            Ripartizione spese
                                        </p>
                                        <h2 className="text-lg font-black text-white">
                                            Peso economico per settore
                                        </h2>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white px-6 py-6">
                                    {nonOperationsTrendData.hasSectorSplitData ? (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <PieChart>
                                                <Tooltip content={renderNonOpsSectorTooltip} />
                                                <Pie
                                                    data={nonOperationsTrendData.sectorSplitData}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius="55%"
                                                    outerRadius="80%"
                                                    paddingAngle={4}
                                                    strokeWidth={0}
                                                >
                                                    {nonOperationsTrendData.sectorSplitData.map((entry) => (
                                                        <Cell key={`non-ops-sector-${entry.id}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <EmptyState
                                                icon={Layers}
                                                title="Nessun dato di settore"
                                                message="Registra spese o modifica i filtri per vedere il peso delle aree."
                                            />
                                        </div>
                                    )}
                                    {nonOperationsTrendData.hasSectorSplitData && (
                                        <div className="mt-6">
                                            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {nonOperationsTrendData.sectorSplitData.map((entry) => (
                                                    <li
                                                        key={entry.name}
                                                        className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 shadow-sm"
                                                    >
                                                        <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                            <span
                                                                className="inline-flex h-2.5 w-2.5 rounded-full"
                                                                style={{ backgroundColor: entry.color }}
                                                            />
                                                            {entry.name}
                                                        </span>
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            {formatCurrency(entry.value)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {isOperationsDomain && (
                        <>
                            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                                <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                                    <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                        <div className="relative z-10 flex flex-col gap-1 px-6 py-5 text-white">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                Filiali
                                            </p>
                                            <h2 className="text-lg font-black text-white">
                                                Distribuzione mensile {selectedOperationsYear}
                                            </h2>
                                        </div>
                                    </div>
                                    <div className="relative flex flex-1 flex-col px-6 py-6 bg-white">
                                        <div className="flex-1">
                                            {!hasOperationsMonthlyData ? (
                                                <div className="flex h-full items-center justify-center">
                                                    <EmptyState
                                                        icon={Building2}
                                                        title="Nessun dato disponibile"
                                                        message="Registra spese sulle filiali o aggiorna i filtri per visualizzare la distribuzione mensile."
                                                    />
                                                </div>
                                            ) : (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart
                                                        data={operationsMonthlyBranchData}
                                                        stackOffset="none"
                                                        margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
                                                    >
                                                        <defs>
                                                            {operationsTopBranchKeys.map((branch) => (
                                                                <linearGradient
                                                                    key={`ops-branch-gradient-${branch.id}`}
                                                                    id={`ops-branch-gradient-${branch.id}`}
                                                                    x1="0"
                                                                    y1="0"
                                                                    x2="0"
                                                                    y2="1"
                                                                >
                                                                    <stop offset="0%" stopColor={branch.color} stopOpacity={0.9} />
                                                                    <stop offset="100%" stopColor={branch.color} stopOpacity={0.35} />
                                                                </linearGradient>
                                                            ))}
                                                        </defs>
                                                        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                        <XAxis
                                                            dataKey="monthLabel"
                                                            tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <YAxis
                                                            tickFormatter={(value) => {
                                                                if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                                                                if (value >= 1000) return `${Math.round(value / 1000)}k`;
                                                                return value.toFixed(0);
                                                            }}
                                                            tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <Tooltip
                                                            cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                            content={renderOperationsMonthlyTooltip}
                                                        />
                                                        {operationsTopBranchKeys.map((branch) => (
                                                            <Area
                                                                key={`ops-area-${branch.id}`}
                                                                type="monotone"
                                                                dataKey={branch.key}
                                                                name={branch.name}
                                                                stackId="ops-monthly"
                                                                stroke={branch.color}
                                                                strokeWidth={2}
                                                                fill={`url(#ops-branch-gradient-${branch.id})`}
                                                                fillOpacity={1}
                                                                activeDot={{ r: 4, strokeWidth: 0 }}
                                                                isAnimationActive={false}
                                                            />
                                                        ))}
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            )}
                                        </div>
                                        {operationsTopBranches.length > 0 && (
                                            <div className="pt-4">
                                                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    {operationsTopBranches.map((branch, index) => (
                                                        <li
                                                            key={branch.branchId || `top-${index}`}
                                                            className="flex items-center justify-between rounded-2xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm shadow-slate-200/40"
                                                        >
                                                            <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                                <span
                                                                    className="inline-flex h-2.5 w-2.5 rounded-full"
                                                                    style={{
                                                                        backgroundColor: branchColorPalette[index % branchColorPalette.length],
                                                                    }}
                                                                />
                                                                {branch.name}
                                                            </span>
                                                            <span className="text-sm font-semibold text-slate-900">
                                                                {formatCurrency(branch.amount)}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]">
                                    <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                        <div className="relative z-10 flex flex-col gap-1 px-6 py-5 text-white">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                Filiali
                                            </p>
                                            <h2 className="text-lg font-black text-white">
                                                Incidenza sui costi {selectedOperationsYear}
                                            </h2>
                                        </div>
                                    </div>
                                    <div className="relative flex flex-1 flex-col px-6 py-6 bg-white">
                                        <div className="flex-1">
                                            {!hasOperationsDonutData ? (
                                                <div className="flex h-full items-center justify-center">
                                                    <EmptyState
                                                        icon={Layers}
                                                        title="Nessun dato disponibile"
                                                        message="Popola i costi delle filiali per visualizzare l’incidenza complessiva."
                                                    />
                                                </div>
                                            ) : (
                                                <ResponsiveContainer width="100%" height={320}>
                                                    <PieChart>
                                                        <defs>
                                                            {operationsBranchDonutData.map((entry) => (
                                                                <linearGradient
                                                                    key={`ops-donut-${entry.id}`}
                                                                    id={`ops-donut-${entry.id}`}
                                                                    x1="0"
                                                                    y1="1"
                                                                    x2="0"
                                                                    y2="0"
                                                                >
                                                                    <stop offset="0%" stopColor={entry.color} stopOpacity={0.65} />
                                                                    <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
                                                                </linearGradient>
                                                            ))}
                                                        </defs>
                                                        <Tooltip content={renderBranchDonutTooltip} />
                                                        <Pie
                                                            data={operationsBranchDonutData}
                                                            dataKey="value"
                                                            nameKey="name"
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius="60%"
                                                            outerRadius="80%"
                                                            paddingAngle={4}
                                                            strokeWidth={0}
                                                        >
                                                            {operationsBranchDonutData.map((entry) => (
                                                                <Cell key={`ops-donut-cell-${entry.id}`} fill={`url(#ops-donut-${entry.id})`} />
                                                            ))}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            )}
                                        </div>
                                        {operationsBranchDonutSummary.length > 0 && (
                                            <div className="mt-6">
                                                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    {operationsBranchDonutSummary.map((entry) => (
                                                        <li
                                                            key={entry.id}
                                                            className="flex items-center justify-between rounded-2xl border border-orange-100/70 bg-white px-3 py-2 shadow-sm shadow-slate-200/40"
                                                        >
                                                            <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                                <span
                                                                    className="inline-flex h-2.5 w-2.5 rounded-full"
                                                                    style={{ backgroundColor: entry.color }}
                                                                />
                                                                {entry.name}
                                                            </span>
                                                            <span className="text-sm font-semibold text-slate-900">
                                                                {formatCurrency(entry.value)}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                            {operationsBranchSections.map((branch) => {
                                const share =
                                    operationsTotalSpend > 0 ? (branch.totalAmount / operationsTotalSpend) * 100 : 0;
                                const hasExpensesForBranch = branch.totalAmount > 0;

                                return (
                                    <section
                                        key={branch.key}
                                        className="relative overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)]"
                                    >
                                        <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                            <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                            <div className="relative z-10 flex flex-col gap-1 px-6 py-5 text-white md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                        Filiale
                                                    </p>
                                                    <h2 className="text-lg font-black text-white">
                                                        {branch.displayName}
                                                    </h2>
                                                </div>
                                                <div className="text-left md:text-right">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                        Totale {selectedOperationsYear}
                                                    </p>
                                                    <p className="text-lg font-black text-white">
                                                        {formatCurrency(branch.totalAmount)}
                                                    </p>
                                                    <p className="text-xs font-semibold text-white/70">
                                                        Incidenza: {share.toFixed(1)}% del totale sedi
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative z-10 px-6 pb-6 pt-6">
                                            {!hasExpensesForBranch ? (
                                                <div className="rounded-3xl border-2 border-dashed border-orange-100 bg-orange-50/30 p-8 text-center">
                                                    <EmptyState
                                                        icon={Layers}
                                                        title="Nessuna spesa per questa filiale"
                                                        message="Registra un costo o aggiorna i filtri per visualizzare le spese della sede."
                                                    />
                                                </div>
                                            ) : (
                                                <div className="overflow-hidden rounded-3xl border border-orange-100/70 shadow-inner shadow-orange-100/70">
                                                    <ExpenseTableView
                                                        expenses={processedExpenses}
                                                        sectorMap={sectorMap}
                                                        supplierMap={supplierMap}
                                                        branchMap={branchMap}
                                                        contractMap={contractMap}
                                                        marketingChannels={marketingChannels}
                                                        channelCategories={channelCategories}
                                                        onEdit={handleOpenEditModal}
                                                        onDelete={handleDeleteExpense}
                                                        onDuplicate={handleDuplicateExpense}
                                                        canEditOrDelete={canEditOrDelete}
                                                        showDocuments={false}
                                                        splitByBranch
                                                        limitBranchId={branch.branchId}
                                                        actionVariant="icon"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                );
                            })}
                        </>
                    )}

                    {/* Lista Spese generale (solo per domini non Operations) */}
                    {!isOperationsDomain && (
                        <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -top-40 right-0 h-72 w-72 rounded-full bg-orange-200/25 blur-3xl" />
                                <div className="absolute bottom-[-35%] left-1/4 h-64 w-64 rounded-full bg-orange-200/20 blur-3xl" />
                            </div>
                            <div className="relative z-10 flex flex-col">
                                <div className="relative overflow-hidden rounded-t-3xl border-b border-white/20">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-600/95 via-orange-500/90 to-amber-500/85" />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_55%)]" />
                                    <div className="relative z-10 flex flex-col gap-4 px-6 py-5 text-white">
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                Elenco spese
                                            </p>
                                            <h2 className="text-lg font-black text-white">
                                                Dettaglio fornitori e documentazione
                                            </h2>
                                        </div>

                                        {filterPresets.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/40 bg-white/10 px-4 py-3 text-white shadow-inner shadow-black/10 backdrop-blur">
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                                                    Preset rapidi
                                                </span>
                                                {filterPresets.map(preset => (
                                                    <div
                                                        key={preset.id}
                                                        className="inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/15 px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-black/10"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => applyPreset(preset)}
                                                            className="flex-1 text-left transition-colors hover:text-white/80"
                                                        >
                                                            {preset.name}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deletePreset(preset.id)}
                                                            className="text-white/70 transition-colors hover:text-rose-100"
                                                        >
                                                            <XCircle className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="relative z-10 px-6 pb-6 pt-6">
                                    {processedExpenses.length > 0 ? (
                                        <div className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-inner shadow-orange-100/50">
                                            <ExpenseTableView
                                                expenses={processedExpenses}
                                                sectorMap={sectorMap}
                                                supplierMap={supplierMap}
                                                branchMap={branchMap}
                                                contractMap={contractMap}
                                                marketingChannels={marketingChannels}
                                                channelCategories={channelCategories}
                                                onEdit={handleOpenEditModal}
                                                onDelete={handleDeleteExpense}
                                                onDuplicate={handleDuplicateExpense}
                                                canEditOrDelete={canEditOrDelete}
                                                showDocuments
                                                actionVariant="icon"
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-12 text-center">
                                            <div className="p-4 rounded-2xl bg-orange-100 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                                                <Search className="w-8 h-8 text-orange-600" />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-4">Nessuna Spesa Trovata</h3>
                                            <p className="text-gray-600 mb-6">
                                                Non ci sono spese che corrispondono ai filtri selezionati.
                                            </p>
                                            {hasActiveFilters && (
                                                <button
                                                    onClick={resetFilters}
                                                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                                                >
                                                    Resetta Filtri
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {isOperationsDomain && processedExpenses.length === 0 && (
                        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-12 text-center">
                            <div className="p-4 rounded-2xl bg-orange-100 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                                <Search className="w-8 h-8 text-orange-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-4">Nessuna Spesa Trovata</h3>
                            <p className="text-gray-600">
                                Non ci sono costi associati alle sedi in questo periodo.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* Modali */}
            {isModalOpen && (
                <ExpenseFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveExpense}
                    initialData={editingExpense}
                    sectors={sectors}
                    branches={branches}
                    suppliers={suppliers}
                    marketingChannels={marketingChannels}
                    contracts={contracts}
                    geographicAreas={geographicAreas}
                    domainConfigs={domainConfigs}
                    defaultCostDomain={resolvedCostDomain}
                    domainOptions={domainOptions}
                    allowDomainSwitch={canChangeDomain}
                />
            )}
        </div>
    );
}
