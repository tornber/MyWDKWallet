import { useEffect, useState } from "react";
import {
  getAddresses,
  getBalances,
  getTransactions,
  sendTransaction,
} from "./api";
import "./styles.css";

function shorten(address) {
  if (!address) return "—";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function App() {
  const [addresses, setAddresses] = useState({});
  const [balances, setBalances] = useState({});
  const [transactions, setTransactions] = useState([]);

  const [selectedChain, setSelectedChain] = useState("ethereum");
  const [selectedAccount, setSelectedAccount] = useState(0);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadWallet() {
    try {
      setLoading(true);
      setError("");

      const [addressData, balanceData, txData] = await Promise.all([
        getAddresses(),
        getBalances(),
        getTransactions(),
      ]);

      setAddresses(addressData);
      setBalances(balanceData);
      setTransactions(txData);
    } catch (err) {
      setError(err.message || "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWallet();
  }, []);

  async function handleSend(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!recipient.trim()) {
      setError("Enter a recipient address.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    try {
      setSending(true);

      const result = await sendTransaction({
        chain: selectedChain,
        accountIndex: selectedAccount,
        toAddress: recipient.trim(),
        amount,
      });

      setSuccess(`Transaction sent: ${result.txHash}`);

      setRecipient("");
      setAmount("");

      await loadWallet();
    } catch (err) {
      setError(err.message || "Transaction failed");
    } finally {
      setSending(false);
    }
  }

  const currentAddresses = addresses[selectedChain] || [];
  const currentBalances = balances[selectedChain] || {};

  const selectedAddress =
    currentAddresses[selectedAccount]?.address || "";

  const selectedBalance =
    currentBalances[selectedAccount]?.balance || "0";

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading wallet...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>My Wallet</h1>
          <p>Multi-chain WDK Wallet</p>
        </div>

        <button className="refresh" onClick={loadWallet}>
          Refresh
        </button>
      </header>

      {error && (
        <div className="alert error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success">
          {success}
        </div>
      )}

      <main>
        <section className="wallet-card">
          <div className="wallet-card-top">
            <div>
              <span className="label">Selected account</span>

              <h2>
                Account {selectedAccount}
              </h2>
            </div>

            <div className="chain-selector">
              <button
                className={selectedChain === "ethereum" ? "active" : ""}
                onClick={() => setSelectedChain("ethereum")}
              >
                ETH
              </button>

              <button
                className={selectedChain === "tron" ? "active" : ""}
                onClick={() => setSelectedChain("tron")}
              >
                TRX
              </button>

              <button
                className={selectedChain === "bitcoin" ? "active" : ""}
                onClick={() => setSelectedChain("bitcoin")}
              >
                BTC
              </button>
            </div>
          </div>

          <div className="balance">
            {selectedBalance}
          </div>

          <div className="address">
            {selectedAddress || "No address"}
          </div>
        </section>

        <section className="accounts">
          <div className="section-title">
            <h2>Accounts</h2>
            <span>{currentAddresses.length}</span>
          </div>

          <div className="account-list">
            {currentAddresses.map((account) => {
              const balance =
                currentBalances[account.index]?.balance || "0";

              return (
                <button
                  key={account.index}
                  className={
                    selectedAccount === account.index
                      ? "account active-account"
                      : "account"
                  }
                  onClick={() =>
                    setSelectedAccount(account.index)
                  }
                >
                  <div>
                    <strong>
                      Account {account.index}
                    </strong>

                    <span>
                      {shorten(account.address)}
                    </span>
                  </div>

                  <strong>{balance}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="send-section">
          <div className="section-title">
            <h2>Send</h2>
          </div>

          <form onSubmit={handleSend}>
            <label>Network</label>

            <select
              value={selectedChain}
              onChange={(e) => {
                setSelectedChain(e.target.value);
                setSelectedAccount(0);
              }}
            >
              <option value="ethereum">
                Ethereum
              </option>

              <option value="tron">
                TRON
              </option>

              <option value="bitcoin">
                Bitcoin
              </option>
            </select>

            <label>From</label>

            <div className="readonly">
              {selectedAddress}
            </div>

            <label>Recipient</label>

            <input
              type="text"
              placeholder="Enter recipient address"
              value={recipient}
              onChange={(e) =>
                setRecipient(e.target.value)
              }
            />

            <label>Amount</label>

            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value)
              }
            />

            <button
              className="send-button"
              disabled={sending}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </form>
        </section>

        <section className="transactions">
          <div className="section-title">
            <h2>Transactions</h2>
          </div>

          {transactions.length === 0 ? (
            <div className="empty">
              No transactions yet.
            </div>
          ) : (
            <div className="transaction-list">
              {[...transactions]
                .reverse()
                .map((tx, index) => (
                  <div
                    className="transaction"
                    key={index}
                  >
                    <div>
                      <strong>
                        {tx.chain.toUpperCase()}
                      </strong>

                      <span>
                        To: {shorten(tx.to)}
                      </span>
                    </div>

                    <div className="transaction-right">
                      <strong>
                        {tx.amount}
                      </strong>

                      <span>
                        {tx.txHash
                          ? shorten(tx.txHash)
                          : "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
