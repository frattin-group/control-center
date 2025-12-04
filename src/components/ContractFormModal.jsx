import React, { useState, useEffect, useMemo } from 'react';
import { FileSignature, X, PlusCircle, Trash2, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';

const formatCurrency = (number) => {
    if (typeof number !== 'number' || isNaN(number)) return '€ 0,00';
    return number.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
};

export default function ContractFormModal({ isOpen, onClose, onSave, initialData, suppliers, sectors, branches }) {

    const defaultLineItem = useMemo(() => ({
        _key: Math.random(), description: '', totalAmount: '', startDate: '', endDate: '', branchld: '', sectorld: '',
    }), []);

    const defaultFormData = useMemo(() => ({
        supplierld: '', signingDate: new Date().toISOString().split('T')[0], description: '', contractPdfUrl: '', lineItems: [defaultLineItem],
    }), [defaultLineItem]);

    const [formData, setFormData] = useState(defaultFormData);
    const [contractFile, setContractFile] = useState(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const formatDateForInput = (dateString) => {
                    if (!dateString) return '';
                    // If it's already YYYY-MM-DD, return it
                    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
                    try {
                        // Handle ISO strings safely
                        return new Date(dateString).toISOString().split('T')[0];
                    } catch (e) {
                        return '';
                    }
                };

                const mappedData = {
                    ...initialData,
                    supplierld: initialData.supplierld || initialData.supplierId || '',
                    signingDate: formatDateForInput(initialData.signingDate),
                    lineItems: initialData.lineItems?.map(item => ({
                        ...item,
                        _key: Math.random(),
                        totalAmount: item.totalAmount || '',
                        startDate: formatDateForInput(item.startDate),
                        endDate: formatDateForInput(item.endDate),
                        sectorld: item.sectorld || item.sectorId || '',
                        branchld: item.branchld || item.branchId || ''
                    })) || [defaultLineItem]
                };
                setFormData(mappedData);
            } else {
                setFormData(defaultFormData);
            }
        }
        setContractFile(null);
    }, [isOpen, initialData, defaultFormData, defaultLineItem]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedLineItems = [...formData.lineItems];
        updatedLineItems[index][field] = value;
        setFormData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const addLineItem = () => {
        setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { ...defaultLineItem, _key: Math.random() }] }));
    };

    const removeLineItem = (index) => {
        if (formData.lineItems.length <= 1) {
            return toast.error("Deve esserci almeno una voce di contratto.");
        }
        setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index) }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === "application/pdf") {
            setContractFile(file);
            toast.success(`File selezionato: ${file.name}`);
        } else {
            toast.error("Per favore, seleziona un file PDF.");
            e.target.value = null;
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.supplierld || !formData.description.trim() || !formData.signingDate) {
            toast.error("I campi principali (Fornitore, Data Firma, Descrizione) sono obbligatori.");
            return;
        }
        for (const [index, item] of formData.lineItems.entries()) {
            if (!item.description.trim() || !item.totalAmount || !item.startDate || !item.endDate || !item.branchld || !item.sectorld) {
                toast.error(`Tutti i campi nella voce di costo #${index + 1} sono obbligatori.`);
                return;
            }
            if (new Date(item.startDate) >= new Date(item.endDate)) {
                toast.error(`Nella voce "${item.description}", la data di inizio deve essere precedente alla data di fine.`);
                return;
            }
        }
        onSave(formData, contractFile);
    };

    const contractTotal = useMemo(() => {
        return formData.lineItems?.reduce((sum, item) => {
            const amount = parseFloat(String(item.totalAmount || '0').replace(',', '.'));
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;
    }, [formData.lineItems]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] border border-white/30 overflow-hidden">

                <div className="p-6 border-b border-blue-200/30 flex justify-between items-center flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-white/15 text-white shadow-lg shadow-blue-900/30">
                            <FileSignature className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black">{formData.id ? 'Modifica Contratto' : 'Nuovo Contratto'}</h3>
                            <p className="text-sm text-white/80 font-medium">Compila i dati per creare o aggiornare un contratto</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2.5 text-white/70 hover:text-white rounded-xl hover:bg-white/15 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-gradient-to-br from-gray-50/30 to-white">

                        <div className="p-5 bg-white rounded-2xl border-2 border-gray-200 space-y-4 shadow-sm">
                            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Dati Principali</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-2">Fornitore *</label>
                                    <select name="supplierld" value={formData.supplierld || ''} onChange={handleInputChange} className="w-full h-11 px-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium" required>
                                        <option value="">Seleziona Fornitore</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-2">Data Firma Contratto *</label>
                                    <input type="date" name="signingDate" value={formData.signingDate || ''} onChange={handleInputChange} className="w-full h-11 px-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium" required />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 block mb-2">Descrizione Generale Contratto *</label>
                                <input type="text" name="description" value={formData.description || ''} onChange={handleInputChange} className="w-full h-11 px-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all" placeholder="Es. Accordo Quadro Subito.it 2025" required />
                            </div>
                        </div>

                        <div className="p-5 bg-white rounded-2xl border-2 border-gray-200 shadow-sm">
                            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Voci di Costo del Contratto</h4>
                            <div className="space-y-4">
                                {formData.lineItems?.map((item, index) => (
                                    <div key={item._key} className="p-4 bg-gray-50 rounded-xl border-2 border-gray-200 space-y-3 relative">
                                        {formData.lineItems.length > 1 && (
                                            <button type="button" onClick={() => removeLineItem(index)} className="absolute -top-2 -right-2 p-1.5 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded-full transition-all shadow-md"><Trash2 size={14} /></button>
                                        )}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Descrizione Voce *</label>
                                            <input type="text" placeholder="Es. Moto e Scooter - 20 annunci" value={item.description} onChange={e => handleLineItemChange(index, 'description', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg bg-white" required />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Importo (€) *</label>
                                                <input type="number" step="0.01" placeholder="0.00" value={item.totalAmount} onChange={e => handleLineItemChange(index, 'totalAmount', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" required />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Data Inizio *</label>
                                                <input type="date" value={item.startDate || ''} onChange={e => handleLineItemChange(index, 'startDate', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" required />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Data Fine *</label>
                                                <input type="date" value={item.endDate || ''} onChange={e => handleLineItemChange(index, 'endDate', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" required />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Settore *</label>
                                                <select value={item.sectorld || ''} onChange={e => handleLineItemChange(index, 'sectorld', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" required>
                                                    <option value="">Seleziona</option>
                                                    {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Filiale *</label>
                                                <select value={item.branchld || ''} onChange={e => handleLineItemChange(index, 'branchld', e.target.value)} className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg" required disabled={!item.sectorld}>
                                                    <option value="">Seleziona</option>
                                                    {branches.filter(b => b.associatedSectors?.includes(item.sectorld)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={addLineItem} className="mt-4 text-blue-600 font-bold flex items-center gap-2 hover:text-blue-700 transition-colors">
                                <PlusCircle size={18} /> Aggiungi Voce al Contratto
                            </button>
                        </div>

                        <div className="p-5 bg-white rounded-2xl border-2 border-gray-200 space-y-4 shadow-sm">
                            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Allegato</h4>
                            <div>
                                <label htmlFor="contractUpload" className="text-sm font-semibold text-gray-700 block mb-2">PDF Contratto</label>
                                {formData.contractPdfUrl && !contractFile && (
                                    <div className="flex items-center gap-2 text-sm mb-2">
                                        <a href={formData.contractPdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">Visualizza contratto corrente</a>
                                    </div>
                                )}
                                <div className="flex items-center gap-4">
                                    <label htmlFor="contractUpload" className="cursor-pointer flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 text-gray-700 font-semibold text-sm rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all">
                                        <Paperclip className="w-4 h-4" />
                                        <span>{contractFile ? "Cambia PDF" : "Carica PDF"}</span>
                                    </label>
                                    <input id="contractUpload" type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                                    <span className="text-sm text-gray-600">{contractFile ? contractFile.name : "Nessun nuovo file selezionato"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center border-t border-gray-200 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 font-medium">Valore Totale:</span>
                            <span className="text-2xl font-black text-blue-700">{formatCurrency(contractTotal)}</span>
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl bg-white text-gray-800 font-semibold border-2 border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all">Annulla</button>
                            <button type="submit" className="px-7 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold hover:shadow-lg transition-all">
                                Salva Contratto
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
