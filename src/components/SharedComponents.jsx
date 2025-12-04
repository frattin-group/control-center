import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, HelpCircle } from 'lucide-react';

//MultiSelect
export const MultiSelect = ({
    options,
    selected,
    onChange,
    placeholder = 'Seleziona...',
    selectedText,
    searchPlaceholder = 'Cerca...'
}) => {
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
                className="w-full h-12 rounded-2xl border border-slate-200 bg-white pl-4 pr-3 text-sm font-medium text-slate-700 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all flex items-center justify-between"
            >
                <span className="block truncate">
                    {selectedCount > 0 ? (
                        <span className="font-semibold text-slate-800">
                            {selectedText ?? `${selectedCount} elementi selezionati`}
                        </span>
                    ) : (
                        <span className="text-slate-400">{placeholder}</span>
                    )}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl border border-white/40 max-h-60 overflow-hidden">
                    <div className="p-2 sticky top-0 bg-white/95 backdrop-blur-xl border-b border-slate-200/60">
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                    </div>
                    <ul className="overflow-y-auto max-h-48">
                        {filteredOptions.map(option => {
                            const isChecked = (selected || []).includes(option.id);
                            return (
                                <li
                                    key={option.id}
                                    onClick={() => onChange(option.id)}
                                    className="px-3 py-2.5 hover:bg-indigo-50/60 cursor-pointer flex items-center justify-between transition-colors"
                                >
                                    <span className="text-sm font-medium text-slate-800">{option.name}</span>
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                        {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            {isOpen && <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>}
        </div>
    );
};

// InfoTooltip Component
export const InfoTooltip = ({ message }) => {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const buttonRef = React.useRef(null);

    const handleMouseEnter = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top - 10, // 10px gap above button
                left: rect.left + rect.width / 2
            });
        }
        setOpen(true);
    };

    const handleMouseLeave = () => {
        setOpen(false);
    };

    // Update position on scroll/resize if open (optional but good for UX)
    React.useEffect(() => {
        if (!open) return;
        const updatePosition = () => {
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.top - 10,
                    left: rect.left + rect.width / 2
                });
            }
        };
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open]);

    return (
        <span className="relative inline-flex">
            <button
                ref={buttonRef}
                type="button"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="inline-flex items-center justify-center text-slate-400 transition-colors hover:text-indigo-500 focus:outline-none ml-1.5 cursor-help"
            >
                <HelpCircle className="w-4 h-4" />
            </button>
            {open && createPortal(
                <div
                    className="fixed z-[9999] w-56 -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900/95 p-3 text-xs font-medium text-slate-100 shadow-xl backdrop-blur-sm border border-white/10 pointer-events-none transition-opacity duration-200"
                    style={{ top: coords.top, left: coords.left }}
                >
                    {message}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
                </div>,
                document.body
            )}
        </span>
    );
};

//KPI Card
export const KpiCard = React.memo(({ title, value, icon, gradient, subtitle, onClick, tooltip }) => (
    <div
        onClick={onClick}
        className={`group relative bg-white/90 backdrop-blur-2xl rounded-2xl lg:rounded-3xl shadow-xl shadow-slate-200/60 border border-white/40 ring-1 ring-slate-900/5 p-5 lg:p-6 hover:shadow-2xl hover:shadow-slate-300/80 hover:-translate-y-1.5 hover:ring-slate-900/10 transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
    >
        {/* Background Decoration Layer - Clipped */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl lg:rounded-3xl pointer-events-none">
            <div className="absolute -right-8 -top-8 text-gray-100/60 opacity-50 group-hover:opacity-100 group-hover:scale-110 group-hover:rotate-[-10deg] transition-all duration-700 ease-out">
                {React.cloneElement(icon, { className: "w-40 h-40 lg:w-48 lg:h-48" })}
            </div>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-500`} />
        </div>

        {/* Content Layer - Overflow Visible for Tooltips */}
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
                <p className="text-sm font-bold text-slate-500 tracking-widest uppercase">{title}</p>
                {tooltip && (
                    <div className="ml-auto">
                        <InfoTooltip message={tooltip} />
                    </div>
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <p className="text-2xl lg:text-4xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
            </div>

            {subtitle && (
                <div className="mt-2 flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-500">{subtitle}</p>
                </div>
            )}
        </div>
    </div>
));
