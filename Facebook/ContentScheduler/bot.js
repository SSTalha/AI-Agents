const { chromium } = require('playwright');
const schedule = require('node-schedule');
const fs = require('fs').promises;
const path = require('path');

const EMAIL = "alirizwan921111@gmail.com";
const PASSWORD = "haroon@8523";

const POST_CONTENT = "Hey my name is ali rizwan and i want to be a software engineer";
const POST_TIME = "2025-02-02 20:33";

const humanDelay = async () => {
    const delay = Math.floor(Math.random() * (8000 - 3000) + 3000);
    await new Promise(resolve => setTimeout(resolve, delay));
};

async function loginToFacebook(page) {
    console.log("Attempting to login...");
    
    await page.waitForSelector('input[data-testid="royal-email"]');
    await humanDelay();
    for (const char of EMAIL.split('')) {
        await page.type('input[data-testid="royal-email"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
    }

    await humanDelay();

    await page.waitForSelector('input[data-testid="royal-pass"]');
    await humanDelay();
    for (const char of PASSWORD.split('')) {
        await page.type('input[data-testid="royal-pass"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
    }

    await humanDelay();

    await page.click('button[data-testid="royal-login-button"]');
    
    try {
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        await humanDelay();
        
        const currentUrl = page.url();
        if (currentUrl.includes('sk=welcome')) {
            console.log("Redirecting to homepage...");
            await page.goto('https://www.facebook.com', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            await page.waitForSelector('div[role="main"]', { timeout: 60000 });
            await humanDelay();
        }
        
        console.log("Login successful!");
    } catch (error) {
        console.log("Navigation timeout occurred, but continuing anyway...");
    }
}

async function checkStorageState() {
    try {
        await fs.access('facebook.json');
        return true;
    } catch {
        return false;
    }
}

async function postToFacebook(browser, page) {
    console.log("Creating scheduled post...");

    await page.waitForSelector('div[role="button"] span:has-text("What\'s on your mind")', { timeout: 60000 });
    await humanDelay();
    await page.click('div[role="button"] span:has-text("What\'s on your mind")');
    
    console.log("Waiting for post modal to fully load...");
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    await page.waitForSelector('[contenteditable="true"][role="textbox"]', { timeout: 60000 });
    await humanDelay();
    
    const chars = POST_CONTENT.split('');
    for (const char of chars) {
        await page.type('[contenteditable="true"][role="textbox"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
    }
    
    await humanDelay();

    await page.click('div[aria-label="Post"][role="button"]');
    
    console.log("Post created successfully!");
    await humanDelay();

    console.log("Waiting 3 minutes before closing...");
    await new Promise(resolve => setTimeout(resolve, 180000));
    
    await browser.close();
    process.exit(0);
}

(async () => {
    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
    });

    let context;
    const hasStorageState = await checkStorageState();

    if (hasStorageState) {
        console.log("Found existing session, trying to restore...");
        context = await browser.newContext({
            storageState: 'facebook.json'
        });
    } else {
        console.log("No existing session found, creating new context...");
        context = await browser.newContext();
    }

    const page = await context.newPage();
    
    console.log("Starting Facebook Bot...");
    await page.goto('https://www.facebook.com');
    
    try {
        // Check login status
        const isLoggedIn = await page.waitForSelector('input[data-testid="royal-email"]', { timeout: 5000 })
            .then(() => false)
            .catch(() => true);

        if (!isLoggedIn) {
            console.log("Not logged in, attempting login...");
            await loginToFacebook(page);
            
            // Save the storage state after successful login
            console.log("Saving session state...");
            await context.storageState({ path: 'facebook.json' });
        } else {
            console.log("Already logged in!");
        }
        
        console.log(`Waiting for scheduled post time: ${POST_TIME}`);
        
        schedule.scheduleJob(POST_TIME, async function () {
            console.log(`It's time! Creating scheduled post...`);
            await postToFacebook(browser, page);
        });
    } catch (error) {
        console.error("Error:", error);
        await browser.close();
        process.exit(1);
    }
})();
