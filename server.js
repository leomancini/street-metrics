import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveImage } from './saveImage.js';
import { SECRETS, PATHS } from './config.js';
import { analyzeImage } from './analyzeImage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3120;

// Serve static images
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/', (req, res) => {
    const deviceNames = SECRETS.DEVICES.map(d => d.NAME);
    res.json({
        status: 'ok',
        service: 'street-metrics',
        devices: deviceNames,
        endpoints: {
            capture: '/capture/:deviceName',
            images: '/images/:deviceName/',
            analyze_list: 'GET /analyze/:deviceName',
            analyze: 'POST /analyze/:deviceName { "image": "filename.jpg" }'
        }
    });
});

// Capture a snapshot from a device
app.get('/capture/:deviceName', async (req, res) => {
    const { deviceName } = req.params;

    try {
        console.log(`Capturing snapshot for device: ${deviceName}`);
        const imagePath = await saveImage(deviceName);

        if (imagePath) {
            const relativePath = path.relative(path.join(__dirname, 'images'), imagePath);
            res.json({
                success: true,
                device: deviceName,
                imagePath: `/images/${relativePath}`
            });
        } else {
            res.status(500).json({
                success: false,
                device: deviceName,
                error: 'Failed to capture snapshot'
            });
        }
    } catch (error) {
        console.error('Capture error:', error);
        res.status(500).json({
            success: false,
            device: deviceName,
            error: error.message
        });
    }
});

// Capture from default device
app.get('/capture', async (req, res) => {
    const defaultDevice = SECRETS.DEVICES[0]?.NAME || 'TATAMI';
    res.redirect(`/capture/${defaultDevice}`);
});

// List available images for a device
app.get('/analyze/:deviceName', (req, res) => {
    const { deviceName } = req.params;
    const deviceDir = path.join(PATHS.IMAGES, deviceName);

    if (!fs.existsSync(deviceDir)) {
        return res.status(404).json({ error: `No images found for device: ${deviceName}` });
    }

    const images = fs.readdirSync(deviceDir)
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .reverse();

    res.json({
        device: deviceName,
        count: images.length,
        images,
        usage: `POST /analyze/${deviceName} with body { "image": "filename.jpg" }`
    });
});

// Analyze a specific image with Claude
app.post('/analyze/:deviceName', express.json(), async (req, res) => {
    const { deviceName } = req.params;
    const { image } = req.body;

    if (!image) {
        return res.status(400).json({ error: 'Missing "image" in request body. Example: { "image": "2026-01-29-22-15.jpg" }' });
    }

    const imagePath = path.join(PATHS.IMAGES, deviceName, image);

    if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ error: `Image not found: ${image}` });
    }

    try {
        console.log(`Analyzing image: ${imagePath}`);
        const analysis = await analyzeImage(imagePath);

        // Save analysis as JSON with matching filename
        const jsonFilename = image.replace('.jpg', '.json');
        const analysisDir = path.join(__dirname, 'analysis', deviceName);
        fs.mkdirSync(analysisDir, { recursive: true });
        const jsonPath = path.join(analysisDir, jsonFilename);
        fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
        console.log(`Saved analysis: ${jsonPath}`);

        res.json({
            success: true,
            device: deviceName,
            image,
            analysisFile: jsonFilename,
            analysis
        });
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            success: false,
            device: deviceName,
            image,
            error: error.message
        });
    }
});

// Serve analysis dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API: Get all analysis data for a device
app.get('/api/analysis/:deviceName', (req, res) => {
    const { deviceName } = req.params;
    const analysisDir = path.join(__dirname, 'analysis', deviceName);

    if (!fs.existsSync(analysisDir)) {
        return res.status(404).json({ error: `No analysis found for device: ${deviceName}` });
    }

    const files = fs.readdirSync(analysisDir)
        .filter(f => f.endsWith('.json'))
        .sort();

    const analyses = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(analysisDir, f), 'utf-8'));
        data._filename = f;
        data._image = f.replace('.json', '.jpg');
        return data;
    });

    res.json({ device: deviceName, count: analyses.length, analyses });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
