import React from 'react';
import { SignIn } from '@clerk/clerk-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md flex justify-center">
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white rounded-2xl shadow-xl border border-slate-200 p-2 shadow-indigo-100",
              headerTitle: "text-2xl font-bold text-slate-800",
              headerSubtitle: "text-slate-600",
              formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold shadow-lg shadow-indigo-200 transition-all normal-case",
              formFieldInput: "rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all py-3",
              footerActionLink: "text-indigo-600 hover:text-indigo-700 font-medium",
              identityPreviewEditButton: "text-indigo-600 hover:text-indigo-700",
              formFieldLabel: "text-slate-700 font-medium",
              dividerLine: "bg-slate-200",
              dividerText: "text-slate-400",
              formFieldAction: "text-indigo-600 hover:text-indigo-700",
            },
            layout: {
              socialButtonsPlacement: "bottom",
              showOptionalFields: false,
            }
          }}
        />
      </div>
    </div>
  );
}