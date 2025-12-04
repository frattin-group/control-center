import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import {
    X,
    XCircle,
    DollarSign,
    Target,
    Layers,
    Search,
    Car,
    Sailboat,
    Caravan,
    Building2,
    Settings,
    Percent,
    TrendingUp,
    AlertTriangle,
    ArrowUpDown,
    MapPin,
    Calendar,
    Check,
    SlidersHorizontal,
    Info,
    Bell,
    Filter,
    Pencil,
    HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
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
import BudgetAllocationModal from '../components/BudgetAllocationModal';
import {
    KpiCard,
    MultiSelect,
    InfoTooltip
} from '../components/SharedComponents';
import { loadFilterPresets, persistFilterPresets } from '../utils/filterPresets';
import { DEFAULT_COST_DOMAIN } from '../constants/costDomains';
import { getTooltipContainerClass } from '../utils/chartTooltipStyles';
import SortIndicatorIcon from '../components/SortIndicatorIcon';



const formatCurrency = (value) => {
    // Force HMR update
    if (typeof value !== 'number' || Number.isNaN(value)) return '€ 0,00';
    return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
};

const formatDateInput = (year, month, day) => new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];

const BUDGET_ADVANCED_FILTERS = [
    { key: '', label: 'Tutti' },
    { key: 'healthy', label: 'Sotto 80%' },
    { key: 'warning', label: '80% - 100%' },
    { key: 'overrun', label: 'Oltre 100% / arretrati' }
];

const BudgetProgressBar = ({ spent = 0, forecast = 0, budget = 0 }) => {
    const safeBudget = Math.max(0, budget || 0);
    const spentPercentage = safeBudget > 0 ? (spent / safeBudget) * 100 : 0;
    const forecastPercentage = safeBudget > 0 ? (forecast / safeBudget) * 100 : forecast > 0 ? 100 : 0;
    const totalUtilization = spentPercentage + forecastPercentage;
    const hasOverrun = totalUtilization >= 100.5;

    const clamp = (value) => Math.max(0, Math.min(100, value));
    let spentWidth = clamp(spentPercentage);
    let forecastWidth = clamp(forecastPercentage);

    if (hasOverrun) {
        const total = spentPercentage + forecastPercentage;
        if (total > 0) {
            spentWidth = clamp((spentPercentage / total) * 100);
            forecastWidth = clamp(100 - spentWidth);
        } else {
            spentWidth = 50;
            forecastWidth = 50;
        }
    } else if (spentWidth + forecastWidth > 100) {
        forecastWidth = clamp(100 - spentWidth);
    }

    return (
        <div className="relative h-[10px] w-full rounded-full bg-slate-200/70 shadow-inner shadow-slate-300/70 overflow-hidden" role="progressbar" aria-valuenow={Math.min(totalUtilization, 130)} aria-valuemin={0} aria-valuemax={100}>
            <div className="absolute inset-0 bg-gradient-to-r from-white/25 via-transparent to-white/25 pointer-events-none" />
            <div
                className={`absolute inset-y-0 left-0 z-[1] rounded-full transition-all duration-500 ease-out ${hasOverrun
                    ? 'bg-gradient-to-r from-rose-500 via-rose-500 to-red-600'
                    : 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500'
                    }`}
                style={{ width: `${clamp(spentWidth)}%` }}
            />
            {forecastWidth > 0 && (
                <div
                    className={`absolute inset-y-0 z-[2] rounded-full transition-all duration-500 ease-out ${hasOverrun
                        ? 'bg-gradient-to-r from-rose-300 via-rose-400 to-red-400'
                        : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500'
                        }`}
                    style={{
                        left: `${clamp(spentWidth)}%`,
                        width: `${clamp(forecastWidth)}%`
                    }}
                />
            )}
            <div className="absolute inset-0 z-[3] rounded-full border border-white/30" />
        </div>
    );
};

const SupplierTableView = React.memo(({
    suppliers,
    onManage,
    sectorMap,
    showProjections,
    sortConfig,
    onSort
}) => {
    const columns = [
        { key: 'supplier', label: 'FORNITORE', align: 'text-left' },
        { key: 'sector', label: 'SETTORI', align: 'text-left' },
        { key: 'progress', label: 'PROGRESSO', align: 'text-left' },
        { key: 'budget', label: 'BUDGET', align: 'text-right' },
        { key: 'spend', label: 'SPESA', align: 'text-right' },
        ...(showProjections ? [{ key: 'forecast', label: 'PREVISIONI', align: 'text-right' }] : []),
        { key: 'overdue', label: 'SCADUTI', align: 'text-right' },
        { key: 'actions', label: 'AZIONI', align: 'text-center' }
    ];

    const getSectorNames = (item) =>
        (item.associatedSectors || [])
            .map(id => sectorMap.get(id))
            .filter(Boolean)
            .join(', ') || '—';

    const handleSort = (columnKey) => {
        if (columnKey === 'actions') return;
        if (typeof onSort === 'function') {
            onSort(columnKey);
        }
    };

    return (
        <div className="overflow-x-auto rounded-2xl border border-emerald-100 bg-white shadow-inner shadow-emerald-100/40">
            <table className="min-w-full divide-y divide-emerald-100 text-sm text-slate-900">
                <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                    <tr>
                        {columns.map(column => (
                            <th
                                key={column.key}
                                className={`px-3 py-3 ${column.align} whitespace-nowrap`}
                            >
                                {column.key === 'actions' ? (
                                    column.label
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleSort(column.key)}
                                        className="inline-flex items-center gap-1"
                                    >
                                        {column.label}
                                        <SortIndicatorIcon
                                            active={sortConfig?.key === column.key}
                                            direction={sortConfig?.direction || 'asc'}
                                        />
                                    </button>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                    {suppliers.map((supplier, index) => {
                        const budgetValue = supplier.displayBudget || 0;
                        const spentValue = supplier.displaySpend || 0;
                        const forecastValue = showProjections ? (supplier.projections || 0) : 0;
                        const isExtraBudget = budgetValue <= 0;
                        const spentPercentage = budgetValue > 0 ? (spentValue / budgetValue) * 100 : spentValue > 0 ? 150 : 0;
                        const forecastPercentage = budgetValue > 0 ? (forecastValue / budgetValue) * 100 : forecastValue > 0 ? 150 : 0;
                        const totalPercentage = spentPercentage + forecastPercentage;
                        const hasMeaningfulForecast = forecastPercentage >= 0.5;
                        const progressLabel = isExtraBudget
                            ? 'Extra Budget'
                            : Number.isFinite(totalPercentage)
                                ? (hasMeaningfulForecast
                                    ? `${Math.round(spentPercentage)}% + ${Math.round(forecastPercentage)}%`
                                    : `${Math.round(spentPercentage)}%`)
                                : 'N/D';
                        const isOverrun = !isExtraBudget && (Number.isFinite(totalPercentage)
                            ? totalPercentage >= 101
                            : spentValue > 0);

                        return (
                            <tr
                                key={supplier.supplierId || `supplier-${index}`}
                                className="hover:bg-emerald-50/60 transition-colors"
                            >
                                <td className="px-3 py-3 text-left font-semibold text-slate-900">
                                    {supplier.name || 'Fornitore'}
                                </td>
                                <td className="px-3 py-3 text-left font-semibold text-slate-900">
                                    {getSectorNames(supplier)}
                                </td>
                                <td className="px-3 py-3 text-left">
                                    {isExtraBudget ? (
                                        <span className="inline-flex items-center rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 shadow-inner shadow-emerald-100">
                                            Extra Budget
                                        </span>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-36">
                                                <BudgetProgressBar
                                                    spent={spentValue}
                                                    forecast={forecastValue}
                                                    budget={budgetValue}
                                                />
                                            </div>
                                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isOverrun ? 'text-rose-600' : 'text-slate-900'}`}>
                                                {isOverrun && <AlertTriangle className="h-3.5 w-3.5" />}
                                                {progressLabel}
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                    {formatCurrency(supplier.displayBudget || 0)}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                    {formatCurrency(supplier.displaySpend || 0)}
                                </td>
                                {showProjections && (
                                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                        {formatCurrency(supplier.projections || 0)}
                                    </td>
                                )}
                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                    {formatCurrency(supplier.overdue || 0)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onManage(supplier)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-600 transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                                            title="Gestisci fornitore"
                                        >
                                            <Pencil className="h-4 w-4" />
                                            <span className="sr-only">Gestisci</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
});


export default function BudgetPage() {
    const { getToken } = useAuth();
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [startDate, setStartDate] = useState(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 0, 1);
    });
    const [endDate, setEndDate] = useState(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 11, 31);
    });
    const [summaries, setSummaries] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [allExpenses, setAllExpenses] = useState([]); // NUOVO: per calcolare contractSpentMap
    const [suppliers, setSuppliers] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [branches, setBranches] = useState([]);
    const [marketingChannels, setMarketingChannels] = useState([]);
    const [sectorBudgets, setSectorBudgets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [selectedSector, setSelectedSector] = useState('all');
    const [selectedBranch, setSelectedBranch] = useState('all');
    const [searchTerm, setSearchTerm] = useState("");
    const showProjections = true;
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [filterPresets, setFilterPresets] = useState(() =>
        loadFilterPresets().map(preset => {
            const {
                showProjections: _ignoredShow,
                supplierFilter: _ignoredSuppliers,
                sortOrder: _ignoredSort,
                ...rest
            } = preset;
            return rest;
        })
    );
    const [presetName, setPresetName] = useState('');
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [isFiltersPresetPanelOpen, setIsFiltersPresetPanelOpen] = useState(false);
    const [advancedFilter, setAdvancedFilter] = useState('');
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
    const marketingExpenses = useMemo(
        () =>
            allExpenses.filter(
                expense => (expense.costDomain || DEFAULT_COST_DOMAIN) === DEFAULT_COST_DOMAIN
            ),
        [allExpenses]
    );

    const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);
    const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);

    const defaultStartDate = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 0, 1);
    }, []);

    const defaultEndDate = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return formatDateInput(currentYear, 11, 31);
    }, []);

    const hasActiveFilters = useMemo(() => {
        return startDate !== defaultStartDate ||
            endDate !== defaultEndDate ||
            selectedSector !== 'all' ||
            selectedBranch !== 'all' ||
            advancedFilter !== '' ||
            !showProjections ||
            searchTerm.trim() !== '';
    }, [startDate, endDate, selectedSector, selectedBranch, advancedFilter, showProjections, searchTerm, defaultStartDate, defaultEndDate]);

    const filtersLoaded = useRef(false);
    useEffect(() => {
        if (filtersLoaded.current) {
            persistFilterPresets(filterPresets);
        } else {
            filtersLoaded.current = true;
        }
    }, [filterPresets]);


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

    useEffect(() => {
        const endYear = new Date(endDate).getFullYear();
        if (!Number.isNaN(endYear) && endYear !== year) {
            setYear(endYear);
        }
    }, [endDate, year]);

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const token = await getToken();
                const headers = { Authorization: `Bearer ${token}` };

                const [initialDataRes, expensesRes] = await Promise.all([
                    axios.get(`/api/data/initial-data?year=${year}`, { headers }),
                    axios.get('/api/expenses', { headers })
                ]);

                const initialData = initialDataRes.data;
                const expensesData = expensesRes.data;

                setSectors(initialData.sectors);
                setBranches(initialData.branches);
                setSuppliers(initialData.suppliers);
                setMarketingChannels(initialData.marketingChannels);
                setContracts(initialData.contracts);
                setSectorBudgets(initialData.sectorBudgets);
                setAllExpenses(expensesData);

                // Transform Budgets to Summaries
                const rawBudgets = initialData.budgets || [];

                // Get all unique supplier IDs from budgets and expenses
                const budgetSupplierIds = new Set(rawBudgets.map(b => b.supplierId));
                const expenseSupplierIds = new Set(expensesData
                    .filter(e => {
                        if ((e.costDomain || DEFAULT_COST_DOMAIN) !== DEFAULT_COST_DOMAIN) return false;
                        if (e.isAmortized && e.amortizationStartDate && e.amortizationEndDate) {
                            const start = new Date(e.amortizationStartDate).getFullYear();
                            const end = new Date(e.amortizationEndDate).getFullYear();
                            return year >= start && year <= end;
                        }
                        return new Date(e.date).getFullYear() === year;
                    })
                    .map(e => e.supplierId)
                );

                const allSupplierIds = new Set([...budgetSupplierIds, ...expenseSupplierIds]);

                const transformedSummaries = Array.from(allSupplierIds).map(supplierId => {
                    const budget = rawBudgets.find(b => b.supplierId === supplierId) || { allocations: [] };
                    const allocations = budget.allocations || [];
                    const totalBudget = allocations.reduce((sum, a) => sum + (a.budgetAmount || 0), 0);

                    // Calculate spend for this supplier with amortization logic
                    const supplierExpenses = expensesData.filter(e =>
                        e.supplierId === supplierId &&
                        (e.costDomain || DEFAULT_COST_DOMAIN) === DEFAULT_COST_DOMAIN
                    );

                    const getExpenseAmountInYear = (expense, itemAmount) => {
                        const amount = parseFloat(itemAmount) || 0;
                        if (amount === 0) return 0;

                        if (expense.isAmortized && expense.amortizationStartDate && expense.amortizationEndDate) {
                            const startDate = new Date(expense.amortizationStartDate);
                            const endDate = new Date(expense.amortizationEndDate);
                            // Normalize to start of day
                            startDate.setHours(0, 0, 0, 0);
                            endDate.setHours(0, 0, 0, 0);

                            const yearStart = new Date(year, 0, 1);
                            const yearEnd = new Date(year, 11, 31);
                            yearEnd.setHours(23, 59, 59, 999);

                            // Check overlap
                            if (startDate > yearEnd || endDate < yearStart) return 0;

                            const overlapStart = new Date(Math.max(startDate.getTime(), yearStart.getTime()));
                            const overlapEnd = new Date(Math.min(endDate.getTime(), yearEnd.getTime()));

                            // Normalize overlap end to start of day for day counting, or handle time consistently
                            // Let's use the same logic as Dashboard: day-by-day iteration or math
                            // Dashboard uses: durationDays = (endDate - startDate) / dayMs + 1

                            const dayMs = 1000 * 60 * 60 * 24;
                            const durationDays = Math.max(1, Math.round((endDate - startDate) / dayMs) + 1);
                            const dailyAmount = amount / durationDays;

                            // Calculate overlap days
                            // Ensure we compare dates at same time (e.g. noon) or use round
                            const oStart = new Date(overlapStart); oStart.setHours(0, 0, 0, 0);
                            const oEnd = new Date(overlapEnd); oEnd.setHours(0, 0, 0, 0);

                            if (oStart > oEnd) return 0;

                            const overlapDays = Math.round((oEnd - oStart) / dayMs) + 1;
                            return dailyAmount * overlapDays;
                        } else {
                            // Not amortized: check invoice date
                            const expenseDate = new Date(expense.date);
                            return expenseDate.getFullYear() === year ? amount : 0;
                        }
                    };

                    const totalSpend = supplierExpenses.reduce((sum, e) => {
                        const lineItems = e.lineItems || [];
                        if (lineItems.length > 0) {
                            return sum + lineItems.reduce((acc, li) => acc + getExpenseAmountInYear(e, li.amount), 0);
                        }
                        return sum + getExpenseAmountInYear(e, e.amount || e.totalAmount);
                    }, 0);

                    // Calculate detailed spend per allocation
                    const claimedLineItemIds = new Set();

                    // Calculate detailed spend per allocation
                    const details = allocations.map(allocation => {
                        let detailedSpend = 0;
                        supplierExpenses.forEach(expense => {
                            expense.lineItems.forEach(li => {
                                const matchesSector = !allocation.sectorId || li.sectorId === allocation.sectorId;
                                const matchesBranch = !allocation.branchId || li.branchId === allocation.branchId;
                                const matchesChannel = !allocation.marketingChannelId || li.marketingChannelId === allocation.marketingChannelId;

                                if (matchesSector && matchesBranch && matchesChannel) {
                                    const amountInYear = getExpenseAmountInYear(expense, li.amount);
                                    if (amountInYear > 0) {
                                        detailedSpend += amountInYear;
                                        if (li.id) claimedLineItemIds.add(li.id);
                                    }
                                }
                            });
                        });

                        return {
                            ...allocation,
                            detailedSpend
                        };
                    });

                    // Identify unallocated spend (expenses not matching any allocation)
                    const sectorSpendMap = new Map();
                    supplierExpenses.forEach(expense => {
                        expense.lineItems.forEach(li => {
                            // If line item has an ID, check if it was claimed. 
                            if (li.sectorId && (!li.id || !claimedLineItemIds.has(li.id))) {
                                const amountInYear = getExpenseAmountInYear(expense, li.amount);
                                if (amountInYear > 0) {
                                    sectorSpendMap.set(li.sectorId, (sectorSpendMap.get(li.sectorId) || 0) + amountInYear);
                                }
                            }
                        });
                    });

                    sectorSpendMap.forEach((amount, sectorId) => {
                        details.push({
                            id: `virtual-${supplierId}-${sectorId}-${Math.random().toString(36).substr(2, 9)}`,
                            sectorId: sectorId,
                            budgetAmount: 0,
                            detailedSpend: amount,
                            isVirtual: true
                        });
                    });

                    return {
                        id: budget.id || `temp-${supplierId}`,
                        supplierId: supplierId,
                        year: year,
                        totalBudget,
                        totalSpend,
                        details
                    };
                });

                console.log("Debug Data:", {
                    budgetsCount: rawBudgets.length,
                    expensesCount: expensesData.length,
                    summariesCount: transformedSummaries.length,
                    sampleSummary: transformedSummaries[0]
                });

                setSummaries(transformedSummaries);

            } catch (error) {
                console.error("Error fetching budget data:", error);
                toast.error("Errore nel caricamento dei dati");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [year, getToken, refreshTrigger]);

    // LOGICA CORRETTA: Calcolo proiezioni come nella Dashboard
    const contractProjections = useMemo(() => {
        if (contracts.length === 0) {
            return { futureBySupplierId: {}, futureBySectorId: {}, overdueBySupplierId: {} };
        }

        const filterStartDate = (() => {
            if (startDate) {
                const d = new Date(startDate);
                d.setHours(0, 0, 0, 0);
                return d;
            }
            return new Date(year, 0, 1);
        })();

        const filterEndDate = (() => {
            if (endDate) {
                const d = new Date(endDate);
                d.setHours(23, 59, 59, 999);
                return d;
            }
            return new Date(year, 11, 31, 23, 59, 59);
        })();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayMs = 24 * 60 * 60 * 1000;

        const normalizeDate = (value) => {
            if (!value) return null;
            const parsed = new Date(value);
            if (isNaN(parsed)) return null;
            parsed.setHours(0, 0, 0, 0);
            return parsed;
        };

        // Pre-process contract line items (same as Dashboard)
        const contractLineItemsMeta = new Map();
        contracts.forEach(contract => {
            const contractSupplierId = contract.supplierId || contract.supplierld; // Contract-level supplier
            const normalizedLineItems = (contract.lineItems || [])
                .map(lineItem => {
                    const lineItemId = lineItem.id || lineItem.lineItemId || lineItem._key || null;
                    if (!lineItemId) return null;
                    const total = parseFloat(lineItem.totalAmount) || 0;
                    const startDate = normalizeDate(lineItem.startDate);
                    const endDate = normalizeDate(lineItem.endDate);
                    return {
                        ...lineItem,
                        lineItemId,
                        total,
                        startDate,
                        endDate,
                        // Use line item supplier if present, otherwise fall back to contract supplier
                        supplierId: lineItem.supplierId || lineItem.supplierld || contractSupplierId,
                        sectorId: lineItem.sectorId || lineItem.sectorld
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

        // Track spend (same approach as Dashboard)
        const lineItemSpentTotal = new Map();
        const lineItemSpentLifetime = new Map(); // Key addition: lifetime spend
        const lineItemSpentInFilter = new Map(); // Spend in filter period (past + future)
        const lineItemSpentInFilterUpToToday = new Map();

        const addSpendToMaps = (contractId, lineItemId, amount, referenceDate) => {
            if (!contractId || !lineItemId || !amount) return;
            const key = `${contractId}|${lineItemId}`;
            lineItemSpentTotal.set(key, (lineItemSpentTotal.get(key) || 0) + amount);

            const date = normalizeDate(referenceDate);
            if (!date) return;

            // Lifetime: everything up to today
            if (date <= today) {
                lineItemSpentLifetime.set(key, (lineItemSpentLifetime.get(key) || 0) + amount);
            }

            // In-filter: everything in the filter period
            if (date >= filterStartDate && date <= filterEndDate) {
                lineItemSpentInFilter.set(key, (lineItemSpentInFilter.get(key) || 0) + amount);

                // In-filter up to today
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

        // Process expenses (same as Dashboard)
        marketingExpenses.forEach(expense => {
            const lineItems = expense.lineItems || [];
            if (lineItems.length > 0) {
                lineItems.forEach(item => {
                    const contractId = item.contractId || item.relatedContractId || expense.relatedContractId;
                    if (!contractId) return;

                    const amount = parseFloat(item.amount) || 0;
                    if (amount === 0) return;

                    // Try to find target line item
                    let targetLineItemId = item.relatedLineItemId;

                    // SMART LINKING FALLBACK
                    if (!targetLineItemId && contractId && item.description) {
                        const contractItems = contractLineItemsMeta.get(contractId);
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
                        addSpendToMaps(contractId, targetLineItemId, amount, expense.date);
                    } else {
                        allocateAmountToLineItems(contractId, amount, expense.date);
                    }
                });
            }

            // Fallback for expense-level link if no line items or they didn't cover it
            if (expense.relatedContractId && lineItems.length === 0) {
                const amount = parseFloat(expense.amount) || parseFloat(expense.totalAmount) || 0;
                if (amount !== 0) {
                    allocateAmountToLineItems(expense.relatedContractId, amount, expense.date);
                }
            }
        });

        // Calculate projections (Dashboard's logic)
        const futureBySupplierId = {};
        const futureBySectorId = {};
        const overdueBySupplierId = {};
        const overdueInFilterBySupplierId = {};

        contracts.forEach(contract => {
            const lineItems = contractLineItemsMeta.get(contract.id) || [];

            lineItems.forEach(lineItem => {
                const { lineItemId, total, startDate, endDate, supplierId, sectorId } = lineItem;

                if (!supplierId || total <= 0 || !startDate || !endDate || startDate > endDate) {
                    return;
                }

                // Filter overlap
                const overlapStart = new Date(Math.max(startDate.getTime(), filterStartDate.getTime()));
                overlapStart.setHours(0, 0, 0, 0);
                const overlapEnd = new Date(Math.min(endDate.getTime(), filterEndDate.getTime()));
                overlapEnd.setHours(0, 0, 0, 0);
                if (overlapStart > overlapEnd) {
                    return;
                }

                const fullDurationDays = Math.max(1, Math.round((endDate - startDate) / dayMs) + 1);
                const dailyCost = total / fullDurationDays;

                const key = `${contract.id}|${lineItemId}`;
                const spentTotal = lineItemSpentTotal.get(key) || 0;
                const spentLifetime = lineItemSpentLifetime.get(key) || 0;
                const spentInFilter = lineItemSpentInFilter.get(key) || 0;
                const spentInFilterUpToToday = lineItemSpentInFilterUpToToday.get(key) || 0;

                const lineRemaining = Math.max(0, total - spentTotal);
                if (lineRemaining <= 0) {
                    return;
                }

                // KEY DIFFERENCE: Calculate Lifetime Overdue (from start to today)
                const overdueEnd = new Date(Math.min(endDate.getTime(), today.getTime()));
                const daysOverdueLifetime = startDate > overdueEnd ? 0 : Math.max(0, Math.round((overdueEnd - startDate) / dayMs) + 1);
                const expectedOverdueLifetime = dailyCost * daysOverdueLifetime;

                // Calculate In-Filter Future (from tomorrow to filter end)
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);

                const futureStart = new Date(Math.max(overlapStart.getTime(), tomorrow.getTime()));
                const futureEnd = overlapEnd;
                const daysFutureInFilter = futureStart > futureEnd ? 0 : Math.max(0, Math.round((futureEnd - futureStart) / dayMs) + 1);
                const expectedFutureInFilter = dailyCost * daysFutureInFilter;

                // Spent future in filter (expenses after today but in filter)
                const spentFutureInFilter = Math.max(0, spentInFilter - spentInFilterUpToToday);

                // Calculate In-Filter Overdue (OverlapStart -> Today)
                const overdueEndInFilter = new Date(Math.min(overlapEnd.getTime(), today.getTime()));
                const daysOverdueInFilter = overlapStart > overdueEndInFilter ? 0 : Math.max(0, Math.round((overdueEndInFilter - overlapStart) / dayMs) + 1);
                const expectedOverdueInFilter = dailyCost * daysOverdueInFilter;

                // Shortfalls using Lifetime for overdue, In-Filter for future
                const overdueShortfallLifetime = Math.max(0, expectedOverdueLifetime - spentLifetime);
                const futureShortfallInFilter = Math.max(0, expectedFutureInFilter - spentFutureInFilter);

                // Shortfall for In-Filter Overdue
                const overdueShortfallInFilter = Math.max(0, expectedOverdueInFilter - spentInFilterUpToToday);

                // Amounts
                const overdueAmount = Math.min(lineRemaining, overdueShortfallLifetime);
                const futureAmount = Math.min(Math.max(0, lineRemaining - overdueAmount), futureShortfallInFilter);

                // Calculate In-Filter Overdue Amount (capped by remaining line amount)
                const overdueAmountInFilter = Math.min(lineRemaining, overdueShortfallInFilter);

                if (overdueAmount <= 0 && futureAmount <= 0 && overdueAmountInFilter <= 0) {
                    return;
                }

                if (futureAmount > 0) {
                    futureBySupplierId[supplierId] = (futureBySupplierId[supplierId] || 0) + futureAmount;
                    if (sectorId) {
                        futureBySectorId[sectorId] = (futureBySectorId[sectorId] || 0) + futureAmount;
                    }
                }

                if (overdueAmount > 0) {
                    overdueBySupplierId[supplierId] = (overdueBySupplierId[supplierId] || 0) + overdueAmount;
                }

                if (overdueAmountInFilter > 0) {
                    overdueInFilterBySupplierId[supplierId] = (overdueInFilterBySupplierId[supplierId] || 0) + overdueAmountInFilter;
                }
            });
        });

        return { futureBySupplierId, futureBySectorId, overdueBySupplierId, overdueInFilterBySupplierId };
    }, [contracts, marketingExpenses, startDate, endDate, year]);

    const displayData = useMemo(() => {
        let enriched = summaries.map(summary => {
            const supplierInfo = supplierMap.get(summary.supplierId);
            const details = summary.details || [];
            const projections = contractProjections.futureBySupplierId[summary.supplierId] || 0;
            const overdue = contractProjections.overdueBySupplierId[summary.supplierId] || 0;
            const overdueInFilter = contractProjections.overdueInFilterBySupplierId[summary.supplierId] || 0;

            let displayDetails = [...details];

            if (selectedSector !== 'all') {
                displayDetails = displayDetails.filter(d => d.sectorId === selectedSector);
            }

            if (selectedBranch !== 'all') {
                displayDetails = displayDetails.filter(d => (d.branchId || '') === selectedBranch);
            }

            let displaySpend = 0;
            let displayBudget = 0;

            if (selectedSector === 'all' && selectedBranch === 'all') {
                displaySpend = summary.totalSpend;
                displayBudget = summary.totalBudget;
            } else {
                displaySpend = displayDetails.reduce((sum, d) => sum + (d.detailedSpend || 0), 0);
                displayBudget = displayDetails.reduce((sum, d) => sum + (d.budgetAmount || 0), 0);
            }

            // Derive associated sectors from details if not present in supplier info
            let associatedSectors = supplierInfo?.associatedSectors || [];
            if (associatedSectors.length === 0 && details.length > 0) {
                const sectorIds = new Set(details.map(d => d.sectorId).filter(Boolean));
                associatedSectors = Array.from(sectorIds);
            }

            return {
                ...summary,
                ...supplierInfo,
                associatedSectors, // Override with derived sectors
                displaySpend,
                displayBudget,
                displayDetails,
                projections,
                overdue,
                overdueInFilter
            };
        });

        let baseFiltered = enriched.filter(s => s.displaySpend > 0 || s.displayBudget > 0 || s.projections > 0 || s.overdue > 0);

        if (selectedSector !== 'all' && baseFiltered.length > 0) {
            baseFiltered = baseFiltered.filter(s => {
                // Use the enriched associatedSectors which includes dynamically derived ones
                return s.associatedSectors?.includes(selectedSector);
            });
        }

        if (selectedBranch !== 'all') {
            baseFiltered = baseFiltered.filter(s => (s.displayDetails || []).length > 0);
        }

        if (searchTerm.trim() !== '') {
            baseFiltered = baseFiltered.filter(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        if (advancedFilter) {
            baseFiltered = baseFiltered.filter((s) => {
                const utilization = getUtilization(s);
                switch (advancedFilter) {
                    case 'healthy':
                        return utilization < 80;
                    case 'warning':
                        return utilization >= 80 && utilization < 100;
                    case 'overrun':
                        return utilization >= 100 || (s.overdue || 0) > 0;
                    default:
                        return true;
                }
            });
        }

        const filtered = [...baseFiltered];

        const { key: sortKey = 'spend', direction = 'desc' } = sortConfig || {};
        const directionMultiplier = direction === 'asc' ? 1 : -1;

        const getSectorNames = (item) => {
            return (item.associatedSectors || [])
                .map(id => sectorMap.get(id))
                .filter(Boolean)
                .join(', ') || '';
        };

        const getUtilization = (item) => {
            const budgetValue = item.displayBudget || 0;
            const forecastValue = showProjections ? (item.projections || 0) : 0;
            if (budgetValue > 0) {
                return ((item.displaySpend + forecastValue) / budgetValue) * 100;
            }
            if ((item.displaySpend || 0) + forecastValue > 0) {
                return 150;
            }
            return 0;
        };

        const getSortValue = (item, key) => {
            switch (key) {
                case 'supplier':
                    return (item.name || '').toLowerCase();
                case 'sector':
                    return getSectorNames(item).toLowerCase();
                case 'budget':
                    return item.displayBudget || 0;
                case 'spend':
                    return item.displaySpend || 0;
                case 'overdue':
                    return item.overdue || 0;
                case 'forecast':
                    return item.projections || 0;
                case 'progress':
                case 'utilization':
                    return getUtilization(item);
                default:
                    return (item.name || '').toLowerCase();
            }
        };

        return filtered.sort((a, b) => {
            const aValue = getSortValue(a, sortKey);
            const bValue = getSortValue(b, sortKey);

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                const difference = aValue - bValue;
                if (difference === 0) {
                    return directionMultiplier * (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' });
                }
                return difference * directionMultiplier;
            }

            return directionMultiplier * String(aValue ?? '').localeCompare(String(bValue ?? ''), 'it', { sensitivity: 'base' });
        });
    }, [
        summaries,
        supplierMap,
        selectedSector,
        selectedBranch,
        searchTerm,
        advancedFilter,
        contractProjections,
        sortConfig,
        sectorMap,
        showProjections
    ]);

    const supplierBarPalette = useMemo(
        () => ['#10B981', '#059669', '#047857', '#14B8A6', '#22D3EE', '#2DD4BF'],
        []
    );

    const supplierBarData = useMemo(() => {
        const computeValue = (item) =>
            (item.displaySpend || 0) + (showProjections ? (item.overdue || 0) : 0);

        const prioritized = [...displayData]
            .filter(item => (item.displaySpend || 0) > 0 || (showProjections && ((item.overdue || 0) > 0)))
            .sort((a, b) => computeValue(b) - computeValue(a));

        return prioritized
            .slice(0, 6)
            .map((item, index) => ({
                id: item.supplierId || item.id || index,
                name: item.name || 'N/D',
                spend: item.displaySpend || 0,
                overdue: showProjections ? (item.overdue || 0) : 0,
                projections: showProjections ? (item.projections || 0) : 0,
                forecast: showProjections ? ((item.projections || 0) + (item.overdue || 0)) : 0,
                budget: item.displayBudget || 0,
                color: supplierBarPalette[index % supplierBarPalette.length]
            }));
    }, [displayData, showProjections, supplierBarPalette]);

    const supplierInsights = useMemo(() => {
        if (displayData.length === 0) {
            return {
                topShare: 0,
                overBudgetValue: 0,
                overBudgetCount: 0,
                extraBudgetValue: 0,
                analyzedCount: 0
            };
        }

        // Calculate Top Share based on the top supplier in the FULL list (sorted by spend)
        const sortedBySpend = [...displayData].sort((a, b) => {
            const spendA = (a.displaySpend || 0) + (showProjections ? ((a.projections || 0) + (a.overdue || 0)) : 0);
            const spendB = (b.displaySpend || 0) + (showProjections ? ((b.projections || 0) + (b.overdue || 0)) : 0);
            return spendB - spendA;
        });

        const topEntry = sortedBySpend[0];
        const topTotal = (topEntry.displaySpend || 0) + (showProjections ? ((topEntry.projections || 0) + (topEntry.overdue || 0)) : 0);

        const grandTotal = displayData.reduce(
            (sum, entry) => sum + (entry.displaySpend || 0) + (showProjections ? ((entry.projections || 0) + (entry.overdue || 0)) : 0),
            0
        );

        const overBudgetSuppliers = displayData.filter(
            (entry) =>
                (entry.displayBudget || 0) > 0 &&
                (entry.displaySpend || 0) + (showProjections ? ((entry.projections || 0) + (entry.overdue || 0)) : 0) > (entry.displayBudget || 0)
        );

        const overBudgetValue = overBudgetSuppliers.reduce(
            (sum, entry) =>
                sum +
                Math.max(
                    0,
                    (entry.displaySpend || 0) + (showProjections ? ((entry.projections || 0) + (entry.overdue || 0)) : 0) - (entry.displayBudget || 0)
                ),
            0
        );

        const extraBudgetValue = displayData
            .filter((entry) => (entry.displayBudget || 0) <= 0)
            .reduce((sum, entry) => sum + (entry.displaySpend || 0) + (showProjections ? ((entry.projections || 0) + (entry.overdue || 0)) : 0), 0);

        return {
            topShare: grandTotal > 0 ? (topTotal / grandTotal) * 100 : 0,
            overBudgetValue,
            overBudgetCount: overBudgetSuppliers.length,
            extraBudgetValue,
            analyzedCount: displayData.length
        };
    }, [displayData, showProjections]);

    const sectorDistributionData = useMemo(() => {
        const totals = new Map();

        displayData.forEach(item => {
            const details = Array.isArray(item.displayDetails) ? item.displayDetails : [];

            if (details.length > 0) {
                details.forEach(detail => {
                    const sectorId = detail.sectorId || item.associatedSectors?.[0];
                    if (!sectorId) return;
                    const amount = detail.detailedSpend || detail.spend || 0;
                    if (amount <= 0) return;
                    totals.set(sectorId, (totals.get(sectorId) || 0) + amount);
                });
            } else {
                // Fallback: try to derive sector from item.details (which might be populated from expenses even if no budget)
                // OR from associatedSectors
                // OR from the expenses themselves if we had access to them here.
                // Since displayData items come from summaries, and we populated 'details' in summaries,
                // let's check if we can use that.

                // In the previous fix, we populated 'details' for suppliers without budget too.
                // So 'details' should not be empty if there are expenses with line items.
                // If 'details' is empty, it means expenses have no line items or no sectorId in line items.

                if (Array.isArray(item.associatedSectors) && item.associatedSectors.length > 0) {
                    const share = (item.displaySpend || 0) / item.associatedSectors.length;
                    if (share > 0) {
                        item.associatedSectors.forEach(sectorId => {
                            if (!sectorId) return;
                            totals.set(sectorId, (totals.get(sectorId) || 0) + share);
                        });
                    }
                } else if ((item.displaySpend || 0) > 0) {
                    // Try to find sector from the raw expenses if possible, but we don't have them here easily.
                    // However, we can try to map 'unassigned' to a default sector if needed, or just keep it.
                    // But wait, the user says "Non classificato" appears.
                    // If we want to fix it, we need to ensure 'details' is populated correctly in the first place.
                    totals.set('unassigned', (totals.get('unassigned') || 0) + item.displaySpend);
                }
            }
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
    }, [displayData, sectorMap]);

    const sectorDistributionTotal = useMemo(
        () => sectorDistributionData.reduce((sum, entry) => sum + entry.value, 0),
        [sectorDistributionData]
    );

    const sectorAreaData = useMemo(
        () => sectorDistributionData.map(entry => ({
            name: entry.name,
            value: entry.value,
            color: entry.color
        })),
        [sectorDistributionData]
    );

    const renderSupplierTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) {
            return null;
        }

        const data = payload[0]?.payload;
        if (!data) return null;

        const spendValue = data.spend || 0;
        const forecastValue = showProjections ? (data.forecast || 0) : 0;
        const budget = data.budget || 0;
        const total = spendValue + forecastValue;

        return (
            <div className={getTooltipContainerClass('emerald')}>
                <p className="text-sm font-bold text-slate-900">
                    {data.name || 'Fornitore'}
                </p>
                <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                    <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-emerald-600">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                            Speso
                        </span>
                        <span>{formatCurrency(spendValue)}</span>
                    </div>
                    {showProjections && (
                        <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-2 text-amber-600">
                                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                                Previsioni
                            </span>
                            <span>{formatCurrency(forecastValue)}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-slate-500">
                            <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                            Budget
                        </span>
                        <span>{formatCurrency(budget)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Totale</span>
                        <span className="text-slate-900">{formatCurrency(total)}</span>
                    </div>
                </div>
            </div>
        );
    }, [showProjections]);

    const renderSectorTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) {
            return null;
        }

        const entry = payload[0]?.payload;
        if (!entry) return null;

        const percentage = sectorDistributionTotal > 0
            ? ((entry.value / sectorDistributionTotal) * 100).toFixed(1)
            : '0.0';

        return (
            <div className={getTooltipContainerClass('emerald')}>
                <p className="text-sm font-bold text-slate-900">
                    {entry.name}
                </p>
                <p className="text-xs font-semibold text-slate-600 mt-1">
                    {formatCurrency(entry.value)} · {percentage}%
                </p>
            </div>
        );
    }, [sectorDistributionTotal]);

    const budgetAlerts = useMemo(() => {
        if (displayData.length === 0) return [];

        const suppliersWithForecast = displayData.map(supplier => {
            const forecast = supplier.displaySpend + (showProjections ? ((supplier.projections || 0) + (supplier.overdue || 0)) : 0);
            const overAmount = forecast - (supplier.displayBudget || 0);
            return {
                supplier,
                forecast,
                overAmount
            };
        });

        const alerts = [];

        const overBudgetSuppliers = suppliersWithForecast.filter(item => (item.supplier.displayBudget || 0) > 0 && item.overAmount > 0.01);
        if (overBudgetSuppliers.length > 0) {
            const totalOverrun = overBudgetSuppliers.reduce((sum, item) => sum + item.overAmount, 0);
            alerts.push({
                key: 'overBudget',
                type: 'critical',
                title: `${overBudgetSuppliers.length} fornitori oltre budget`,
                description: 'Valuta una riallocazione o riduci la spesa prevista.',
                totalLabel: 'Sforamento complessivo',
                totalAmount: totalOverrun,
                items: overBudgetSuppliers
                    .sort((a, b) => b.overAmount - a.overAmount)
                    .slice(0, 6)
                    .map(item => ({
                        id: item.supplier.supplierId || item.supplier.id,
                        name: item.supplier.name || 'N/D',
                        amount: item.overAmount,
                        forecast: item.forecast
                    }))
            });
        }

        const unbudgetedSuppliers = suppliersWithForecast.filter(item => (item.supplier.displayBudget || 0) <= 0 && item.forecast > 0);
        if (unbudgetedSuppliers.length > 0) {
            const totalUnbudgeted = unbudgetedSuppliers.reduce((sum, item) => sum + item.forecast, 0);
            alerts.push({
                key: 'unbudgeted',
                type: 'warning',
                title: `${unbudgetedSuppliers.length} fornitori senza budget allocato`,
                description: 'Assegna un budget per allineare la spesa registrata.',
                totalLabel: 'Spesa non allocata',
                totalAmount: totalUnbudgeted,
                items: unbudgetedSuppliers
                    .sort((a, b) => b.forecast - a.forecast)
                    .slice(0, 6)
                    .map(item => ({
                        id: item.supplier.supplierId || item.supplier.id,
                        name: item.supplier.name || 'N/D',
                        amount: item.forecast
                    }))
            });
        }

        return alerts;
    }, [displayData, showProjections]);

    const globalKpis = useMemo(() => {
        const totalSpend = displayData.reduce((sum, item) => sum + item.displaySpend, 0);
        const totalFutureProjections = displayData.reduce((sum, item) => sum + (item.projections || 0), 0);
        const totalOverdueProjections = displayData.reduce((sum, item) => sum + (item.overdue || 0), 0);
        const totalOverdueInFilter = displayData.reduce((sum, item) => sum + (item.overdueInFilter || 0), 0);

        let totalMasterBudget = 0;
        if (selectedSector === 'all') {
            totalMasterBudget = sectorBudgets.reduce((sum, item) => sum + (item.amount || 0), 0);
        } else {
            const budgetInfo = sectorBudgets.find(b => b.sectorId === selectedSector);
            totalMasterBudget = budgetInfo?.amount || 0;
        }



        const totalAllocatedBudget = displayData.reduce((sum, item) => sum + item.displayBudget, 0);
        // Use In-Filter overdue for forecast to match Dashboard
        const projectionsCombined = totalFutureProjections + totalOverdueInFilter;
        const totalForecast = totalSpend + (showProjections ? projectionsCombined : 0);
        const utilizationPercentage = totalMasterBudget > 0 ? (totalForecast / totalMasterBudget) * 100 : 0;
        const hasOverrunRisk = showProjections && totalForecast > totalMasterBudget;

        return { totalSpend, totalFutureProjections, totalOverdueProjections, totalMasterBudget, totalAllocatedBudget, utilizationPercentage, totalForecast, hasOverrunRisk };
    }, [displayData, sectorBudgets, selectedSector, showProjections]);

    const kpiCards = useMemo(() => {
        const supplierCount = displayData.length;
        const utilizationPct = globalKpis.totalMasterBudget > 0
            ? Math.round((globalKpis.totalForecast / globalKpis.totalMasterBudget) * 100)
            : 0;
        const utilizationTrend = globalKpis.totalForecast >= globalKpis.totalMasterBudget ? 'up' : 'down';

        return [
            {
                key: 'spesa',
                title: 'Spesa Effettiva',
                value: formatCurrency(globalKpis.totalSpend),
                subtitle: supplierCount > 0 ? `${supplierCount} fornitori monitorati` : 'Nessun fornitore filtrato',
                icon: <DollarSign className="w-6 h-6" />,
                gradient: 'from-emerald-500 to-green-600',
                tooltip: 'Somma di tutte le spese registrate e fatturate per il periodo selezionato.'
            },
            {
                key: 'allocato',
                title: 'Budget Allocato',
                value: formatCurrency(globalKpis.totalAllocatedBudget),
                subtitle: 'Distribuito sui canali attivi',
                icon: <Target className="w-6 h-6" />,
                gradient: 'from-emerald-400 to-lime-500',
                tooltip: 'Budget totale assegnato ai canali e fornitori attivi per l\'anno corrente.'
            },
            {
                key: 'forecast',
                title: 'Forecast Totale',
                value: formatCurrency(globalKpis.totalForecast),
                subtitle: showProjections ? 'Incluse proiezioni contrattuali' : 'Solo spesa registrata',
                icon: <TrendingUp className="w-6 h-6" />,
                gradient: 'from-teal-500 to-cyan-500',
                tooltip: 'Stima della spesa totale a fine periodo, basata sulle spese attuali e sui costi contrattuali futuri previsti.'
            },
            {
                key: 'master',
                title: 'Master Budget',
                value: formatCurrency(globalKpis.totalMasterBudget),
                subtitle: 'Cap residuo organizzativo',
                icon: <Percent className="w-6 h-6" />,
                gradient: 'from-emerald-600 to-slate-700',
                trend: globalKpis.totalMasterBudget > 0 ? {
                    direction: utilizationTrend,
                    value: `${utilizationPct}%`
                } : undefined,
                tooltip: 'Budget complessivo definito a livello aziendale per l\'area marketing.'
            }
        ];
    }, [globalKpis, showProjections, displayData.length]);
    const globalOverrunAmount = useMemo(() => {
        const forecast = globalKpis.totalForecast || 0;
        const master = globalKpis.totalMasterBudget || 0;
        return forecast > master ? forecast - master : 0;
    }, [globalKpis.totalForecast, globalKpis.totalMasterBudget]);
    const totalBudgetAlertsAmount = useMemo(
        () => budgetAlerts.reduce((sum, alert) => sum + (alert.totalAmount || 0), 0),
        [budgetAlerts]
    );
    const notificationCount = (globalKpis.hasOverrunRisk ? 1 : 0) + budgetAlerts.length;

    useEffect(() => {
        if (notificationCount === 0 && isNotificationsPanelOpen) {
            setIsNotificationsPanelOpen(false);
        }
    }, [notificationCount, isNotificationsPanelOpen]);

    const handleOpenModal = (supplier) => {
        setIsModalOpen(true);
        const summary = summaries.find(s => s.supplierId === supplier.id);
        setSelectedSupplier({
            ...supplier,
            allocations: summary?.details || [],
            isUnexpected: summary?.isUnexpected || false
        });
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedSupplier(null);
    };

    const handleSaveAllocations = useCallback(async (updatedAllocations) => {
        try {
            const token = await getToken();
            await axios.post('/api/budgets/update', {
                supplierId: selectedSupplier.id,
                year: year,
                allocations: updatedAllocations
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            toast.success("Budget aggiornato con successo");
            handleCloseModal();
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Error updating budget:", error);
            toast.error("Errore durante l'aggiornamento del budget");
        }
    }, [selectedSupplier, year, getToken, handleCloseModal]);

    const resetFilters = () => {
        setSearchTerm('');
        setSelectedSector('all');
        setSelectedBranch('all');
        setStartDate(defaultStartDate);
        setEndDate(defaultEndDate);
        setAdvancedFilter('');
        setIsAdvancedPanelOpen(false);
        setPresetName('');
        setIsFiltersPresetPanelOpen(false);
        toast.success("Filtri resettati!");
    };

    const applyPreset = (preset) => {
        const presetStart = preset.startDate || defaultStartDate;
        const presetEnd = preset.endDate || defaultEndDate;
        setStartDate(presetStart);
        setEndDate(presetEnd);
        setSelectedSector(preset.selectedSector || 'all');
        setSelectedBranch(preset.selectedBranch || 'all');
        setAdvancedFilter(preset.advancedFilter || '');
        setPresetName('');

        const derivedYear = new Date(presetEnd).getFullYear();
        if (!Number.isNaN(derivedYear)) {
            setYear(derivedYear);
        }

        toast.success(`Preset "${preset.name}" applicato`);
    };

    const deletePreset = (id) => {
        setFilterPresets(prev => prev.filter(p => p.id !== id));
        toast.success('Preset eliminato');
    };

    const handleYearChange = (newYear) => {
        setYear(newYear);
        const start = formatDateInput(newYear, 0, 1);
        const end = formatDateInput(newYear, 11, 31);
        setStartDate(start);
        setEndDate(end);
    };

    const handleSortChange = useCallback((columnKey) => {
        setSortConfig((prev) => {
            if (prev?.key === columnKey) {
                return {
                    key: columnKey,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc'
                };
            }
            const defaultDirection = ['supplier', 'sector'].includes(columnKey) ? 'asc' : 'desc';
            return {
                key: columnKey,
                direction: defaultDirection
            };
        });
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div className="text-xl font-semibold text-gray-700">Caricamento budget...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative">
            <div className="relative p-4 lg:p-8 space-y-6">
                {/* Header */}
                <div className="space-y-6">
                    <div className="relative rounded-3xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 text-white shadow-2xl border border-white/20 p-6 lg:p-10">
                        <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.3),transparent_60%)] pointer-events-none" />
                        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-emerald-900/30 ring-4 ring-white/25">
                                        <Target className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">Budget</p>
                                        <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">
                                            Controllo Budget
                                        </h1>
                                    </div>
                                </div>
                                <p className="text-sm lg:text-base text-white/85 max-w-3xl">
                                    Pianifica e monitora spesa, allocazioni e impegni contrattuali con la stessa logica applicata alle altre aree della piattaforma.
                                </p>
                                <div className="flex flex-wrap items-center gap-3" />
                            </div>
                            <div className="flex items-center justify-end">
                                <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                                    {notificationCount > 0 && (
                                        <div className="relative w-full">
                                            <button
                                                type="button"
                                                onClick={() => setIsNotificationsPanelOpen((prev) => !prev)}
                                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-900/30 backdrop-blur-sm transition-all bg-white/15 text-white hover:bg-white/25"
                                            >
                                                <Bell className="w-4 h-4" />
                                                Notifiche
                                                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-bold text-emerald-600">
                                                    {notificationCount}
                                                </span>
                                            </button>
                                            {isNotificationsPanelOpen && (
                                                <>
                                                    <div
                                                        className="absolute inset-0 z-40"
                                                        onClick={() => setIsNotificationsPanelOpen(false)}
                                                    />
                                                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[calc(100vw-3rem)] max-w-md rounded-3xl border border-white/40 bg-white/95 p-5 shadow-2xl shadow-emerald-900/30 backdrop-blur sm:w-[24rem] space-y-4">
                                                        {globalKpis.hasOverrunRisk && (
                                                            <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/80 p-4">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-500">
                                                                            Rischio budget globale
                                                                        </p>
                                                                        <h3 className="text-sm font-black text-slate-900">
                                                                            {formatCurrency(globalKpis.totalForecast)} previsti · Master {formatCurrency(globalKpis.totalMasterBudget)}
                                                                        </h3>
                                                                    </div>
                                                                    <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
                                                                        <AlertTriangle className="h-3.5 w-3.5" />
                                                                        {formatCurrency(globalOverrunAmount)}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-600">
                                                                    Con le proiezioni attuali potresti superare il budget master disponibile. Valuta una riallocazione o una revisione degli importi assegnati.
                                                                </p>
                                                            </div>
                                                        )}
                                                        {budgetAlerts.length > 0 && (
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-500">
                                                                        Alert attivi
                                                                    </p>
                                                                    <span className="text-xs font-bold text-emerald-600">
                                                                        Totale {formatCurrency(totalBudgetAlertsAmount)}
                                                                    </span>
                                                                </div>
                                                                <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
                                                                    {budgetAlerts.map(alert => {
                                                                        const isCritical = alert.type === 'critical';
                                                                        const isWarning = alert.type === 'warning';
                                                                        const accent = isCritical
                                                                            ? 'text-rose-600'
                                                                            : isWarning
                                                                                ? 'text-amber-600'
                                                                                : 'text-emerald-600';
                                                                        const badgeBg = isCritical
                                                                            ? 'bg-rose-50 border-rose-100'
                                                                            : isWarning
                                                                                ? 'bg-amber-50 border-amber-100'
                                                                                : 'bg-emerald-50 border-emerald-100';
                                                                        return (
                                                                            <div
                                                                                key={alert.key}
                                                                                className="space-y-2 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-inner shadow-slate-100/60"
                                                                            >
                                                                                <div className="space-y-1">
                                                                                    <h4 className="text-sm font-black text-slate-900">{alert.title}</h4>
                                                                                    <p className="text-xs font-medium text-slate-600">
                                                                                        {alert.description}
                                                                                    </p>
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeBg} ${accent}`}>
                                                                                        {alert.typeLabel}
                                                                                    </span>
                                                                                    <p className={`text-base font-black ${accent}`}>
                                                                                        {formatCurrency(alert.totalAmount)}
                                                                                    </p>
                                                                                </div>
                                                                                {alert.items?.length > 0 && (
                                                                                    <div className="grid grid-cols-1 gap-2">
                                                                                        {alert.items.map(item => (
                                                                                            <div
                                                                                                key={item.id || item.name}
                                                                                                className="flex items-center justify-between rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm"
                                                                                            >
                                                                                                <span className="truncate max-w-[160px]">{item.name}</span>
                                                                                                <span className={`font-bold ${accent}`}>
                                                                                                    {formatCurrency(item.amount)}
                                                                                                </span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsNotificationsPanelOpen(false)}
                                                            className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600 transition hover:bg-emerald-100"
                                                        >
                                                            Chiudi notifiche
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sezione Filtri */}
                <section className="relative z-20 rounded-3xl border border-white/80 bg-gradient-to-r from-slate-300/95 via-slate-100/90 to-white/90 px-4 py-5 shadow-[0_32px_72px_-38px_rgba(15,23,42,0.6)] backdrop-blur-2xl overflow-visible">
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
                        <div className="flex min-w-[170px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <Calendar className="h-4 w-4 text-slate-600" />
                            <select
                                value={year}
                                onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                {[0, -1, -2].map(offset => {
                                    const y = new Date().getFullYear() + offset;
                                    return (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
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
                                        {sector.name}
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
                        <div className="relative">
                            {isAdvancedPanelOpen && (
                                <div className="fixed inset-0 z-[210]" onClick={() => setIsAdvancedPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdvancedPanelOpen(prev => !prev);
                                    setIsFiltersPresetPanelOpen(false);
                                }}
                                aria-expanded={isAdvancedPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${advancedFilter ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <Filter className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">Filtri avanzati</span>
                                <ArrowUpDown
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isAdvancedPanelOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {isAdvancedPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-[20rem] rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                Stato utilizzo
                                            </p>
                                            <p className="text-xs font-medium text-slate-500">
                                                Evidenzia fornitori in base al livello di saturazione budget.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { key: '', label: 'Tutti' },
                                                { key: 'healthy', label: 'Sotto 80%' },
                                                { key: 'warning', label: '80% - 100%' },
                                                { key: 'overrun', label: 'Oltre 100% / arretrati' }
                                            ].map(option => {
                                                const active = advancedFilter === option.key;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={option.key || 'all'}
                                                        onClick={() => setAdvancedFilter(option.key)}
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
                                                onClick={() => setAdvancedFilter('')}
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
                        <div className="relative flex flex-row items-center gap-3">
                            {isFiltersPresetPanelOpen && (
                                <div className="fixed inset-0 z-[210]" onClick={() => setIsFiltersPresetPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFiltersPresetPanelOpen(prev => !prev);
                                    setIsAdvancedPanelOpen(false);
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
                                    <XCircle className="h-3.5 w-3.5" />
                                    Resetta filtri
                                </button>
                            )}
                            {isFiltersPresetPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-80 max-w-[calc(100vw-3rem)] rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                        Preset salvati
                                    </span>
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                        <input
                                            type="text"
                                            value={presetName}
                                            onChange={(event) => setPresetName(event.target.value)}
                                            placeholder="Nome preset (es. Consiglio Q1)"
                                            className="w-full sm:flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const name = presetName.trim();
                                                if (!name) {
                                                    toast.error('Inserisci un nome per il preset');
                                                    return;
                                                }
                                                const preset = {
                                                    id: Date.now(),
                                                    name,
                                                    startDate,
                                                    endDate,
                                                    selectedSector,
                                                    selectedBranch,
                                                    advancedFilter,
                                                };
                                                setFilterPresets(prev => {
                                                    const withoutDuplicates = prev.filter(p => p.name.toLowerCase() !== name.toLowerCase());
                                                    return [...withoutDuplicates, preset];
                                                });
                                                setPresetName('');
                                                setIsFiltersPresetPanelOpen(false);
                                                toast.success('Preset salvato');
                                            }}
                                            disabled={!presetName.trim()}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Check className="w-4 h-4" />
                                            Salva
                                        </button>
                                    </div>
                                    {filterPresets.length > 0 ? (
                                        <div className="mt-3 flex flex-col gap-2">
                                            {filterPresets.map(preset => (
                                                <div
                                                    key={preset.id}
                                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-100/40"
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
                                        <p className="mt-2 text-xs font-medium text-slate-400">
                                            Salva le combinazioni di filtri per riutilizzarle rapidamente.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {filterPresets.length > 0 && (
                        <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/70 bg-slate-50/85 px-4 py-3 shadow-inner shadow-slate-200/60 backdrop-blur">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
                    {kpiCards.map(({ key, ...card }) => (
                        <KpiCard key={key} {...card} />
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                        <div className="flex flex-col">
                            <div className="rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 px-6 py-5 text-white">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Analisi fornitori
                                </p>
                                <h2 className="text-lg font-black text-white">
                                    Principali canali · Spesa vs scostamenti
                                </h2>
                            </div>
                            <div className="flex flex-1 flex-col px-6 py-6">
                                <div className="flex-1">
                                    {supplierBarData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <AreaChart
                                                data={supplierBarData}
                                                stackOffset="none"
                                                margin={{ top: 12, right: 8, left: -12, bottom: 0 }}
                                            >
                                                <defs>
                                                    <linearGradient id="supplier-spend-gradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.95} />
                                                        <stop offset="100%" stopColor="#34D399" stopOpacity={0.35} />
                                                    </linearGradient>
                                                    <linearGradient id="supplier-forecast-gradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#F97316" stopOpacity={0.9} />
                                                        <stop offset="100%" stopColor="#FDBA74" stopOpacity={0.35} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                                                    tickFormatter={(value) => {
                                                        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                                                        if (value >= 1000) return `${Math.round(value / 1000)}k`;
                                                        return value.toFixed(0);
                                                    }}
                                                />
                                                <RechartsTooltip
                                                    cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                    content={renderSupplierTooltip}
                                                />
                                                <Area
                                                    type="linear"
                                                    dataKey="spend"
                                                    name="Speso"
                                                    stackId="supplier"
                                                    stroke="#10B981"
                                                    fill="url(#supplier-spend-gradient)"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                />
                                                {showProjections && (
                                                    <Area
                                                        type="linear"
                                                        dataKey="forecast"
                                                        name="Previsioni"
                                                        stackId="supplier"
                                                        stroke="#EA580C"
                                                        fill="url(#supplier-forecast-gradient)"
                                                        strokeWidth={2}
                                                        fillOpacity={1}
                                                    />
                                                )}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200/60 bg-white/60 p-10 text-center text-sm font-semibold text-emerald-600">
                                            Non ci sono spese registrate per i filtri selezionati.
                                        </div>
                                    )}
                                </div>
                                {supplierBarData.length > 0 && (
                                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {[
                                            {
                                                label: 'Peso principale',
                                                value: `${supplierInsights.topShare.toFixed(1)}%`,
                                                tone: 'text-slate-900',
                                                tooltip: 'Quota del primo fornitore sul totale speso (spesa effettiva + proiezioni).'
                                            },
                                            {
                                                label: 'Sforamento atteso',
                                                value: formatCurrency(supplierInsights.overBudgetValue),
                                                tone: 'text-rose-600',
                                                tooltip: `Differenza tra forecast e budget sui fornitori filtrati (${supplierInsights.overBudgetCount} fornitori).`
                                            },
                                            {
                                                label: 'Extra budget',
                                                value: formatCurrency(supplierInsights.extraBudgetValue),
                                                tone: 'text-slate-900',
                                                tooltip: 'Spesa associata ai fornitori privi di budget assegnato.'
                                            },
                                            {
                                                label: 'Campione analizzato',
                                                value: supplierBarData.length,
                                                tone: 'text-slate-900',
                                                tooltip: 'Numero di fornitori visualizzati nel grafico (ordinati per impatto).'
                                            }
                                        ].map((card) => (
                                            <div
                                                key={card.label}
                                                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                            >
                                                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                    {card.label}
                                                    <InfoTooltip message={card.tooltip} />
                                                </div>
                                                <p className={`text-sm font-semibold ${card.tone !== 'text-slate-900' ? card.tone : 'text-slate-800'}`}>
                                                    {card.value}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="relative flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
                        <div className="flex flex-col">
                            <div className="rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 px-6 py-5 text-white">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Ripartizione settoriale
                                </p>
                                <h2 className="text-lg font-black text-white">
                                    Contributo sui costi filtrati
                                </h2>
                            </div>
                            <div className="flex flex-1 flex-col px-6 py-6">
                                <div className="flex-1">
                                    {sectorAreaData.length > 0 ? (
                                        <>
                                            <ResponsiveContainer width="100%" height={320}>
                                                <AreaChart
                                                    data={sectorAreaData}
                                                    margin={{ top: 12, right: 8, left: -12, bottom: 0 }}
                                                >
                                                    <defs>
                                                        <linearGradient id="sector-area-gradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.95} />
                                                            <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.3} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis
                                                        dataKey="name"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                                                    />
                                                    <YAxis
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                                                        tickFormatter={(value) => {
                                                            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                                                            if (value >= 1000) return `${Math.round(value / 1000)}k`;
                                                            return value.toFixed(0);
                                                        }}
                                                    />
                                                    <RechartsTooltip
                                                        cursor={{ stroke: '#0EA5E9', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                        content={renderSectorTooltip}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke="#0EA5E9"
                                                        strokeWidth={2}
                                                        fill="url(#sector-area-gradient)"
                                                        fillOpacity={1}
                                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                                        isAnimationActive={false}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {sectorDistributionData.slice(0, 4).map((entry) => {
                                                    const percentage = sectorDistributionTotal > 0
                                                        ? `${Math.round((entry.value / sectorDistributionTotal) * 100)}%`
                                                        : '0%';
                                                    return (
                                                        <div
                                                            key={`sector-stat-${entry.id}`}
                                                            className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                                        >
                                                            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                                {entry.name}
                                                                <InfoTooltip message={`${entry.name}: ${formatCurrency(entry.value)} (${percentage}).`} />
                                                            </div>
                                                            <p className="text-sm font-semibold text-slate-800">
                                                                {percentage}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200/60 bg-white/60 p-10 text-center text-sm font-semibold text-emerald-600">
                                            Nessun dato disponibile per generare la ripartizione settoriale.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Lista Fornitori */}
                <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur-2xl mt-6">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -top-40 right-0 h-72 w-72 rounded-full bg-emerald-200/25 blur-3xl" />
                        <div className="absolute bottom-[-35%] left-1/4 h-72 w-72 rounded-full bg-teal-200/20 blur-2xl" />
                    </div>
                    <div className="relative z-10 flex flex-col">
                        <div className="flex flex-col gap-3 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 px-6 py-5 text-white md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Fornitori & allocazioni
                                </p>
                                <h2 className="text-lg font-black text-white">
                                    Budget per canale e stato di utilizzo
                                </h2>
                            </div>
                        </div>
                        <div className="relative z-10 px-6 pb-6 mt-4">
                            {displayData.length > 0 ? (
                                <SupplierTableView
                                    suppliers={displayData}
                                    onManage={handleOpenModal}
                                    sectorMap={sectorMap}
                                    showProjections={showProjections}
                                    sortConfig={sortConfig}
                                    onSort={handleSortChange}
                                />
                            ) : (
                                <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-12 text-center">
                                    <div className="p-4 rounded-2xl bg-emerald-100 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                                        <Search className="w-8 h-8 text-emerald-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-4">Nessun Fornitore Trovato</h3>
                                    <p className="text-slate-600">
                                        Non ci sono fornitori che corrispondono ai filtri attuali per l&apos;anno {year}.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <BudgetAllocationModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveAllocations}
                    supplier={selectedSupplier}
                    year={year}
                    initialAllocations={selectedSupplier?.allocations}
                    sectors={sectors}
                    branches={branches}
                    marketingChannels={marketingChannels}
                />
            )}
        </div>
    );
}
