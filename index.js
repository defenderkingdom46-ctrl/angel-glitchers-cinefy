const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { runProMaxForensic } = require('./engine');

const app = express();
const PORT = 3000;

// 1. Essential Middleware
app.use(express.json());
app.use(express.static('public')); // Serves your index.html, style.css, app.js

// Ensure temp directory exists for the ZIP files
const tempDir = path.join(__dirname, 'temp');
fs.ensureDirSync(tempDir);

/**
 * Main Scan Route
 * This uses Chunked Transfer Encoding to stream logs back to the UI
 */
app.post('/scan', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Set headers for Streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // Run the engine and pass a callback to stream logs to the client
        const result = await runProMaxForensic(url, tempDir, (logData) => {
            // We stringify the log and add a newline so the frontend can split it
            res.write(JSON.stringify(logData) + '\n');
        });

        // Send the final completion signal with the requestId
        res.write(JSON.stringify({ 
            type: 'done', 
            requestId: result.requestId 
        }) + '\n');
        
        res.end();
    } catch (err) {
        console.error("Scan Error:", err);
        // Send the error as a JSON chunk so the UI doesn't crash
        res.write(JSON.stringify({ 
            type: 'error', 
            msg: err.message 
        }) + '\n');
        res.end();
    }
});

/**
 * Download Route
 * Allows the user to grab the ZIP file after the scan
 */
app.get('/download/:id', (req, res) => {
    const file = path.join(tempDir, `${req.params.id}.zip`);
    
    if (fs.existsSync(file)) {
        res.download(file, (err) => {
            if (err) console.error("Download Error:", err);
            // Optional: Delete file after download to save space
            // fs.removeSync(file);
        });
    } else {
        res.status(404).send('File not found');
    }
});

app.listen(PORT, () => {
    console.log(`
🚀 CINEFy Forensic Engine Active
🌍 Dashboard: http://localhost:${PORT}
📂 Temp Directory: ${tempDir}
    `);
});