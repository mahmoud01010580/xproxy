
require("dotenv").config();

const axios = require("axios");
const crypto = require("crypto");

async function testBinancePay() {
  try {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_SECRET_KEY;

    if (!apiKey || !apiSecret) {
      throw new Error("API Key or Secret is missing from .env");
    }

    const timestamp = Date.now();

    const params = new URLSearchParams({
      timestamp: timestamp.toString(),
      recvWindow: "5000",
      limit: "10"
    });

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(params.toString())
      .digest("hex");

    const url =
      `https://api.binance.com/sapi/v1/pay/transactions?${params.toString()}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey
      },
      timeout: 15000
    });

    console.log("Connection successful!");
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.log("Binance API Error:");
    console.log(error.response?.data || error.message);
  }
}

testBinancePay();
