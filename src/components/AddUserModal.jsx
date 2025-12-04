import React, { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { MultiSelect } from './SharedComponents';

const AVAILABLE_PAGES = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'expenses', name: 'Spese' },
    { id: 'budget', name: 'Budget' },
    { id: 'operations', name: 'Operazioni (Sedi)' },
    { id: 'hr', name: 'Risorse Umane' },
    { id: 'contracts', name: 'Contratti' },
    { id: 'settings', name: 'Impostazioni' },
];

export default function AddUserModal({ isOpen, onClose, onSave, suppliers = [] }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('collaborator');
    const [assignedChannels, setAssignedChannels] = useState([]);
    const [allowedPages, setAllowedPages] = useState(['dashboard', 'expenses']);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setName('');
            setEmail('');
            setRole('collaborator');
            setAssignedChannels([]);
            setAllowedPages(['dashboard', 'expenses']);
        }
    }, [isOpen]);

    const handleSave = () => {
        if (!name.trim() || !email.trim()) {
            return toast.error("Tutti i campi sono obbligatori.");
        }
        onSave({
            name,
            email,
            role,
            assignedChannels,
            allowedPages
        });
    };

    const handleChannelChange = (channelId) => {
        setAssignedChannels(prev =>
            prev.includes(channelId)
                ? prev.filter(id => id !== channelId)
                : [...prev, channelId]
        );
    };

    const handlePageChange = (pageId) => {
        setAllowedPages(prev =>
            prev.includes(pageId)
                ? prev.filter(id => id !== pageId)
                : [...prev, pageId]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white/98 shadow-[0_35px_95px_-45px_rgba(15,23,42,0.75)] transition-transform max-h-[90vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white shrink-0">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white shadow-inner shadow-black/20">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black">Invita utente</h3>
                            <p className="text-sm font-medium text-white/80">Invia un invito via email per accedere alla piattaforma</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/80 transition-all hover:bg-white/20 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-5 overflow-y-auto bg-white px-6 py-6 grow">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 block">Nome completo</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-all focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 block">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-all focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 block">Ruolo</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-all focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                        >
                            <option value="collaborator">Collaborator</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    {role === 'collaborator' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 block">
                                    Fornitori Assegnati
                                </label>
                                <MultiSelect
                                    options={suppliers}
                                    selected={assignedChannels}
                                    onChange={handleChannelChange}
                                    placeholder="Seleziona fornitori..."
                                    selectedText={`${assignedChannels.length} fornitori`}
                                    searchPlaceholder="Cerca fornitore..."
                                />
                                <p className="text-[10px] text-slate-400">
                                    L'utente vedrà solo le spese relative a questi fornitori.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 block">
                                    Pagine Abilitate
                                </label>
                                <MultiSelect
                                    options={AVAILABLE_PAGES}
                                    selected={allowedPages}
                                    onChange={handlePageChange}
                                    placeholder="Seleziona pagine..."
                                    selectedText={`${allowedPages.length} pagine`}
                                    searchPlaceholder="Cerca pagina..."
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200/60 bg-slate-50/80 px-6 py-5 sm:flex-row sm:items-center sm:justify-between shrink-0">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                        Operazione impostazioni
                    </div>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row">
                        <button type="button" onClick={onClose} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-100">Annulla</button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-transform hover:-translate-y-[1px] hover:bg-slate-800"
                        >
                            Invia Invito
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
