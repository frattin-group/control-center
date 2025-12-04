const OpenAI = require("openai");
const pdfParse = require("pdf-parse");

const analyzeInvoice = async (req, res) => {
    try {
        const { fileBase64, fileUrl, context } = req.body;

        if (!fileBase64 && !fileUrl) {
            return res.status(400).json({ error: "File mancante (base64 o URL richiesto)." });
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Costruisci il contesto per il prompt
        let contextPrompt = "";
        if (context) {
            contextPrompt = `
            CONTEXT DATA (Use these IDs for mapping):
            - Suppliers: ${JSON.stringify(context.suppliers || [])}
            - Sectors: ${JSON.stringify(context.sectors || [])}
            - Marketing Channels: ${JSON.stringify(context.marketingChannels || [])}
            - Contracts: ${JSON.stringify(context.contracts || [])}
            `;
        }

        let messages = [];
        const systemPrompt = `Sei un assistente amministrativo esperto. Analizza il documento fornito (fattura) ed estrai i dati in formato JSON.
                        
                        ${contextPrompt}

                        ISTRUZIONI DI MAPPATURA:
                        1. **Fornitore**: Cerca di abbinare il nome del fornitore estratto con uno della lista "Suppliers". Se trovi un match, usa il suo "id" nel campo "supplierId". Se è nuovo, lascia "supplierId" null ma compila "supplierName".
                        2. **Area di Costo (costDomain)**: Analizza la fattura. Se è relativa a utenze, affitto, manutenzione sedi, imposta "costDomain" = "sedi". Se è relativa a pubblicità, software marketing, consulenza marketing, imposta "costDomain" = "marketing". Default: "marketing".
                        3. **Settore (sectorId)**: Se riesci a dedurre il settore (es. "Ristorazione", "Automotive") e trovi un match nella lista "Sectors", usa il suo "id".
                        4. **Canale Marketing (marketingChannelId)**: Se è una spesa di marketing, cerca di abbinarla a un canale (es. "Meta Ads", "Google Ads") dalla lista "Marketing Channels".
                        5. **Contratto (contractId)**: Se la fattura sembra riferirsi a un contratto specifico (es. canone mensile, riferimento numero contratto) presente nella lista "Contracts" (filtrata per quel fornitore), usa il suo "id".

                        Struttura JSON richiesta:
                        {
                            "supplierName": "Nome Fornitore Estratto",
                            "supplierId": "ID_FORNITORE_O_NULL",
                            "date": "YYYY-MM-DD",
                            "totalAmount": 123.45,
                            "description": "Descrizione sintetica",
                            "costDomain": "marketing" | "sedi",
                            "lineItems": [
                                { 
                                    "description": "Voce 1", 
                                    "amount": 100.00,
                                    "sectorId": "ID_SETTORE_O_NULL",
                                    "marketingChannelId": "ID_CANALE_O_NULL",
                                    "contractId": "ID_CONTRATTO_O_NULL"
                                }
                            ]
                        }
                        Restituisci SOLO il JSON.`;

        // Rileva se è un PDF o un'immagine
        const isPdf = fileBase64 && fileBase64.startsWith("data:application/pdf");

        if (isPdf) {
            // --- GESTIONE PDF (Estrazione Testo) ---
            const base64Data = fileBase64.replace(/^data:application\/pdf;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');

            try {
                const pdfData = await pdfParse(buffer);
                const textContent = pdfData.text;

                if (!textContent || textContent.trim().length === 0) {
                    return res.status(400).json({ error: "Il PDF sembra vuoto o è una scansione (immagine). Per favore carica un'immagine (JPG/PNG) o un PDF testuale." });
                }

                messages = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analizza il seguente testo estratto da una fattura PDF:\n\n${textContent}` }
                ];

            } catch (pdfError) {
                console.error("Errore parsing PDF:", pdfError);
                return res.status(400).json({ error: "Impossibile leggere il PDF. Assicurati che non sia corrotto o protetto." });
            }

        } else {
            // --- GESTIONE IMMAGINE (GPT-4o Vision) ---
            let imageUrl = fileUrl || fileBase64;

            messages = [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analizza questa fattura." },
                        { type: "image_url", image_url: { "url": imageUrl } },
                    ],
                },
            ];
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        const jsonStr = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(jsonStr);

        res.json({ status: "success", data });

    } catch (error) {
        console.error("Errore analisi fattura:", error);
        res.status(500).json({ error: "Errore durante l'analisi della fattura: " + error.message });
    }
};

module.exports = {
    analyzeInvoice
};
