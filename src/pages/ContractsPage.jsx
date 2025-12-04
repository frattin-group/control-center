
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';

import {
    PlusCircle, Pencil, Trash2, Search, Layers, XCircle, FileSignature, Check,
    Paperclip, DollarSign, Calendar, Target, AlertTriangle, CheckCircle,
    ArrowUpDown, MapPin, SlidersHorizontal, Bell, Filter, X
} from 'lucide-react';
import ContractFormModal from '../components/ContractFormModal';
import toast from 'react-hot-toast';
import { KpiCard, MultiSelect } from '../components/SharedComponents';
import { loadFilterPresets, persistFilterPresets } from '../utils/filterPresets';
import { getDefaultDateFilter, filterExpensesByDateRange, PREDEFINED_DATE_PRESETS } from '../utils/dateFilters';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { getSectorColor } from '../constants/sectorColors';
import { getTooltipContainerClass } from '../utils/chartTooltipStyles';
import SortIndicatorIcon from '../components/SortIndicatorIcon';

const storage = getStorage();

const MONTH_NAMES_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const CONTRACT_ADVANCED_FILTERS = [
    { key: '', label: 'Tutti' },
    { key: 'active', label: 'Attivi' },
    { key: 'completed', label: 'Completati' },
    { key: 'overrun', label: 'Sforati' }
];

// ===== UTILITY FUNCTIONS =====
const formatCurrency = (number) => {
    if (typeof number !== 'number' || isNaN(number)) return 'N/A';
    return number.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
};

const formatCompactCurrency = (value) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
    if (abs >= 1000) return `${Math.round(value / 1000)} k`;
    return value.toFixed(0);
};

// ===== UI COMPONENTS =====

// Progress Bar Component con gestione sforamenti
const ProgressBar = ({ spentPercentage = 0, overduePercentage = 0 }) => {
    const sanitize = (value) => {
        if (!Number.isFinite(value)) {
            if (value === Infinity) return 100;
            return 0;
        }
        return Math.max(0, value);
    };

    const safeSpentRaw = sanitize(spentPercentage);
    const overdueRaw = sanitize(overduePercentage);
    const totalUtilization = safeSpentRaw + overdueRaw;
    const hasOverrun = totalUtilization >= 101 || !Number.isFinite(totalUtilization);

    const clamp = (value) => Math.max(0, Math.min(100, value));

    let spentWidth = 0;
    let overdueWidth = 0;

    if (hasOverrun) {
        const totalForRatio = safeSpentRaw + overdueRaw;
        if (totalForRatio > 0) {
            spentWidth = clamp((safeSpentRaw / totalForRatio) * 100);
            overdueWidth = clamp(100 - spentWidth);
        }
    } else {
        spentWidth = clamp(safeSpentRaw);
        overdueWidth = clamp(Math.min(overdueRaw, 100 - spentWidth));
    }

    return (
        <div
            className="relative w-full h-[10px] rounded-full bg-slate-200/60 shadow-inner shadow-slate-300/60 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(Number.isFinite(totalUtilization) ? totalUtilization : 130, 130))}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-white/30 pointer-events-none" />

            {hasOverrun ? (
                <div
                    className="absolute inset-y-0 left-0 z-[2] rounded-full bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 transition-all duration-500 ease-out"
                    style={{ width: '100%' }}
                />
            ) : (
                <>
                    <div
                        className="absolute inset-y-0 left-0 z-[1] rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-all duration-500 ease-out"
                        style={{ width: `${spentWidth}% ` }}
                    />

                    {overdueWidth > 0 && (
                        <div
                            className="absolute inset-y-0 z-[2] rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 transition-all duration-500 ease-out"
                            style={{
                                left: `${spentWidth}% `,
                                width: `${overdueWidth}% `
                            }}
                        />
                    )}
                </>
            )}

            <div
                className="absolute inset-0 z-[5] rounded-full border border-white/30"
                aria-hidden="true"
            />
        </div>
    );
};

// Vista Tabella
const ContractsTableView = ({
    contracts,
    sectorMap,
    supplierMap = new Map(),
    onEdit,
    onDelete,
    sortConfig,
    onSort
}) => {
    const columns = [
        { key: 'supplier', label: 'Fornitore', className: 'px-5 py-3 text-left' },
        { key: 'description', label: 'Descrizione', className: 'px-5 py-3 text-left hidden lg:table-cell' },
        { key: 'sectors', label: 'Settori', className: 'px-5 py-3 text-left hidden xl:table-cell' },
        { key: 'progress', label: 'Progresso', className: 'px-5 py-3 text-left' },
        { key: 'value', label: 'Valore', className: 'px-5 py-3 text-right' },
        { key: 'spent', label: 'Speso', className: 'px-5 py-3 text-right' },
        { key: 'overdue', label: 'Scaduto', className: 'px-5 py-3 text-right' },
        { key: 'residual', label: 'Residuo', className: 'px-5 py-3 text-right' }
    ];

    const handleSort = (columnKey) => {
        if (typeof onSort === 'function') {
            onSort(columnKey);
        }
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl shadow-blue-200/60">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-slate-700">
                    <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white uppercase text-[11px] font-bold tracking-[0.16em]">
                        <tr>
                            {columns.map((column) => {
                                const isActive = sortConfig?.key === column.key;
                                const direction = sortConfig?.direction || 'asc';
                                const isRightAligned = column.className.includes('text-right');

                                return (
                                    <th
                                        key={column.key}
                                        className={column.className}
                                        aria-sort={
                                            isActive
                                                ? direction === 'asc'
                                                    ? 'ascending'
                                                    : 'descending'
                                                : 'none'
                                        }
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSort(column.key)}
                                            className={`flex w - full items - center gap - 2 text - xs font - bold uppercase tracking - [0.16em] text - white / 90 transition - colors hover: text - white ${isRightAligned ? 'justify-end' : 'justify-start'
                                                } `}
                                        >
                                            <span>{column.label}</span>
                                            <SortIndicatorIcon
                                                active={isActive}
                                                direction={direction}
                                            />
                                        </button>
                                    </th>
                                );
                            })}
                            <th className="px-5 py-3 text-center">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/70">
                        {contracts.map((contract, index) => {
                            const totalAmount = contract.totalAmount || 0;
                            const spentAmount = contract.spentAmount || 0;
                            const overdueAmount = contract.overdueAmount || 0;
                            const residualAmount = typeof contract.residualAmount === 'number'
                                ? contract.residualAmount
                                : totalAmount - (spentAmount + overdueAmount);
                            const spentPercentage = totalAmount > 0 ? (spentAmount / totalAmount) * 100 : 0;
                            const overduePercentage = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0;
                            const totalPercentage = spentPercentage + overduePercentage;
                            const hasMeaningfulOverdue = overduePercentage >= 0.5;
                            const isOverrun = Number.isFinite(totalPercentage)
                                ? totalPercentage >= 101
                                : spentAmount > 0;
                            const progressLabel = Number.isFinite(totalPercentage)
                                ? (
                                    hasMeaningfulOverdue
                                        ? `${Math.round(spentPercentage)}% + ${Math.round(overduePercentage)}% `
                                        : `${Math.round(totalPercentage)}% `
                                )
                                : 'N/D';
                            const supplierDisplayName = contract.supplierName || supplierMap.get(contract.supplierId) || 'N/D';
                            const sectorNames = (contract.effectiveSectors || []).map(id => sectorMap.get(id)).filter(Boolean).join(', ');
                            const residualDisplay = Math.abs(residualAmount) < 0.01 ? 0 : residualAmount;

                            return (
                                <tr key={contract.id} className={`
hover: bg - blue - 50 / 40 transition - colors
                                    ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
`}>
                                    <td className="px-5 py-4">
                                        <div className="min-w-0">
                                            <p className="max-w-[220px] truncate text-sm font-semibold text-slate-900">
                                                {supplierDisplayName}
                                            </p>
                                            {sectorNames && (
                                                <p className="text-[11px] font-medium text-slate-400 truncate sm:hidden">
                                                    {sectorNames}
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 hidden lg:table-cell">
                                        <div className="text-sm font-medium text-slate-600 truncate max-w-xs">
                                            {contract.description || '—'}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 hidden xl:table-cell">
                                        <span className="text-sm font-medium text-slate-600">
                                            {sectorNames || '—'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 min-w-[190px]">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-shrink-0 w-40">
                                                <ProgressBar
                                                    spentPercentage={spentPercentage}
                                                    overduePercentage={overduePercentage}
                                                />
                                            </div>
                                            <span className={`inline - flex items - center gap - 1 text - xs font - semibold ${isOverrun ? 'text-rose-600' : 'text-slate-700'} `}>
                                                {isOverrun && <AlertTriangle className="h-3.5 w-3.5" />}
                                                {progressLabel}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                                        {formatCurrency(totalAmount)}
                                    </td>
                                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                                        {formatCurrency(spentAmount)}
                                    </td>
                                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                                        {overdueAmount > 0 ? formatCurrency(overdueAmount) : '—'}
                                    </td>
                                    <td className="px-5 py-4">
                                        {residualDisplay === 0 ? (
                                            <div className="flex items-center justify-end text-sm font-semibold text-slate-400">
                                                —
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2">
                                                {residualDisplay < 0 && (
                                                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                                                )}
                                                <span className="text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                                                    {formatCurrency(residualDisplay)}
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => onEdit(contract)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-500 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
                                                title="Modifica contratto"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            {contract.contractPdfUrl && (
                                                <a
                                                    href={contract.contractPdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-500 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                                                    title="Apri documento"
                                                >
                                                    <Paperclip className="h-4 w-4" />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => onDelete(contract)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                                title="Elimina contratto"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const DateRangeFilter = ({
    isOpen,
    setIsOpen,
    dateFilter,
    setDateFilter,
    hasDateRange,
    setIsPresetPanelOpen = () => { },
    setIsAdvancedPanelOpen = () => { },
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

    const dateRangeLabel = (dateFilter.startDate && dateFilter.endDate)
        ? `${formatDateLabel(dateFilter.startDate)} → ${formatDateLabel(dateFilter.endDate)} `
        : 'Seleziona periodo';

    const isHeroStyle = variant === 'hero';
    const buttonBaseClasses = isHeroStyle
        ? 'inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 shadow-lg shadow-blue-900/30 backdrop-blur-sm transition hover:border-white/60 hover:bg-white/20'
        : 'inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600';
    const ringClass = hasDateRange
        ? isHeroStyle
            ? 'ring-2 ring-white/60'
            : 'ring-2 ring-indigo-100'
        : '';
    const calendarIconClass = isHeroStyle ? 'h-4 w-4 text-white/80' : 'h-4 w-4 text-slate-500';
    const arrowIconClass = isHeroStyle ? 'h-4 w-4 text-white/60' : 'h-4 w-4 text-slate-400';

    return (
        <div className="relative">
            {isOpen && (
                <div
                    className="fixed inset-0 z-[210]"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <button
                type="button"
                onClick={() => {
                    setIsOpen((prev) => !prev);
                    setIsPresetPanelOpen(false);
                    setIsAdvancedPanelOpen(false);
                }}
                aria-expanded={isOpen}
                className={`${buttonBaseClasses} ${ringClass} `}
            >
                <Calendar className={calendarIconClass} />
                <span className="whitespace-nowrap">
                    {dateRangeLabel}
                </span>
                <ArrowUpDown
                    className={`${arrowIconClass} transition - transform duration - 200 ${isOpen ? 'rotate-180' : ''} `}
                />
            </button>
            {isOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-[18rem] rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Intervallo date
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                                Imposta il periodo di firma da includere nella tabella.
                            </p>
                        </div>
                        <div className="space-y-3">
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                Da
                                <input
                                    type="date"
                                    value={dateFilter.startDate}
                                    onChange={(event) =>
                                        setDateFilter((prev) => ({
                                            ...prev,
                                            startDate: event.target.value
                                        }))
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                A
                                <input
                                    type="date"
                                    value={dateFilter.endDate}
                                    onChange={(event) =>
                                        setDateFilter((prev) => ({
                                            ...prev,
                                            endDate: event.target.value
                                        }))
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                />
                            </label>
                        </div>
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setDateFilter({ startDate: '', endDate: '' })}
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


const ContractsTableSection = ({
    filterPresets,
    applyPreset,
    deletePreset,
    hasActiveFilters,
    resetFilters,
    processedContracts,
    supplierMap,
    sectorMap,
    handleOpenEditModal,
    handleDeleteContract,
    handleOpenAddModal,
    sortConfig,
    onSortChange,
}) => {
    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-48 right-0 h-80 w-80 rounded-full bg-blue-200/25 blur-3xl" />
                <div className="absolute bottom-[-35%] left-1/4 h-72 w-72 rounded-full bg-indigo-200/20 blur-2xl" />
            </div>
            <div className="relative z-10 flex flex-col">
                <div className="flex flex-col gap-4 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 px-6 py-5 text-white lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                Elenco contratti
                            </p>
                            <h2 className="text-lg font-black text-white">Dettaglio budget &amp; stato</h2>
                        </div>
                    </div>
                </div>
                <div className="relative z-10 px-6 pb-6 space-y-6">
                    {filterPresets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/40 bg-white/10 px-4 py-3 text-white shadow-inner shadow-black/10 backdrop-blur">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                                Preset rapidi
                            </span>
                            {filterPresets.map((preset) => (
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

                    <div className="overflow-hidden rounded-3xl border border-blue-100 shadow-inner shadow-blue-100/70 mt-4">
                        {processedContracts.length > 0 ? (
                            <ContractsTableView
                                contracts={processedContracts}
                                supplierMap={supplierMap}
                                sectorMap={sectorMap}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteContract}
                                sortConfig={sortConfig}
                                onSort={onSortChange}
                            />
                        ) : (
                            <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-12 text-center">
                                <div className="p-4 rounded-2xl bg-blue-100 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                                    <FileSignature className="w-8 h-8 text-blue-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Nessun Contratto Trovato</h3>
                                <p className="text-gray-600 mb-6">Non ci sono contratti che corrispondono ai filtri selezionati.</p>
                                {hasActiveFilters ? (
                                    <>
                                        <button
                                            onClick={resetFilters}
                                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-transform hover:-translate-y-[1px]"
                                        >
                                            <XCircle className="w-5 h-5" />
                                            Resetta filtri
                                        </button>
                                        <button
                                            onClick={handleOpenAddModal}
                                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 text-sm font-semibold text-blue-600 shadow-sm shadow-blue-100/40 transition-transform hover:-translate-y-[1px]"
                                        >
                                            <PlusCircle className="w-5 h-5" />
                                            Nuovo contratto
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={handleOpenAddModal}
                                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-transform hover:-translate-y-[1px]"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                        Crea il primo contratto
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

// ===== MAIN COMPONENT =====
export default function ContractsPage({ user }) {
    const { getToken } = useAuth();
    const [allContracts, setAllContracts] = useState([]);
    const [allExpenses, setAllExpenses] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [branches, setBranches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContract, setEditingContract] = useState(null);
    const [selectedBranch, setSelectedBranch] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isFiltersPresetPanelOpen, setIsFiltersPresetPanelOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [selectedSector, setSelectedSector] = useState('all');
    const [contractAdvancedFilter, setContractAdvancedFilter] = useState('');
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);

    // Memoize default date filter to compare against current state
    const defaultDateFilter = useMemo(() => ({ startDate: '', endDate: '' }), []);
    const [dateFilter, setDateFilter] = useState(defaultDateFilter);
    const otherPresetsRef = useRef([]);
    const [filterPresets, setFilterPresets] = useState(() => {
        const stored = loadFilterPresets() || [];
        const contractPresets = [];
        const others = [];
        stored.forEach(preset => {
            if (!preset.scope || preset.scope === 'contracts') {
                contractPresets.push(preset);
            } else {
                others.push(preset);
            }
        });
        otherPresetsRef.current = others;
        return contractPresets;
    });
    const [presetName, setPresetName] = useState('');
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const presetsMountedRef = useRef(false);
    const [sortConfig, setSortConfig] = useState({ key: 'supplier', direction: 'asc' });

    // Check if date filter is different from default
    const hasCustomDateRange = Boolean(
        dateFilter.startDate !== defaultDateFilter.startDate ||
        dateFilter.endDate !== defaultDateFilter.endDate
    );

    const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
    const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);
    const orderedBranches = useMemo(() => {
        return [...branches].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [branches]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const token = await getToken();
            const headers = { 'Authorization': `Bearer ${token} ` };

            const [contractsRes, expensesRes, initialDataRes] = await Promise.all([
                axios.get('/api/contracts', { headers }),
                axios.get('/api/expenses', { headers }),
                axios.get(`/ api / data / initial - data ? year = ${new Date().getFullYear()} `, { headers })
            ]);

            const contractsData = contractsRes.data;
            const expensesData = expensesRes.data;
            const initialData = initialDataRes.data;

            console.log("Contracts API response:", contractsData);
            console.log("Expenses API response length:", expensesData.length);
            console.log("Initial Data response:", initialData);

            // Filter contracts based on user role/assignments if needed
            let filteredContracts = contractsData;
            if (user.role === 'collaborator' && user.assignedChannels && user.assignedChannels.length > 0) {
                if (user.assignedChannels.length <= 10) {
                    filteredContracts = contractsData.filter(c => user.assignedChannels.includes(c.supplierId));
                }
            }
            console.log("Filtered contracts (after role check):", filteredContracts);

            setAllContracts(filteredContracts);
            setAllExpenses(expensesData);
            setSuppliers(initialData.suppliers);
            setSectors(initialData.sectors);
            setBranches(initialData.branches);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Errore nel caricamento dei dati");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (presetsMountedRef.current) {
            const scopedPresets = filterPresets.map(preset => ({
                ...preset,
                scope: 'contracts'
            }));
            persistFilterPresets([
                ...otherPresetsRef.current,
                ...scopedPresets
            ]);
        } else {
            presetsMountedRef.current = true;
        }
    }, [filterPresets]);

    const processedContracts = useMemo(() => {
        const dayMs = 24 * 60 * 60 * 1000;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let filtered = allContracts.map(contract => {
            const rawLineItems = Array.isArray(contract.lineItems) ? contract.lineItems : [];
            const normalizedLineItems = rawLineItems.map((item, index) => {
                const normalizedId = item.id || item._key || `${contract.id} -line - ${index} `;
                return { ...item, _normalizedId: normalizedId };
            });

            const lineItemIdLookup = new Map();
            normalizedLineItems.forEach(li => {
                lineItemIdLookup.set(li._normalizedId, li._normalizedId);
                if (li.id) lineItemIdLookup.set(li.id, li._normalizedId);
                if (li._key) lineItemIdLookup.set(li._key, li._normalizedId);
            });

            const lineItemSpent = new Map();
            const lineItemSpentToDate = new Map();
            normalizedLineItems.forEach(li => {
                lineItemSpent.set(li._normalizedId, 0);
                lineItemSpentToDate.set(li._normalizedId, 0);
            });

            const allocateToLineItem = (normalizedId, amount, isUpToToday) => {
                if (!normalizedId || amount === 0) return;
                lineItemSpent.set(normalizedId, (lineItemSpent.get(normalizedId) || 0) + amount);
                if (isUpToToday) {
                    lineItemSpentToDate.set(normalizedId, (lineItemSpentToDate.get(normalizedId) || 0) + amount);
                }
            };

            const sortedLineItems = [...normalizedLineItems].sort((a, b) => {
                const startA = a.startDate ? new Date(a.startDate) : null;
                const startB = b.startDate ? new Date(b.startDate) : null;
                if (!startA && !startB) return 0;
                if (!startA) return 1;
                if (!startB) return -1;
                return startA - startB;
            });

            const distributeAmount = (amount, expenseDateRaw, isUpToToday) => {
                if (!sortedLineItems.length || amount === 0) return;

                // Robust date comparison using YYYY-MM-DD strings
                const expenseDateStr = expenseDateRaw ? String(expenseDateRaw).slice(0, 10) : '';

                const activeLineItems = expenseDateStr
                    ? sortedLineItems.filter(li => {
                        if (!li.startDate || !li.endDate) return false;
                        const startStr = String(li.startDate).slice(0, 10);
                        const endStr = String(li.endDate).slice(0, 10);
                        return expenseDateStr >= startStr && expenseDateStr <= endStr;
                    })
                    : [];

                // If no active line items found, allocate to the first line item (Old App Logic)
                if (activeLineItems.length === 0) {
                    allocateToLineItem(sortedLineItems[0]._normalizedId, amount, isUpToToday);
                    return;
                }

                const totalActive = activeLineItems.reduce((sum, li) => sum + (parseFloat(li.totalAmount) || 0), 0);
                if (totalActive <= 0) {
                    const share = amount / activeLineItems.length;
                    activeLineItems.forEach(li => allocateToLineItem(li._normalizedId, share, isUpToToday));
                    return;
                }

                activeLineItems.forEach(li => {
                    const liTotal = parseFloat(li.totalAmount) || 0;
                    const share = (liTotal / totalActive) * amount;
                    allocateToLineItem(li._normalizedId, share, isUpToToday);
                });
            };

            // Use all expenses for calculation, do not filter by date range
            // This matches the old app behavior where "Spent" includes everything
            const filteredExpenses = allExpenses;

            filteredExpenses.forEach(expense => {
                const expenseLineItems = Array.isArray(expense.lineItems) ? expense.lineItems : [];
                // Parse date directly - it's already an ISO string from the API
                const expenseDate = expense.date ? new Date(expense.date) : null;
                if (expenseDate && !isNaN(expenseDate)) {
                    expenseDate.setHours(0, 0, 0, 0);
                }
                const isUpToToday = !expenseDate || isNaN(expenseDate) || expenseDate <= today;

                let handled = false;
                expenseLineItems.forEach(item => {
                    // Check both contractId (Prisma) and relatedContractId (Legacy/Firestore)
                    if ((item.contractId || item.relatedContractId) === contract.id) {
                        handled = true;
                        const amount = parseFloat(item.amount) || 0;
                        // Use contractLineItemId (from migration) or fallback to legacy fields
                        let normalizedId = lineItemIdLookup.get(item.contractLineItemId || item.relatedLineItemId || item.relatedLineItemID);

                        // SMART LINKING FALLBACK: Try to match by description if no ID link
                        if (!normalizedId && item.description) {
                            const cleanDesc = item.description.trim().toLowerCase();
                            // Fuzzy match: check if line item description contains expense description words or vice versa
                            // Or simpler: check if one contains the other
                            const matchedLineItem = normalizedLineItems.find(li => {
                                const liDesc = (li.description || '').trim().toLowerCase();
                                return liDesc && (liDesc.includes(cleanDesc) || cleanDesc.includes(liDesc));
                            });

                            if (matchedLineItem) {
                                normalizedId = matchedLineItem._normalizedId;
                            }
                        }

                        if (normalizedId) {
                            allocateToLineItem(normalizedId, amount, isUpToToday);
                        } else {
                            // Pass raw date strings for robust comparison
                            distributeAmount(amount, expense.date, isUpToToday);
                        }
                    }
                });

                if (!handled && expense.relatedContractId === contract.id) {
                    const amount = parseFloat(expense.amount) || 0;
                    distributeAmount(amount, expense.date, isUpToToday);
                }
            });

            const enrichedNormalizedLineItems = normalizedLineItems.map(li => {
                const total = parseFloat(li.totalAmount) || 0;
                const spent = lineItemSpent.get(li._normalizedId) || 0;
                const spentUpToToday = lineItemSpentToDate.get(li._normalizedId) || 0;
                const remaining = Math.max(0, total - spent);
                let overdue = 0;

                if (total > 0 && li.startDate && li.endDate) {
                    const start = new Date(li.startDate);
                    const end = new Date(li.endDate);
                    if (!isNaN(start) && !isNaN(end)) {
                        start.setHours(0, 0, 0, 0);
                        end.setHours(0, 0, 0, 0);
                        if (today >= start) {
                            const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
                            const effectiveEnd = today > end ? end : today;
                            const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((effectiveEnd - start) / dayMs) + 1));
                            if (elapsedDays > 0) {
                                const expectedToDate = (total / totalDays) * elapsedDays;
                                const shortfall = expectedToDate - Math.min(spentUpToToday, expectedToDate);
                                overdue = Math.max(0, Math.min(remaining, shortfall));
                            }
                        }
                    }
                }

                const { _normalizedId, ...baseLineItem } = li;
                return {
                    ...baseLineItem,
                    spent,
                    spentUpToToday,
                    remaining,
                    overdue
                };
            });

            const cleanedLineItems = enrichedNormalizedLineItems;
            const spentAmount = enrichedNormalizedLineItems.reduce((sum, li) => sum + li.spent, 0);
            const overdueAmount = enrichedNormalizedLineItems.reduce((sum, li) => sum + li.overdue, 0);
            const totalAmountFromLines = enrichedNormalizedLineItems.reduce((sum, li) => sum + (parseFloat(li.totalAmount) || 0), 0);
            const totalAmount = totalAmountFromLines || parseFloat(contract.totalAmount) || 0;
            const residualAmount = totalAmount - (spentAmount + overdueAmount);
            const progress = totalAmount > 0 ? ((spentAmount + overdueAmount) / totalAmount) * 100 : (spentAmount > 0 ? Infinity : 0);
            const actualProgress = totalAmount > 0 ? (spentAmount / totalAmount) * 100 : (spentAmount > 0 ? Infinity : 0);

            let sectorsFromSource = [];
            const lineItemSectors = [...new Set(cleanedLineItems.map(item => item.sectorId).filter(Boolean))];

            if (lineItemSectors.length > 0) {
                sectorsFromSource = lineItemSectors;
            } else if (contract.associatedSectors && contract.associatedSectors.length > 0) {
                sectorsFromSource = contract.associatedSectors;
            } else if (contract.sectorId) {
                sectorsFromSource = [contract.sectorId];
            }

            return {
                ...contract,
                totalAmount,
                spentAmount,
                overdueAmount,
                residualAmount,
                progress,
                actualProgress,
                effectiveSectors: sectorsFromSource,
                lineItems: cleanedLineItems
            };
        });

        if (searchTerm.trim() !== '') {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(c =>
                (c.description || '').toLowerCase().includes(lowerSearch) ||
                (supplierMap.get(c.supplierId) || '').toLowerCase().includes(lowerSearch)
            );
        }

        if (dateFilter.startDate) {
            const start = new Date(dateFilter.startDate);
            start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(c => {
                const signingDate = c.signingDate ? new Date(c.signingDate) : null;
                return signingDate ? signingDate >= start : true;
            });
        }

        if (dateFilter.endDate) {
            const end = new Date(dateFilter.endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(c => {
                const signingDate = c.signingDate ? new Date(c.signingDate) : null;
                return signingDate ? signingDate <= end : true;
            });
        }

        if (selectedBranch !== 'all') {
            filtered = filtered.filter(c => {
                if (c.branchId && c.branchId === selectedBranch) return true;
                return (c.lineItems || []).some(li => (li.branchId || li.branchId) === selectedBranch);
            });
        }

        if (selectedSector !== 'all') {
            filtered = filtered.filter(contract => {
                const sectorsList = Array.isArray(contract.effectiveSectors) ? contract.effectiveSectors : [];
                if (sectorsList.includes(selectedSector)) return true;
                if (!contract.effectiveSectors && contract.sectorId) {
                    return contract.sectorId === selectedSector;
                }
                return false;
            });
        }

        if (contractAdvancedFilter) {
            filtered = filtered.filter(contract => {
                switch (contractAdvancedFilter) {
                    case 'active':
                        return contract.actualProgress > 0 && contract.actualProgress < 100;
                    case 'completed':
                        return contract.actualProgress >= 100;
                    case 'overrun':
                        return (contract.progress || 0) > 100 || (contract.budgetOverrun || 0) > 0;
                    default:
                        return true;
                }
            });
        }

        const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;
        const getSortValue = (contract, key) => {
            switch (key) {
                case 'supplier':
                    return contract.supplierName || supplierMap.get(contract.supplierId) || '';
                case 'description':
                    return contract.description || '';
                case 'sectors':
                    return (contract.effectiveSectors || [])
                        .map(id => sectorMap.get(id))
                        .filter(Boolean)
                        .join(', ');
                case 'progress':
                    return Number.isFinite(contract.progress) ? contract.progress : contract.progress === Infinity ? Number.MAX_SAFE_INTEGER : 0;
                case 'value':
                    return contract.totalAmount || 0;
                case 'spent':
                    return contract.spentAmount || 0;
                case 'overdue':
                    return contract.overdueAmount || 0;
                case 'residual':
                    return Number.isFinite(contract.residualAmount)
                        ? contract.residualAmount
                        : contract.residualAmount === Infinity
                            ? Number.MAX_SAFE_INTEGER
                            : 0;
                default:
                    return '';
            }
        };

        const normalizeNumber = (value) => {
            if (typeof value !== 'number' || Number.isNaN(value)) return 0;
            if (!Number.isFinite(value)) {
                return value === -Infinity ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
            }
            return value;
        };

        return [...filtered].sort((a, b) => {
            const aValue = getSortValue(a, sortConfig.key);
            const bValue = getSortValue(b, sortConfig.key);

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                const normalizedA = normalizeNumber(aValue);
                const normalizedB = normalizeNumber(bValue);
                if (normalizedA === normalizedB) return 0;
                return normalizedA > normalizedB ? directionMultiplier : -directionMultiplier;
            }

            return String(aValue)
                .localeCompare(String(bValue), 'it', { sensitivity: 'base' }) * directionMultiplier;
        });
    }, [
        allContracts,
        allExpenses,
        searchTerm,
        supplierMap,
        selectedBranch,
        selectedSector,
        dateFilter.startDate,
        dateFilter.endDate,
        contractAdvancedFilter,
        sortConfig,
        sectorMap
    ]);
    const savePreset = useCallback(() => {
        const name = presetName.trim();
        if (!name) {
            toast.error('Inserisci un nome per il preset');
            return;
        }
        const trimmedSearch = searchTerm.trim();
        const preset = {
            id: Date.now(),
            scope: 'contracts',
            name,
            searchTerm: trimmedSearch,
            startDate: dateFilter.startDate,
            endDate: dateFilter.endDate,
            selectedBranch,
            selectedSector,
            advancedFilter: contractAdvancedFilter
        };
        setFilterPresets(prev => {
            const withoutDuplicates = prev.filter(p => p.name.toLowerCase() !== name.toLowerCase());
            return [...withoutDuplicates, preset];
        });
        setPresetName('');
        toast.success('Preset salvato');
    }, [presetName, searchTerm, dateFilter.startDate, dateFilter.endDate, selectedBranch, selectedSector, contractAdvancedFilter]);

    const applyPreset = useCallback((preset) => {
        // Handle predefined presets (with getFilter function)
        if (preset.isPredefined && preset.getFilter) {
            const dateRange = preset.getFilter();
            setDateFilter({
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            });
            // Use all expenses for calculation, do not filter by date range
            // This matches the old app behavior where "Spent" includes everything
            const filteredExpenses = allExpenses;
            toast.success(`Filtro "${preset.name}" applicato`);
            return;
        }

        // Handle custom saved presets
        setSearchTerm(preset.searchTerm || '');
        setDateFilter({
            startDate: preset.startDate ?? '',
            endDate: preset.endDate ?? ''
        });
        setSelectedBranch(preset.selectedBranch || 'all');
        setSelectedSector(preset.selectedSector || 'all');
        setContractAdvancedFilter(preset.advancedFilter || '');
        toast.success(`Preset "${preset.name}" applicato`);
    }, []);

    const deletePreset = useCallback((id) => {
        setFilterPresets(prev => prev.filter(p => p.id !== id));
        toast.success('Preset eliminato');
    }, []);

    const handleSortChange = useCallback((columnKey) => {
        setSortConfig((prev) => {
            if (prev.key === columnKey) {
                return {
                    key: columnKey,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc'
                };
            }
            return { key: columnKey, direction: 'asc' };
        });
    }, []);

    const contractStats = useMemo(() => {
        const total = processedContracts.length;
        const totalValue = processedContracts.reduce((sum, c) => sum + c.totalAmount, 0);
        const totalSpent = processedContracts.reduce((sum, c) => sum + c.spentAmount, 0);
        const totalOverdue = processedContracts.reduce((sum, c) => sum + (c.overdueAmount || 0), 0);
        const totalResidual = processedContracts.reduce((sum, c) => sum + (c.residualAmount || 0), 0);
        const active = processedContracts.filter(c => c.actualProgress > 0 && c.actualProgress < 100).length;
        const completed = processedContracts.filter(c => c.actualProgress >= 100).length;
        const overrun = processedContracts.filter(c => c.progress > 100).length;
        const avgUtilization = totalValue > 0 ? ((totalSpent + totalOverdue) / totalValue) * 100 : 0;

        return { total, totalValue, totalSpent, totalOverdue, totalResidual, active, completed, overrun, avgUtilization };
    }, [processedContracts]);

    const kpiCards = useMemo(() => {
        return [
            {
                key: 'total',
                title: 'Contratti Totali',
                value: contractStats.total.toString(),
                subtitle: `${contractStats.active} attivi`,
                icon: <FileSignature className="w-6 h-6" />,
                gradient: 'from-blue-500 to-indigo-600',
                tooltip: 'Numero totale di contratti monitorati.'
            },
            {
                key: 'value',
                title: 'Valore Totale',
                value: formatCurrency(contractStats.totalValue),
                subtitle: 'valore complessivo',
                icon: <DollarSign className="w-6 h-6" />,
                gradient: 'from-sky-500 to-cyan-500',
                tooltip: 'Valore complessivo di tutti i contratti attivi.'
            },
            {
                key: 'spent',
                title: 'Importo Speso',
                value: formatCurrency(contractStats.totalSpent),
                subtitle: `+ Scaduto ${formatCurrency(contractStats.totalOverdue)} `,
                icon: <Target className="w-6 h-6" />,
                gradient: 'from-indigo-500 to-blue-700',
                tooltip: 'Somma degli importi già spesi o scaduti.'
            },
            {
                key: 'residual',
                title: 'Residuo Netto',
                value: formatCurrency(contractStats.totalResidual),
                subtitle: contractStats.overrun > 0 ? `${contractStats.overrun} sforati` : 'budget disponibile',
                icon: <CheckCircle className="w-6 h-6" />,
                gradient: contractStats.overrun > 0 ? 'from-rose-500 to-red-600' : 'from-emerald-500 to-green-600',
                tooltip: 'Budget residuo disponibile sui contratti.'
            }
        ];
    }, [contractStats]);

    const contractsTrendData = useMemo(() => {
        const monthMap = new Map();

        processedContracts.forEach(contract => {
            if (!contract.signingDate) return;
            const date = new Date(contract.signingDate);
            if (Number.isNaN(date.getTime())) return;

            const year = date.getFullYear();
            const month = date.getMonth();
            const key = `${year} -${month} `;

            if (!monthMap.has(key)) {
                monthMap.set(key, {
                    sortKey: year * 100 + month,
                    label: `${MONTH_NAMES_IT[month]} '${String(year).slice(-2)}`,
                    fullLabel: `${MONTH_NAMES_IT[month]} ${year}`,
                    spend: 0,
                    overdue: 0,
                    total: 0
                });
            }

            const bucket = monthMap.get(key);
            bucket.spend += contract.spentAmount || 0;
            bucket.overdue += contract.overdueAmount || 0;
            bucket.total += contract.totalAmount || 0;
        });

        return Array.from(monthMap.values())
            .sort((a, b) => a.sortKey - b.sortKey)
            .slice(-12);
    }, [processedContracts]);

    const contractsTrendSummary = useMemo(() => {
        if (contractsTrendData.length === 0) return [];
        return [...contractsTrendData].slice(-4).reverse();
    }, [contractsTrendData]);

    const contractSectorDistribution = useMemo(() => {
        const totals = new Map();

        processedContracts.forEach(contract => {
            const effectiveAmount = (() => {
                const spend = (contract.spentAmount || 0) + (contract.overdueAmount || 0);
                if (spend > 0) return spend;
                return contract.totalAmount || 0;
            })();

            if (effectiveAmount <= 0) return;

            const sectorsList = Array.isArray(contract.effectiveSectors) && contract.effectiveSectors.length > 0
                ? contract.effectiveSectors
                : ['unassigned'];

            const share = effectiveAmount / sectorsList.length;
            sectorsList.forEach(sectorId => {
                const key = sectorId || 'unassigned';
                totals.set(key, (totals.get(key) || 0) + share);
            });
        });

        return Array.from(totals.entries())
            .map(([sectorId, value], index) => {
                const name = sectorId === 'unassigned'
                    ? 'Non classificato'
                    : (sectorMap.get(sectorId) || 'Non classificato');
                return {
                    id: sectorId,
                    name,
                    value,
                    color: getSectorColor(name, index)
                };
            })
            .filter(entry => entry.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [processedContracts, sectorMap]);

    const contractSectorTotal = useMemo(
        () => contractSectorDistribution.reduce((sum, entry) => sum + entry.value, 0),
        [contractSectorDistribution]
    );

    const renderContractsTrendTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const data = payload[0]?.payload;
        if (!data) return null;
        const spendEntry = payload.find(item => item.dataKey === 'spend');
        const overdueEntry = payload.find(item => item.dataKey === 'overdue');

        return (
            <div className={getTooltipContainerClass('blue')}>
                <p className="text-sm font-bold text-slate-900">
                    {data.fullLabel}
                </p>
                <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                    <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-blue-600">
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            Speso
                        </span>
                        <span>{formatCurrency(spendEntry?.value || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-amber-600">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                            Scaduto
                        </span>
                        <span>{formatCurrency(overdueEntry?.value || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Valore contratti</span>
                        <span className="text-slate-900">{formatCurrency(data.total || 0)}</span>
                    </div>
                </div>
            </div>
        );
    }, []);

    const renderContractsSectorTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const data = payload[0]?.payload;
        if (!data) return null;
        const percentage = contractSectorTotal > 0
            ? ((data.value / contractSectorTotal) * 100).toFixed(1)
            : '0.0';

        return (
            <div className={getTooltipContainerClass('blue')}>
                <p className="text-sm font-bold text-slate-900">{data.name}</p>
                <p className="text-xs font-semibold text-slate-600 mt-1">
                    {formatCurrency(data.value)} · {percentage}%
                </p>
            </div>
        );
    }, [contractSectorTotal]);

    const handleOpenAddModal = () => { setEditingContract(null); setIsModalOpen(true); };
    const handleOpenEditModal = (contract) => { setEditingContract(contract); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingContract(null); };
    const handleSaveContract = async (formData, contractFile) => {
        const isEditing = !!formData.id;
        const toastId = toast.loading(isEditing ? 'Aggiornamento...' : 'Salvataggio...');
        try {
            const { _key, ...cleanFormData } = formData;

            // Upload file if present
            let fileURL = cleanFormData.contractPdfUrl || "";
            if (contractFile) {
                const formData = new FormData();
                formData.append('file', contractFile);
                const token = await getToken();
                const uploadRes = await axios.post('/api/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });
                fileURL = uploadRes.data.url;
            }

            const payload = {
                ...cleanFormData,
                supplierId: cleanFormData.supplierld || cleanFormData.supplierId, // Map back to API field
                contractPdfUrl: fileURL,
                amount: parseFloat(String(cleanFormData.totalAmount || 0).replace(',', '.')), // Ensure amount is float if needed
                lineItems: cleanFormData.lineItems.map(item => ({
                    ...item,
                    totalAmount: parseFloat(String(item.totalAmount).replace(',', '.')) || 0,
                    sectorId: item.sectorld || item.sectorId, // Map back to API field
                    branchId: item.branchld || item.branchId      // Map back to API field
                }))
            };

            const url = isEditing ? `/api/contracts/${formData.id}` : '/api/contracts';
            const token = await getToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            if (isEditing) {
                await axios.put(url, payload, { headers });
            } else {
                await axios.post(url, payload, { headers });
            }



            toast.success(isEditing ? 'Contratto aggiornato!' : 'Contratto creato!', { id: toastId });
            handleCloseModal();
            fetchData(); // Refresh data
        } catch (error) {
            console.error("Errore nel salvare il contratto:", error);
            toast.error(error.message || 'Errore imprevisto.', { id: toastId });
        }
    };

    const handleDeleteContract = async (contract) => {
        if (!window.confirm(`Sei sicuro di voler eliminare il contratto "${contract.description}"?`)) return;
        const toastId = toast.loading("Eliminazione in corso...");
        try {
            if (contract.contractPdfUrl) {
                const fileRef = ref(storage, contract.contractPdfUrl);
                await deleteObject(fileRef).catch(err => console.warn("File non trovato:", err));
            }

            const token = await getToken();
            await axios.delete(`/api/contracts/${contract.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            toast.success("Contratto eliminato!", { id: toastId });
            fetchData(); // Refresh data
        } catch (error) {
            console.error("Errore durante l'eliminazione:", error);
            toast.error("Errore durante l'eliminazione.", { id: toastId });
        }
    };

    const resetFilters = () => {
        setSearchTerm('');
        setSelectedBranch('all');
        setSelectedSector('all');
        setDateFilter({ startDate: '', endDate: '' }); // Reset to empty (all time)
        setContractAdvancedFilter('');
        setIsAdvancedPanelOpen(false);
        setIsFiltersPresetPanelOpen(false);
        setIsDateDropdownOpen(false);
        setPresetName('');
        toast.success("Filtri resettati!");
    };

    const trimmedSearchTerm = searchTerm.trim();
    const hasActiveFilters = Boolean(
        trimmedSearchTerm ||
        selectedBranch !== 'all' ||
        selectedSector !== 'all' ||
        hasCustomDateRange ||
        contractAdvancedFilter
    );
    const overrunContracts = processedContracts
        .filter(c => c.progress > 100)
        .map(c => ({
            ...c,
            budgetOverrun: Math.max(0, (c.spentAmount + (c.overdueAmount || 0)) - c.totalAmount)
        }));
    const totalOverrunAmount = overrunContracts.reduce((sum, c) => sum + (c.budgetOverrun || 0), 0);
    const notificationCount = overrunContracts.length;
    useEffect(() => {
        if (notificationCount === 0 && isNotificationsPanelOpen) {
            setIsNotificationsPanelOpen(false);
        }
    }, [notificationCount, isNotificationsPanelOpen]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div className="text-xl font-semibold text-gray-700">Caricamento contratti...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative">
            <div className="relative p-4 lg:p-8 space-y-6">
                {/* Hero */}
                <div className="space-y-6">
                    <div className="relative rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-600 text-white shadow-2xl border border-white/20 p-6 lg:p-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.3),transparent_55%)]" />
                        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-4 lg:max-w-3xl">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-blue-900/30 ring-4 ring-white/20">
                                        <FileSignature className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">Contratti</p>
                                        <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">Gestione Contratti</h1>
                                    </div>
                                </div>
                                <p className="text-sm lg:text-base text-white/85 max-w-3xl">
                                    Monitora accordi e impegni con i fornitori mantenendo un'esperienza coerente con dashboard, spese e budget.
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-4 lg:ml-auto lg:w-auto lg:max-w-4xl">
                                {notificationCount > 0 && (
                                    <div className="flex flex-col items-end gap-3 w-full">
                                        <div className="relative w-full">
                                            <button
                                                type="button"
                                                onClick={() => setIsNotificationsPanelOpen((prev) => !prev)}
                                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-lg shadow-blue-900/30 backdrop-blur-sm transition-all bg-white/15 text-white hover:bg-white/25"
                                            >
                                                <Bell className="w-4 h-4" />
                                                Notifiche
                                                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-bold text-blue-600">
                                                    {notificationCount}
                                                </span>
                                            </button>
                                            {isNotificationsPanelOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setIsNotificationsPanelOpen(false)}
                                                    />
                                                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/40 bg-white/95 p-5 shadow-2xl shadow-blue-900/30 backdrop-blur sm:w-80 space-y-3">
                                                        {overrunContracts.length > 0 ? (
                                                            <>
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-500">
                                                                            Contratti oltre budget
                                                                        </p>
                                                                        <h3 className="text-sm font-black text-slate-900">
                                                                            {formatCurrency(totalOverrunAmount)}
                                                                        </h3>
                                                                    </div>
                                                                    <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                                                                        <AlertTriangle className="h-4 w-4" />
                                                                        {overrunContracts.length}
                                                                    </span>
                                                                </div>
                                                                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                                                    {overrunContracts.map(contract => (
                                                                        <div
                                                                            key={contract.id}
                                                                            className="flex items-center justify-between rounded-2xl border border-rose-100/80 bg-white px-3 py-2 shadow-sm shadow-rose-100/50"
                                                                        >
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-semibold text-slate-700">
                                                                                    {supplierMap.get(contract.supplierId) || 'N/D'}
                                                                                </span>
                                                                                <span className="text-[11px] font-semibold text-rose-500">
                                                                                    +{(contract.progress - 100).toFixed(1)}%
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-xs font-bold text-slate-900">
                                                                                {formatCurrency(contract.budgetOverrun || 0)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <p className="text-sm font-semibold text-slate-600">
                                                                Nessuna notifica disponibile.
                                                            </p>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsNotificationsPanelOpen(false)}
                                                            className="w-full rounded-xl border border-blue-200 bg-blue-50 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 transition hover:bg-blue-100"
                                                        >
                                                            Chiudi notifiche
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col items-end gap-3 w-full">
                                    <button
                                        type="button"
                                        onClick={handleOpenAddModal}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 backdrop-blur-sm transition-all hover:bg-white/25"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        Nuovo contratto
                                    </button>
                                </div>
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
                        <DateRangeFilter
                            isOpen={isDateDropdownOpen}
                            setIsOpen={setIsDateDropdownOpen}
                            dateFilter={dateFilter}
                            setDateFilter={setDateFilter}
                            hasDateRange={hasCustomDateRange}
                            setIsPresetPanelOpen={setIsFiltersPresetPanelOpen}
                            setIsAdvancedPanelOpen={setIsAdvancedPanelOpen}
                        />
                        <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <Layers className="h-4 w-4 text-slate-600" />
                            <select
                                value={selectedSector}
                                onChange={(event) => setSelectedSector(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                <option value="all">Tutti i settori</option>
                                {Array.from(sectorMap.entries()).map(([id, name]) => (
                                    <option key={id} value={id}>
                                        {name || 'N/D'}
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
                                {orderedBranches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name || 'N/D'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="relative">
                            {isAdvancedPanelOpen && (
                                <div className="fixed inset-0 z-[210]" onClick={() => setIsAdvancedPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdvancedPanelOpen(prev => !prev);
                                    setIsFiltersPresetPanelOpen(false);
                                    setIsDateDropdownOpen(false);
                                }}
                                aria-expanded={isAdvancedPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${contractAdvancedFilter ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <Filter className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">Filtri avanzati</span>
                                <ArrowUpDown
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isAdvancedPanelOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {isAdvancedPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-5 shadow-2xl shadow-slate-900/15 backdrop-blur space-y-3">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            Stato documentale
                                        </p>
                                        <p className="text-xs font-medium text-slate-500">
                                            Limita l'elenco in base allo stato dei contratti.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {CONTRACT_ADVANCED_FILTERS.map(option => {
                                            const active = contractAdvancedFilter === option.key;
                                            return (
                                                <button
                                                    key={option.key || 'all'}
                                                    type="button"
                                                    onClick={() => setContractAdvancedFilter(option.key)}
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
                                            onClick={() => setContractAdvancedFilter('')}
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
                            )}
                        </div>
                        <div className="relative flex flex-row items-center gap-3">
                            {isFiltersPresetPanelOpen && (
                                <div
                                    className="fixed inset-0 z-[210]"
                                    onClick={() => setIsFiltersPresetPanelOpen(false)}
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFiltersPresetPanelOpen(prev => !prev);
                                    setIsAdvancedPanelOpen(false);
                                    setIsDateDropdownOpen(false);
                                }}
                                aria-expanded={isFiltersPresetPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${isFiltersPresetPanelOpen ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                Preset
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm shadow-rose-100/60 transition hover:border-rose-300 whitespace-nowrap"
                                >
                                    <X className="w-3.5 h-3.5 text-rose-500" />
                                    Resetta filtri
                                </button>
                            )}
                            {isFiltersPresetPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-5 shadow-2xl shadow-slate-900/15 backdrop-blur sm:w-80 space-y-3">
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
                                            placeholder="Nome preset (es. Trimestrale HQ)"
                                            className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!presetName.trim()) return;
                                                savePreset();
                                                setIsFiltersPresetPanelOpen(false);
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
                                                    className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-100/40"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            applyPreset(preset);
                                                            setIsFiltersPresetPanelOpen(false);
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
                                            Nessun preset salvato.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
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
                                    key={preset.id}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-100/40"
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
                                        <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
                    {kpiCards.map(({ key, ...cardProps }) => (
                        <KpiCard key={key} {...cardProps} />
                    ))}
                </div>



                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                        <div className="flex flex-col">
                            <div className="rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 px-6 py-5 text-white">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Andamento contratti
                                </p>
                                <h2 className="text-lg font-black text-white">
                                    Valore vs spesa · Ultimi 12 mesi
                                </h2>
                            </div>
                            <div className="flex flex-1 flex-col px-6 py-6">
                                <div className="flex-1">
                                    {contractsTrendData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <AreaChart
                                                data={contractsTrendData}
                                                stackOffset="none"
                                                margin={{ top: 12, right: 8, left: -12, bottom: 0 }}
                                            >
                                                <defs>
                                                    <linearGradient id="contracts-spend-gradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.95} />
                                                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.35} />
                                                    </linearGradient>
                                                    <linearGradient id="contracts-overdue-gradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                                                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.35} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                <XAxis
                                                    dataKey="label"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 600 }}
                                                />
                                                <YAxis
                                                    tickFormatter={(value) => formatCompactCurrency(value)}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 600 }}
                                                />
                                                <RechartsTooltip
                                                    content={renderContractsTrendTooltip}
                                                    cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="spend"
                                                    stackId="1"
                                                    stroke="#2563eb"
                                                    strokeWidth={2}
                                                    fill="url(#contracts-spend-gradient)"
                                                    fillOpacity={1}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                    isAnimationActive={false}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="overdue"
                                                    stackId="1"
                                                    stroke="#f97316"
                                                    strokeWidth={2}
                                                    fill="url(#contracts-overdue-gradient)"
                                                    fillOpacity={1}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                    isAnimationActive={false}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/70 bg-white/60 p-10 text-center text-sm font-semibold text-blue-600">
                                            Non ci sono contratti nel periodo selezionato.
                                        </div>
                                    )}
                                </div>
                                {contractsTrendSummary.length > 0 && (
                                    <div className="mt-6">
                                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {contractsTrendSummary.map((entry) => (
                                                <li
                                                    key={`trend-summary-${entry.sortKey}`}
                                                    className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                                >
                                                    <span className="text-sm font-medium text-slate-600">
                                                        {entry.fullLabel}
                                                    </span>
                                                    <span className="text-sm font-semibold text-slate-900">
                                                        {formatCurrency(entry.spend + entry.overdue)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                        <div className="flex flex-col">
                            <div className="rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 px-6 py-5 text-white">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Ripartizione fornitori
                                </p>
                                <h2 className="text-lg font-black text-white">
                                    Peso economico per settore
                                </h2>
                            </div>
                            <div className="flex flex-1 flex-col px-6 py-6">
                                <div className="flex-1">
                                    {contractSectorDistribution.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <PieChart>
                                                <Pie
                                                    data={contractSectorDistribution}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius="60%"
                                                    outerRadius="80%"
                                                    paddingAngle={4}
                                                    strokeWidth={0}
                                                >
                                                    {contractSectorDistribution.map((entry) => (
                                                        <Cell key={`sector-${entry.id}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip content={renderContractsSectorTooltip} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/70 bg-white/60 p-10 text-center text-sm font-semibold text-blue-600">
                                            Nessun dato disponibile per generare la ripartizione.
                                        </div>
                                    )}
                                </div>
                                {contractSectorDistribution.length > 0 && (
                                    <div className="mt-6">
                                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {contractSectorDistribution.slice(0, 4).map((entry) => {
                                                const percentage = contractSectorTotal > 0
                                                    ? `${Math.round((entry.value / contractSectorTotal) * 100)}%`
                                                    : '0%';
                                                return (
                                                    <li
                                                        key={`sector-summary-${entry.id}`}
                                                        className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                                    >
                                                        <span className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                            <span
                                                                className="inline-flex h-2.5 w-2.5 rounded-full"
                                                                style={{ backgroundColor: entry.color }}
                                                            />
                                                            {entry.name}
                                                        </span>
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            {percentage}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                <ContractsTableSection
                    filterPresets={filterPresets}
                    applyPreset={applyPreset}
                    deletePreset={deletePreset}
                    hasActiveFilters={hasActiveFilters}
                    resetFilters={resetFilters}
                    processedContracts={processedContracts}
                    supplierMap={supplierMap}
                    sectorMap={sectorMap}
                    handleOpenEditModal={handleOpenEditModal}
                    handleDeleteContract={handleDeleteContract}
                    handleOpenAddModal={handleOpenAddModal}
                    sortConfig={sortConfig}
                    onSortChange={handleSortChange}
                />

                {/* Modal */}
                <ContractFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveContract}
                    initialData={editingContract}
                    suppliers={suppliers}
                    sectors={sectors}
                    branches={branches}
                />
            </div>
        </div>
    );
}
