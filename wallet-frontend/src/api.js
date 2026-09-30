const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";

async function request(url, options = {}) {
  const response = await fetch(`${API_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Request failed"
    );
  }

  return data;
}

export async function getAddresses() {
  return request("/api/wallet/addresses");
}

export async function getBalances() {
  return request("/api/wallet/balances");
}

export async function getTransactions() {
  return request("/api/wallet/transactions");
}

export async function sendTransaction({
  chain,
  accountIndex,
  toAddress,
  amount,
}) {
  return request("/api/wallet/send", {
    method: "POST",
    body: JSON.stringify({
      chain,
      accountIndex,
      toAddress,
      amount,
    }),
  });
}
