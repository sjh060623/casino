"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCaretDown } from "react-icons/fa";
import Image from "next/image";

function loadLWScript(cb) {
  if (typeof window === "undefined") return;
  if (window.LightweightCharts && window.LightweightCharts.createChart) {
    cb();
    return;
  }
  const existing = document.querySelector(
    'script[src^="https://unpkg.com/lightweight-charts"]'
  );
  if (existing) {
    existing.addEventListener("load", cb, { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src =
    "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
  s.async = true;
  s.onload = cb;
  document.body.appendChild(s);
}

export default function FuturesMockTrading() {
  const [prevPrice, setPrevPrice] = useState(null);

  const [price, setPrice] = useState(null);
  const [high, setHigh] = useState(null);
  const [low, setLow] = useState(null);
  const [volume, setVolume] = useState(null);
  const [usdtVolume, setUsdtVolume] = useState(null);
  const [priceChangePercent, setPriceChangePercent] = useState(0);
  const [position, setPosition] = useState(null);
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(12719326);
  const [leverage, setLeverage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  {
    /** */
  }
  const [showInputPopup, setShowInputPopup] = useState(false);
  const [inputValue, setInputValue] = useState("");
  {
    /** */
  }

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setIsDarkMode(e.matches);
    setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const router = useRouter();

  useEffect(() => {
    const tickerSocket = new WebSocket(
      "wss://stream.binance.com:9443/ws/btcusdt@ticker"
    );

    tickerSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const changePercent = parseFloat(data.P); // 24h change %
        if (!Number.isNaN(changePercent)) setPriceChangePercent(changePercent);
      } catch (_) {}
    };

    return () => {
      try {
        tickerSocket.close();
      } catch (_) {}
    };
  }, []);

  const fetchDataRef = useRef([]);

  useEffect(() => {
    const savedBalance = localStorage.getItem("balance");
    if (savedBalance) setBalance(parseFloat(savedBalance));

    const savedPosition = localStorage.getItem("position");
    if (savedPosition) setPosition(JSON.parse(savedPosition));

    const savedLeverage = localStorage.getItem("leverage");
    if (savedLeverage) setLeverage(parseInt(savedLeverage));
  }, []);

  useEffect(() => {
    localStorage.setItem("balance", balance.toString());
  }, [balance]);

  const candleSeriesRef = useRef(null);

  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connectWebSocket = () => {
      socket = new WebSocket(
        "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
      );

      socket.onopen = () => {
        console.log("WebSocket connected");
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const k = data.k;
        const newPrice = parseFloat(k.c);

        setPrice((prev) => {
          if (prev !== null && newPrice !== prev) setPrevPrice(prev);
          return newPrice;
        });
        setHigh(parseFloat(k.h));
        setLow(parseFloat(k.l));
        setVolume(parseFloat(k.v));
        setUsdtVolume(parseFloat(k.q));

        setPnl((prevPnl) => {
          if (position) {
            const positionSize = position.amount * leverage;
            const entryQty = positionSize / position.entry;
            const currentValue = entryQty * newPrice;
            const profit = currentValue - positionSize;
            return position.type === "long" ? profit : -profit;
          }
          return prevPnl;
        });

        const lastCandle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
        };
        if (
          candleSeriesRef.current &&
          typeof candleSeriesRef.current.update === "function"
        ) {
          candleSeriesRef.current.update(lastCandle);
        }
      };

      socket.onerror = (event) => {
        try {
          console.error(
            "WebSocket error: ",
            (event && (event.message || event.reason || event.type)) || event
          );
        } catch (_) {}
        try {
          socket.close();
        } catch (_) {}
      };

      socket.onclose = () => {
        console.warn("WebSocket closed. Attempting to reconnect in 3s...");
        reconnectTimeout = setTimeout(connectWebSocket, 3000); // 3초 후 재연결
      };
    };

    connectWebSocket();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [position, leverage]); // price는 제외 (무한 갱신 방지)

  const chartRef = useRef(null);
  const volumeRef = useRef(null);
  const macdRef = useRef(null);
  const [interval, setInterval] = useState("1m");

  useEffect(() => {
    let cleanupFn = null;

    loadLWScript(() => {
      // Guard
      if (!chartRef.current || !volumeRef.current || !macdRef.current) return;

      // Clear containers to avoid stacking multiple charts
      try {
        chartRef.current.innerHTML = "";
      } catch (_) {}
      try {
        volumeRef.current.innerHTML = "";
      } catch (_) {}
      try {
        macdRef.current.innerHTML = "";
      } catch (_) {}

      const gridOptions = {
        vertLines: { color: "#f6f6f6", style: 0, visible: true },
        horzLines: { color: "#f6f6f6", style: 0, visible: true },
      };

      const chartWidth = chartRef.current ? chartRef.current.clientWidth : 900;

      const chart = window.LightweightCharts.createChart(chartRef.current, {
        width: chartWidth,
        height: 300,
        layout: {
          background: { color: "#f6f6f6" },
          textColor: "#333",
          fontSize: 7,
        },
        grid: gridOptions,
        rightPriceScale: {
          visible: true,
          textColor: "#808080",
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          mode: 1,
        },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
      });
      chart.timeScale().applyOptions({ rightOffset: 0, barSpacing: 5 });

      const onResize = () => {
        if (!chartRef.current) return;
        chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener("resize", onResize);

      // Series
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#2dbd85",
        downColor: "#f5475d",
        borderVisible: false,
        wickUpColor: "#2dbd85",
        wickDownColor: "#f5475d",
        priceLineVisible: true,
        lastValueVisible: true,
      });
      candleSeriesRef.current = candleSeries;

      const ma7 = chart.addLineSeries({
        color: "#f5a623",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const pastelYellow = "#8ecae6";
      const bbUpper = chart.addLineSeries({
        color: pastelYellow,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const bbMiddle = chart.addLineSeries({
        color: "#edafb8",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: 1,
      });
      const bbLower = chart.addLineSeries({
        color: pastelYellow,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const volumeChart = window.LightweightCharts.createChart(
        volumeRef.current,
        {
          width: chartWidth,
          height: 70,
          layout: {
            background: { color: "#f6f6f6" },
            textColor: "#333",
            fontSize: 7,
          },
          grid: gridOptions,
          rightPriceScale: {
            visible: true,
            textColor: "#808080",
            borderVisible: false,
            scaleMargins: { top: 0.1, bottom: 0.1 },
          },
          leftPriceScale: { visible: false },
          timeScale: { visible: false, borderVisible: false },
        }
      );
      const volumeSeries = volumeChart.addHistogramSeries({
        priceFormat: { type: "volume" },
        scaleMargins: { top: 0.9, bottom: 0 },
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const macdChart = window.LightweightCharts.createChart(macdRef.current, {
        width: chartWidth,
        height: 60,
        layout: {
          background: { color: "#f6f6f6" },
          textColor: "#333",
          fontSize: 7,
        },
        grid: gridOptions,
        rightPriceScale: {
          visible: true,
          textColor: "#808080",
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
      });
      const macdLine = macdChart.addLineSeries({
        color: "#f5a623",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const deaLine = macdChart.addLineSeries({
        color: "#9c27b0",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const macdHist = macdChart.addHistogramSeries({
        priceFormat: { type: "volume" },
        scaleMargins: { top: 0.9, bottom: 0 },
        priceLineVisible: false,
        lastValueVisible: false,
      });

      // Load initial data for selected interval
      const fetchData = async () => {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=500`
        );
        const data = await res.json();
        const cData = data.map((d) => ({
          time: Math.floor(d[0] / 1000),
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));
        fetchDataRef.current = cData;
        candleSeries.setData(cData);

        const totalBars = cData.length;
        if (totalBars > 300) {
          chart
            .timeScale()
            .setVisibleLogicalRange({ from: totalBars - 300, to: totalBars });
        } else {
          chart.timeScale().fitContent();
        }

        const volumes = data.map((d) => ({
          time: Math.floor(d[0] / 1000),
          value: parseFloat(d[5]),
          color: parseFloat(d[4]) > parseFloat(d[1]) ? "#2dbd85" : "#f5475d",
        }));
        volumeSeries.setData(volumes);

        // MA7
        const calcMA = (period) =>
          cData
            .map((d, idx) => {
              if (idx < period) return null;
              const sum = cData
                .slice(idx - period + 1, idx + 1)
                .reduce((acc, v) => acc + v.close, 0);
              return { time: d.time, value: sum / period };
            })
            .filter((d) => d !== null);
        ma7.setData(calcMA(7));

        // Bollinger Bands
        const bbPeriod = 20;
        const bbMultiplier = 2;
        const std = (arr) => {
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          const variance =
            arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
          return Math.sqrt(variance);
        };
        const bbData = [];
        for (let i = 0; i < cData.length; ++i) {
          if (i < bbPeriod - 1) continue;
          const closes = cData
            .slice(i - bbPeriod + 1, i + 1)
            .map((c) => c.close);
          const mean = closes.reduce((a, b) => a + b, 0) / bbPeriod;
          const sd = std(closes);
          bbData.push({
            time: cData[i].time,
            upper: mean + bbMultiplier * sd,
            middle: mean,
            lower: mean - bbMultiplier * sd,
          });
        }
        bbUpper.setData(bbData.map((d) => ({ time: d.time, value: d.upper })));
        bbMiddle.setData(
          bbData.map((d) => ({ time: d.time, value: d.middle }))
        );
        bbLower.setData(bbData.map((d) => ({ time: d.time, value: d.lower })));

        // MACD
        const calcEMA = (period, data) => {
          const k = 2 / (period + 1);
          let ema = data[0].close;
          return data.map((d) => (ema = d.close * k + ema * (1 - k)));
        };
        const ema12 = calcEMA(12, cData);
        const ema26 = calcEMA(26, cData);
        const dif = ema12.map((e, i) => e - ema26[i]);
        const dea = calcEMA(
          9,
          dif.map((d) => ({ close: d }))
        );
        const macd = dif.map((d, i) => d - dea[i]);
        const times = cData.map((d) => d.time);
        macdHist.setData(
          times.map((t, i) => ({
            time: t,
            value: macd[i],
            color: macd[i] >= 0 ? "#2dbd85" : "#f5475d",
          }))
        );
        macdLine.setData(times.map((t, i) => ({ time: t, value: dif[i] })));
        deaLine.setData(times.map((t, i) => ({ time: t, value: dea[i] })));
      };
      fetchData();

      // Keep cleanup to remove charts & listeners when interval changes
      cleanupFn = () => {
        window.removeEventListener("resize", onResize);
        try {
          chart.remove();
        } catch {}
        try {
          volumeChart.remove();
        } catch {}
        try {
          macdChart.remove();
        } catch {}
      };
    });

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [interval]);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}. ${
      date.getMonth() + 1
    }. ${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#f6f6f6] text-black max-w-[844px] mx-auto pt-16 pb-20 relative overflow-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#f6f6f6] shadow-sm h-14 flex">
        <button
          onClick={() => {
            setShowHistory(true);
            const data = localStorage.getItem("tradeHistory");
            if (data) setHistory(JSON.parse(data));
          }}
          className="text-black text-lg"
        ></button>
      </header>
      <div className="flex flex-row items-center mb-5"></div>

      <div className="rounded-xl px-3 grid grid-cols-2 gap-4 mb-4 text-xs">
        <div>
          <p
            className={`text-2xl font-semibold ${
              price > prevPrice
                ? "text-[#2dbd85]"
                : price < prevPrice
                ? "text-[#f5465d]"
                : "text-black"
            }`}
          >
            {price !== null
              ? price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "--"}
          </p>
          <p className="text-xs text-black">
            ${price?.toFixed(2)}{" "}
            <span
              className={`ml-2 ${
                priceChangePercent > 0
                  ? "text-[#2dbd85]"
                  : priceChangePercent < 0
                  ? "text-[#f5465d]"
                  : "text-black"
              }`}
            >
              {priceChangePercent.toFixed(2)}%
            </span>
          </p>
        </div>
      </div>

      {/* (fin.js 스타일, fully replaced) */}
      <div className="bg-[#f6f6f6] w-full ">
        <div className="flex flex-row items-center justify-between space-x-3 px-4">
          <div className="flex flex-row items-center justify-center space-x-3 text-gray-500 text-sm">
            {["15m", "1h", "4h", "1d", "1m"].map((tf) => (
              <h1
                key={tf}
                onClick={() => setInterval(tf)} // ✅ 클릭 시 interval 변경 유지
                className={`cursor-pointer ${
                  interval === tf ? "text-black" : ""
                }`}
              >
                {tf}
              </h1>
            ))}
          </div>
        </div>
        <div className="max-w-[900px] mx-auto mb-4">
          <div className="absolute w-12 h-[160px]" />

          <div ref={chartRef} className="w-full min-h-[300px] h-[300px]" />
          <div ref={volumeRef} className="w-full min-h-[70px] h-[70px]" />
          <div ref={macdRef} className="w-full min-h-[60px] h-[60px]" />
        </div>
      </div>

      <div className="p-1 translate-x-2">
        <div className="flex flex-row space-x-2 justify-between gap-1 text-xs"></div>
      </div>
    </div>
  );
}
