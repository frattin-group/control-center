const express = require('express');
const router = express.Router();
const multer = require('multer');
const { put } = require('@vercel/blob');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload endpoint
router.post('/', ClerkExpressRequireAuth(), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Upload to Vercel Blob
        const blob = await put(req.file.originalname, req.file.buffer, {
            access: 'public',
        });

        res.json({
            url: blob.url,
            pathname: blob.pathname,
            contentType: blob.contentType
        });
    } catch (error) {
        console.error("Error uploading to Vercel Blob:", error);
        res.status(500).json({ error: 'Error uploading file' });
    }
});

module.exports = router;
