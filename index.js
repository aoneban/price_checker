import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// URL product
const URL =
  'https://www.ceneo.pl/170343896?fto=533694621&se=HjaMfoC7jA0DKNTqpkT6v3fmh46Jrlju';

// Path to the file contains last price
const PRICE_FILE = path.resolve('./price.json');

// Mail settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS 
  },
});

// Function for receiving price with Puppeteer
async function getPrice() {
  const browser = await puppeteer.launch({
  headless: true,         
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--no-first-run",
    "--no-zygote",
    "--single-process"
  ],
});
  const page = await browser.newPage();

  // Set up User-Agent, to not to lock
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Navigation with extended timeout
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // Waiting for a block with price
  await page.waitForSelector('span.price-format', { timeout: 60000 });

  // Extract price form this block "Aktualnie najniższa cena"
  const priceText = await page.evaluate(() => {
    // Looking for all the elements which contain this text "Aktualnie najniższa cena:"
    const labels = Array.from(document.querySelectorAll('body *')).filter(
      (el) => el.textContent.includes('Aktualnie najniższa cena')
    );

    if (!labels.length) return null;

    const label = labels[0];

    // Search inside of this element span.price
    const priceBox =
      label.querySelector('span.price') ||
      label.parentElement.querySelector('span.price');
    if (!priceBox) return null;

    const value = priceBox.querySelector('.value')?.textContent.trim();
    const penny = priceBox
      .querySelector('.penny')
      ?.textContent.trim()
      .replace(',', '.');

    return value && penny ? `${value}${penny}` : null;
  });

  await browser.close();

  if (!priceText)
    throw new Error("Unable to find price in block 'Aktualnie najniższa cena'");

  return parseFloat(priceText);
}

// Function of sending a letter
async function sendEmail(newPrice, message) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
     subject: "💰 Check price for Ceneo",
    text: `${message}\nCurrent price: ${newPrice} PLN\n${URL}`,
  };

  await transporter.sendMail(mailOptions);
  console.log('📧 The letter is sent!');
}

// Check price
async function checkPrice() {
  try {
    const newPrice = await getPrice();
    let oldPrice = null;

    if (fs.existsSync(PRICE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf-8'));
      oldPrice = data.price;
    }

    // If first launch — save price and won't send a letter
    if (oldPrice === null) {
      console.log(`First launch. Save price: ${newPrice}`);
      fs.writeFileSync(
        PRICE_FILE,
        JSON.stringify({ price: newPrice }, null, 2),
        'utf-8'
      );
      return;
    }

    // If price didn't change - send email
    if (newPrice !== oldPrice) {
      console.log(`Price changed: ${oldPrice} → ${newPrice}`);
      await sendEmail(newPrice);
      fs.writeFileSync(
        PRICE_FILE,
        JSON.stringify({ price: newPrice }, null, 2),
        'utf-8'
      );
    } else {
      console.log(`Price didn't change: ${newPrice}`);
      await sendEmail(newPrice, `Price didn't change (remains ${newPrice})`);
    }
  } catch (err) {
    console.error('Error checking price:', err.message);
  }
}

// Launch every ~~!~~ minutes
checkPrice();
setInterval(checkPrice, 5 * 60 * 1000);
