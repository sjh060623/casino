"use client";
import { useEffect, useRef, useState } from "react";

const TV_CONTAINER_ID = "tv_btc_chart";

function loadTVScript(cb) {
  if (typeof window === "undefined") return;
  if (window.TradingView) {
    cb();
    return;
  }

  const existing = document.querySelector(
    'script[src="https://s3.tradingview.com/tv.js"]'
  );
  if (existing) {
    existing.addEventListener("load", cb, { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/tv.js";
  s.async = true;
  s.onload = cb;
  document.body.appendChild(s);
}

export default function BTCChart() {
  const [position, setPosition] = useState(null);
  const [prevPrice, setPrevPrice] = useState(10000);

  const [priceChangePercent, setPriceChangePercent] = useState(0);
  const [price, setPrice] = useState(10000);
  useEffect(() => {
    const tickerSocket = new WebSocket(
      "wss://stream.binance.com:9443/ws/btcusdt@ticker"
    );
    tickerSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const changePercent = parseFloat(data.P);
      setPriceChangePercent(changePercent);
    };
    return () => tickerSocket.close();
  }, []);

  useEffect(() => {
    const socket = new WebSocket(
      "wss://fstream.binance.com/ws/btcusdt@kline_1m"
    );
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const k = data.k;
      const newPrice = parseFloat(k.c);

      setPrice((prev) => {
        setPrevPrice(prev);
        return newPrice;
      });

      if (position) {
        const entryQty = position.amount / position.entry;
        const currentValue = entryQty * newPrice;
        const profit = currentValue - position.amount;
        const finalProfit = position.type === "long" ? profit : -profit;
        setPnl(finalProfit);
      }
    };
    return () => socket.close();
  }, [position]);

  const widgetRef = useRef(null);
  const [interval, setIntervalState] = useState("1"); // 1, 3, 5, 15, 60, 240

  useEffect(() => {
    let destroyed = false;

    loadTVScript(() => {
      if (destroyed) return;

      window.tvWidget = new TradingView.widget({
        autosize: true,
        symbol: "BINANCE:BTCUSDT",
        interval,
        timezone: "Asia/Seoul",
        theme: "light",
        style: "1",
        locale: "ko",
        container_id: TV_CONTAINER_ID,
        hide_top_toolbar: false,
        withdateranges: true,
        allow_symbol_change: false,
        toolbar_bg: "#fff",
      });

      const w = window.tvWidget;
      if (w && typeof w.onChartReady === "function") {
        w.onChartReady(() => {
          if (destroyed) return;
          widgetRef.current = w;
        });
      } else {
        widgetRef.current = w || null;
      }
    });

    return () => {
      destroyed = true;
      const el = document.getElementById(TV_CONTAINER_ID);
      if (el) {
        el.innerHTML = "";
      }
      widgetRef.current = null;
      if (typeof window !== "undefined") delete window.tvWidget;
    };
  }, []);

  const changeInterval = (iv) => {
    setIntervalState(iv);
    const w =
      widgetRef.current ||
      (typeof window !== "undefined" ? window.tvWidget : null);
    if (!w) return;

    try {
      if (typeof w.onChartReady === "function") {
        w.onChartReady(() => {
          const chart = w.activeChart && w.activeChart();
          if (chart && typeof chart.setInterval === "function")
            chart.setInterval(iv);
        });
      } else {
        const chart = w.activeChart && w.activeChart();
        if (chart && typeof chart.setInterval === "function")
          chart.setInterval(iv);
      }
    } catch (e) {}
  };

  const TF_ITEMS = [
    { label: "1m", iv: "1" },
    { label: "3m", iv: "3" },
    { label: "5m", iv: "5" },
    { label: "15m", iv: "15" },
    { label: "1h", iv: "60" },
    { label: "4h", iv: "240" },
  ];

  const pcColor =
    priceChangePercent > 0
      ? "text-emerald-600"
      : priceChangePercent < 0
      ? "text-rose-600"
      : "text-slate-700";

  const priceColor =
    price > prevPrice
      ? "text-emerald-600"
      : price < prevPrice
      ? "text-rose-600"
      : "text-slate-900";

  return (
    <div className="bg-white text-slate-900 max-w-[980px] p-2 h-screen">
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          BTC/USDT Chart
        </h2>

        <div className="flex items-center justify-between">
          <div className={`text-2xl font-semibold ${priceColor}`}>
            {price.toLocaleString(undefined, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${pcColor} ${
            priceChangePercent >= 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }`}
        >
          {priceChangePercent.toFixed(2)}%
        </span>
      </div>

      {/* Chart */}
      <div
        id={TV_CONTAINER_ID}
        style={{
          width: "100%",
          height: 560,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}
      />
    </div>
  );
}
