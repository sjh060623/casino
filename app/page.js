"use client";
import Image from "next/image";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { FaCaretDown, FaMinus, FaPlus } from "react-icons/fa";
import { FiShare2 } from "react-icons/fi";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const MMR = 0.004;
const CLOSE_FEE_PER_LEV = 0.0008;
const calcCloseFee = (myCapital, leverage) =>
  myCapital * (CLOSE_FEE_PER_LEV * leverage);
function calcMaintenanceMargin(notional) {
  return notional * MMR;
}
function calcUnrealizedPnL(type, entry, price, amount) {
  const qty = amount / entry;
  const gross = (price - entry) * qty;
  return type === "long" ? gross : -gross;
}
function calcMarginRatioIsolated(position, price) {
  if (!position) return 0;
  const notional = position.amount;
  const mm = calcMaintenanceMargin(notional);
  const upnl = calcUnrealizedPnL(
    position.type,
    position.entry,
    price,
    position.amount
  );
  const unrealizedLoss = Math.max(0, -upnl);
  const positionMargin = position.myCapital;
  return (mm + unrealizedLoss) / Math.max(1e-9, positionMargin);
}

function TradingContent() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("initial");

  const [val, setVal] = useState(0);
  const [isSell, setIsSell] = useState(false);
  const [value, setValue] = useState(50);
  const [price, setPrice] = useState(10000);
  const [prevPrice, setPrevPrice] = useState(10000);
  const [leverage, setLeverage] = useState(10);
  const [showLeveragePopup, setShowLeveragePopup] = useState(false);
  const [position, setPosition] = useState(null);
  const [balance, setBalance] = useState(470334);
  const [priceChangePercent, setPriceChangePercent] = useState(0);
  const [pnl, setPnl] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [additional, setAdditional] = useState("");

  const DURATION = 8 * 60 * 60 * 1000; // 8시간(ms)
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [endTime, setEndTime] = useState(Date.now() + DURATION);

  // Refs for latest position and leverage (for use in WS without resubscribe)
  const positionRef = useRef(null);
  const leverageRef = useRef(leverage);

  const format = (ms) => {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const remain = endTime - Date.now();
      if (remain <= 0) {
        const newEnd = Date.now() + DURATION;
        setEndTime(newEnd);
        setTimeLeft(newEnd - Date.now());
      } else {
        setTimeLeft(remain);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [endTime]);

  useEffect(() => {
    if (initial !== null) setIsSell(initial === "true");
  }, [initial]);

  useEffect(() => {
    const savedPosition = localStorage.getItem("position");
    if (savedPosition) setPosition(JSON.parse(savedPosition));
    const savedBalance = parseFloat(localStorage.getItem("balance")) || 10000;
    setBalance(savedBalance);
    const savedLeverage = parseInt(localStorage.getItem("leverage")) || 10;
    setLeverage(savedLeverage);
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    leverageRef.current = leverage;
  }, [leverage]);

  useEffect(() => {
    localStorage.setItem("balance", balance.toString());
  }, [balance]);

  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let retry = 0;
    const MAX_RETRY_DELAY = 15000; // 15s cap

    const connectWebSocket = () => {
      try {
        socket = new WebSocket(
          "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
        );
      } catch (e) {
        console.error("WS construct error:", e);
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        // reset backoff on success
        retry = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const k = data.k;
          if (!k) return;
          const newPrice = parseFloat(k.c);

          setPrice((prev) => {
            if (prev !== null && prev !== undefined && prev !== newPrice)
              setPrevPrice(prev);
            return newPrice;
          });

          // Safe PnL compute using refs (no resubscribe needed)
          const pos = positionRef.current;
          const lev = leverageRef.current || 1;
          if (pos && !Number.isNaN(newPrice)) {
            const entryQty = pos.amount / pos.entry;
            const currentValue = entryQty * newPrice;
            const profit = currentValue - pos.amount;
            const finalProfit = pos.type === "long" ? profit : -profit;
            setPnl(finalProfit);
          }
        } catch (err) {
          console.error("WS message parse error:", err);
        }
      };

      socket.onerror = (event) => {
        try {
          console.error(
            "WebSocket error:",
            (event && (event.message || event.reason || event.type)) || event
          );
        } catch (_) {}
        try {
          socket.close();
        } catch (_) {}
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      const delay = Math.min(1000 * Math.pow(2, retry++), MAX_RETRY_DELAY);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      try {
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      } catch (_) {}
    };
  }, []);

  // 등락률
  useEffect(() => {
    const tickerSocket = new WebSocket(
      "wss://stream.binance.com:9443/ws/btcusdt@ticker"
    );
    tickerSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const changePercent = parseFloat(data.P);
        if (!Number.isNaN(changePercent)) setPriceChangePercent(changePercent);
      } catch (_) {}
    };
    return () => {
      try {
        tickerSocket.close();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const myCapital = balance * (value / 100);
    const totalPosition = myCapital * leverage;
    setVal(totalPosition);
  }, [value, leverage, balance]);

  const handleEnterPosition = (side) => {
    if (position == null) {
      const myCapital = balance * (value / 100);
      const positionSize = myCapital * leverage;
      if (price && myCapital > 0 && myCapital <= balance) {
        const type = side === "short" ? "short" : "long";
        const newPosition = {
          type,
          entry: price,
          amount: positionSize,
          myCapital,
        };
        setPosition(newPosition);
        setBalance((prev) => prev - myCapital);
        setPnl(0);
        localStorage.setItem("position", JSON.stringify(newPosition));
        localStorage.setItem("leverage", leverage.toString());
      } else {
        console.log("Invalid");
      }
    }
  };

  const handleExitPosition = () => {
    if (position && price) {
      const entryQty = position.amount / position.entry;
      const currentValue = entryQty * price;
      const profit = currentValue - position.amount;
      const finalProfit = position.type === "long" ? profit : -profit;
      const closeFee = calcCloseFee(position.myCapital, leverage);

      setBalance((prev) => prev + position.myCapital + finalProfit - closeFee);
      setPosition(null);
      setPnl(0);
      localStorage.removeItem("position");
      localStorage.removeItem("leverage");
    }
  };

  const handleAddFunds = () => {
    const amount = parseFloat(additional);
    if (!isNaN(amount) && amount > 0) {
      setBalance((prev) => prev + amount);
      setShowPopup(false);
      setAdditional("");
    } else {
      alert("유효한 금액을 입력하세요");
    }
  };

  const selectLeverage = (lv) => {
    setLeverage(lv);
    localStorage.setItem("leverage", lv.toString());
    setShowLeveragePopup(false);
  };

  const liveMarginRatio = position
    ? calcMarginRatioIsolated(position, price)
    : leverage * MMR;

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
    <div className="bg-white text-slate-900 max-w-[980px] mx-auto p-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">BTC/USDT</h1>
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
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLeveragePopup(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs hover:bg-slate-50"
            >
              {leverage}x
            </button>
            <button
              onClick={() => setShowPopup(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">Last Price (USDT)</div>
            <div className={`text-2xl font-semibold ${priceColor}`}>
              {price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="mt-1 text-right text-xs text-slate-400">
            {parseFloat(price).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>Amount (USDT)</span>
              <span className="text-slate-900 font-medium">{value}%</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                onClick={() => setValue((v) => Math.max(0, Number(v) - 5))}
              >
                <FaMinus size={10} className="text-slate-600" />
              </button>
              <input
                id="labels-range-input"
                type="range"
                value={value}
                min="0"
                max="100"
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none bg-slate-200"
                style={{
                  background: `linear-gradient(to right, #111827 ${value}%, #e5e7eb ${value}%)`,
                  height: 6,
                }}
              />
              <button
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                onClick={() => setValue((v) => Math.min(100, Number(v) + 5))}
              >
                <FaPlus size={10} className="text-slate-600" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-slate-500">Max</div>
                <div className="text-sm font-semibold">
                  {balance.toLocaleString()} USDT
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-slate-500">Margin</div>
                <div className="text-sm font-semibold">
                  {((balance * value) / 100).toLocaleString()} USDT
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-slate-500">Cost</div>
                <div className="text-sm font-semibold">
                  {((balance * value * leverage) / 100).toLocaleString()} USDT
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => handleEnterPosition("long")}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium shadow-sm"
                disabled={!!position}
              >
                Buy / Long
              </button>
              <button
                onClick={() => handleEnterPosition("short")}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2.5 text-sm font-medium shadow-sm"
                disabled={!!position}
              >
                Sell / Short
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          {position ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-md text-white text-[11px] grid place-items-center ${
                      position.type === "long"
                        ? "bg-emerald-600"
                        : "bg-rose-600"
                    }`}
                  >
                    {position.type === "long" ? "L" : "S"}
                  </span>
                  <span className="text-base font-semibold">BTCUSDT</span>

                  <span className="text-xs px-2 py-0.5 rounded-md border border-slate-200 text-slate-600">
                    {leverage}x
                  </span>
                </div>
              </div>

              {/* PNL/ROI */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500 mb-1">
                    PNL (USDT)
                  </div>
                  <div
                    className={`text-xl font-semibold ${
                      pnl > 0
                        ? "text-emerald-600"
                        : pnl < 0
                        ? "text-rose-600"
                        : "text-slate-900"
                    }`}
                  >
                    {pnl.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500 mb-1">ROI</div>
                  <div
                    className={`text-xl font-semibold ${
                      pnl > 0
                        ? "text-emerald-600"
                        : pnl < 0
                        ? "text-rose-600"
                        : "text-slate-900"
                    }`}
                  >
                    {((pnl / position.myCapital) * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">
                    Entry Price (USDT)
                  </div>
                  <div className="font-medium">
                    {position.entry.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">
                    Market Price (USDT)
                  </div>
                  <div className="font-medium">
                    {price?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">
                    Liq. Price (USDT)
                  </div>
                  <div className="font-medium">
                    {position
                      ? (position.type === "long"
                          ? position.entry *
                            ((leverage - 1) / (leverage * (1 - 0.004)))
                          : position.entry * ((1 + 1 / leverage) / (1 + 0.004))
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowLeveragePopup(true)}
                  className="h-10 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
                >
                  Leverage
                </button>

                <button
                  onClick={handleExitPosition}
                  className="h-10 rounded-xl bg-slate-900 text-white text-sm hover:bg-black"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[220px] grid place-items-center text-slate-500 text-sm">
              포지션없음
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-1 text-sm">
          <div className="rounded-xl border border-slate-200 p-1 bg-slate-50/50">
            <div className="text-[11px] text-slate-500">수수료</div>
            <div className="font-medium">
              {position
                ? calcCloseFee(position.myCapital, leverage).toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )
                : "-"}{" "}
              USDT
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              = Margin × (0.08% × {leverage}x)
            </div>
          </div>
        </div>
      </div>

      {showLeveragePopup && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-xl p-4 border border-slate-200">
            <h3 className="text-base font-semibold mb-3">레버리지 선택</h3>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 25, 50, 75, 100, 125].map((lv) => (
                <button
                  key={lv}
                  onClick={() => selectLeverage(lv)}
                  className={`px-3 py-2 rounded-xl border text-sm hover:bg-slate-50 ${
                    leverage === lv
                      ? "border-slate-900 text-slate-900"
                      : "border-slate-200 text-slate-700"
                  }`}
                >
                  {lv}x
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLeveragePopup(false)}
              className="w-full mt-3 h-10 rounded-xl bg-slate-900 text-white text-sm hover:bg-black"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-xl p-4 border border-slate-200">
            <h3 className="text-base font-semibold mb-3">추가할 금액 입력</h3>
            <input
              type="number"
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              placeholder="추가금 (USDT)"
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={handleAddFunds}
                className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
              >
                추가
              </button>
              <button
                onClick={() => setShowPopup(false)}
                className="h-10 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Trading() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-600">Loading...</div>}>
      <TradingContent />
    </Suspense>
  );
}
