const { app, BrowserWindow, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { exec } = require('child_process');

nativeTheme.themeSource = 'dark';

// Pin userData to a fixed path so data is always in the same place
// regardless of where the .app bundle is located
const FIXED_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'ticker');
app.setPath('userData', FIXED_USER_DATA);

const DATA_FILE = path.join(FIXED_USER_DATA, 'app-data-v1.json');
const GDRIVE_CONFIG_FILE = path.join(FIXED_USER_DATA, 'gdrive-sync.json');

function getGDriveSyncUrl() {
    try {
        if (fs.existsSync(GDRIVE_CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(GDRIVE_CONFIG_FILE, 'utf8'));
            return (parsed && parsed.url) ? parsed.url.trim() : null;
        }
    } catch(e) {}
    return null;
}

async function syncToGDrive(dataStr) {
    const url = getGDriveSyncUrl();
    if (!url) return;
    try {
        console.log('[GDrive] Syncing data to Google Drive Web App...');
        const res = await fetch(url, {
            method: 'POST',
            body: dataStr,
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow'
        });
        if (res.ok) {
            console.log('[GDrive] Sync to Google Drive successful!');
        } else {
            console.warn('[GDrive] Sync responded with status:', res.status);
        }
    } catch (e) {
        console.error('[GDrive] Sync error:', e.message);
    }
}

// --- Real-time Sync Server for iPhone (PWA) ---
const SYNC_PORT = 7321;
let sseClients = [];
let currentHttpsUrl = null;
let tunnelProcess = null;

function getLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.startsWith('utun') || name.startsWith('lo') || name.startsWith('awdl') || name.startsWith('llw')) continue;
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('28.0.')) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function startCloudflareTunnel() {
    const cloudflaredBin = '/opt/homebrew/bin/cloudflared';
    if (!fs.existsSync(cloudflaredBin)) {
        console.log('[Tunnel] cloudflared not found at', cloudflaredBin);
        return;
    }

    try {
        console.log('[Tunnel] Starting cloudflared tunnel for port', SYNC_PORT);
        const proc = exec(`${cloudflaredBin} tunnel --protocol http2 --url http://localhost:${SYNC_PORT}`);
        tunnelProcess = proc;

        const checkOutput = (data) => {
            const str = data.toString();
            const match = str.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
            if (match && match[0]) {
                currentHttpsUrl = match[0];
                console.log('[Tunnel] Active HTTPS URL:', currentHttpsUrl);
            }
        };

        proc.stderr.on('data', checkOutput);
        proc.stdout.on('data', checkOutput);

        proc.on('close', () => {
            console.log('[Tunnel] Tunnel process closed');
            currentHttpsUrl = null;
            tunnelProcess = null;
        });
    } catch (e) {
        console.error('[Tunnel] Failed to start tunnel:', e);
    }
}

function broadcastSyncData(dataObj) {
    if (sseClients.length === 0) return;
    const payload = `data: ${JSON.stringify({ type: 'sync', data: dataObj })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(payload);
        } catch (e) {}
    });
}

function startSyncServer() {
    try {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = parsedUrl.pathname;

            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // SSE Real-time Events
            if (pathname === '/api/events') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                res.write('\n');
                
                // Send initial state immediately
                try {
                    if (fs.existsSync(DATA_FILE)) {
                        const content = fs.readFileSync(DATA_FILE, 'utf8');
                        const parsed = JSON.parse(content);
                        res.write(`data: ${JSON.stringify({ type: 'sync', data: parsed })}\n\n`);
                    }
                } catch(e) {}

                sseClients.push(res);
                console.log(`[SyncServer] Client connected. Total clients: ${sseClients.length}`);

                req.on('close', () => {
                    sseClients = sseClients.filter(c => c !== res);
                    console.log(`[SyncServer] Client disconnected. Total clients: ${sseClients.length}`);
                });
                return;
            }

            // REST Data Endpoint (GET / POST)
            if (pathname === '/api/data' || pathname === '/api/save') {
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => { body += chunk.toString(); });
                    req.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('sync-data-updated', parsed);
                            }
                            syncToGDrive(body);
                            broadcastSyncData(parsed);
                            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ success: true }));
                        } catch(err) {
                            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ success: false, error: err.message }));
                        }
                    });
                    return;
                }

                try {
                    if (fs.existsSync(DATA_FILE)) {
                        const content = fs.readFileSync(DATA_FILE, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(content);
                        return;
                    }
                } catch(e) {}
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ historyRecords: [], customLabels: [] }));
                return;
            }

            if (pathname === '/api/server-info') {
                const ip = getLanIp();
                const localUrl = `http://${ip}:${SYNC_PORT}`;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    ip,
                    port: SYNC_PORT,
                    localUrl,
                    httpsUrl: currentHttpsUrl,
                    url: currentHttpsUrl || localUrl,
                    gdriveUrl: getGDriveSyncUrl(),
                    clientsCount: sseClients.length
                }));
                return;
            }

            // Static Files Serving
            let filePath = '';
            let contentType = 'text/plain';

            if (pathname === '/' || pathname === '/index.html' || pathname === '/mobile.html') {
                filePath = path.join(__dirname, 'mobile.html');
                contentType = 'text/html; charset=utf-8';
            } else if (pathname === '/mobile.css') {
                filePath = path.join(__dirname, 'mobile.css');
                contentType = 'text/css; charset=utf-8';
            } else if (pathname === '/mobile.js') {
                filePath = path.join(__dirname, 'mobile.js');
                contentType = 'application/javascript; charset=utf-8';
            } else if (pathname === '/manifest.json') {
                filePath = path.join(__dirname, 'manifest.json');
                contentType = 'application/manifest+json; charset=utf-8';
            } else if (pathname === '/apple-touch-icon.png' || pathname === '/icon.png') {
                const iconPath = path.join(__dirname, 'apple-touch-icon.png');
                filePath = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'build', 'icon.png');
                contentType = 'image/png';
            }

            if (filePath && fs.existsSync(filePath)) {
                res.writeHead(200, { 'Content-Type': contentType });
                fs.createReadStream(filePath).pipe(res);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.listen(SYNC_PORT, '0.0.0.0', () => {
            console.log(`[SyncServer] Ticker Mobile Sync Server running on http://${getLanIp()}:${SYNC_PORT}`);
        });

        server.on('error', (err) => {
            console.error('[SyncServer] Server error:', err);
        });
    } catch(err) {
        console.error('[SyncServer] Failed to start sync server:', err);
    }
}

// Register ALL IPC handlers BEFORE the window is created
// so they are ready when the renderer loads script.js

ipcMain.handle('get-sync-server-info', () => {
    const ip = getLanIp();
    const localUrl = `http://${ip}:${SYNC_PORT}`;
    return {
        ip,
        port: SYNC_PORT,
        localUrl,
        httpsUrl: currentHttpsUrl,
        url: currentHttpsUrl || localUrl,
        gdriveUrl: getGDriveSyncUrl(),
        clientCount: sseClients.length
    };
});

ipcMain.handle('get-gdrive-sync-url', () => {
    return getGDriveSyncUrl();
});

ipcMain.handle('save-gdrive-sync-url', async (event, url) => {
    try {
        fs.mkdirSync(FIXED_USER_DATA, { recursive: true });
        fs.writeFileSync(GDRIVE_CONFIG_FILE, JSON.stringify({ url: (url || '').trim(), updated: Date.now() }));
        if (url && url.trim() && fs.existsSync(DATA_FILE)) {
            const currentData = fs.readFileSync(DATA_FILE, 'utf8');
            await syncToGDrive(currentData);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-data', () => {
    const backupFile = `${DATA_FILE}.bak`;
    try {
        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf8');
            if (content.trim().length > 0 && content.trim().startsWith('{')) {
                JSON.parse(content); // Verify it is valid JSON
                console.log('[main] load-data: returning', content.length, 'chars');
                return content;
            } else {
                throw new Error("File is empty or not valid JSON object");
            }
        }
        console.log('[main] load-data: file not found at', DATA_FILE);
    } catch(e) {
        console.error('[main] load-data error, attempting backup:', e);
        try {
            if (fs.existsSync(backupFile)) {
                const backupContent = fs.readFileSync(backupFile, 'utf8');
                console.log('[main] load-data: returning BACKUP', backupContent.length, 'chars');
                return backupContent;
            }
        } catch(backupErr) {
            console.error('[main] backup also failed:', backupErr);
        }
    }
    return null;
});

ipcMain.on('save-data', (event, dataStr) => {
    try {
        fs.mkdirSync(FIXED_USER_DATA, { recursive: true });
        const tempFile = `${DATA_FILE}.tmp`;
        const backupFile = `${DATA_FILE}.bak`;
        
        // 1. Write to a temporary file (atomic write)
        fs.writeFileSync(tempFile, dataStr, 'utf8');
        
        // 2. Backup the current good file before overwriting
        if (fs.existsSync(DATA_FILE)) {
            fs.copyFileSync(DATA_FILE, backupFile);
        }
        
        // 3. Atomically replace the old file with the new file
        fs.renameSync(tempFile, DATA_FILE);

        // 4. Broadcast live update to mobile clients
        try {
            const parsed = JSON.parse(dataStr);
            broadcastSyncData(parsed);
        } catch(e) {}

        // 5. Asynchronously push to Google Drive
        syncToGDrive(dataStr);
    } catch(e) {
        console.error('[main] save-data error:', e);
    }
});

ipcMain.on('open-pdf-window', (event, pdfPath) => {
    let fullPath = pdfPath;
    if (!path.isAbsolute(pdfPath)) {
        fullPath = path.join(os.homedir(), 'Zotero', 'storage', pdfPath);
    }
    if (fs.existsSync(fullPath)) {
        const pdfWin = new BrowserWindow({
            width: 1000,
            height: 800,
            titleBarStyle: 'hiddenInset',
            backgroundColor: '#030303',
            alwaysOnTop: true,
            webPreferences: { plugins: true }
        });
        pdfWin.loadFile(fullPath);
    } else {
        console.error('[main] PDF not found at:', fullPath);
    }
});

ipcMain.handle('open-pdf-by-key', async (event, key) => {
    return new Promise((resolve) => {
        const pythonScript = app.isPackaged 
        ? path.join(process.resourcesPath, 'get_pdf_path.py')
        : path.join(__dirname, 'get_pdf_path.py');
        const cmd = `python3 "${pythonScript}" "${key}"`;
        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Running: ${cmd}\n`);
        
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Error: ${error.message} - Stderr: ${stderr}\n`);
                console.error('[main] open-pdf-by-key error:', stderr || error.message);
                resolve(null);
                return;
            }
            try {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Stdout: ${stdout}\n`);
                const result = JSON.parse(stdout);
                if (result.success && result.pdfPath) {
                    let fullPath = result.pdfPath;
                    if (!path.isAbsolute(fullPath)) {
                        fullPath = path.join(os.homedir(), 'Zotero', 'storage', fullPath);
                    }
                    if (fs.existsSync(fullPath)) {
                        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Resolving: ${fullPath}\n`);
                        resolve(fullPath);
                    } else {
                        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] File not found: ${fullPath}\n`);
                        resolve(null);
                    }
                } else {
                    fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Failed JSON result\n`);
                    resolve(null);
                }
            } catch (e) {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Catch error: ${e.message}\n`);
                console.error('[main] open-pdf-by-key parse error:', e);
                resolve(null);
            }
        });
    });
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();


ipcMain.handle('translate-text', async (event, text, targetLang) => {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await require("electron").net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
        const data = await res.json();
        if (data && data[0]) {
            return data[0].map(x => x[0]).join('');
        }
        return '';
    } catch (e) {
        console.error('Translation error:', e);
        return '';
    }
});

ipcMain.handle('fetch-yahoo', async (event, symbol) => {
    try {
        const result = await yahooFinance.quoteSummary(symbol, { modules: ['calendarEvents', 'summaryDetail', 'financialData', 'price', 'defaultKeyStatistics'] });
        return { quoteSummary: result };
    } catch (e) {
        console.error('[main] fetch-yahoo error:', e);
        return { error: e.message };
    }
});
ipcMain.handle('fetch-zotero-api', async (event, url) => {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Ticker-App/1.0' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('[main] fetch-zotero-api error:', error);
        return { error: error.message };
    }
});

ipcMain.handle('query-zotero', async (event, args) => {
    return new Promise((resolve) => {
        let dbPath, action, collectionId;
        if (typeof args === 'string' || !args) {
            dbPath = args || 'default';
            action = 'get_items';
            collectionId = '';
        } else {
            dbPath = args.dbPath || 'default';
            action = args.action || 'get_items';
            collectionId = args.collectionId || '';
        }
        
        const pythonScript = app.isPackaged 
            ? path.join(process.resourcesPath, 'zotero_query.py')
            : path.join(__dirname, 'zotero_query.py');
            
        const cmd = `python3 "${pythonScript}" "${dbPath}" "${action}" "${collectionId}"`;
        
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('[main] query-zotero exec error:', stderr || error.message);
                resolve({ error: stderr || error.message });
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                console.error('[main] query-zotero parse error:', e);
                resolve({ error: 'Failed to parse python script output: ' + e.message });
            }
        });
    });
});

ipcMain.handle('fetch-financial-data', async (event, url) => {
    try {
        const headers = url.includes('push2.eastmoney.com') 
            ? {} 
            : { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' };
            
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('[main] fetch error:', error);
        return { error: error.message };
    }
});

function createWindow() {
    const stateFile = path.join(FIXED_USER_DATA, 'window-state-v9.json');
    let state = { width: 600, height: 1180 };
    try {
        if (fs.existsSync(stateFile)) {
            state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        }
    } catch(e) {}

    const mainWindow = new BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        resizable: true,
        titleBarStyle: 'hiddenInset',
        alwaysOnTop: true,
        backgroundColor: '#030303',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            plugins: true,
            webviewTag: true
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
        console.log(`[RENDERER CONSOLE]: ${message}`);
    });
    const saveWindowState = () => {
        try {
            const bounds = mainWindow.getBounds();
            fs.writeFileSync(stateFile, JSON.stringify(bounds));
        } catch(e) {}
    };

    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    let userSizes = { 
        size1: { width: 800, height: 1180 }, 
        size2: { width: 1440, height: 1180 } 
    };
    const sizesFile = path.join(FIXED_USER_DATA, 'custom-sizes.json');
    try {
        if (fs.existsSync(sizesFile)) {
            userSizes = JSON.parse(fs.readFileSync(sizesFile, 'utf8'));
        }
    } catch(e) {}

    let isSize2 = false;

    ipcMain.on('record-size', (event, index) => {
        const bounds = mainWindow.getBounds();
        if (index === 1) userSizes.size1 = { width: bounds.width, height: bounds.height };
        if (index === 2) userSizes.size2 = { width: bounds.width, height: bounds.height };
        try {
            fs.writeFileSync(sizesFile, JSON.stringify(userSizes), 'utf8');
        } catch(e) {}
    });

    ipcMain.on('toggle-window-size', () => {
        if (isSize2) {
            mainWindow.setBounds(userSizes.size1);
            isSize2 = false;
        } else {
            mainWindow.setBounds(userSizes.size2);
            isSize2 = true;
        }
    });
}

app.whenReady().then(() => {
    startSyncServer();
    startCloudflareTunnel();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    if (tunnelProcess) {
        try {
            tunnelProcess.kill('SIGTERM');
        } catch(e) {}
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
