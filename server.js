import express from "express";
import cors from "cors";
import { WalletApp } from "./app.js";
import "dotenv/config.js";

const app = express();

app.use(cors());
app.use(express.json());

const wallet = new WalletApp({
  storageDir: "./my-wallet",
  encryptionKey: process.env.WALLET_ENCRYPTION_KEY,
  accounts: 3,
});

await wallet.initialize();

app.get("/api/wallet/addresses", async (req, res) => {
  try {
    res.json(await wallet.getAllAddresses());
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/wallet/balances", async (req, res) => {
  try {
    res.json(await wallet.checkAllBalances(false));
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/wallet/transactions", (req, res) => {
  try {
    res.json(wallet.getTransactionHistory());
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.post("/api/wallet/send", async (req, res) => {
  try {
    const {
      chain,
      accountIndex,
      toAddress,
      amount,
    } = req.body;

    if (!["ethereum", "tron", "bitcoin"].includes(chain)) {
      return res.status(400).json({
        error: "Invalid chain",
      });
    }

    if (!Number.isInteger(accountIndex)) {
      return res.status(400).json({
        error: "Invalid account index",
      });
    }

    if (!toAddress || !amount) {
      return res.status(400).json({
        error: "Missing transaction parameters",
      });
    }

    const result = await wallet.sendTransaction(
      chain,
      accountIndex,
      toAddress,
      amount
    );

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.listen(3001, () => {
  console.log(
    "Wallet API running on http://localhost:3001"
  );
});
