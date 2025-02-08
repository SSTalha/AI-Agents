const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Returns a promise that resolves after a random delay.
 * Mimics human-like delays between actions.
 */
function randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}


async function postImageToInstagram(imagePath) {

    const userDataDir = 'C:\\Users\\Talha\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 17';

    const context = await chromium.launchPersistentContext(
        userDataDir,
        { headless: false }
    );
    const page = await context.newPage();

    console.log("Navigating to Instagram login page...");
    await page.goto('https://www.instagram.com/accounts/login/');
    await page.waitForTimeout(3000 + await randomDelay());

    // --- LOGIN PROCESS ---
    // If the profile already has a stored session, Instagram may not require login
    // Using the provided selectors for username and password fields.
    const usernameSelector = "input[name='username']";
    const passwordSelector = "input[name='password']";
    const loginButtonSelector = 'button[type="submit"]';

    // Check if login is required by determining if the username field is visible.
    const needLogin = await page.$(usernameSelector);
    if (needLogin) {
        console.log("No session detected, performing login...");
        
        // Human-like typing for username
        const username = process.env.INSTAGRAM_USERNAME || 'J__Paul_Brandout';
        for (const char of username) {
            await page.type(usernameSelector, char, { delay: Math.random() * 100 + 150 }); // 150-250ms per keystroke
            await randomDelay(100, 200); // Additional micro pause between characters
        }
        await randomDelay(1000, 1500); // Natural pause after typing the username
        
        // Human-like typing for password
        const password = process.env.INSTAGRAM_PASSWORD || 'limo@insta.acc';
        await page.click(passwordSelector); // Focus on the password field
        for (const char of password) {
            await page.type(passwordSelector, char, { delay: Math.random() * 100 + 150 });
            await randomDelay(100, 200);
        }
        await randomDelay(1000, 1500); // Pause before submitting
        
        await page.click(loginButtonSelector);
        console.log("Logging in...");

        // Wait for "Not now" popup on the home page to dismiss saving login info.
        const homePageSelector = 'div[role="button"]:has-text("Not now")';
        try {
            await page.waitForSelector(homePageSelector, { timeout: 15000 });
            console.log("Login successful! 'Not now' popup detected.");
            await randomDelay(1500, 2000); // Increased delay before clicking "Not now"
            await page.click(homePageSelector);
            await randomDelay(1000, 1500);
        } catch (err) {
            console.log("Login may have failed or is taking too long.");
        }
    } else {
        console.log("Session loaded. Skipping login.");
    }

    // --- POST CREATION PROCESS ---
    // Use the "New Post" button or the fallback selector.
    const newPostButtonSelector = 'span:has-text("Create")';
    await randomDelay();
    await page.click(newPostButtonSelector);
    console.log("Initiating new post...");

    // Wait for the file input to appear.
    // Use the "Select from computer" button or a direct file input as fallback.
    const fileInputSelector = 'button:has-text("Select from computer")';
    await page.waitForSelector(fileInputSelector);
    await randomDelay();

    // Ensure the image path is absolute.
    const absoluteImagePath = path.resolve(imagePath);
    
    // Try to find a direct file input element.
    const fileInputElement = await page.$('input[type="file"]');
    if (fileInputElement) {
        // If found, upload the file directly.
        await page.setInputFiles('input[type="file"]', absoluteImagePath);
        console.log("Uploading image using the file input element.");
    } else {
        // If not found, wait for the filechooser event triggered by clicking the button.
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click('button:has-text("Select from computer")')
        ]);
        await fileChooser.setFiles(absoluteImagePath);
        console.log("Uploading image using the file chooser event.");
    }
    await randomDelay();

    // Optional: Add further steps (such as image cropping or filter selection)
    // Use the "Next" button selector and click it twice.
    const nextButtonSelector = 'div[role="button"]:has-text("Next")';
    for (let i = 0; i < 2; i++) {
        await page.click(nextButtonSelector);
        console.log(`Clicked "Next" button (${i + 1}/2)`);
        await randomDelay();
    }

    // Finalize by clicking the "Share" button.
    const shareButtonSelector = 'div[role="button"]:has-text("Share")';
    // Wait a longer delay for any overlay animations or interfering elements to settle (adjust as needed)
    await randomDelay(3000, 5000);
    // Wait for the share button to be visible. Increase timeout to ensure it loads.
    await page.waitForSelector(shareButtonSelector, { visible: true, timeout: 60000 });
    // Force the click if there are still overlay issues.
    await page.click(shareButtonSelector, { force: true });
    console.log("Image posted to Instagram successfully!");

    // Final delay then close the browser.
    await randomDelay();
    await context.close();
}

/**
 * Schedules a post based on the supplied imagePath and posting time.
 * If the scheduled time is in the past, the image is posted immediately.
 */
function schedulePost(imagePath, scheduledTimeStr) {
    const scheduledTime = new Date(scheduledTimeStr);
    const currentTime = new Date();
    const delay = scheduledTime.getTime() - currentTime.getTime();

    console.log(`Scheduled posting time: ${scheduledTime}`);
    if (delay <= 0) {
        console.log("Scheduled time is in the past or now. Posting immediately...");
        postImageToInstagram(imagePath);
    } else {
        console.log(`Post will be scheduled in ${(delay / 1000).toFixed(2)} seconds.`);
        setTimeout(() => {
            postImageToInstagram(imagePath);
        }, delay);
    }
}

/**
 * Prompts the user for input via the command line.
 */
function promptUser(query) {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, answer => {
        rl.close();
        resolve(answer);
    }));
}

/**
 * Main function:
 * - Prompts the user for image file path.
 * - Verifies and saves the image in a specified folder.
 * - Prompts for scheduled posting time.
 * - Schedules the post accordingly.
 */
async function main() {
    try {
        // Prompt the user for the image file path.
        const imagePathInput = await promptUser("Enter the full file path to the image: ");
        if (!fs.existsSync(imagePathInput)) {
            console.error("The provided image file does not exist.");
            process.exit(1);
        }

        const saveDir = path.join(__dirname, 'scheduled_posts');
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir);
        }
        const uniqueImageName = `${Date.now()}_${path.basename(imagePathInput)}`;
        const savedImagePath = path.join(saveDir, uniqueImageName);
        fs.copyFileSync(imagePathInput, savedImagePath);
        console.log(`Image saved to ${savedImagePath}`);


        console.log("Enter posting time in the following format: YYYY-MM-DD HH:MM (24-hour format)");
        const postTimeInput = await promptUser("Posting time: ");
        const scheduledTime = new Date(postTimeInput);
        if (isNaN(scheduledTime)) {
            console.error("Invalid date/time format.");
            process.exit(1);
        }

        schedulePost(savedImagePath, postTimeInput);
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

main();
