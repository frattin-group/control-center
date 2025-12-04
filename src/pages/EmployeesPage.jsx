import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    Users,
    PlusCircle,
    Search,
    Filter,
    Building2,
    PieChart as PieChartIcon,
    Wallet,
    TrendingUp,
    Pencil,
    Trash2,
    Layers,
    Calendar,
    Bell,
    MapPin,
    SlidersHorizontal,
    X,
    XCircle,
    Check,
    ArrowUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import Spinner from '../components/Spinner';
import EmployeeFormModal from '../components/EmployeeFormModal';
import EmptyState from '../components/EmptyState';
import { KpiCard } from '../components/SharedComponents';
import { getSectorColor } from '../constants/sectorColors';
import { loadFilterPresets, persistFilterPresets } from '../utils/filterPresets';
import SortIndicatorIcon from '../components/SortIndicatorIcon';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts';

const STATUS_LABELS = {
    active: 'Attivo',
    inactive: 'Non attivo',
};

const STATUS_FILTER_OPTIONS = [
    { id: 'all', label: 'Tutti' },
    { id: 'active', label: 'Attivi' },
    { id: 'inactive', label: 'Non attivi' },
];

const CHART_COLORS = [
    '#4338ca',
    '#db2777',
    '#0891b2',
    '#22c55e',
    '#f59e0b',
    '#6366f1',
    '#ec4899',
    '#0ea5e9',
    '#10b981',
    '#f97316',
];

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

const CURRENT_MONTH_INDEX = new Date().getMonth();
const CURRENT_MONTH_KEY = MONTHS[CURRENT_MONTH_INDEX]?.id ?? '01';
const CURRENT_YEAR = new Date().getFullYear();
const branchColorPalette = [
    '#6366F1',
    '#EC4899',
    '#F97316',
    '#10B981',
    '#0EA5E9',
    '#F59E0B',
];

const formatCurrency = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '€ 0';
    }
    return value.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    });
};

const normalizeNumber = (value) => {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyYearMap = () =>
    MONTHS.reduce((acc, month) => {
        acc[month.id] = 0;
        return acc;
    }, {});

const normalizeMonthlyCostsByYear = (employee) => {
    const byYear = {};

    if (employee?.monthlyCostsByYear && typeof employee.monthlyCostsByYear === 'object') {
        Object.entries(employee.monthlyCostsByYear).forEach(([year, months]) => {
            const yearKey = String(year);
            const normalizedMonths = createEmptyYearMap();
            if (months && typeof months === 'object') {
                MONTHS.forEach((month) => {
                    const value = months[month.id] ?? months[month.id.toLowerCase()];
                    if (typeof value === 'number') {
                        normalizedMonths[month.id] = value;
                    } else if (value) {
                        const parsed = parseFloat(value);
                        normalizedMonths[month.id] = Number.isFinite(parsed) ? parsed : 0;
                    }
                });
            }
            byYear[yearKey] = normalizedMonths;
        });
    }

    if (!Object.keys(byYear).length) {
        const normalizedMonths = createEmptyYearMap();
        if (employee?.monthlyCosts && typeof employee.monthlyCosts === 'object') {
            MONTHS.forEach((month) => {
                const value =
                    employee.monthlyCosts[month.id] ?? employee.monthlyCosts[month.id.toLowerCase()];
                if (typeof value === 'number') {
                    normalizedMonths[month.id] = value;
                } else if (value) {
                    const parsed = parseFloat(value);
                    normalizedMonths[month.id] = Number.isFinite(parsed) ? parsed : 0;
                }
            });
        } else if (typeof employee?.monthlyCost === 'number') {
            normalizedMonths[CURRENT_MONTH_KEY] = normalizeNumber(employee.monthlyCost);
        }
        byYear[String(CURRENT_YEAR)] = normalizedMonths;
    }

    const availableYears = Object.keys(byYear);
    const preferredYear = (() => {
        const defaultYear = employee?.defaultYear && String(employee.defaultYear);
        if (defaultYear && byYear[defaultYear]) return defaultYear;
        if (availableYears.includes(String(CURRENT_YEAR))) return String(CURRENT_YEAR);
        return availableYears[0];
    })();

    return { byYear, preferredYear };
};

const enhanceEmployee = (employee) => {
    const { byYear, preferredYear } = normalizeMonthlyCostsByYear(employee);
    const monthlyCosts = byYear[preferredYear] || createEmptyYearMap();

    return {
        ...employee,
        monthlyCostsByYear: byYear,
        monthlyCosts,
        monthlyCost: monthlyCosts[CURRENT_MONTH_KEY] ?? 0,
        defaultYear: preferredYear,
        status: employee.status || 'active',
        employmentType: employee.employmentType || 'full_time',
        department: employee.department || '',
    };
};

const getMonthlyCostForEmployee = (employee, year, monthKey) => {
    if (!employee) return 0;
    const yearKey = String(year);
    const value =
        employee.monthlyCostsByYear?.[yearKey]?.[monthKey] ??
        employee.monthlyCosts?.[monthKey];
    return typeof value === 'number' ? value : normalizeNumber(value);
};

const getAnnualCostForEmployee = (employee, year) =>
    MONTHS.reduce((sum, month) => sum + getMonthlyCostForEmployee(employee, year, month.id), 0);

export default function EmployeesPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);

    const [employees, setEmployees] = useState([]);
    const [branches, setBranches] = useState([]);
    const [sectors, setSectors] = useState([]);

    // ... (State variables remain same)

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState('all');
    const [selectedSectorId, setSelectedSectorId] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active');
    const [selectedDepartment, setSelectedDepartment] = useState('all');
    const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const otherPresetsRef = useRef([]);
    const [filterPresets, setFilterPresets] = useState(() => {
        const stored = loadFilterPresets() || [];
        const scoped = [];
        const others = [];
        stored.forEach((preset) => {
            if (!preset.scope || preset.scope === 'employees') {
                scoped.push(preset);
            } else {
                others.push(preset);
            }
        });
        otherPresetsRef.current = others;
        return scoped;
    });
    const [presetName, setPresetName] = useState('');
    const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false);
    const [isAdvancedPanelOpen, setIsAdvancedPanelOpen] = useState(false);
    const presetsMountedRef = useRef(false);

    useEffect(() => {
        if (presetsMountedRef.current) {
            const scopedPresets = filterPresets.map((preset) => ({
                ...preset,
                scope: 'employees',
            }));
            persistFilterPresets([...otherPresetsRef.current, ...scopedPresets]);
        } else {
            presetsMountedRef.current = true;
        }
    }, [filterPresets]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [employeesRes, branchesRes, sectorsRes] = await Promise.all([
                axios.get('/api/employees'),
                axios.get('/api/data/branches'),
                axios.get('/api/data/sectors')
            ]);

            setEmployees(employeesRes.data.map(enhanceEmployee));
            setBranches(branchesRes.data);
            setSectors(sectorsRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Impossibile caricare i dati. Riprova più tardi.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
    const sectorMap = useMemo(() => new Map(sectors.map((sector) => [sector.id, sector.name])), [sectors]);
    const departmentOptions = useMemo(() => {
        const set = new Set();
        employees.forEach((employee) => {
            const value = (employee.department || '').trim();
            if (value) {
                set.add(value);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    }, [employees]);

    const availableYears = useMemo(() => {
        const years = new Set([String(CURRENT_YEAR)]);
        employees.forEach((employee) => {
            Object.keys(employee.monthlyCostsByYear || {}).forEach((year) => {
                years.add(String(year));
            });
        });
        return Array.from(years).sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
    }, [employees]);

    useEffect(() => {
        if (!availableYears.length) return;
        if (!availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0]);
        }
    }, [availableYears, selectedYear]);


    const filteredEmployees = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const normalizedSelectedDepartment =
            selectedDepartment === 'all' ? null : selectedDepartment.trim().toLowerCase();

        const filtered = employees.filter((employee) => {
            const departmentValue = (employee.department || '').trim();
            const matchesSearch =
                term.length === 0 ||
                [
                    employee.name,
                    employee.jobTitle,
                    branchMap.get(employee.branchId),
                    sectorMap.get(employee.sectorId),
                    departmentValue,
                ]
                    .filter(Boolean)
                    .some((value) => value.toLowerCase().includes(term));

            const matchesBranch = selectedBranchId === 'all' || employee.branchId === selectedBranchId;
            const matchesSector =
                selectedSectorId === 'all' || (employee.sectorId && employee.sectorId === selectedSectorId);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' ? employee.status !== 'inactive' : employee.status === 'inactive');

            const matchesDepartment =
                !normalizedSelectedDepartment ||
                departmentValue.toLowerCase() === normalizedSelectedDepartment;

            return matchesSearch && matchesBranch && matchesSector && matchesStatus && matchesDepartment;
        });

        const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;

        const getSortValue = (employee, key) => {
            switch (key) {
                case 'name':
                    return employee.name || '';
                case 'jobTitle':
                    return employee.jobTitle || '';
                case 'branch':
                    return branchMap.get(employee.branchId) || '';
                case 'sector':
                    return sectorMap.get(employee.sectorId) || '';
                case 'department':
                    return (employee.department || '').trim();
                case 'cost':
                    return getAnnualCostForEmployee(employee, selectedYear);
                default:
                    return '';
            }
        };

        return [...filtered].sort((a, b) => {
            const aValue = getSortValue(a, sortConfig.key);
            const bValue = getSortValue(b, sortConfig.key);

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                if (aValue === bValue) return 0;
                return aValue > bValue ? directionMultiplier : -directionMultiplier;
            }

            return String(aValue)
                .localeCompare(String(bValue), 'it', { sensitivity: 'base' }) * directionMultiplier;
        });
    }, [
        employees,
        searchTerm,
        selectedBranchId,
        selectedSectorId,
        statusFilter,
        selectedDepartment,
        branchMap,
        sectorMap,
        sortConfig,
        selectedYear,
    ]);

    const headcount = filteredEmployees.length;
    const selectedYearKey = selectedYear || String(CURRENT_YEAR);
    const totalAnnualCost = filteredEmployees.reduce(
        (sum, employee) => sum + getAnnualCostForEmployee(employee, selectedYearKey),
        0
    );

    const costByBranchAnnual = useMemo(() => {
        const map = new Map();
        filteredEmployees.forEach((employee) => {
            const key = employee.branchId || 'unknown';
            if (!map.has(key)) {
                map.set(key, {
                    branchId: employee.branchId,
                    branchName: branchMap.get(employee.branchId) || 'Non assegnato',
                    totalCost: 0,
                    headcount: 0,
                });
            }
            const entry = map.get(key);
            entry.totalCost += getAnnualCostForEmployee(employee, selectedYearKey);
            entry.headcount += 1;
        });
        return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
    }, [filteredEmployees, branchMap, selectedYearKey]);

    const costBySectorAnnual = useMemo(() => {
        const map = new Map();
        filteredEmployees.forEach((employee) => {
            const key = employee.sectorId || 'unknown';
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    name: sectorMap.get(employee.sectorId) || 'Non assegnato',
                    totalCost: 0,
                });
            }
            const entry = map.get(key);
            entry.totalCost += getAnnualCostForEmployee(employee, selectedYearKey);
        });
        return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
    }, [filteredEmployees, sectorMap, selectedYearKey]);

    const sectorKeys = useMemo(
        () => costBySectorAnnual.slice(0, 4),
        [costBySectorAnnual]
    );

    const sectorNameById = useMemo(() => {
        const map = new Map();
        sectorKeys.forEach((sector) => {
            map.set(sector.id, sector.name);
        });
        return map;
    }, [sectorKeys]);

    const monthlySectorData = useMemo(() => {
        if (sectorKeys.length === 0) return [];

        const base = MONTHS.map((month) => {
            const entry = {
                monthId: month.id,
                monthLabel: month.label.slice(0, 3),
            };
            sectorKeys.forEach((sector) => {
                entry[sector.id] = 0;
            });
            return entry;
        });

        filteredEmployees.forEach((employee) => {
            const key = employee.sectorId || 'unknown';
            const sectorIndex = sectorKeys.findIndex((sector) => sector.id === key);
            if (sectorIndex === -1) return;
            const sectorKey = sectorKeys[sectorIndex].id;
            const months = employee.monthlyCostsByYear?.[selectedYearKey];
            if (!months) return;
            base.forEach((entry) => {
                const value = months[entry.monthId] || 0;
                if (value > 0) {
                    entry[sectorKey] += value;
                }
            });
        });

        return base;
    }, [filteredEmployees, selectedYearKey, sectorKeys]);

    const costByDepartmentAnnual = useMemo(() => {
        const map = new Map();
        filteredEmployees.forEach((employee) => {
            const dept = (employee.department || 'Non assegnato').trim() || 'Non assegnato';
            if (!map.has(dept)) {
                map.set(dept, {
                    id: dept.toLowerCase().replace(/\s+/g, '-'),
                    name: dept,
                    totalCost: 0,
                });
            }
            const entry = map.get(dept);
            entry.totalCost += getAnnualCostForEmployee(employee, selectedYearKey);
        });
        return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
    }, [filteredEmployees, selectedYearKey]);

    const departmentChartData = useMemo(
        () =>
            costByDepartmentAnnual.map((entry, index) => ({
                ...entry,
                value: entry.totalCost,
                color: branchColorPalette[index % branchColorPalette.length],
            })),
        [costByDepartmentAnnual]
    );

    const departmentChartSummary = useMemo(
        () => departmentChartData.slice(0, 4),
        [departmentChartData]
    );

    const employeeNotifications = useMemo(() => [], []);
    const notificationCount = employeeNotifications.length;

    useEffect(() => {
        if (notificationCount === 0 && isNotificationsPanelOpen) {
            setIsNotificationsPanelOpen(false);
        }
    }, [notificationCount, isNotificationsPanelOpen]);

    const hasDepartmentChartData = useMemo(
        () => departmentChartData.some((entry) => entry.totalCost > 0),
        [departmentChartData]
    );

    const renderMonthlySectorTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const monthId = payload[0]?.payload?.monthId;
        const monthLabel = (() => {
            if (monthId) {
                const match = MONTHS.find((month) => month.id === monthId);
                if (match) return match.label;
            }
            return payload[0]?.payload?.monthLabel || '';
        })();

        const rows = payload
            .filter((item) => Number(item.value) > 0)
            .map((item) => {
                const sectorId = item.dataKey;
                const sectorIndex = sectorKeys.findIndex((sector) => sector.id === sectorId);
                const name = sectorNameById.get(String(sectorId)) || sectorId;
                const color = getSectorColor(name, sectorIndex);
                return {
                    id: sectorId,
                    name,
                    value: item.value,
                    color,
                };
            });

        if (rows.length === 0) return null;

        return (
            <div className="rounded-2xl border border-rose-100 bg-white/95 px-4 py-3 shadow-xl shadow-rose-100/40 backdrop-blur">
                <p className="text-sm font-bold text-slate-900">{monthLabel}</p>
                <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                    {rows.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-2 text-slate-600">
                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                                {row.name}
                            </span>
                            <span>{formatCurrency(row.value)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }, [sectorKeys, sectorNameById]);

    const renderDepartmentTooltip = useCallback(({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const dataPoint = payload[0]?.payload;
        if (!dataPoint) return null;

        return (
            <div className="rounded-2xl border border-rose-100 bg-white/95 px-4 py-3 shadow-xl shadow-rose-100/40 backdrop-blur">
                <p className="text-sm font-bold text-slate-900">{dataPoint.name || 'Reparto'}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                    Totale {selectedYearKey}
                </p>
                <p className="text-sm font-bold text-slate-900">
                    {formatCurrency(dataPoint.totalCost || dataPoint.value || 0)}
                </p>
            </div>
        );
    }, [selectedYearKey]);

    const hasSectorChartData = useMemo(
        () =>
            monthlySectorData.some((entry) =>
                sectorKeys.some((sector) => entry[sector.id] > 0)
            ),
        [monthlySectorData, sectorKeys]
    );

    const topCostCenter = costByBranchAnnual.length > 0 ? costByBranchAnnual[0] : null;
    const averageMonthlyCostYear = totalAnnualCost / 12;
    const averageCostPerEmployeeYear = headcount > 0 ? totalAnnualCost / headcount : 0;

    const kpiCards = [
        {
            key: 'annual-cost',
            title: `Costo annuo totale • ${selectedYearKey}`,
            value: formatCurrency(totalAnnualCost),
            subtitle: `${headcount} dipendenti considerati`,
            icon: <PieChartIcon />,
            gradient: 'from-pink-500 via-rose-500 to-orange-400',
            tooltip: `Totale dei costi del personale per l'anno ${selectedYearKey}.`,
        },
        {
            key: 'avg-monthly',
            title: 'Costo medio mensile',
            value: formatCurrency(averageMonthlyCostYear),
            subtitle: `Media su 12 mesi • ${selectedYearKey}`,
            icon: <Wallet />,
            gradient: 'from-fuchsia-500 via-rose-500 to-pink-500',
            tooltip: 'Media dei costi mensili del personale.',
        },
        {
            key: 'avg-employee',
            title: 'Costo medio per dipendente',
            value: formatCurrency(averageCostPerEmployeeYear),
            subtitle: `${selectedYearKey} • annuale per risorsa`,
            icon: <TrendingUp />,
            gradient: 'from-rose-500 via-fuchsia-500 to-purple-500',
            tooltip: 'Costo medio annuo per singola risorsa.',
        },
        {
            key: 'top-branch',
            title: 'Centro di costo principale',
            value: topCostCenter ? topCostCenter.branchName : '—',
            subtitle: topCostCenter
                ? `${formatCurrency(topCostCenter.totalCost)} • ${selectedYearKey}`
                : 'In attesa di dati',
            icon: <Building2 />,
            gradient: 'from-slate-800 via-slate-900 to-black',
            tooltip: 'Filiale con il costo del personale più elevato.',
        },
    ];

    const openCreateModal = () => {
        setEditingEmployee(null);
        setIsModalOpen(true);
    };

    const openEditModal = (employee) => {
        setEditingEmployee(employee);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEmployee(null);
    };

    const handleSaveEmployee = async (payload) => {
        try {
            if (editingEmployee) {
                await axios.put(`/api/employees/${editingEmployee.id}`, payload);
                toast.success('Dipendente aggiornato con successo.');
            } else {
                await axios.post('/api/employees', payload);
                toast.success('Dipendente aggiunto con successo.');
            }
            fetchData();
            closeModal();
        } catch (error) {
            console.error('Errore durante il salvataggio del dipendente:', error);
            toast.error('Si è verificato un errore durante il salvataggio. Riprova.');
        }
    };

    const handleDeleteEmployee = async (employee) => {
        const confirmDelete = window.confirm(
            `Vuoi davvero eliminare ${employee.name || 'questo dipendente'}? Questa azione non è reversibile.`
        );
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/employees/${employee.id}`);
            toast.success('Dipendente eliminato.');
            fetchData();
        } catch (error) {
            console.error('Errore durante l’eliminazione del dipendente:', error);
            toast.error('Impossibile eliminare il dipendente.');
        }
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedBranchId('all');
        setSelectedSectorId('all');
        setStatusFilter('active');
        setSelectedDepartment('all');
        setSelectedYear(String(CURRENT_YEAR));
    };

    const handleSavePreset = useCallback(() => {
        const name = presetName.trim();
        if (!name) {
            toast.error('Inserisci un nome per il preset');
            return;
        }
        const preset = {
            id: Date.now(),
            scope: 'employees',
            name,
            searchTerm,
            selectedBranchId,
            selectedSectorId,
            statusFilter,
            selectedDepartment,
            selectedYear,
        };
        setFilterPresets((prev) => {
            const withoutDuplicates = prev.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
            return [...withoutDuplicates, preset];
        });
        setPresetName('');
        toast.success('Preset salvato');
    }, [presetName, searchTerm, selectedBranchId, selectedSectorId, statusFilter, selectedDepartment, selectedYear]);

    const applyPreset = useCallback((preset) => {
        setSearchTerm(preset.searchTerm || '');
        setSelectedBranchId(preset.selectedBranchId || 'all');
        setSelectedSectorId(preset.selectedSectorId || 'all');
        setStatusFilter(preset.statusFilter || 'active');
        setSelectedDepartment(preset.selectedDepartment || 'all');
        setSelectedYear(preset.selectedYear || String(CURRENT_YEAR));
        toast.success(`Preset "${preset.name}" applicato`);
    }, []);

    const handleDeletePreset = useCallback((id) => {
        setFilterPresets((prev) => prev.filter((preset) => preset.id !== id));
        toast.success('Preset eliminato');
    }, []);

    const hasEmployeeFilters = Boolean(
        searchTerm ||
        selectedBranchId !== 'all' ||
        selectedSectorId !== 'all' ||
        statusFilter !== 'active' ||
        selectedDepartment !== 'all' ||
        selectedYear !== String(CURRENT_YEAR)
    );

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return {
                    key,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc',
                };
            }
            return { key, direction: 'asc' };
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-rose-50 to-pink-100 relative">
            <div className="relative p-4 lg:p-8 space-y-8">
                <div className="relative rounded-3xl bg-gradient-to-br from-fuchsia-600 via-rose-600 to-pink-500 text-white shadow-2xl border border-white/20 p-6 lg:p-10">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]" />
                    <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-4 lg:max-w-3xl">
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-rose-900/30 ring-4 ring-white/20">
                                    <Users className="w-7 h-7" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">
                                        Risorse Umane
                                    </p>
                                    <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">
                                        Dipendenti & Costi HR
                                    </h1>
                                </div>
                            </div>
                            <p className="text-sm lg:text-base text-white/85 max-w-3xl">
                                Controlla l’organico aziendale e monitora l’impatto dei costi del personale sui centri di costo, mantenendo coerenza con il resto della piattaforma.
                            </p>
                        </div>
                        <div className="flex w-full flex-col gap-4 lg:ml-auto lg:w-auto lg:max-w-5xl">
                            <div className="flex flex-col items-end gap-3">
                                <div className="inline-flex w-full flex-col gap-3 sm:w-auto">
                                    {notificationCount > 0 && (
                                        <div className="relative w-full sm:w-auto">
                                            <button
                                                type="button"
                                                onClick={() => setIsNotificationsPanelOpen(prev => !prev)}
                                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-lg shadow-rose-900/30 backdrop-blur-sm transition-all bg-white/15 text-white hover:bg-white/25"
                                            >
                                                <Bell className="w-4 h-4" />
                                                Notifiche
                                                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-bold text-rose-600">
                                                    {notificationCount}
                                                </span>
                                            </button>
                                            {isNotificationsPanelOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setIsNotificationsPanelOpen(false)}
                                                    />
                                                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/40 bg-white/95 p-5 shadow-2xl shadow-rose-900/30 backdrop-blur sm:w-80 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-500">
                                                                Centro notifiche
                                                            </p>
                                                            <p className="text-sm font-black text-slate-900 mt-1">
                                                                Nessun avviso disponibile
                                                            </p>
                                                            <p className="text-xs font-medium text-slate-500 mt-1">
                                                                Le comunicazioni relative al personale verranno mostrate qui quando disponibili.
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsNotificationsPanelOpen(false)}
                                                            className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-600 transition hover:bg-rose-100"
                                                        >
                                                            Chiudi notifiche
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={openCreateModal}
                                            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-900/30 backdrop-blur-sm transition-all hover:bg-white/25"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            Nuovo dipendente
                                        </button>
                                    </div>
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
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Ricerca libera"
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 placeholder:text-slate-600 focus:outline-none"
                            />
                        </div>
                        <div className="flex min-w-[170px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <Calendar className="h-4 w-4 text-slate-600" />
                            <select
                                value={selectedYear}
                                onChange={(event) => setSelectedYear(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                {availableYears.map((yearOption) => (
                                    <option key={yearOption} value={yearOption}>
                                        {yearOption}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <Layers className="h-4 w-4 text-slate-600" />
                            <select
                                value={selectedSectorId}
                                onChange={(event) => setSelectedSectorId(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                <option value="all">Tutti i settori</option>
                                {sectors.map((sector) => (
                                    <option key={sector.id} value={sector.id}>
                                        {sector.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex min-w-[200px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur">
                            <MapPin className="h-4 w-4 text-slate-600" />
                            <select
                                value={selectedBranchId}
                                onChange={(event) => setSelectedBranchId(event.target.value)}
                                className="w-full bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            >
                                <option value="all">Tutte le filiali</option>
                                {branches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
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
                                    setIsPresetPanelOpen(false);
                                }}
                                aria-expanded={isAdvancedPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${(selectedDepartment !== 'all' || statusFilter !== 'active') ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <Filter className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">Filtri avanzati</span>
                                <ArrowUpDown
                                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isAdvancedPanelOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {isAdvancedPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur space-y-4">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            Filtri aggiuntivi
                                        </p>
                                        <p className="text-xs font-medium text-slate-500">
                                            Personalizza la vista dell’anagrafica dipendenti.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Reparto
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {departmentOptions.map((departmentName) => {
                                                const active = selectedDepartment === departmentName;
                                                return (
                                                    <button
                                                        key={departmentName}
                                                        type="button"
                                                        onClick={() => setSelectedDepartment(departmentName)}
                                                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${active
                                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
                                                            : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                                                            }`}
                                                    >
                                                        {departmentName}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Stato
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {STATUS_FILTER_OPTIONS.map((option) => {
                                                const active = statusFilter === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => setStatusFilter(option.value)}
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
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedDepartment('all');
                                                setStatusFilter('active');
                                            }}
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
                            {isPresetPanelOpen && (
                                <div className="fixed inset-0 z-[210]" onClick={() => setIsPresetPanelOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPresetPanelOpen(prev => !prev);
                                    setIsAdvancedPanelOpen(false);
                                }}
                                aria-expanded={isPresetPanelOpen}
                                className={`inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/80 backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600 ${isPresetPanelOpen ? 'ring-2 ring-indigo-100' : ''
                                    }`}
                            >
                                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                <span className="whitespace-nowrap">Preset</span>
                            </button>
                            {hasEmployeeFilters && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm shadow-rose-100/60 transition hover:border-rose-300 whitespace-nowrap"
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Resetta filtri
                                </button>
                            )}
                            {isPresetPanelOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[220] w-[calc(100vw-3rem)] max-w-xs rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur space-y-3">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            Preset salvati
                                        </p>
                                        <p className="text-xs font-medium text-slate-500">
                                            Salva e riutilizza combinazioni di filtri.
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                                        <input
                                            type="text"
                                            value={presetName}
                                            onChange={(event) => setPresetName(event.target.value)}
                                            placeholder="Nome preset (es. HR Italia)"
                                            className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/70"
                                        />
                                        <button
                                            type="button"
                                            disabled={!presetName.trim()}
                                            onClick={() => {
                                                if (!presetName.trim()) return;
                                                handleSavePreset();
                                                setIsPresetPanelOpen(false);
                                            }}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                            Salva
                                        </button>
                                    </div>
                                    {filterPresets.length > 0 ? (
                                        <div className="flex flex-col gap-2">
                                            {filterPresets.map((preset) => (
                                                <div
                                                    key={preset.id}
                                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-100/60"
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
                                                        onClick={() => handleDeletePreset(preset.id)}
                                                        className="text-slate-300 transition-colors hover:text-rose-500"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs font-medium text-slate-400">
                                            Nessun preset salvato al momento.
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
                            {filterPresets.map((preset) => (
                                <div
                                    key={`quick-preset-${preset.id}`}
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
                                        onClick={() => handleDeletePreset(preset.id)}
                                        className="text-slate-300 transition-colors hover:text-rose-500"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {kpiCards.map(({ key, ...card }) => (
                        <KpiCard key={key} {...card} />
                    ))}
                </div>

                <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-rose-200/25 blur-3xl" />
                            <div className="absolute bottom-[-40%] left-1/3 h-56 w-56 rounded-full bg-rose-100/20 blur-2xl" />
                        </div>
                        <div className="relative z-10 flex flex-col gap-1 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-400 px-6 py-5 text-white">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                Settori
                            </p>
                            <h2 className="text-lg font-black text-white">
                                Distribuzione mensile {selectedYearKey}
                            </h2>
                        </div>
                        <div className="relative z-10 flex flex-1 flex-col px-6 py-6">
                            <div className="flex-1">
                                {!hasSectorChartData ? (
                                    <div className="flex h-full items-center justify-center">
                                        <EmptyState
                                            icon={Layers}
                                            title="Nessun dato disponibile"
                                            message="Aggiungi un dipendente o modifica i filtri per vedere la ripartizione annuale."
                                        />
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlySectorData}>
                                            <defs>
                                                {sectorKeys.map((sector, index) => {
                                                    const color = getSectorColor(sector.name, index);
                                                    return (
                                                        <linearGradient
                                                            key={`gradient-${sector.id}`}
                                                            id={`branch-gradient-${sector.id}`}
                                                            x1="0"
                                                            y1="1"
                                                            x2="0"
                                                            y2="0"
                                                        >
                                                            <stop offset="0%" stopColor={color} stopOpacity={0.7} />
                                                            <stop offset="100%" stopColor={color} stopOpacity={1} />
                                                        </linearGradient>
                                                    );
                                                })}
                                            </defs>
                                            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
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
                                                cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                                                content={renderMonthlySectorTooltip}
                                            />
                                            {sectorKeys.map((sector) => (
                                                <Bar
                                                    key={`bar-${sector.id}`}
                                                    dataKey={sector.id}
                                                    name={sector.name}
                                                    fill={`url(#branch-gradient-${sector.id})`}
                                                    radius={[8, 8, 0, 0]}
                                                    maxBarSize={48}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            {costBySectorAnnual.length > 0 && (
                                <div className="mt-6">
                                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {costBySectorAnnual.slice(0, 4).map((entry, index) => (
                                            <li
                                                key={entry.id || index}
                                                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                            >
                                                <span className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                    <span
                                                        className="inline-flex h-2.5 w-2.5 rounded-full"
                                                        style={{
                                                            backgroundColor: getSectorColor(entry.name, index),
                                                        }}
                                                    />
                                                    {entry.name}
                                                </span>
                                                <span className="text-sm font-semibold text-slate-900">
                                                    {formatCurrency(entry.totalCost)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl">
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -top-40 left-1/4 h-64 w-64 rounded-full bg-rose-100/25 blur-3xl" />
                            <div className="absolute bottom-[-35%] right-0 h-72 w-72 rounded-full bg-rose-200/25 blur-2xl" />
                        </div>
                        <div className="relative z-10 flex flex-col gap-1 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-400 px-6 py-5 text-white">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                Reparti
                            </p>
                            <h2 className="text-lg font-black text-white">
                                Incidenza sui costi {selectedYearKey}
                            </h2>
                        </div>
                        <div className="relative z-10 flex flex-1 flex-col px-6 py-6">
                            <div className="flex-1">
                                {!hasDepartmentChartData ? (
                                    <div className="flex h-full items-center justify-center">
                                        <EmptyState
                                            icon={Users}
                                            title="Nessun dato disponibile"
                                            message="Popola i costi mensili per vedere l’incidenza dei reparti."
                                        />
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <PieChart>
                                            <defs>
                                                {departmentChartData.map((entry) => (
                                                    <linearGradient
                                                        key={`dept-gradient-${entry.id}`}
                                                        id={`dept-gradient-${entry.id}`}
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
                                            <Tooltip content={renderDepartmentTooltip} />
                                            <Pie
                                                data={departmentChartData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="60%"
                                                outerRadius="80%"
                                                paddingAngle={4}
                                                strokeWidth={0}
                                            >
                                                {departmentChartData.map((entry) => (
                                                    <Cell
                                                        key={`cell-${entry.id}`}
                                                        fill={`url(#dept-gradient-${entry.id})`}
                                                    />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            {departmentChartSummary.length > 0 && (
                                <div className="mt-6">
                                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {departmentChartSummary.map((entry) => (
                                            <li
                                                key={entry.id}
                                                className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                            >
                                                <span className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                    <span
                                                        className="inline-flex h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: entry.color }}
                                                    />
                                                    {entry.name}
                                                </span>
                                                <span className="text-sm font-semibold text-slate-900">
                                                    {formatCurrency(entry.totalCost)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -top-48 right-0 h-80 w-80 rounded-full bg-rose-200/20 blur-3xl" />
                        <div className="absolute bottom-[-35%] left-1/4 h-72 w-72 rounded-full bg-rose-100/20 blur-2xl" />
                    </div>
                    <div className="relative z-10 flex flex-col">
                        <div className="flex flex-col gap-4 rounded-t-3xl border-b border-white/20 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-400 px-6 py-5 text-white lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                    Anagrafica dipendenti
                                </p>
                                <h2 className="text-lg font-black text-white">Organico e costi ricorrenti</h2>
                            </div>
                        </div>
                        <div className="relative z-10 px-6 pb-6 pt-6">
                            <div className="overflow-hidden rounded-3xl border border-rose-100 shadow-inner shadow-rose-100/70">
                                {isLoading ? (
                                    <div className="flex h-64 items-center justify-center bg-white/80">
                                        <Spinner />
                                    </div>
                                ) : filteredEmployees.length === 0 ? (
                                    <div className="bg-white/80">
                                        <EmptyState
                                            icon={Users}
                                            title="Nessun dipendente trovato"
                                            message="Aggiungi un nuovo dipendente oppure aggiorna i filtri di ricerca."
                                        />
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-rose-100 bg-white/95 text-sm text-slate-700">
                                            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                                                <tr>
                                                    {[
                                                        { key: 'name', label: 'Dipendente', align: 'text-left' },
                                                        { key: 'jobTitle', label: 'Mansione', align: 'text-left' },
                                                        { key: 'branch', label: 'Centro di costo', align: 'text-left' },
                                                        { key: 'sector', label: 'Settore', align: 'text-left' },
                                                        { key: 'department', label: 'Reparto', align: 'text-left' },
                                                        { key: 'cost', label: `Costo ${selectedYearKey}`, align: 'text-right' },
                                                    ].map((column) => {
                                                        const isActive = sortConfig.key === column.key;
                                                        return (
                                                            <th
                                                                key={column.key}
                                                                className={`px-5 py-3 ${column.align}`}
                                                                aria-sort={
                                                                    isActive
                                                                        ? sortConfig.direction === 'asc'
                                                                            ? 'ascending'
                                                                            : 'descending'
                                                                        : 'none'
                                                                }
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSort(column.key)}
                                                                    className={`flex w-full items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/90 transition-colors hover:text-white ${column.align.includes('right') ? 'justify-end' : 'justify-start'
                                                                        }`}
                                                                >
                                                                    <span>{column.label}</span>
                                                                    <SortIndicatorIcon
                                                                        active={isActive}
                                                                        direction={sortConfig.direction}
                                                                    />
                                                                </button>
                                                            </th>
                                                        );
                                                    })}
                                                    <th className="px-5 py-3 text-center">Stato</th>
                                                    <th className="px-5 py-3 text-center">Azioni</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-rose-50 bg-white">
                                                {filteredEmployees.map((employee) => (
                                                    <tr key={employee.id} className="transition-colors hover:bg-rose-50/60">
                                                        <td className="px-5 py-4">
                                                            <div className="font-semibold text-slate-900">{employee.name}</div>
                                                            {employee.notes && (
                                                                <p className="mt-1 text-xs font-medium text-rose-400">
                                                                    {employee.notes}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <span className="text-sm font-medium text-slate-600">
                                                                {employee.jobTitle || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-semibold text-slate-700">
                                                                    {branchMap.get(employee.branchId) || 'Non assegnato'}
                                                                </span>
                                                                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
                                                                    {employee.employmentType.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <span className="text-sm font-medium text-slate-600">
                                                                {sectorMap.get(employee.sectorId) || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <span className="text-sm font-medium text-slate-600">
                                                                {(employee.department || '—').trim() || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-right font-semibold text-slate-900">
                                                            {formatCurrency(
                                                                getAnnualCostForEmployee(employee, selectedYearKey)
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 text-center">
                                                            <span
                                                                className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] ${employee.status === 'inactive'
                                                                    ? 'bg-rose-100 text-rose-600'
                                                                    : 'bg-emerald-100 text-emerald-600'
                                                                    }`}
                                                            >
                                                                {STATUS_LABELS[employee.status] || 'Attivo'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditModal(employee)}
                                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 transition-all hover:border-rose-400 hover:text-rose-600"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteEmployee(employee)}
                                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 transition-all hover:border-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <EmployeeFormModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onSave={handleSaveEmployee}
                initialData={editingEmployee}
                branches={branches}
                sectors={sectors}
                initialYear={selectedYear}
            />
        </div>
    );
}
