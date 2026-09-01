const { app, BrowserWindow, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

nativeTheme.themeSource = 'dark';

// Pin userData to a fixed path so data is always in the same place
// regardless of where the .app bundle is located
const FIXED_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'ticker');
app.setPath('userData', FIXED_USER_DATA);

const DATA_FILE = path.join(FIXED_USER_DATA, 'app-data-v1.json');

// Register ALL IPC handlers BEFORE the window is created
// so they are ready when the renderer loads script.js

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
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
