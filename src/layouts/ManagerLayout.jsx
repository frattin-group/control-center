import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { BarChart3, LayoutDashboard, Target, DollarSign, Settings, Plug, LogOut } from 'lucide-react';

// Un piccolo componente per i link di navigazione, per non ripetere il codice
function NavLink({ to, active, icon, children }) {
  return (
    <Link
      to={to}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${active ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-200'
        }`}
    >
      {icon}
      {children}
    </Link>
  );
}

export default function ManagerLayout({ user }) {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/budget', label: 'Budget', icon: <Target size={20} /> },
    { to: '/expenses', label: 'Spese', icon: <DollarSign size={20} /> },
    { to: '/settings', label: 'Impostazioni', icon: <Settings size={20} /> },
  ];

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-64 bg-white shadow-lg flex flex-col p-4">
        <div className="text-center mb-8">
          <BarChart3 className="mx-auto h-10 w-10 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Platform</h1>
        </div>
        <nav className="flex flex-col gap-2">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              active={location.pathname === link.to}
              icon={link.icon}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-center">
          <p className="text-gray-700 font-semibold">{user.name}</p>
          <p className="text-sm text-gray-500 mb-4">{user.email}</p>
          <button
            onClick={() => signOut(auth)}
            className="w-full bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            Esci
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {/* L'Outlet è il segnaposto dove React Router disegnerà la pagina corretta */}
        <Outlet />
      </main>
    </div>
  );
}