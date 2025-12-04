import React from 'react';
import { SignIn } from '@clerk/clerk-react';
import { BarChart3, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 z-0" />
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-200/20 blur-3xl" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-purple-200/20 blur-3xl" />
      </div>

      <div className="w-full max-w-md flex flex-col items-center relative z-10 px-4">
        {/* Logo & Branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 shadow-lg shadow-indigo-200 mb-4">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">The Flux Data</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">Marketing Intelligence Platform</p>
        </div>

        {/* Login Card */}
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 shadow-indigo-100/50",
              headerTitle: "text-xl font-bold text-slate-800",
              headerSubtitle: "text-slate-500 text-sm",
              formButtonPrimary: "bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3.5 text-sm font-semibold shadow-lg shadow-slate-200 transition-all transform hover:-translate-y-0.5 normal-case",
              formFieldInput: "rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 transition-all py-3.5",
              footerActionLink: "text-indigo-600 hover:text-indigo-700 font-semibold",
              identityPreviewEditButton: "text-indigo-600 hover:text-indigo-700",
              formFieldLabel: "text-slate-700 font-semibold text-xs uppercase tracking-wider mb-1.5",
              dividerLine: "bg-slate-100",
              dividerText: "text-slate-400 text-xs font-medium uppercase tracking-widest",
              formFieldAction: "text-indigo-600 hover:text-indigo-700 font-medium text-sm",
              socialButtonsBlockButton: "rounded-xl border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all py-2.5",
              socialButtonsBlockButtonText: "font-medium text-slate-600",
              alertText: "text-rose-600",
              alert: "bg-rose-50 border border-rose-100 rounded-xl",
            },
            layout: {
              socialButtonsPlacement: "bottom",
              showOptionalFields: false,
            }
          }}
        />

        {/* Footer */}
        <div className="mt-8 flex items-center gap-2 text-slate-400 text-xs font-medium">
          <ShieldCheck className="w-3 h-3" />
          <span>Secured by Clerk</span>
        </div>
      </div>
    </div>
  );
}