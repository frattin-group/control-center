import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, X, PlusCircle, Trash2, Link, List, Paperclip, ChevronDown, Check, ShoppingCart, FileSignature, Info, Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';

import { COST_DOMAINS, DEFAULT_COST_DOMAIN } from '../constants/costDomains';

// --- Componente MultiSelect ---
const MultiSelect = ({ options, selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredOptions = useMemo(() =>
        (options || []).filter(opt => opt.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [options, searchTerm]
    );

    const selectedCount = useMemo(() => (selected || []).length, [selected]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-10 px-3 text-left bg-white border-2 border-slate-200 rounded-lg flex justify-between items-center hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
            >
                <span className="block truncate text-slate-800 text-sm">
                    {selectedCount > 0 ? `${selectedCount} selezionat${selectedCount > 1 ? 'e' : 'a'}` : <span className="text-slate-400">Seleziona...</span>}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div
                    className="absolute z-20 mt-1 w-full bg-white shadow-2xl rounded-xl border border-slate-200 max-h-60 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                        <input
                            type="text"
                            placeholder="Cerca..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        />
                    </div>
                    <ul className="p-2">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => {
                                const isChecked = (selected || []).includes(option.id);
                                return (
                                    <li
                                        key={option.id}
                                        onClick={() => onChange(option.id)}
                                        className="px-3 py-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between transition-colors rounded-lg"
                                    >
                                        <span className="text-sm font-medium text-slate-800">{option.name}</span>
                                        <div className={`
                                            w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all
                                            ${isChecked ? 'bg-amber-600 border-amber-600' : 'bg-white border-slate-300'}
                                        `}>
                                            {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-3 py-4 text-center text-sm text-slate-500">
                                Nessuna opzione trovata
                            </li>
                        )}
                    </ul>
                </div>
            )}
            {isOpen && <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>}
        </div>
    );
};

const formatCurrency = (number) => {
    if (typeof number !== 'number' || isNaN(number)) return '€ 0,00';
    return number.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
};

export default function ExpenseFormModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    suppliers,
    sectors,
    branches,
    contracts,
    marketingChannels,
    domainConfigs = COST_DOMAINS,
    defaultCostDomain = DEFAULT_COST_DOMAIN,
    domainOptions,
    allowDomainSwitch = false,
}) {
    const { getToken } = useAuth();
    const resolvedDomainOptions = useMemo(() => {
        if (Array.isArray(domainOptions) && domainOptions.length > 0) {
            return domainOptions;
        }
        return Object.values(domainConfigs).map((config) => ({
            id: config.id,
            label: config.label,
        }));
    }, [domainOptions, domainConfigs]);

    const defaultDomainId = useMemo(() => {
        if (defaultCostDomain && domainConfigs[defaultCostDomain]) {
            return defaultCostDomain;
        }
        return DEFAULT_COST_DOMAIN;
    }, [defaultCostDomain, domainConfigs]);

    const getDomainConfig = useCallback(
        (domainId) => domainConfigs[domainId] || domainConfigs[DEFAULT_COST_DOMAIN] || COST_DOMAINS[DEFAULT_COST_DOMAIN],
        [domainConfigs]
    );

    const defaultLineItem = useMemo(() => ({
        _key: Math.random(),
        description: '',
        amount: '',
        sectorId: '',
        branchIds: [],
        marketingChannelId: '',
        relatedContractId: '',
        contractLineItemId: '', // Updated to match database field
    }), []);

    const defaultFormData = useMemo(() => {
        const domainConfig = getDomainConfig(defaultDomainId);
        return {
            supplierId: '',
            date: new Date().toISOString().split('T')[0],
            description: '',
            relatedContractId: '',
            requiresContract: domainConfig?.defaultRequiresContract ?? true,
            isAmortized: false,
            amortizationStartDate: '',
            amortizationEndDate: '',
            lineItems: [defaultLineItem],
            contractLinkType: 'single',
            costDomain: domainConfig?.id || defaultDomainId,
        };
    }, [defaultDomainId, defaultLineItem, getDomainConfig]);

    const [formData, setFormData] = useState(defaultFormData);
    const [invoiceFile, setInvoiceFile] = useState(null);

    // ⭐ NUOVO STATO: Per memorizzare i lineItems del contratto selezionato
    const [contractLineItems, setContractLineItems] = useState([]);
    const [selectedContract, setSelectedContract] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyzeInvoice = async (file) => {
        if (!file) return;
        setIsAnalyzing(true);
        const toastId = toast.loading('Analisi fattura in corso con AI...');

        try {
            let fileBase64ToUpload = null;

            if (file.type === 'application/pdf') {
                toast.loading('Conversione PDF in immagine...', { id: toastId });
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    const page = await pdf.getPage(1); // Prendi solo la prima pagina

                    const viewport = page.getViewport({ scale: 2.0 }); // Scala 2x per buona qualità
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    // Converti in JPEG
                    fileBase64ToUpload = canvas.toDataURL('image/jpeg', 0.8);
                } catch (pdfError) {
                    console.error("Errore conversione PDF:", pdfError);
                    toast.error("Errore nella lettura del PDF. Riprova con un'immagine.", { id: toastId });
                    setIsAnalyzing(false);
                    return;
                }
            } else {
                // È già un'immagine, leggila come base64
                fileBase64ToUpload = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                });
            }

            // Preparazione del contesto (Semplificato per risparmiare token)
            const context = {
                suppliers: suppliers?.map(s => ({ id: s.id, name: s.name })) || [],
                sectors: sectors?.map(s => ({ id: s.id, name: s.name })) || [],
                marketingChannels: marketingChannels?.map(c => ({ id: c.id, name: c.name })) || [],
                contracts: contracts?.map(c => ({ id: c.id, description: c.description, supplierId: c.supplierId || c.supplierld })) || []
            };

            try {
                const token = await getToken();
                // Inviamo sempre come immagine (se era PDF è stato convertito)
                const response = await axios.post('/api/invoice-analysis/analyze', {
                    fileBase64: fileBase64ToUpload,
                    context
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const data = response.data.data;

                toast.success('Dati estratti con successo!', { id: toastId });

                setFormData(prev => {
                    const updates = {};

                    // 1. Data
                    if (data.date) {
                        updates.date = data.date;
                    }

                    // 2. Fornitore
                    if (data.supplierId) {
                        updates.supplierId = data.supplierId;
                    } else if (data.supplierName) {
                        // Fallback: Fuzzy match se l'AI non ha trovato l'ID ma ha estratto il nome
                        if (suppliers) {
                            const normalizedSearch = data.supplierName.toLowerCase();
                            const foundSupplier = suppliers.find(s =>
                                s.name.toLowerCase().includes(normalizedSearch) ||
                                normalizedSearch.includes(s.name.toLowerCase())
                            );
                            if (foundSupplier) {
                                updates.supplierId = foundSupplier.id;
                            } else {
                                toast('Nuovo fornitore rilevato: ' + data.supplierName, { icon: '⚠️' });
                            }
                        }
                    }

                    // 3. Descrizione
                    if (data.description) {
                        updates.description = data.description;
                    }

                    // 4. Area di Costo (Cost Domain)
                    if (data.costDomain) {
                        // Mappa "marketing" o "sedi" agli ID reali
                        if (data.costDomain.toLowerCase() === 'sedi') {
                            // Trova l'ID del dominio Sedi (assumiamo che sia diverso dal default)
                            const sediDomain = Object.values(domainConfigs).find(d => d.id !== defaultDomainId); // Semplificazione
                            if (sediDomain) updates.costDomain = sediDomain.id;
                        } else {
                            updates.costDomain = defaultDomainId;
                        }
                    }

                    // 5. Line Items
                    let newLineItems = prev.lineItems;
                    if (data.lineItems && Array.isArray(data.lineItems) && data.lineItems.length > 0) {
                        newLineItems = data.lineItems.map(item => ({
                            ...defaultLineItem,
                            _key: Math.random(),
                            description: item.description || '',
                            amount: item.amount || 0,
                            sectorId: item.sectorId || prev.lineItems[0]?.sectorId || '',
                            branchIds: prev.lineItems[0]?.branchIds || [], // Le filiali sono difficili da dedurre, manteniamo quelle di default o vuote
                            marketingChannelId: item.marketingChannelId || '',
                            relatedContractId: item.contractId || '',
                        }));
                    } else if (data.totalAmount) {
                        // Se non ci sono line items dettagliati ma c'è il totale
                        newLineItems = [{
                            ...defaultLineItem,
                            _key: Math.random(),
                            description: data.description || 'Spesa generica',
                            amount: data.totalAmount,
                            sectorId: prev.lineItems[0]?.sectorId || '',
                            branchIds: prev.lineItems[0]?.branchIds || [],
                            marketingChannelId: prev.lineItems[0]?.marketingChannelId || '',
                        }];
                    }

                    return {
                        ...prev,
                        ...updates,
                        lineItems: newLineItems
                    };
                });

            } catch (error) {
                console.error("Error calling function:", error);
                toast.error('Errore durante l\'analisi AI: ' + error.message, { id: toastId });
            } finally {
                setIsAnalyzing(false);
            }
        } catch (e) {
            console.error(e);
            toast.error('Errore generico.', { id: toastId });
            setIsAnalyzing(false);
        }
    };

    const activeDomainConfig = useMemo(
        () => getDomainConfig(formData.costDomain || defaultDomainId),
        [formData.costDomain, getDomainConfig, defaultDomainId]
    );

    const channelLabel = activeDomainConfig?.lineItemChannelLabel || 'Canale Marketing';
    const channelPlaceholder = activeDomainConfig?.lineItemChannelPlaceholder || 'Seleziona...';
    const channelRequired = activeDomainConfig?.lineItemChannelRequired !== false;
    const supportsContracts = activeDomainConfig?.supportsContracts !== false;
    const supportsAttachments = activeDomainConfig?.supportsAttachments !== false;

    useEffect(() => {
        if (!isOpen) return;

        if (initialData) {
            const initialCostDomain = initialData.costDomain && domainConfigs[initialData.costDomain]
                ? initialData.costDomain
                : defaultDomainId;
            const domainConfig = getDomainConfig(initialCostDomain);

            const enrichedLineItems = (initialData.lineItems && initialData.lineItems.length > 0)
                ? initialData.lineItems.map(item => ({
                    ...item,
                    _key: Math.random(),
                    amount: item.amount || '',
                    sectorId: item.sectorId || item.sectorld || initialData.sectorId || initialData.sectorld,
                    branchIds: item.branchIds && item.branchIds.length > 0
                        ? item.branchIds
                        : (item.branchId ? [item.branchId] : (item.assignmentId ? [item.assignmentId] : [])),
                    marketingChannelId: item.marketingChannelId || item.marketingChannelld || '',
                    contractLineItemId: item.contractLineItemId || item.relatedLineItemId || '', // Support legacy field
                    relatedContractId: item.relatedContractId || item.contractId || '',
                }))
                : [{ ...defaultLineItem, _key: Math.random() }];

            const linkType = enrichedLineItems.some(li => li.relatedContractId) ? 'line' : 'single';

            setFormData({
                ...initialData,
                date: initialData.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                supplierId: initialData.supplierId || initialData.supplierld,
                contractLinkType: linkType,
                relatedContractId: initialData.relatedContractId || initialData.contractId || '',
                requiresContract: initialData.requiresContract !== undefined
                    ? initialData.requiresContract
                    : (domainConfig?.defaultRequiresContract ?? true),
                lineItems: enrichedLineItems,
                costDomain: initialCostDomain,
            });
        } else {
            setFormData(defaultFormData);
        }

        setInvoiceFile(null);
        setContractLineItems([]);
        setSelectedContract(null);
    }, [isOpen, initialData, defaultFormData, defaultLineItem, defaultDomainId, domainConfigs, getDomainConfig]);

    useEffect(() => {
        if (!supportsAttachments) {
            setInvoiceFile(null);
        }
    }, [supportsAttachments]);

    // ⭐ NUOVO useEffect: Carica i lineItems quando si seleziona un contratto
    useEffect(() => {
        if (formData.relatedContractId && contracts && formData.requiresContract) {
            const contract = contracts.find(c => c.id === formData.relatedContractId);
            if (contract && contract.lineItems) {
                setSelectedContract(contract);
                setContractLineItems(contract.lineItems);
            } else {
                setSelectedContract(null);
                setContractLineItems([]);
            }
        } else {
            setSelectedContract(null);
            setContractLineItems([]);
        }
    }, [formData.relatedContractId, contracts, formData.requiresContract]);

    const expenseTotal = useMemo(() => {
        return formData.lineItems?.reduce((sum, item) => {
            const amount = parseFloat(String(item.amount || '0').replace(',', '.'));
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0) || 0;
    }, [formData.lineItems]);

    const selectedSupplier = useMemo(() => {
        if (!formData.supplierId || !suppliers) return null;
        return suppliers.find(s => s.id === formData.supplierId) || null;
    }, [formData.supplierId, suppliers]);

    const availableSectors = useMemo(() => {
        if (!sectors || sectors.length === 0) return [];
        if (!selectedSupplier || !Array.isArray(selectedSupplier.associatedSectors) || selectedSupplier.associatedSectors.length === 0) {
            return sectors;
        }
        const allowed = sectors.filter(sector => selectedSupplier.associatedSectors.includes(sector.id));

        console.log('Filtering Sectors:', {
            supplier: selectedSupplier.name,
            associatedSectors: selectedSupplier.associatedSectors,
            totalSectors: sectors.length,
            allowedCount: allowed.length
        });

        return allowed.length > 0 ? allowed : sectors;
    }, [sectors, selectedSupplier]);

    const getBranchesForSector = useCallback((sectorId) => {
        if (!branches || branches.length === 0) return [];
        if (!sectorId) return branches;
        const filtered = branches.filter(branch => branch.associatedSectors?.includes(sectorId));

        console.log('Filtering Branches:', {
            sectorId,
            totalBranches: branches.length,
            filteredCount: filtered.length,
            firstBranchSectors: branches[0]?.associatedSectors
        });

        return filtered.length > 0 ? filtered : branches;
    }, [branches]);

    const defaultSectorIdForSupplier = useMemo(() => {
        if (!availableSectors || availableSectors.length === 0) return '';
        if (availableSectors.length === 1) return availableSectors[0].id;
        const preferred = availableSectors.find(sector => selectedSupplier?.associatedSectors?.[0] === sector.id);
        return preferred?.id || availableSectors[0].id;
    }, [availableSectors, selectedSupplier]);

    useEffect(() => {
        if (!isOpen) return;
        if (!selectedSupplier) return;

        setFormData(prev => {
            const currentLineItems = Array.isArray(prev.lineItems) ? prev.lineItems : [];
            let hasChanges = false;

            const updatedLineItems = currentLineItems.map(item => {
                let updatedItem = item;
                let itemChanged = false;

                if (availableSectors.length > 0 && !availableSectors.some(sector => sector.id === item.sectorId)) {
                    updatedItem = { ...updatedItem, sectorId: defaultSectorIdForSupplier };
                    itemChanged = true;
                }

                const sectorBranches = getBranchesForSector(updatedItem.sectorId || defaultSectorIdForSupplier || '');

                const currentBranchIds = Array.isArray(updatedItem.branchIds) ? updatedItem.branchIds : [];
                const validBranchIds = currentBranchIds.filter(id => sectorBranches.some(branch => branch.id === id));

                if (sectorBranches.length === 1) {
                    const singleBranchId = sectorBranches[0].id;
                    if (validBranchIds.length !== 1 || validBranchIds[0] !== singleBranchId) {
                        updatedItem = { ...updatedItem, branchIds: [singleBranchId] };
                        itemChanged = true;
                    }
                } else if (validBranchIds.length !== currentBranchIds.length) {
                    updatedItem = { ...updatedItem, branchIds: validBranchIds };
                    itemChanged = true;
                }

                if (itemChanged) {
                    hasChanges = true;
                    return updatedItem;
                }
                return item;
            });

            return hasChanges ? { ...prev, lineItems: updatedLineItems } : prev;
        });
    }, [isOpen, selectedSupplier, availableSectors, defaultSectorIdForSupplier, getBranchesForSector]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const finalValue = type === 'checkbox' ? checked : value;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedLineItems = [...formData.lineItems];
        updatedLineItems[index][field] = value;
        setFormData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const handleBranchMultiSelectChange = (lineIndex, branchId) => {
        const updatedLineItems = [...formData.lineItems];
        const currentSelection = updatedLineItems[lineIndex].branchIds || [];
        const newSelection = currentSelection.includes(branchId)
            ? currentSelection.filter(id => id !== branchId)
            : [...currentSelection, branchId];
        updatedLineItems[lineIndex].branchIds = newSelection;
        setFormData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const handleDomainChange = (domainId) => {
        setFormData(prev => {
            const nextDomainConfig = getDomainConfig(domainId);
            const resetLineItems = (prev.lineItems || []).map(item => ({
                ...item,
                marketingChannelId: '',
                relatedContractId: '',
                contractLineItemId: '',
            }));
            return {
                ...prev,
                costDomain: domainId,
                requiresContract:
                    nextDomainConfig?.defaultRequiresContract !== undefined
                        ? nextDomainConfig.defaultRequiresContract
                        : prev.requiresContract,
                relatedContractId: '',
                contractLinkType: 'single',
                lineItems: resetLineItems.length > 0 ? resetLineItems : [{ ...defaultLineItem, _key: Math.random() }],
            };
        });
        setContractLineItems([]);
        setSelectedContract(null);
    };

    const renderContractControls = () => {
        if (!supportsContracts) {
            return null;
        }
        const toggleActive = formData.requiresContract;

        return (
            <div className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <FileSignature className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900">Questa spesa richiede un contratto?</p>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    Disattiva per spese che non necessitano contratto (es. spese una tantum)
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setFormData(prev => ({ ...prev, requiresContract: !prev.requiresContract }));
                            }}
                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${toggleActive ? 'bg-indigo-600' : 'bg-slate-300'
                                } cursor-pointer`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${toggleActive ? 'translate-x-8' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                {toggleActive && (
                    <div className="space-y-4">
                        <div className="p-3 bg-slate-100 rounded-xl">
                            <p className="text-xs font-bold text-slate-600 mb-2">Tipo di collegamento:</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleInputChange({ target: { name: 'contractLinkType', value: 'single' } })}
                                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${formData.contractLinkType === 'single'
                                        ? 'bg-white shadow-lg text-slate-900'
                                        : 'text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    <Link size={16} />
                                    Contratto Unico
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInputChange({ target: { name: 'contractLinkType', value: 'line' } })}
                                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${formData.contractLinkType === 'line'
                                        ? 'bg-white shadow-lg text-slate-900'
                                        : 'text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    <List size={16} />
                                    Per Singola Voce
                                </button>
                            </div>
                        </div>

                        {formData.contractLinkType === 'single' && (
                            <div>
                                <label className="text-sm font-semibold text-slate-700 block mb-2">
                                    Collega Contratto (intera spesa)
                                </label>
                                <select
                                    name="relatedContractId"
                                    value={formData.relatedContractId || ''}
                                    onChange={handleInputChange}
                                    className="w-full h-11 px-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                    disabled={!formData.supplierId}
                                >
                                    <option value="">Nessun contratto</option>
                                    {availableContracts.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.description}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {formData.contractLinkType === 'line' && (
                            <div className="p-4 bg-gradient-to-br from-indigo-50 to-white rounded-xl border-2 border-indigo-100">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="p-2 bg-indigo-100 rounded-lg">
                                        <List className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <p className="text-sm font-bold text-slate-900">Collega contratto per ogni voce</p>
                                        <p className="text-xs text-slate-600">
                                            Usa i controlli all'interno di ogni voce di spesa (sotto) per selezionare il contratto specifico.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {formData.contractLinkType === 'single' && formData.relatedContractId && contractLineItems.length > 0 && (
                            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200">
                                <div className="flex items-start gap-3 mb-3">
                                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900 mb-1">
                                            📋 LineItems del contratto "{selectedContract?.description}"
                                        </p>
                                        <p className="text-xs text-slate-600 mb-3">
                                            Seleziona quale lineItem del contratto stai pagando con questa spesa per un tracking preciso del budget
                                        </p>

                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                            {contractLineItems.map((lineItem) => {
                                                const isSelected = formData.lineItems[0]?.contractLineItemId === lineItem.id;
                                                const remaining = calculateLineItemRemaining(lineItem);
                                                const percentage = ((lineItem.totalAmount - remaining) / lineItem.totalAmount) * 100;

                                                return (
                                                    <button
                                                        key={lineItem.id}
                                                        type="button"
                                                        onClick={() => handleLineItemChange(0, 'contractLineItemId', lineItem.id)}
                                                        className={`w-full p-3 rounded-lg border-2 text-left transition-all ${isSelected
                                                            ? 'border-blue-500 bg-blue-100'
                                                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                                                            }`}
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex-1">
                                                                <p className="text-sm font-semibold text-slate-900">
                                                                    {lineItem.description}
                                                                </p>
                                                                <p className="text-xs text-slate-600 mt-1">
                                                                    {new Date(lineItem.startDate).toLocaleDateString('it-IT')} → {new Date(lineItem.endDate).toLocaleDateString('it-IT')}
                                                                </p>
                                                            </div>
                                                            <div
                                                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-2 ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                                                                    }`}
                                                            >
                                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between text-xs mb-1">
                                                            <span className="text-slate-600">Budget:</span>
                                                            <span className="font-bold text-slate-900">
                                                                {formatCurrency(lineItem.totalAmount)}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-slate-600">Residuo stimato:</span>
                                                            <span className="font-bold text-emerald-600">
                                                                {formatCurrency(remaining)}
                                                            </span>
                                                        </div>

                                                        <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
                                                                style={{ width: `${Math.min(percentage, 100)}%` }}
                                                            />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
                                            <p className="text-xs text-amber-800 flex items-start gap-2">
                                                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                <span>Seleziona il lineItem per un tracking preciso. Se non selezioni nulla, verrà usata la distribuzione temporale automatica.</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const addLineItem = () => {
        const baseItem = { ...defaultLineItem, _key: Math.random() };
        const sectorId = baseItem.sectorId || defaultSectorIdForSupplier || '';
        const sectorBranches = sectorId ? getBranchesForSector(sectorId) : [];
        const branchIds = sectorBranches.length === 1 ? [sectorBranches[0].id] : [];

        setFormData(prev => ({
            ...prev,
            lineItems: [
                ...prev.lineItems,
                {
                    ...baseItem,
                    sectorId,
                    branchIds,
                }
            ]
        }));
    };

    const removeLineItem = (index) => {
        if (formData.lineItems.length <= 1) {
            return toast.error("Deve esserci almeno una voce di spesa.");
        }
        setFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.filter((_, i) => i !== index)
        }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Accetta PDF e Immagini
            const isPdf = file.type === "application/pdf";
            const isImage = file.type.startsWith("image/");

            if (isPdf || isImage) {
                setInvoiceFile(file);
                toast.success(`File selezionato: ${file.name}`);

                // Opzionale: Chiedi se vuole analizzare subito
                // Per ora lo facciamo manuale col bottone, o automatico?
                // Meglio manuale col bottone "Compila con AI" che appare se c'è un file.
            } else {
                toast.error("Per favore, seleziona un file PDF o un'immagine.");
                e.target.value = null;
            }
        }
    };

    const availableContracts = useMemo(() => {
        if (!supportsContracts) return [];
        if (!formData.supplierId || !contracts) return [];
        return contracts.filter(c => (c.supplierId || c.supplierld) === formData.supplierId);
    }, [formData.supplierId, contracts, supportsContracts]);

    const filteredMarketingChannels = useMemo(() => {
        if (!marketingChannels) return [];

        const domainFiltered = marketingChannels.filter(channel => {
            const channelDomain = channel.domain || DEFAULT_COST_DOMAIN;
            return channelDomain === (formData.costDomain || defaultDomainId);
        });

        const supplierRestricted = (activeDomainConfig?.id || DEFAULT_COST_DOMAIN) === DEFAULT_COST_DOMAIN;

        if (!formData.supplierId || !suppliers || !supplierRestricted) {
            return domainFiltered;
        }

        const selectedSupplier = suppliers.find(s => s.id === formData.supplierId);
        // Ensure offeredMarketingChannels is treated as an array of strings
        const offeredIds = selectedSupplier?.offeredMarketingChannels || [];

        if (offeredIds.length === 0 || !supplierRestricted) return domainFiltered;

        return domainFiltered.filter(mc => offeredIds.includes(mc.id));
    }, [formData.supplierId, suppliers, marketingChannels, formData.costDomain, defaultDomainId, activeDomainConfig]);

    // ⭐ NUOVA FUNZIONE: Ottieni i lineItems per un contratto specifico (per modalità "Per Singola Voce")
    const getLineItemsForContract = (contractId) => {
        if (!contractId || !contracts) return [];
        const contract = contracts.find(c => c.id === contractId);
        return contract?.lineItems || [];
    };

    // ⭐ FUNZIONE HELPER: Calcola il residuo di un lineItem
    const calculateLineItemRemaining = (lineItem) => {
        // Questa è una versione semplificata - dovresti passare le spese come prop per calcolare accuratamente
        return lineItem.totalAmount || 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.supplierId || !formData.date) {
            toast.error("Fornitore e Data sono campi obbligatori.");
            return;
        }

        const finalLineItems = [];
        let hasError = false;

        formData.lineItems.forEach((item, index) => {
            if (hasError) return;
            const branches = item.branchIds || [];
            const channelRequired = activeDomainConfig?.lineItemChannelRequired !== false;
            const missingChannel = channelRequired && !item.marketingChannelId;

            if (!item.description || !item.amount || !item.sectorId || branches.length === 0 || missingChannel) {
                const channelLabel = activeDomainConfig?.lineItemChannelLabel || 'Canale Marketing';
                const errorLabel = missingChannel
                    ? `${channelLabel} obbligatorio`
                    : 'Tutti i campi sono obbligatori';
                toast.error(`${errorLabel} nella voce di spesa #${index + 1}.`);
                hasError = true;
                return;
            }

            const amount = parseFloat(String(item.amount).replace(',', '.')) || 0;

            if (branches.length > 1) {
                const amountPerBranch = amount / branches.length;
                const splitGroupId = uuidv4();
                branches.forEach(branchId => {
                    finalLineItems.push({
                        description: item.description,
                        amount: amountPerBranch,
                        sectorId: item.sectorId,
                        assignmentId: branchId,
                        marketingChannelId: item.marketingChannelId || null,
                        relatedContractId: formData.contractLinkType === 'line' ? (item.relatedContractId || null) : (formData.relatedContractId || null),
                        contractLineItemId: item.contractLineItemId || null,
                        splitGroupId,
                    });
                });
            } else {
                finalLineItems.push({
                    description: item.description,
                    amount,
                    sectorId: item.sectorId,
                    assignmentId: branches[0],
                    marketingChannelId: item.marketingChannelId || null,
                    relatedContractId: formData.contractLinkType === 'line' ? (item.relatedContractId || null) : (formData.relatedContractId || null),
                    contractLineItemId: item.contractLineItemId || null,
                });
            }
        });

        if (hasError) return;

        const finalData = {
            ...formData,
            supplierId: formData.supplierId,
            lineItems: finalLineItems,
            requiresContract: formData.requiresContract,
            invoiceFile: invoiceFile || null,
            costDomain: formData.costDomain || defaultDomainId,
        };

        onSave(finalData, invoiceFile || null, null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center px-4" onClick={onClose}>
            <div className="w-full max-w-5xl max-h-[90vh] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-amber-500 text-white px-6 py-5 flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-white/70 font-semibold">Spese</p>
                        <h2 className="text-2xl font-black">{formData.id ? 'Modifica Spesa' : 'Nuova Spesa'}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-slate-50/70">

                        {/* Sezione Dati Principali */}
                        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <ShoppingCart className="w-5 h-5 text-amber-600" />
                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                                    Informazioni Principali
                                </h4>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700 block mb-2">Area di costo *</label>
                                    {allowDomainSwitch ? (
                                        <select
                                            value={formData.costDomain || defaultDomainId}
                                            onChange={e => handleDomainChange(e.target.value)}
                                            className="w-full h-11 px-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                        >
                                            {resolvedDomainOptions.map(option => (
                                                <option key={option.id} value={option.id}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="w-full h-11 px-3 flex items-center bg-slate-100 border-2 border-slate-200 rounded-xl text-slate-700 font-semibold">
                                            {activeDomainConfig?.label || resolvedDomainOptions?.[0]?.label}
                                        </div>
                                    )}
                                    {activeDomainConfig?.description && (
                                        <p className="text-xs text-slate-500 mt-2">
                                            {activeDomainConfig.description}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 block mb-2">Fornitore *</label>
                                    <select
                                        name="supplierId"
                                        value={formData.supplierId || ''}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full h-11 px-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                    >
                                        <option value="">Seleziona Fornitore</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 block mb-2">Data Documento *</label>
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date || ''}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full h-11 px-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-slate-700 block mb-2">Descrizione Generale</label>
                                <input
                                    type="text"
                                    name="description"
                                    value={formData.description || ''}
                                    onChange={handleInputChange}
                                    placeholder="Es. Campagna marketing Q1 2025"
                                    className="w-full h-11 px-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                />
                            </div>
                        </div>

                        {/* Sezione Voci di Spesa */}
                        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <List className="w-5 h-5 text-amber-600" />
                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                                    Voci di Spesa
                                </h4>
                            </div>

                            <div className="space-y-4">
                                {formData.lineItems.map((item, index) => (
                                    <div key={item._key} className="p-4 bg-gradient-to-br from-slate-50 to-white rounded-xl border-2 border-slate-200 hover:border-amber-300 transition-all">
                                        <div className="flex items-start justify-between mb-3">
                                            <span className="text-sm font-bold text-slate-600">Voce #{index + 1}</span>
                                            {formData.lineItems.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeLineItem(index)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Descrizione *</label>
                                                <input
                                                    type="text"
                                                    value={item.description || ''}
                                                    onChange={e => handleLineItemChange(index, 'description', e.target.value)}
                                                    placeholder="Es. Google Ads - Auto"
                                                    className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Importo (€) *</label>
                                                <input
                                                    type="text"
                                                    value={item.amount || ''}
                                                    onChange={e => handleLineItemChange(index, 'amount', e.target.value)}
                                                    placeholder="0,00"
                                                    className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Settore *</label>
                                                <select
                                                    value={item.sectorId || ''}
                                                    onChange={e => handleLineItemChange(index, 'sectorId', e.target.value)}
                                                    className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                                    required
                                                >
                                                    <option value="">Seleziona...</option>
                                                    {availableSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Filiali *</label>
                                                <MultiSelect
                                                    options={getBranchesForSector(item.sectorId)}
                                                    selected={item.branchIds}
                                                    onChange={(branchId) => handleBranchMultiSelectChange(index, branchId)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                                                    {channelLabel}
                                                    {channelRequired ? ' *' : ''}
                                                </label>
                                                <select
                                                    value={item.marketingChannelId || ''}
                                                    onChange={e => handleLineItemChange(index, 'marketingChannelId', e.target.value)}
                                                    className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                                    required={channelRequired}
                                                >
                                                    <option value="">{channelPlaceholder}</option>
                                                    {filteredMarketingChannels.map(mc => (
                                                        <option key={mc.id} value={mc.id}>{mc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* ⭐ NUOVO: Dropdown contratto e lineItems per modalità "Per Singola Voce" */}
                                        {activeDomainConfig?.supportsContracts !== false && formData.contractLinkType === 'line' && formData.requiresContract && (
                                            <div className="col-span-2 pt-3 mt-3 border-t-2 border-slate-200">
                                                <div className="space-y-3">
                                                    {/* Dropdown Contratto */}
                                                    <div>
                                                        <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                                                            Collega Contratto (questa voce) *
                                                        </label>
                                                        <select
                                                            value={item.relatedContractId || ''}
                                                            onChange={e => {
                                                                handleLineItemChange(index, 'relatedContractId', e.target.value);
                                                                // Reset lineItem quando cambia contratto
                                                                handleLineItemChange(index, 'contractLineItemId', '');
                                                            }}
                                                            className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg bg-white hover:border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                                            disabled={!formData.supplierId}
                                                        >
                                                            <option value="">Seleziona contratto...</option>
                                                            {availableContracts.map(c => (
                                                                <option key={c.id} value={c.id}>{c.description}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* ⭐ Dropdown LineItems (appare solo se c'è un contratto selezionato) */}
                                                    {item.relatedContractId && getLineItemsForContract(item.relatedContractId).length > 0 && (
                                                        <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                                                            <label className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-2">
                                                                <Info className="w-4 h-4 text-blue-600" />
                                                                Seleziona LineItem specifico (opzionale)
                                                            </label>
                                                            <select
                                                                value={item.contractLineItemId || ''}
                                                                onChange={e => handleLineItemChange(index, 'contractLineItemId', e.target.value)}
                                                                className="w-full h-10 px-3 border-2 border-blue-200 rounded-lg bg-white hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                                            >
                                                                <option value="">Nessun lineItem (usa distribuzione automatica)</option>
                                                                {getLineItemsForContract(item.relatedContractId).map(li => (
                                                                    <option key={li.id} value={li.id}>
                                                                        {li.description} • {formatCurrency(li.totalAmount)} • {new Date(li.startDate).toLocaleDateString('it-IT')} → {new Date(li.endDate).toLocaleDateString('it-IT')}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <p className="text-xs text-slate-600 mt-2 flex items-start gap-1">
                                                                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                                <span>Seleziona un lineItem per tracking preciso. Se non selezioni, verrà usata la distribuzione temporale.</span>
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={addLineItem}
                                className="mt-4 text-amber-600 font-bold flex items-center gap-2 hover:text-amber-700 transition-colors"
                            >
                                <PlusCircle size={18} />
                                Aggiungi Voce di Spesa
                            </button>
                        </div>

                        {/* Sezione Documenti e Contratti */}
                        <div className="space-y-4">
                            {supportsContracts && renderContractControls()}

                            {supportsAttachments && (
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 block mb-2">
                                        <Paperclip className="w-4 h-4 inline mr-1" />
                                        Allega Fattura PDF
                                    </label>

                                    {/* NUOVO FILE UPLOAD CON AI */}
                                    <div className="mt-2 flex items-center gap-3">
                                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl cursor-pointer hover:bg-indigo-100 transition-colors font-semibold text-sm border border-indigo-200">
                                            <Paperclip size={16} />
                                            {invoiceFile ? 'Cambia File' : 'Carica Fattura/Ricevuta'}
                                            <input
                                                type="file"
                                                accept=".pdf,image/*"
                                                onChange={handleFileChange}
                                                className="hidden"
                                            />
                                        </label>
                                        {invoiceFile && (
                                            <span className="text-sm text-slate-600 font-medium bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 flex items-center gap-2">
                                                <FileText size={14} />
                                                {invoiceFile.name}
                                            </span>
                                        )}

                                        {invoiceFile && (
                                            <button
                                                type="button"
                                                onClick={() => handleAnalyzeInvoice(invoiceFile)}
                                                disabled={isAnalyzing}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:from-fuchsia-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isAnalyzing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="w-4 h-4" />
                                                )}
                                                {isAnalyzing ? 'Analisi in corso...' : 'Compila con AI'}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 ml-1">
                                        Formati supportati: PDF, Immagini (JPG, PNG). Carica il file per abilitare l'autocompilazione AI.
                                    </p>

                                    <div className="mt-2 text-sm">
                                        <span className="text-slate-600">File selezionato: </span>
                                        <span className="font-medium">
                                            {invoiceFile ? (
                                                <span className="font-medium text-emerald-600">
                                                    ✓ {invoiceFile.name}
                                                </span>
                                            ) : formData.invoicePdfUrl ? (
                                                <span className="text-slate-500">File PDF già caricato</span>
                                            ) : (
                                                <span className="text-slate-400">Nessun file selezionato</span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-slate-50 flex justify-between items-center border-t border-slate-200 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="text-sm text-slate-600 font-medium">Totale Spesa:</div>
                            <div className="text-2xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                                {formatCurrency(expenseTotal)}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 rounded-xl bg-white text-slate-800 font-semibold border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all hover:scale-105"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                className="px-7 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold hover:shadow-lg transition-all hover:scale-105 flex items-center gap-2"
                            >
                                {formData.id ? 'Salva Modifiche' : 'Crea Spesa'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
