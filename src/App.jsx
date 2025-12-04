import React, { useState, useEffect } from 'react';
import { X, Menu } from 'lucide-react';
import { useUser, useClerk, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import BudgetPage from './pages/BudgetPage';
import SettingsPage from './pages/SettingsPage';
import Spinner from './components/Spinner';
import ContractsPage from './pages/ContractsPage';
import EmployeesPage from './pages/EmployeesPage';
import MFASetup from './components/MFASetup';

export default function App() {
    const { user, isLoaded, isSignedIn } = useUser();
    const { signOut } = useClerk();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [pageState, setPageState] = useState({
        currentPage: 'dashboard',
        initialFilters: {},
    });

    // Sync Clerk user data with local state structure if needed, or use Clerk user object directly
    // For now, mapping Clerk user to existing structure
    const appUser = user ? {
        uid: user.id,
        name: user.fullName,
        email: user.primaryEmailAddress?.emailAddress,
        role: user.publicMetadata?.role || 'collaborator', // Default role
    } : null;

    const navigate = (page, filters = {}) => {
        setPageState({ currentPage: page, initialFilters: filters });
        setIsMobileMenuOpen(false);
    };

    const renderPage = (page, user, filters) => {
        const userPermissions = {
            manager: ['dashboard', 'budget', 'expenses', 'operations', 'hr', 'settings', 'contracts'],
            collaborator: ['dashboard', 'expenses'],
            admin: ['dashboard', 'expenses', 'operations', 'hr', 'budget', 'settings', 'contracts'],
        };
        const allowedPages = userPermissions[user.role] || [];
        if (!allowedPages.includes(page)) {
            return <DashboardPage user={user} navigate={navigate} />;
        }

        switch (page) {
            case 'dashboard':
                return <DashboardPage user={user} navigate={navigate} />;
            case 'expenses':
                return <ExpensesPage user={user} initialFilters={filters} />;
            case 'operations':
                return <ExpensesPage user={user} initialFilters={filters} costDomain="operations" />;
            case 'budget':
                return <BudgetPage user={user} />;
            case 'settings':
                return <SettingsPage user={user} />;
            case 'contracts':
                return <ContractsPage user={user} />;
            case 'hr':
                return <EmployeesPage user={user} />;
            default:
                return <DashboardPage user={user} navigate={navigate} />;
        }
    };

    const handleLogout = () => {
        signOut();
    };

    if (!isLoaded) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Spinner size="large" />
            </div>
        );
    }

    // Force MFA Setup with Custom UI
    if (isSignedIn && user && !user.twoFactorEnabled) {
        return <MFASetup />;
    }



    return (
        <>
            <SignedOut>
                <RedirectToSignIn />
            </SignedOut>
            <SignedIn>
                <div className="flex h-screen bg-gray-50 overflow-hidden">
                    <Sidebar
                        user={appUser}
                        currentPage={pageState.currentPage}
                        setCurrentPage={(page) => navigate(page)}
                        handleLogout={handleLogout}
                        isMobileMenuOpen={isMobileMenuOpen}
                        setIsMobileMenuOpen={setIsMobileMenuOpen}
                    />
                    <main className="flex-1 flex flex-col overflow-y-auto">
                        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-20 p-4 bg-gray-50/80 backdrop-blur-sm border-b border-gray-200">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="p-3 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-xl shadow-lg"
                                aria-label="Toggle menu"
                            >
                                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                                {appUser?.name?.charAt(0)?.toUpperCase() || appUser?.email?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                        </header>
                        <div className="flex-1">
                            {appUser && renderPage(pageState.currentPage, appUser, pageState.initialFilters)}
                        </div>
                    </main>
                </div>
            </SignedIn>
        </>
    );
}
