import React from 'react';
import {
    LayoutDashboard,
    ShoppingCart,
    Target,
    Settings,
    LogOut,
    FileSignature,
    BarChart3,
    ChevronRight,
    Building2,
    Users,
} from 'lucide-react';

const NAVIGATION = [
    {
        section: 'Panoramica',
        items: [
            {
                key: 'dashboard',
                label: 'Dashboard',
                description: 'Indicatori e andamento generale',
                icon: LayoutDashboard,
                roles: ['admin', 'manager', 'collaborator'],
            },
            {
                key: 'expenses',
                label: 'Spese',
                description: 'Monitoraggio movimenti e uscite',
                icon: ShoppingCart,
                roles: ['admin', 'manager', 'collaborator'],
            },
        ],
    },
    {
        section: 'Gestione',
        items: [
            {
                key: 'budget',
                label: 'Budget',
                description: 'Allocazioni e scostamenti',
                icon: Target,
                roles: ['admin', 'manager'],
            },
            {
                key: 'contracts',
                label: 'Contratti',
                description: 'Stato accordi e scadenze',
                icon: FileSignature,
                roles: ['admin', 'manager'],
            },
        ],
    },
    {
        section: 'Operations',
        items: [
            {
                key: 'operations',
                label: 'Sedi',
                description: 'Affitti, mutui e costi fissi delle filiali',
                icon: Building2,
                roles: ['admin', 'manager'],
            },
            {
                key: 'hr',
                label: 'Dipendenti',
                description: 'Organico, costi HR e headcount',
                icon: Users,
                roles: ['admin', 'manager'],
            },
        ],
    },
    {
        section: 'Sistema',
        items: [
            {
                key: 'settings',
                label: 'Impostazioni',
                description: 'Configurazione piattaforma',
                icon: Settings,
                roles: ['admin', 'manager'],
            },
        ],
    },
];

const ROLE_LABELS = {
    admin: 'Amministratore',
    manager: 'Manager',
    collaborator: 'Collaboratore',
};

const NavItem = ({ icon, label, description, isActive, onClick }) => {
    const IconComponent = icon;
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className={`group relative w-full overflow-hidden rounded-2xl border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${isActive
                        ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-600 text-white border-transparent shadow-[0_15px_40px_-20px_rgba(88,81,219,0.8)]'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900'
                    }`}
            >
                <div className="flex items-center gap-3 p-3.5 lg:p-4">
                    <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300 ${isActive
                                ? 'border-white/20 bg-white/10 text-white shadow-inner'
                                : 'border-slate-800 bg-slate-900 text-indigo-300 shadow-sm group-hover:border-indigo-400/60 group-hover:text-indigo-300'
                            }`}
                    >
                        <IconComponent className="w-5 h-5" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 text-left">
                        <p
                            className={`text-sm font-semibold tracking-tight ${isActive ? 'text-white' : 'text-slate-100 group-hover:text-white'
                                }`}
                        >
                            {label}
                        </p>
                        {description && (
                            <p
                                className={`mt-0.5 text-xs font-medium transition-colors ${isActive ? 'text-indigo-100/80' : 'text-slate-500 group-hover:text-slate-300'
                                    }`}
                            >
                                {description}
                            </p>
                        )}
                    </div>
                    <ChevronRight
                        className={`w-4 h-4 transition-all duration-300 ${isActive
                                ? 'translate-x-1 text-white drop-shadow'
                                : 'text-slate-300 opacity-0 group-hover:translate-x-1 group-hover:text-indigo-400 group-hover:opacity-100'
                            }`}
                    />
                </div>
            </button>
        </li>
    );
};

export default function Sidebar({
    user,
    currentPage,
    setCurrentPage,
    handleLogout,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
}) {
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const handleNavClick = (page) => {
        setCurrentPage(page);
        closeMobileMenu();
    };

    const userRole = user?.role || 'collaborator';
    const allowedPages = user?.allowedPages || [];

    const visibleSections = NAVIGATION.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
            // 1. Check Role
            const hasRole = item.roles.includes(userRole);
            if (!hasRole) return false;

            // 2. Check Granular Permissions (if defined)
            if (allowedPages.length > 0) {
                return allowedPages.includes(item.key);
            }

            return true;
        }),
    })).filter((section) => section.items.length > 0);

    const userInitial =
        user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';
    const roleLabel = ROLE_LABELS[userRole] || userRole;

    return (
        <>
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
                    onClick={closeMobileMenu}
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-[19rem] flex-col gap-6 border-r border-slate-800/80 bg-slate-950/95 px-5 py-6 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.9)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:static lg:z-40 lg:w-72 lg:px-6 lg:py-8 lg:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm shadow-black/40">
                    <div className="flex items-center gap-3">
                        <div className="flex aspect-square w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/40">
                            <BarChart3 className="h-6 w-6" strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                                Marketing Platform
                            </p>
                            <h1 className="truncate text-lg font-black tracking-tight text-white">
                                MarketingApp
                            </h1>
                        </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-slate-400">
                        Controllo centralizzato di budget, spese e contratti.
                    </p>
                </div>

                <nav className="flex-1 space-y-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
                    {visibleSections.map((section) => (
                        <div key={section.section} className="space-y-3">
                            <p className="px-2 text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
                                {section.section}
                            </p>
                            <ul className="space-y-2">
                                {section.items.map((item) => (
                                    <NavItem
                                        key={item.key}
                                        icon={item.icon}
                                        label={item.label}
                                        description={item.description}
                                        isActive={currentPage === item.key}
                                        onClick={() => handleNavClick(item.key)}
                                    />
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                <div className="mt-auto space-y-3">
                    <div className="space-y-3">
                        <p className="px-2 text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
                            Account
                        </p>
                    </div>
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm shadow-black/40">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white font-semibold">
                                {userInitial}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">
                                    {user?.name || user?.email}
                                </p>
                                {user?.name && user?.email && (
                                    <p className="truncate text-xs font-medium text-slate-400">
                                        {user.email}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-start">
                            <span className="inline-flex items-center rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300">
                                {roleLabel}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            handleLogout();
                            closeMobileMenu();
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-rose-400 hover:bg-rose-500/10 hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                        <LogOut className="h-4 w-4" />
                        Esci
                    </button>
                </div>
            </aside>
        </>
    );
}
