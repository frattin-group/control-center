import React, { useState, useEffect } from 'react';
import { X, Users, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';

export default function UserPermissionsModal({ isOpen, onClose, onSave, userData }) {
    const [role, setRole] = useState('');
    const [assignedChannels, setAssignedChannels] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);
    const { getToken } = useAuth();

    useEffect(() => {
        if (isOpen && userData) {
            setRole(userData.role || 'collaborator');
            setAssignedChannels(userData.assignedChannels || []);
        }
    }, [isOpen, userData]);

    useEffect(() => {
        if (!isOpen) return;

        const fetchSuppliers = async () => {
            setLoadingSuppliers(true);
            try {
                const token = await getToken();
                const response = await axios.get('/api/suppliers', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                // Sort by name
                const list = response.data.sort((a, b) => a.name.localeCompare(b.name));
                setSuppliers(list);
            } catch (error) {
                console.error('Errore caricamento fornitori:', error);
                toast.error('Errore nel caricamento dei fornitori');
            } finally {
                setLoadingSuppliers(false);
            }
        };

        fetchSuppliers();
    }, [isOpen, getToken]);

    const handleSave = () => {
        const dataToSave = {
            role,
            assignedChannels: role === 'collaborator' ? assignedChannels : [],
        };
        onSave(userData.id, dataToSave);
    };

    const toggleChannel = (channelId) => {
        setAssignedChannels(prev =>
            prev.includes(channelId)
                ? prev.filter(id => id !== channelId)
                : [...prev, channelId]
        );
    };

    const selectAllChannels = () => setAssignedChannels(suppliers.map(s => s.id));
    const deselectAllChannels = () => setAssignedChannels([]);

    if (!isOpen || !userData) return null;

    const isCollaborator = role === 'collaborator';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white/98 shadow-[0_35px_95px_-45px_rgba(15,23,42,0.75)]">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white shadow-inner shadow-black/20">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black">Modifica permessi utente</h3>
                            <p className="text-sm font-medium text-white/80">
                                Assegna ruolo e visibilità ai fornitori della piattaforma
                            </p>
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

                <div className="space-y-6 overflow-y-auto bg-white px-6 py-6">
                    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-5 shadow-inner shadow-white/60">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Utente selezionato
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{userData.name}</p>
                        <p className="text-sm font-medium text-slate-600">{userData.email}</p>
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
                        <p className="text-xs text-slate-500">
                            {role === 'admin' && '• Accesso completo a tutte le sezioni e alle configurazioni.'}
                            {role === 'manager' && '• Supervisione di budget, spese e contratti con facoltà di modifica.'}
                            {role === 'collaborator' && '• Accesso operativo ai soli fornitori assegnati.'}
                        </p>
                    </div>

                    {isCollaborator && (
                        <div className="space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                                        <ShoppingCart className="h-4 w-4" />
                                        Fornitori assegnati ({assignedChannels.length})
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Seleziona a quali fornitori questo collaboratore potrà accedere
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={selectAllChannels}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-800 underline"
                                    >
                                        Seleziona tutti
                                    </button>
                                    <span className="text-slate-400">|</span>
                                    <button
                                        type="button"
                                        onClick={deselectAllChannels}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-800 underline"
                                    >
                                        Deseleziona tutti
                                    </button>
                                </div>
                            </div>

                            {loadingSuppliers ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-600 border-t-transparent" />
                                </div>
                            ) : suppliers.length === 0 ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                                    <p className="text-sm font-semibold text-amber-800">
                                        Nessun fornitore disponibile. Aggiungili dalla pagina Impostazioni.
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
                                    {suppliers.map(supplier => (
                                        <label
                                            key={supplier.id}
                                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-100/60"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={assignedChannels.includes(supplier.id)}
                                                onChange={() => toggleChannel(supplier.id)}
                                                className="h-4 w-4 rounded border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-500"
                                            />
                                            <span className="text-sm font-semibold text-slate-800">{supplier.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {assignedChannels.length === 0 && !loadingSuppliers && suppliers.length > 0 && (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
                                    <p className="text-sm font-medium text-rose-700">
                                        ⚠️ Senza fornitori assegnati il collaboratore non potrà visualizzare alcun dato.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {!isCollaborator && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4">
                            <p className="text-sm font-medium text-blue-800">
                                ℹ️ Manager e Admin dispongono automaticamente dell’accesso a tutti i fornitori.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200/60 bg-slate-50/80 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                        Operazione impostazioni
                    </div>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-100"
                        >
                            Annulla
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-transform hover:-translate-y-[1px] hover:bg-slate-800"
                        >
                            Salva permessi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
