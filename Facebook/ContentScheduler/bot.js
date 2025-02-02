const { chromium } = require('playwright');
const schedule = require('node-schedule');

// Facebook login credentials (Replace with your details)
const EMAIL = "alirizwan921111@gmail.com";
const PASSWORD = "haroon@8523";

// Post details
const POST_CONTENT = "Hey my name is ali rizwan and i want to be a software engineer";
const POST_TIME = "2025-02-02 21:00"; // Format: YYYY-MM-DD HH:mm

// Function to add random delays to make actions more human-like
const humanDelay = async () => {
    const delay = Math.floor(Math.random() * (8000 - 3000) + 3000); // Random delay between 3-8 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
};

// Function to login to Facebook
async function loginToFacebook(page) {
    console.log("Attempting to login...");
    
    // Wait for email input and type with human-like delays
    await page.waitForSelector('input[data-testid="royal-email"]');
    await humanDelay();
    for (const char of EMAIL.split('')) {
        await page.type('input[data-testid="royal-email"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
    }

    await humanDelay();

    // Wait for password input and type with human-like delays
    await page.waitForSelector('input[data-testid="royal-pass"]');
    await humanDelay();
    for (const char of PASSWORD.split('')) {
        await page.type('input[data-testid="royal-pass"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
    }

    await humanDelay();

    // Click login button
    await page.click('button[data-testid="royal-login-button"]');
    
    // Wait for navigation with increased timeout
    try {
        await page.waitForLoadState('networkidle', { timeout: 60000 }); // Increased to 60 seconds
        await humanDelay();
        
        // Navigate to homepage if we're on the welcome page
        const currentUrl = page.url();
        if (currentUrl.includes('sk=welcome')) {
            console.log("Redirecting to homepage...");
            await page.goto('https://www.facebook.com', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Wait for feed to be visible
            await page.waitForSelector('div[role="main"]', { timeout: 60000 });
            await humanDelay();
        }
        
        console.log("Login successful!");
    } catch (error) {
        console.log("Navigation timeout occurred, but continuing anyway...");
        // Even if timeout occurs, we can continue as the page might still be usable
    }
}

// Function to automate Facebook post scheduling
async function postToFacebook(browser, page) {
    console.log("Creating scheduled post...");

    // Click on "What's on your mind" to open post modal
    await page.waitForSelector('div[role="button"] span:has-text("What\'s on your mind")', { timeout: 60000 });
    await humanDelay();
    await page.click('div[role="button"] span:has-text("What\'s on your mind")');
    
    // Wait longer for the modal to fully appear (1 minute as requested)
    console.log("Waiting for post modal to fully load...");
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Wait for post textbox and type content
    await page.waitForSelector('[contenteditable="true"][role="textbox"]', { timeout: 60000 });
    await humanDelay();
    
    // Type content with human-like delays between characters
    const chars = POST_CONTENT.split('');
    for (const char of chars) {
        await page.type('[contenteditable="true"][role="textbox"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500)); // Increased typing delay
    }
    
    await humanDelay();

    // Click Post button
    await page.click('div[aria-label="Post"][role="button"]');
    
    console.log("Post created successfully!");
    await humanDelay();

    // Wait for 3 minutes before closing
    console.log("Waiting 3 minutes before closing...");
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes
    
    await browser.close();
    process.exit(0);
}

// Main execution
(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log("Starting Facebook Bot...");
    await page.goto('https://www.facebook.com');
    await loginToFacebook(page);
    
    console.log(`Logged in successfully. Waiting for scheduled post time: ${POST_TIME}`);
    
    // Schedule the post
    schedule.scheduleJob(POST_TIME, async function () {
        console.log(`It's time! Creating scheduled post...`);
        await postToFacebook(browser, page);
    });
})();
