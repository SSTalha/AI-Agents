const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

// Store scheduled tasks
let scheduledTasks = [];

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle image file selection
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }]
    });
    return result.filePaths[0];
});

// Handle form submission
ipcMain.on('start-post', async (event, data) => {
    const { imagePath, scheduledTime, platform } = data;
    
    try {
        const scheduledDateTime = new Date(scheduledTime);
        const now = new Date();
        
        if (scheduledDateTime <= now) {
            // If scheduled time is now or in the past, post immediately
            await executePost(imagePath, platform, event);
        } else {
            // Schedule the post
            const timeoutId = setTimeout(async () => {
                await executePost(imagePath, platform, event);
            }, scheduledDateTime.getTime() - now.getTime());

            // Store the scheduled task
            scheduledTasks.push({
                id: timeoutId,
                platform,
                scheduledTime: scheduledDateTime,
                imagePath
            });

            event.reply('post-status', { 
                success: true, 
                message: `Post scheduled for ${scheduledDateTime.toLocaleString()}` 
            });
        }
    } catch (error) {
        console.error('Error handling post:', error);
        event.reply('post-status', { 
            success: false, 
            message: `Error: ${error.message}` 
        });
    }
});

async function executePost(imagePath, platform, event) {
    try {
        if (platform === 'instagram') {
            const { postImageToInstagram } = require('../Instagram/ContentScheduler/bot');
            await postImageToInstagram(imagePath);
            event.reply('post-status', { 
                success: true, 
                message: 'Post uploaded to Instagram successfully!' 
            });
        }
    } catch (error) {
        event.reply('post-status', { 
            success: false, 
            message: `Error during posting: ${error.message}` 
        });
    }
}