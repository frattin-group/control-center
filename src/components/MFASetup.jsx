import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { QRCodeSVG } from 'qrcode.react';
import { Shield, Smartphone, ArrowRight, CheckCircle, Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MFASetup({ onComplete }) {
    const { user } = useUser();
    const [step, setStep] = useState('intro'); // intro, scan, verify, success
    const [totp, setTotp] = useState(null);
    const [code, setCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const startSetup = async () => {
        setIsLoading(true);
        try {
            const newTotp = await user.createTOTP();
            setTotp(newTotp);
            setStep('scan');
        } catch (error) {
            console.error("Error creating TOTP:", error);
            toast.error("Errore durante l'inizializzazione della 2FA");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!code || code.length !== 6) return;

        setIsVerifying(true);
        try {
            await totp.attemptVerification({ code });
            setStep('success');
            toast.success("Autenticazione a due fattori attivata!");
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error("Verification error:", error);
            toast.error("Codice non valido. Riprova.");
        } finally {
            setIsVerifying(false);
        }
    };

    const copyToClipboard = () => {
        if (totp?.secret) {
            navigator.clipboard.writeText(totp.secret);
            toast.success("Codice segreto copiato!");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-700 p-6 text-white text-center">
                    <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                        <Shield size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold mb-1">Sicurezza Account</h1>
                    <p className="text-indigo-100 text-sm">Configurazione Autenticazione a Due Fattori</p>
                </div>

                {/* Content */}
                <div className="p-8">
                    {step === 'intro' && (
                        <div className="text-center space-y-6">
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <p className="text-slate-700 text-sm leading-relaxed">
                                    Per garantire la massima sicurezza dei dati aziendali, è richiesto l'utilizzo di <strong>Google Authenticator</strong> (o app compatibile) per accedere alla piattaforma.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="font-bold text-slate-600">1</span>
                                    </div>
                                    <p className="text-left text-sm text-slate-600">Scarica Google Authenticator sul tuo smartphone</p>
                                </div>
                                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="font-bold text-slate-600">2</span>
                                    </div>
                                    <p className="text-left text-sm text-slate-600">Scansiona il QR Code che ti mostreremo</p>
                                </div>
                                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="font-bold text-slate-600">3</span>
                                    </div>
                                    <p className="text-left text-sm text-slate-600">Inserisci il codice di verifica</p>
                                </div>
                            </div>

                            <button
                                onClick={startSetup}
                                disabled={isLoading}
                                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : <>Inizia Configurazione <ArrowRight size={18} /></>}
                            </button>
                        </div>
                    )}

                    {step === 'scan' && totp && (
                        <div className="text-center space-y-6">
                            <p className="text-sm text-slate-600">
                                Apri l'app Authenticator e scansiona questo codice:
                            </p>

                            <div className="flex justify-center">
                                <div className="p-4 bg-white border-2 border-slate-100 rounded-xl shadow-sm">
                                    <QRCodeSVG value={totp.uri} size={180} />
                                </div>
                            </div>

                            <div className="text-xs text-slate-400">
                                <p className="mb-2">Non riesci a scansionare?</p>
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center justify-center gap-2 mx-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                                >
                                    <Copy size={12} />
                                    Copia codice segreto
                                </button>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <button
                                    onClick={() => setStep('verify')}
                                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all"
                                >
                                    Ho scansionato il codice
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'verify' && (
                        <form onSubmit={handleVerify} className="text-center space-y-6">
                            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-600 mb-4">
                                <Smartphone size={32} />
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-slate-800 mb-2">Inserisci il codice</h3>
                                <p className="text-sm text-slate-500 mb-6">
                                    Inserisci il codice a 6 cifre generato dalla tua app Authenticator
                                </p>

                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setStep('scan')}
                                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                                >
                                    Indietro
                                </button>
                                <button
                                    type="submit"
                                    disabled={code.length !== 6 || isVerifying}
                                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isVerifying ? <Loader2 className="animate-spin" /> : 'Verifica'}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-6 py-8">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-4 animate-bounce">
                                <CheckCircle size={40} />
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Tutto pronto!</h3>
                                <p className="text-slate-600">
                                    L'autenticazione a due fattori è stata attivata con successo.
                                </p>
                            </div>

                            <p className="text-sm text-slate-400">
                                Verrai reindirizzato alla dashboard tra un istante...
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
