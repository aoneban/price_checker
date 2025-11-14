import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';

// URL product
const URL = 'https://www.ceneo.pl/170343896';

// Path to the file contains last price
const PRICE_FILE = path.resolve('./price.json');

// Mail settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

var nameProduct;

// Function for receiving price with Puppeteer
async function getPrice() {
  try {
    // Loading HTML pages
    const { data } = await axios.get(URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    // Loading HTML into Cheerio
    const $ = cheerio.load(data);
    nameProduct = await getNameProduct($);

    // Extract the price from the specified element
    const priceElement = $(
      'p.my-0:contains("Aktualnie najniższa cena") .price'
    );
    const value = priceElement.find('.value').text().trim();
    const penny = priceElement.find('.penny').text().trim();

    // Combining the integer and fractional parts
    const price = `${value}${penny}`.replace(',', '.');

    console.log('Price found:', price);
    return price;
  } catch (error) {
    console.error('Error getting price:', error.message);
  }
}

async function getNameProduct(item) {
  const h1Text = item('h1').first().text().trim();
  return h1Text;
}

// Function of sending a letter
async function sendEmail(newPrice, message) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `💰 Check price for Ceneo: ${nameProduct}`,
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
      console.log(`Price changed: ${oldPrice} → ${newPrice} PLN`);
      await sendEmail(newPrice, `Price changed: ${oldPrice} → ${newPrice} PLN`);
      fs.writeFileSync(
        PRICE_FILE,
        JSON.stringify({ price: newPrice }, null, 2),
        'utf-8'
      );
    } else {
      console.log(`Price didn't change: ${newPrice}`);
      await sendEmail(
        newPrice,
        `💲 Price didn't change 💲 (remains ${newPrice} PLN)`
      );
    }
  } catch (err) {
    console.error('Error checking price:', err.message);
  }
}

// Launch every ~~!~~ minutes
checkPrice();
setInterval(checkPrice, 60 * 60 * 1000);
