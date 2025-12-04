import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Users, Layers, Building2, RadioTower, Link2, PlusCircle, Search, ShoppingCart, Car, Sailboat, Caravan, DollarSign, Settings, Target, AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { UserProfile } from '@clerk/clerk-react';
import AssociationModal from '../components/AssociationModal';
import UserPermissionsModal from '../components/UserPermissionsModal';
import AddUserModal from '../components/AddUserModal';
import MarketingChannelModal from '../components/MarketingChannelModal';
import SimpleAddModal from '../components/SimpleAddModal';
import SectorBudgetModal from '../components/SectorBudgetModal';
import SettingsListItem from '../components/SettingsListItem';
import { KpiCard } from '../components/SharedComponents';
import toast from 'react-hot-toast';
import { COST_DOMAINS, DEFAULT_COST_DOMAIN } from '../constants/costDomains';

const sectorIcons = {
    'Auto': <Car className="w-5 h-5 text-slate-600" />,
    'Camper&Caravan': <Caravan className="w-5 h-5 text-slate-600" />,
    'Yachting': <Sailboat className="w-5 h-5 text-slate-600" />,
    'Frattin Group': <Building2 className="w-5 h-5 text-slate-600" />,
    'default': <DollarSign className="w-5 h-5 text-slate-600" />,
};

const getSectorIcon = (sectorName) => sectorIcons[sectorName] || sectorIcons.default;

const HERO_DESCRIPTIONS = {
    sector_budgets: "Verifica gli stanziamenti annuali e monitora l'utilizzo dei budget per ogni settore.",
    suppliers: 'Mantieni aggiornato il catalogo fornitori e associa rapidamente i canali disponibili.',
    branches: 'Gestisci filiali e punti vendita collegando i settori di competenza.',
    sectors: 'Crea o modifica i settori aziendali per mantenere coerenti tutte le analisi.',
    marketing_channels: 'Organizza i canali marketing e definisci categorie per segmentare gli investimenti.',
    channel_categories: 'Raggruppa i canali per categoria così da velocizzare report e assegnazioni.',
    users: 'Definisci ruoli e canali assegnati per garantire accessi coerenti al team.',
    default:
        "Configura strutture, fornitori e permessi con un'interfaccia coerente e sincronizzata con il resto della piattaforma.",
};

const QUICK_ADD_LABELS = {
    suppliers: 'Nuovo fornitore',
    branches: 'Nuova filiale',
    sectors: 'Nuovo settore',
    marketing_channels: 'Nuovo canale',
    channel_categories: 'Nuova categoria',
    users: 'Nuovo utente',
};

const TabButton = ({ tabKey, label, icon, activeTab, setActiveTab, count }) => {
    const isActive = activeTab === tabKey;
    const Icon = icon;
    return (
        <button
            type="button"
            onClick={() => setActiveTab(tabKey)}
            aria-pressed={isActive}
            className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${isActive
                ? 'border-transparent bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.9)]'
                : 'border-white/60 bg-white/70 text-slate-600 hover:-translate-y-[1px] hover:border-indigo-200/80 hover:bg-white'
                }`}
        >
            <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ${isActive
                    ? 'border-white/30 bg-white/20 text-white shadow-inner shadow-indigo-900/30'
                    : 'border-slate-200 bg-white text-indigo-500 group-hover:border-indigo-200/70 group-hover:text-indigo-500'
                    }`}
            >
                <Icon className="w-4 h-4" />
            </div>
            <span className="whitespace-nowrap">{label}</span>
            {typeof count === 'number' && (
                <span
                    className={`ml-1 inline-flex items-center justify-center rounded-xl px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] ${isActive ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-600'
                        }`}
                >
                    {count}
                </span>
            )}
        </button>
    );
};

export default function SettingsPage({ user }) {
    const [sectors, setSectors] = useState([]);
    const [branches, setBranches] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [marketingChannels, setMarketingChannels] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [channelCategories, setChannelCategories] = useState([]);
    const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('sector_budgets');
    const [searchTerms, setSearchTerms] = useState({});
    const [availableBudgetYears, setAvailableBudgetYears] = useState(() => {
        const current = new Date().getFullYear();
        return [current, current - 1, current - 2];
    });
    const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
    const [isAddingBudgetYear, setIsAddingBudgetYear] = useState(false);
    const [newBudgetYearInput, setNewBudgetYearInput] = useState('');
    const [sectorBudgets, setSectorBudgets] = useState(new Map());
    const [editingSectorBudget, setEditingSectorBudget] = useState(null);

    const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [
                sectorsRes,
                branchesRes,
                suppliersRes,
                channelsRes,
                categoriesRes,
                usersRes
            ] = await Promise.all([
                axios.get('/api/master-data/sectors'),
                axios.get('/api/master-data/branches'),
                axios.get('/api/suppliers'),
                axios.get('/api/master-data/marketing-channels'),
                axios.get('/api/master-data/channel-categories'),
                axios.get('/api/users'),
            ]);

            setSectors(sectorsRes.data);
            setBranches(branchesRes.data);
            setSuppliers(suppliersRes.data);
            setMarketingChannels(channelsRes.data);
            setChannelCategories(categoriesRes.data);
            setAllUsers(usersRes.data);
        } catch (error) {
            console.error("Error fetching settings data:", error);
            toast.error("Errore caricamento dati.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const fetchSectorBudgets = useCallback(async () => {
        try {
            const res = await axios.get(`/api/sector-budgets?year=${budgetYear}`);
            const budgetsMap = new Map(res.data.map(b => [b.sectorId, { ...b, maxAmount: b.amount }]));
            setSectorBudgets(budgetsMap);
        } catch (error) {
            console.error("Error fetching sector budgets:", error);
        }
    }, [budgetYear]);

    useEffect(() => {
        fetchSectorBudgets();
    }, [fetchSectorBudgets]);

    useEffect(() => {
        setAvailableBudgetYears(prev => {
            if (prev.includes(budgetYear)) {
                return prev;
            }
            return [...prev, budgetYear].sort((a, b) => b - a);
        });
    }, [budgetYear]);

    const combinedSectorData = useMemo(() => {
        return sectors.map(sector => ({
            ...sector,
            budget: sectorBudgets.get(sector.id)?.maxAmount || 0,
        }));
    }, [sectors, sectorBudgets]);

    const handleOpenModal = (type, data = null) => setModalState({ isOpen: true, type, data });
    const handleCloseModal = () => { setModalState({ isOpen: false, type: null, data: null }); setEditingSectorBudget(null); };
    const handleSearchChange = (e) => setSearchTerms(prev => ({ ...prev, [activeTab]: e.target.value }));
    const handleStartAddBudgetYear = () => {
        setIsAddingBudgetYear(true);
        setNewBudgetYearInput('');
    };
    const handleCancelAddBudgetYear = () => {
        setIsAddingBudgetYear(false);
        setNewBudgetYearInput('');
    };
    const handleConfirmAddBudgetYear = () => {
        const parsedYear = parseInt(newBudgetYearInput, 10);
        if (Number.isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
            toast.error("Inserisci un anno valido tra 2000 e 2100.");
            return;
        }
        if (availableBudgetYears.includes(parsedYear)) {
            toast.error("Anno già presente in elenco.");
            setBudgetYear(parsedYear);
            setIsAddingBudgetYear(false);
            setNewBudgetYearInput('');
            return;
        }
        setAvailableBudgetYears(prev => [...prev, parsedYear].sort((a, b) => b - a));
        setBudgetYear(parsedYear);
        setIsAddingBudgetYear(false);
        setNewBudgetYearInput('');
    };
    const handleBudgetYearInputKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleConfirmAddBudgetYear();
        }
    };

    const handleOpenSectorBudgetModal = (sector) => setEditingSectorBudget(sector);

    const handleSaveSectorBudget = async (sectorId, newAmount) => {
        const toastId = toast.loading("Salvataggio budget settore...");
        try {
            await axios.post('/api/sector-budgets', {
                sectorId,
                year: budgetYear,
                maxAmount: newAmount
            });
            toast.success("Budget del settore salvato!", { id: toastId });
            fetchSectorBudgets();
            setEditingSectorBudget(null);
        } catch (error) {
            console.error("Errore salvataggio budget settore:", error);
            toast.error("Errore durante il salvataggio.", { id: toastId });
        }
    };

    const handleDelete = async (collectionName, id) => {
        if (window.confirm("Sei sicuro di voler eliminare questo elemento? L'azione è irreversibile.")) {
            const toastId = toast.loading("Eliminazione in corso...");
            try {
                let endpoint = '';
                switch (collectionName) {
                    case 'sectors': endpoint = `/api/master-data/sectors/${id}`; break;
                    case 'branches': endpoint = `/api/master-data/branches/${id}`; break;
                    case 'channels': endpoint = `/api/suppliers/${id}`; break;
                    case 'marketing_channels': endpoint = `/api/master-data/marketing-channels/${id}`; break;
                    case 'channel_categories': endpoint = `/api/master-data/channel-categories/${id}`; break;
                    case 'users': endpoint = `/api/users/${id}`; break;
                    default: throw new Error('Unknown collection');
                }

                await axios.delete(`${endpoint}`);
                toast.success("Elemento eliminato!", { id: toastId });
                fetchData();
            } catch (error) {
                console.error("Errore durante l'eliminazione:", error);
                toast.error("Errore durante l'eliminazione.", { id: toastId });
            }
        }
    };

    const handleDeleteUser = async (userIdToDelete) => {
        if (userIdToDelete === user.uid) {
            toast.error("Non puoi eliminare te stesso.");
            return;
        }
        if (window.confirm("Sei sicuro di voler eliminare questo utente?")) {
            const toastId = toast.loading("Eliminazione utente...");
            try {
                // Also delete from DB
                await axios.delete(`/api/users/${userIdToDelete}`);
                toast.success("Utente eliminato!", { id: toastId });
                fetchData();
            } catch (error) {
                toast.error(`Errore: ${error.message}`, { id: toastId });
            }
        }
    };

    const handleSave = async (collectionName, formData) => {
        const { data } = modalState;
        const isEditing = !!(data && data.id);
        const toastId = toast.loading("Salvataggio...");
        try {
            if (!formData.name?.trim()) throw new Error("Il nome è obbligatorio.");

            let endpoint = '';
            let payload = { ...formData };

            switch (collectionName) {
                case 'sectors': endpoint = '/api/master-data/sectors'; break;
                case 'branches': endpoint = '/api/master-data/branches'; break;
                case 'channels': endpoint = '/api/suppliers'; break;
                case 'marketing_channels': endpoint = '/api/master-data/marketing-channels'; break;
                case 'channel_categories': endpoint = '/api/master-data/channel-categories'; break;
                case 'users': endpoint = '/api/users'; break;
                default: throw new Error('Unknown collection');
            }

            if (isEditing) {
                await axios.put(`${endpoint}/${data.id}`, payload);
            } else {
                await axios.post(`${endpoint}`, payload);
            }

            toast.success("Salvato!", { id: toastId });
            fetchData();
            handleCloseModal();
        } catch (error) {
            toast.error(error.message, { id: toastId });
        }
    };

    const handleSaveSimple = async (collectionName, formData) => {
        // Reusing handleSave as logic is similar now
        return handleSave(collectionName, formData);
    };

    const handleSaveUserRole = async (userId, data) => {
        const toastId = toast.loading("Aggiornamento...");
        try {
            await axios.put(`/api/users/${userId}`, {
                role: data.role,
                assignedChannels: data.assignedChannels
            });

            toast.success("Ruolo aggiornato!", { id: toastId });
            fetchData();
        } catch (error) {
            console.error("Errore aggiornamento ruolo:", error);
            toast.error("Errore aggiornamento ruolo.", { id: toastId });
        }
    };

    const handleCreateUser = async (userData) => {
        const toastId = toast.loading("Creazione utente...");
        try {
            // Call Node.js backend to create user in Clerk and Neon
            const response = await axios.post('/api/users/create-with-auth', {
                email: userData.email,
                password: userData.password, // Ensure password is passed from the form
                name: userData.name,
                role: userData.role,
                assignedChannels: userData.assignedChannels
            });

            if (response.data.status === 'success') {
                toast.success("Utente creato!", { id: toastId });
                handleCloseModal();
                fetchData();
            } else {
                console.error("Errore creazione utente:", error);
                const errorMessage = error.response?.data?.error || error.message;
                toast.error(`Errore: ${errorMessage}`, { id: toastId });
            }
        };

        const TABS = {
            sector_budgets: { label: 'Budget Settori', icon: Target },
            suppliers: { label: 'Fornitori', icon: ShoppingCart, modalType: 'supplier', collectionName: 'channels' },
            branches: { label: 'Filiali', icon: Building2, modalType: 'branch', collectionName: 'branches' },
            sectors: { label: 'Settori', icon: Layers, modalType: 'sector', collectionName: 'sectors' },
            marketing_channels: { label: 'Canali Marketing', icon: RadioTower, modalType: 'marketing_channel', collectionName: 'marketing_channels' },
            channel_categories: { label: 'Categorie', icon: Link2, modalType: 'category', collectionName: 'channel_categories' },
            users: { label: 'Utenti', icon: Users, modalType: 'user_permissions', addModalType: 'add_user', collectionName: 'users' },
            security: { label: 'Sicurezza', icon: Shield },
        };

        const activeTabInfo = TABS[activeTab];
        const heroDescription = HERO_DESCRIPTIONS[activeTab] || HERO_DESCRIPTIONS.default;
        const tabCounts = useMemo(() => ({
            sector_budgets: combinedSectorData.length,
            suppliers: suppliers.length,
            branches: branches.length,
            sectors: sectors.length,
            marketing_channels: marketingChannels.length,
            channel_categories: channelCategories.length,
            users: allUsers.length,
        }), [combinedSectorData, suppliers, branches, sectors, marketingChannels, channelCategories, allUsers]);
        const budgetYearsOptions = useMemo(() => [...availableBudgetYears].sort((a, b) => b - a), [availableBudgetYears]);
        const activeTabCount = tabCounts[activeTab] ?? 0;
        const heroHighlights = useMemo(() => {
            const base = [
                {
                    key: 'sync',
                    icon: CheckCircle,
                    title: 'Cataloghi sincronizzati',
                    description: 'Ogni modifica è disponibile subito nella dashboard e nei moduli operativi.',
                },
            ];

            if (activeTab === 'users') {
                base.push({
                    key: 'permissions',
                    icon: AlertCircle,
                    title: 'Permessi sensibili',
                    description: "Dopo ogni aggiornamento avvisa l'utente di eseguire nuovamente l'accesso.",
                });
            } else {
                base.push({
                    key: 'associations',
                    icon: Link2,
                    title: 'Associazioni guidate',
                    description: 'Collega rapidamente settori, canali e filiali direttamente dal tab attivo.',
                });
            }

            return base;
        }, [activeTab]);
        const canAddOnActiveTab = activeTab !== 'sector_budgets';
        const quickAddLabel = QUICK_ADD_LABELS[activeTab] || 'Nuovo elemento';
        const handleQuickAdd = () => {
            if (!canAddOnActiveTab || !activeTabInfo) return;
            handleOpenModal(activeTabInfo.addModalType || activeTabInfo.modalType);
        };

        const currentSearchTerm = searchTerms[activeTab] || '';
        const ICON_WRAPPER_BASE = 'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500';
        const filterItems = (items) => items.filter(item => item.name?.toLowerCase().includes(currentSearchTerm.toLowerCase()));

        const renderTabContent = () => {
            if (loading) {
                return (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center space-y-4">
                            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-gray-600 font-medium">Caricamento...</p>
                        </div>
                    </div>
                );
            }

            const renderList = (items, collectionName, modalType, renderItemContent, variant = 'default') => (
                <ul className="space-y-3">
                    {filterItems(items).map(item => (
                        <SettingsListItem
                            key={item.id}
                            onEdit={() => handleOpenModal(modalType, item)}
                            onDelete={() => handleDelete(collectionName, item.id)}
                            variant={variant}
                        >
                            {renderItemContent(item)}
                        </SettingsListItem>
                    ))}
                </ul>
            );

            const renderAssociationList = (items, collectionName, modalType, defaultIcon, variant = 'default') => {
                return renderList(items, collectionName, modalType, (item) => {
                    const primarySectorId = item.associatedSectors?.[0];
                    const primarySectorName = sectorMap.get(primarySectorId);
                    const associatedSectorNames = item.associatedSectors?.map(id => sectorMap.get(id)).filter(Boolean).join(', ');

                    return (
                        <div className="flex items-center gap-3">
                            <div className={`${ICON_WRAPPER_BASE} flex-shrink-0`}>
                                {primarySectorName ? getSectorIcon(primarySectorName) : defaultIcon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                                {associatedSectorNames && (
                                    <p className="text-xs text-slate-500 truncate mt-1">
                                        <span className="font-medium text-slate-600">Settori:</span> {associatedSectorNames}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                }, variant);
            };

            switch (activeTab) {
                case 'sector_budgets':
                    return (
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                                <select
                                    value={budgetYear}
                                    onChange={e => {
                                        const value = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(value)) {
                                            setBudgetYear(value);
                                        }
                                    }}
                                    className="h-11 rounded-2xl border border-slate-200 bg-white/90 px-4 text-sm font-semibold text-slate-700 shadow-inner transition-all focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300/60"
                                >
                                    {budgetYearsOptions.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                {isAddingBudgetYear ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min="2000"
                                            max="2100"
                                            placeholder="Es. 2026"
                                            value={newBudgetYearInput}
                                            onChange={(event) => setNewBudgetYearInput(event.target.value)}
                                            onKeyDown={handleBudgetYearInputKeyDown}
                                            className="h-11 w-28 rounded-2xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-inner transition-all focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300/60"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleConfirmAddBudgetYear}
                                            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                                        >
                                            Aggiungi
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCancelAddBudgetYear}
                                            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-3 text-sm font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
                                        >
                                            Annulla
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleStartAddBudgetYear}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition-all hover:border-slate-400 hover:text-slate-800"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        Nuovo anno
                                    </button>
                                )}
                            </div>
                            <ul className="space-y-3">
                                {combinedSectorData.map(item => (
                                    <SettingsListItem key={item.id} onEdit={() => handleOpenSectorBudgetModal(item)} variant="sector">
                                        <div className="flex items-center justify-between w-full gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`${ICON_WRAPPER_BASE} border-indigo-200/60 text-indigo-500`}>
                                                    {getSectorIcon(item.name)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                                    <span className="text-xs font-medium text-slate-500">Budget {budgetYear}</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-700">
                                                {item.budget.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                                            </span>
                                        </div>
                                    </SettingsListItem>
                                ))}
                            </ul>
                        </div>
                    );
                case 'suppliers':
                    return renderAssociationList(suppliers, TABS.suppliers.collectionName, TABS.suppliers.modalType, <ShoppingCart className="w-5 h-5 text-slate-500" />, 'supplier');
                case 'branches':
                    return renderAssociationList(branches, TABS.branches.collectionName, TABS.branches.modalType, <Building2 className="w-5 h-5 text-slate-500" />, 'branch');
                case 'sectors':
                    return renderList(sectors, TABS.sectors.collectionName, TABS.sectors.modalType, (item) => (
                        <div className="flex items-center gap-3">
                            <div className={ICON_WRAPPER_BASE}>
                                {getSectorIcon(item.name)}
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        </div>
                    ), 'sector');
                case 'marketing_channels':
                case 'channel_categories': {
                    const channelItems = activeTab === 'marketing_channels' ? marketingChannels : channelCategories;
                    return renderList(channelItems, TABS[activeTab].collectionName, TABS[activeTab].modalType, (item) => (
                        <div className="flex items-center justify-between gap-4 w-full">
                            <div className="flex items-center gap-3">
                                <div className={ICON_WRAPPER_BASE}>
                                    <RadioTower className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                    {activeTab === 'marketing_channels' && (
                                        <span
                                            className="mt-1 inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600"
                                        >
                                            {COST_DOMAINS[item.domain]?.shortLabel || COST_DOMAINS[DEFAULT_COST_DOMAIN].shortLabel}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {activeTab === 'marketing_channels' && item.categoryId && (
                                <span className="text-xs font-medium text-slate-500">
                                    {channelCategories.find(cat => cat.id === item.categoryId)?.name || '—'}
                                </span>
                            )}
                        </div>
                    ), 'default');
                }
                case 'users':
                    return (
                        <ul className="space-y-3">
                            {filterItems(allUsers).map(item => (
                                <SettingsListItem key={item.id} onEdit={() => handleOpenModal('user_permissions', item)} onDelete={() => handleDeleteUser(item.id)} variant="user">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 font-semibold">
                                                {item.name?.charAt(0)?.toUpperCase() || item.email?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.email}</p>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                                            {item.role || '—'}
                                        </span>
                                    </div>
                                </SettingsListItem>
                            ))}
                        </ul>
                    );
                default:
                    return null;
            }
        };

        const stats = useMemo(() => ({
            totalSectors: sectors.length,
            totalSuppliers: suppliers.length,
            totalBranches: branches.length,
            totalUsers: allUsers.length,
        }), [sectors, suppliers, branches, allUsers]);
        const statCards = [
            {
                key: 'sectors',
                title: 'Settori',
                value: stats.totalSectors.toString(),
                icon: <Layers className="w-6 h-6" />,
                gradient: 'from-indigo-500 via-purple-500 to-indigo-600',
                subtitle: 'Anagrafica business unit',
                onClick: () => setActiveTab('sectors'),
                tooltip: 'Gestione delle business unit e dei centri di costo.',
            },
            {
                key: 'suppliers',
                title: 'Fornitori',
                value: stats.totalSuppliers.toString(),
                icon: <ShoppingCart className="w-6 h-6" />,
                gradient: 'from-amber-500 via-orange-500 to-rose-500',
                subtitle: 'Catalogo partner e media',
                onClick: () => setActiveTab('suppliers'),
                tooltip: 'Gestione dell\'anagrafica fornitori e partner.',
            },
            {
                key: 'branches',
                title: 'Filiali',
                value: stats.totalBranches.toString(),
                icon: <Building2 className="w-6 h-6" />,
                gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
                subtitle: 'Punti vendita e sedi',
                onClick: () => setActiveTab('branches'),
                tooltip: 'Gestione dei punti vendita e delle sedi operative.',
            },
            {
                key: 'users',
                title: 'Utenti',
                value: stats.totalUsers.toString(),
                icon: <Users className="w-6 h-6" />,
                gradient: 'from-blue-500 via-indigo-500 to-purple-500',
                subtitle: 'Ruoli e permessi',
                onClick: () => setActiveTab('users'),
                tooltip: 'Gestione degli accessi e dei permessi della piattaforma.',
            },
        ];

        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200">
                <div className="relative p-4 lg:p-8 space-y-6">
                    {/* Hero */}
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl border border-white/10 p-6 lg:p-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_55%)]" />
                        <div className="relative flex flex-col gap-6">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-indigo-900/30 ring-4 ring-white/20">
                                    <Settings className="w-7 h-7 lg:w-8 lg:h-8" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">Control Room</p>
                                    <h1 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-tight">
                                        Centro Impostazioni
                                    </h1>
                                </div>
                            </div>
                            <p className="text-sm lg:text-base text-white/85 max-w-3xl">{heroDescription}</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/80">
                                    {activeTabInfo?.label || 'Seleziona un tab'}
                                </span>
                                <span className="text-xs font-semibold text-white/80">
                                    Elementi totali: {activeTabCount}
                                </span>
                                {canAddOnActiveTab && (
                                    <button
                                        type="button"
                                        onClick={handleQuickAdd}
                                        className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:bg-white/25"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        {quickAddLabel}
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {heroHighlights.map((highlight) => {
                                    const Icon = highlight.icon;
                                    return (
                                        <div
                                            key={highlight.key}
                                            className="flex items-start gap-3 rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-sm shadow-[0_25px_60px_-40px_rgba(15,23,42,0.6)]"
                                        >
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner shadow-indigo-900/25">
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white">{highlight.title}</p>
                                                <p className="text-xs text-white/75 leading-relaxed">{highlight.description}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Stat Overview */}
                    <div className="bg-white/85 backdrop-blur-xl rounded-3xl shadow-xl border border-white/30 p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Panoramica</p>
                                <h2 className="text-xl lg:text-2xl font-black text-slate-900">Struttura organizzativa</h2>
                                <p className="mt-1 text-sm font-medium text-slate-600">
                                    Accedi rapidamente alle entità più utilizzate della piattaforma.
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-600">
                                <Layers className="w-4 h-4" />
                                Dati aggiornati in tempo reale
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {statCards.map((card) => (
                                <KpiCard
                                    key={card.key}
                                    title={card.title}
                                    value={card.value}
                                    icon={card.icon}
                                    gradient={card.gradient}
                                    subtitle={card.subtitle}
                                    onClick={card.onClick}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Configuratore */}
                    <div className="rounded-3xl border border-white/30 bg-white/90 backdrop-blur-xl shadow-2xl p-5 lg:p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Cataloghi configurabili</p>
                                    <h3 className="text-lg lg:text-xl font-black text-slate-900">Seleziona l'area da gestire</h3>
                                </div>
                                <span className="inline-flex items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
                                    <Target className="w-4 h-4" />
                                    {activeTabInfo?.label || '—'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                {Object.entries(TABS).map(([key, { label, icon }]) => (
                                    <TabButton
                                        key={key}
                                        tabKey={key}
                                        label={label}
                                        icon={icon}
                                        activeTab={activeTab}
                                        setActiveTab={setActiveTab}
                                        count={tabCounts[key]}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="relative flex-1 min-w-[220px]">
                                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder={`Cerca in ${activeTabInfo?.label?.toLowerCase() || 'questa sezione'}...`}
                                    value={currentSearchTerm}
                                    onChange={handleSearchChange}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white/90 pl-12 pr-4 text-sm font-medium text-slate-700 shadow-inner transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="inline-flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                                    <span className="uppercase tracking-[0.22em] text-[10px] text-slate-400">Disponibili</span>
                                    <span className="text-sm font-bold text-slate-900">{activeTabCount}</span>
                                </span>
                                {canAddOnActiveTab && (
                                    <button
                                        type="button"
                                        onClick={handleQuickAdd}
                                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition-all hover:-translate-y-[1px] hover:bg-slate-800"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                        {quickAddLabel}
                                    </button>
                                )}
                            </div>
                        </div>
                        {renderTabContent()}
                    </div>
                </div>

                {/* Modals */}
                {modalState.isOpen && (
                    <>
                        {modalState.type === 'supplier' && (
                            <AssociationModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={(data) => handleSave('channels', data)}
                                initialData={modalState.data}
                                title={modalState.data ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
                                itemLabel="Nome Fornitore"
                                associationLists={[
                                    { key: 'associatedSectors', label: 'Settori di Competenza', items: sectors },
                                    { key: 'offeredMarketingChannels', label: 'Canali di Marketing Offerti', items: marketingChannels }
                                ]}
                            />
                        )}
                        {modalState.type === 'branch' && (
                            <AssociationModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={(data) => handleSave('branches', data)}
                                initialData={modalState.data}
                                title={modalState.data ? 'Modifica Filiale' : 'Nuova Filiale'}
                                itemLabel="Nome Filiale"
                                associationLists={[
                                    { key: 'associatedSectors', label: 'Settori di Competenza', items: sectors }
                                ]}
                            />
                        )}
                        {(modalState.type === 'sector' || modalState.type === 'category') && (
                            <SimpleAddModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={(data) => handleSaveSimple(modalState.type === 'sector' ? 'sectors' : 'channel_categories', data)}
                                initialData={modalState.data}
                                type={modalState.type}
                            />
                        )}
                        {modalState.type === 'marketing_channel' && (
                            <MarketingChannelModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={(data) => handleSave('marketing_channels', data)}
                                initialData={modalState.data}
                                categories={channelCategories}
                            />
                        )}
                        {modalState.type === 'user_permissions' && (
                            <UserPermissionsModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={handleSaveUserRole}
                                userData={modalState.data}
                            />
                        )}
                        {modalState.type === 'add_user' && (
                            <AddUserModal
                                isOpen={modalState.isOpen}
                                onClose={handleCloseModal}
                                onSave={handleCreateUser}
                            />
                        )}
                    </>
                )}

                {editingSectorBudget && (
                    <SectorBudgetModal
                        isOpen={!!editingSectorBudget}
                        onClose={() => setEditingSectorBudget(null)}
                        onSave={handleSaveSectorBudget}
                        sector={editingSectorBudget}
                        year={budgetYear}
                    />
                )}

                {activeTab === 'security' && (
                    <div className="flex justify-center p-6">
                        <UserProfile />
                    </div>
                )}
            </div>
        );
    }
