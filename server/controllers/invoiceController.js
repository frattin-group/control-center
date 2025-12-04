const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const fs = require('fs');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

exports.analyzeInvoice = async (req, res) => {
    try {
        const { context } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "File mancante." });
        }

        let contextPrompt = "";
        if (context) {
            try {
                const parsedContext = typeof context === 'string' ? JSON.parse(context) : context;
                contextPrompt = `
            CONTEXT DATA (Use these IDs for mapping):
            - Suppliers: ${JSON.stringify(parsedContext.suppliers || [])}
            - Sectors: ${JSON.stringify(parsedContext.sectors || [])}
            - Marketing Channels: ${JSON.stringify(parsedContext.marketingChannels || [])}
            - Contracts: ${JSON.stringify(parsedContext.contracts || [])}
            `;
            } catch (e) {
                console.warn("Error parsing context:", e);
            }
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

        if (file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(file.path);
            try {
                const pdfData = await pdfParse(dataBuffer);
                const textContent = pdfData.text;

                if (!textContent || textContent.trim().length === 0) {
                    // Fallback to vision if PDF is image-based (not implemented here without converting PDF to image)
                    // For now, throw error or suggest image upload
                    throw new Error("Il PDF sembra vuoto o è una scansione (immagine).");
                }

                messages = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analizza il seguente testo estratto da una fattura PDF:\n\n${textContent}` }
                ];
            } catch (error) {
                console.error("PDF Parse error:", error);
                return res.status(400).json({ error: "Impossibile leggere il PDF. Assicurati che sia testuale." });
            }
        } else if (file.mimetype.startsWith('image/')) {
            const imageBuffer = fs.readFileSync(file.path);
            const base64Image = imageBuffer.toString('base64');
            const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

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
        } else {
            return res.status(400).json({ error: "Formato file non supportato." });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        const jsonStr = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(jsonStr);

        // Cleanup uploaded file
        fs.unlinkSync(file.path);

        res.json({ status: "success", data });

    } catch (error) {
        console.error("Errore analisi fattura:", error);
        res.status(500).json({ error: "Errore durante l'analisi della fattura: " + error.message });
    }
};
