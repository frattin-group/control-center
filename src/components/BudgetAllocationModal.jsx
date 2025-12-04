import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Trash2, X, Settings, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BudgetAllocationModal({ isOpen, onClose, onSave, supplier, year, initialAllocations, sectors, branches, marketingChannels }) {
    const [allocations, setAllocations] = useState([]);
    const [isUnexpected, setIsUnexpected] = useState(false);

    const defaultAllocation = useMemo(() => ({
        _key: Math.random(),
        marketingChannelId: '',
        sectorId: '',
        branchId: '',
        budgetAmount: '',
        isUnexpected: false,
    }), []);

    useEffect(() => {
        if (isOpen) {
            setIsUnexpected(supplier?.isUnexpected || false);
            if (!initialAllocations || initialAllocations.length === 0) {
                setAllocations([defaultAllocation]);
                return;
            }
            const frattinGroupSector = sectors.find(s => s.name === 'Frattin Group');
            const genericoBranch = branches.find(b => b.name.toLowerCase() === 'generico');
            const grouped = [];
            const processed = new Set();
            initialAllocations.forEach((alloc, index) => {
                if (processed.has(index)) return;
                const siblings = initialAllocations.filter((a, i) => i !== index && a.sectorId === alloc.sectorId && a.marketingChannelId === alloc.marketingChannelId && a.branchId !== alloc.branchId);
                if (alloc.sectorId === frattinGroupSector?.id && siblings.length > 0) {
                    const allSiblings = [alloc, ...siblings];
                    allSiblings.forEach(s => processed.add(initialAllocations.indexOf(s)));
                    const totalBudget = allSiblings.reduce((sum, s) => sum + (s.budgetAmount || 0), 0);
                    const isUnexpectedAny = allSiblings.some(s => s.isUnexpected);
                    grouped.push({ marketingChannelId: alloc.marketingChannelId, sectorId: alloc.sectorId, branchId: genericoBranch?.id || '', budgetAmount: totalBudget, isUnexpected: isUnexpectedAny, _key: Math.random() });
                } else {
                    processed.add(index);
                    grouped.push({ ...alloc, budgetAmount: alloc.budgetAmount || '', isUnexpected: alloc.isUnexpected || false, _key: Math.random() });
                }
            });
            setAllocations(grouped.length > 0 ? grouped : [defaultAllocation]);
        }
    }, [isOpen, initialAllocations, supplier, defaultAllocation, sectors, branches]);

    const handleAllocationChange = (index, field, value) => {
        const newAllocations = [...allocations];
        newAllocations[index][field] = value;
        if (field === 'sectorId') {
            newAllocations[index]['branchId'] = '';
        }
        setAllocations(newAllocations);
    };

    const addAllocation = () => setAllocations([...allocations, { ...defaultAllocation, _key: Math.random() }]);

    const removeAllocation = (index) => {
        if (allocations.length <= 1) {
            return toast.error("Deve esserci almeno una riga di budget.");
        }
        setAllocations(allocations.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        const allocationsToSave = allocations.map((allocation) => {
            const cleaned = { ...allocation };
            delete cleaned._key;
            const budgetAmount = parseFloat(String(cleaned.budgetAmount || '0').replace(',', '.')) || 0;
            return {
                ...cleaned,
                budgetAmount,
                isUnexpected: cleaned.isUnexpected || false,
            };
        });
        for (const alloc of allocationsToSave) {
            if (!alloc.marketingChannelId || !alloc.sectorId || !alloc.branchId) {
                toast.error("Tutte le righe devono avere Canale, Settore e Filiale selezionati.");
                return;
            }
        }
        onSave(allocationsToSave, isUnexpected);
    };

    const totalBudget = useMemo(() => {
        return allocations.reduce((sum, alloc) => sum + (parseFloat(String(alloc.budgetAmount || '0').replace(',', '.')) || 0), 0);
    }, [allocations]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] border border-white/30 overflow-hidden">

                <div className="p-6 border-b border-gray-200/80 flex justify-between items-center flex-shrink-0 bg-gradient-to-r from-emerald-50 to-green-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 text-white shadow-lg">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900">Gestione Budget per {supplier.name}</h3>
                            <p className="text-sm text-gray-600 font-medium">Anno {year}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-white/80 transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-gradient-to-br from-gray-50/30 to-white">
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Impostazioni Generali</h4>
                        <div className="p-4 bg-white rounded-xl border-2 border-gray-200">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isUnexpected}
                                    onChange={e => setIsUnexpected(e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="font-semibold text-gray-700">Fornitore Inatteso (non previsto nel piano marketing iniziale)</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Allocazioni Budget</h4>
                        <div className="space-y-4">
                            {allocations.map((alloc, index) => {
                                const availableChannels = (supplier.offeredMarketingChannels && supplier.offeredMarketingChannels.length > 0)
                                    ? marketingChannels.filter(mc => supplier.offeredMarketingChannels.includes(mc.id))
                                    : marketingChannels;
                                const filteredBranches = branches.filter(b => b.associatedSectors?.includes(alloc.sectorId));
                                return (
                                    <div key={alloc._key} className={`relative p-4 rounded-xl border-2 space-y-3 transition-all ${alloc.isUnexpected ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-2 border-gray-200'}`}>
                                        {allocations.length > 1 && (
                                            <button type="button" onClick={() => removeAllocation(index)} className="absolute -top-2 -right-2 p-1.5 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded-full transition-all shadow-md" title="Rimuovi allocazione">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1">Canale Marketing</label>
                                                <select value={alloc.marketingChannelId} onChange={e => handleAllocationChange(index, 'marketingChannelId', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg bg-white">
                                                    <option value="">Seleziona</option>
                                                    {availableChannels.map(mc => <option key={mc.id} value={mc.id}>{mc.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 block mb-1">Settore</label>
                                                <select value={alloc.sectorId} onChange={e => handleAllocationChange(index, 'sectorId', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg bg-white">
                                                    <option value="">Seleziona</option>
                                                    {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 block mb-1">Filiale</label>
                                                <select value={alloc.branchId} onChange={e => handleAllocationChange(index, 'branchId', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg bg-white" disabled={!alloc.sectorId}>
                                                    <option value="">Seleziona</option>
                                                    {filteredBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 block mb-1">Budget (€)</label>
                                                <input type="number" step="0.01" value={alloc.budgetAmount} onChange={e => handleAllocationChange(index, 'budgetAmount', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" placeholder="0.00" />
                                            </div>
                                        </div>
                                        <div className="pt-3 border-t border-gray-200/50">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={alloc.isUnexpected || false}
                                                    onChange={e => handleAllocationChange(index, 'isUnexpected', e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className={`w-4 h-4 transition-colors ${alloc.isUnexpected ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500'}`} />
                                                    <span className={`text-sm font-semibold transition-colors ${alloc.isUnexpected ? 'text-amber-700' : 'text-gray-600 group-hover:text-amber-600'}`}>
                                                        Allocazione inattesa (spesa non prevista nel budget originale)
                                                    </span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={addAllocation} className="mt-4 text-emerald-600 font-bold flex items-center gap-2 hover:text-emerald-700 transition-colors">
                            <PlusCircle size={18} /> Aggiungi Allocazione
                        </button>
                    </div>
                </div>

                <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center border-t border-gray-200 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 font-medium">Totale Budget:</span>
                        <span className="text-2xl font-black text-emerald-700">{totalBudget.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl bg-white text-gray-800 font-semibold border-2 border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all">Annulla</button>
                        <button type="button" onClick={handleSave} className="px-7 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold hover:shadow-lg transition-all">
                            Salva Budget
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
