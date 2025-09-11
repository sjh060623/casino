"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FiEdit2 } from "react-icons/fi";

// ===== Firebase (모듈식 v9+) - 이 파일 안에서 모두 초기화 =====
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  deleteUser,
  signOut,
} from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  off,
  query,
  orderByChild,
  limitToFirst,
  update,
  serverTimestamp,
  child,
  enableLogging,
  remove,
} from "firebase/database";

// .env.local 에 아래 값들이 있어야 합니다.
const firebaseConfig = {
  apiKey: "AIzaSyBBOf987WibhkSz_qHSqNe9Is-JLhKaYfs",
  authDomain: "casino-e07ba.firebaseapp.com",
  databaseURL:
    "https://casino-e07ba-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "casino-e07ba",
  storageBucket: "casino-e07ba.firebasestorage.app",
  messagingSenderId: "1019127821313",
  appId: "1:1019127821313:web:e99b4e78b379263b783c00",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Enable verbose Realtime Database logging for debugging timeouts
if (typeof window !== "undefined") {
  try {
    enableLogging(true);
    console.log("[RTDB logging] enabled");
  } catch (e) {
    console.warn("enableLogging failed", e);
  }
}

// ===== 유틸 =====
const ensureAnonSignIn = async () => {
  if (auth.currentUser) return auth.currentUser;
  const res = await signInAnonymously(auth);
  return res.user;
};

const setAuthDisplayName = async (nickname) => {
  if (!auth.currentUser) return;
  try {
    await Promise.race([
      updateProfile(auth.currentUser, { displayName: nickname }),
      new Promise((resolve) => setTimeout(resolve, 4000)), // 4s safety timeout
    ]);
  } catch (e) {
    console.error("updateProfile failed:", e);
  }
};

// ===== 페이지 컴포넌트 =====
export default function RankPage() {
  const [user, setUser] = useState(null); // Firebase User
  const [ready, setReady] = useState(false); // Auth 상태
  const [nickname, setNickname] = useState(""); // 닉네임
  const [editOpen, setEditOpen] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [savingNick, setSavingNick] = useState(false);
  const [lastError, setLastError] = useState("");
  const [connected, setConnected] = useState(null); // null = unknown, true/false

  const [rows, setRows] = useState([]); // 랭킹
  const [loadingRank, setLoadingRank] = useState(true);

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = ref(db, ".info/connected");
    const unsub = onValue(r, (snap) => {
      setConnected(!!snap.val());
      console.log("[.info/connected]", snap.val());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const r = ref(db, `users/${user.uid}/profile`);
    const offFn = onValue(r, (snap) => {
      const v = snap.val();
      const n = v?.nickname || "";
      setNickname(n);
      if (!editOpen) setNickInput(n);
    });
    return () => offFn();
  }, [ready, user, editOpen]);

  useEffect(() => {
    setLoadingRank(true);
    const qRank = query(
      ref(db, "leaderboard_totals"),
      orderByChild("scoreNegTotal"), // 오름차순
      limitToFirst(50)
    );
    const offFn = onValue(qRank, (snap) => {
      const arr = [];
      snap.forEach((child) => {
        arr.push(child.val());
      });
      // (Optional) tie-breaker: if scoreNegTotal is equal, sort by updatedAt desc
      arr.sort((a, b) => {
        const s = (a?.scoreNegTotal ?? 0) - (b?.scoreNegTotal ?? 0);
        if (s !== 0) return s; // lower scoreNegTotal first → higher ROI first
        return (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0);
      });
      setRows(arr);
      setLoadingRank(false);
    });
    return () => off(qRank);
  }, []);

  const handleCreateAnon = async () => {
    try {
      await ensureAnonSignIn();
      const u = auth.currentUser;
      const profSnap = await get(ref(db, `users/${u.uid}/profile`));
      if (!profSnap.exists()) {
        await set(ref(db, `users/${u.uid}/profile`), {
          nickname: `anon-${u.uid.slice(0, 6)}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("[handleCreateAnon]", e?.code, e?.message);
      setLastError(`${e?.code || "unknown"}: ${e?.message || e}`);
      alert("계정 생성 중 오류가 발생했습니다.");
    }
  };

  const saveNickname = async () => {
    if (!user) return;
    const n = nickInput.trim();
    if (!n) {
      alert("닉네임을 입력해 주세요.");
      return;
    }
    if (n.length > 24) {
      alert("닉네임은 24자 이하로 해주세요.");
      return;
    }
    setSavingNick(true);
    setLastError("");

    let timeoutId;
    const clearFlag = () => {
      clearTimeout(timeoutId);
      setSavingNick(false);
    };
    timeoutId = setTimeout(() => {
      console.warn("[saveNickname] timeout");
      setSavingNick(false);
      if (!lastError) setLastError("timeout: 룰/네트워크 문제 가능성");
      alert("오류");
    }, 8000);

    try {
      // 로그인 에러
      try {
        await ensureAnonSignIn();
      } catch (e) {
        console.error("ensureAnonSignIn error", e);
      }

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("no-uid");

      try {
        await get(ref(db, `users/${uid}`));
      } catch (e) {
        console.error("[read test users/uid error]", e?.code, e?.message);
        setLastError(`read ${e?.code || "unknown"}: ${e?.message || e}`);
        throw e;
      }

      try {
        await set(ref(db, `users/${uid}/__ping`), serverTimestamp());
      } catch (e) {
        console.error("[ping write error]", e?.code, e?.message);
        setLastError(`ping ${e?.code || "unknown"}: ${e?.message || e}`);
        throw e;
      }

      const profileRef = ref(db, `users/${uid}/profile`);
      let hadExisting = false;
      try {
        const existing = await get(profileRef);
        hadExisting = !!(existing && existing.exists());
      } catch (e) {
        console.error("get profile error", e);
      }

      // set으로 전체 덮어쓰기
      const fullDoc = {
        nickname: n,
        createdAt: hadExisting ? undefined : serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      Object.keys(fullDoc).forEach(
        (k) => fullDoc[k] === undefined && delete fullDoc[k]
      );

      await set(profileRef, fullDoc)
        .then(() => console.log("[set ok] profile"))
        .catch((e) => {
          console.error("[set error]", e?.code, e?.message);
          setLastError(`set ${e?.code || "unknown"}: ${e?.message || e}`);
          throw e;
        });

      console.log(`[profile saved] users/${uid}/profile`);

      // 랭크 문서에도 닉네임을 즉시 반영 (포지션 종료를 기다리지 않도록)
      try {
        await update(ref(db, `leaderboard_totals/${uid}`), {
          nickname: n,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn(
          "[nickname propagate] totals update failed",
          e?.code,
          e?.message
        );
      }
      try {
        await update(ref(db, `leaderboard/${uid}`), {
          nickname: n,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn(
          "[nickname propagate] legacy leaderboard update failed",
          e?.code,
          e?.message
        );
      }

      setEditOpen(false);
      clearFlag();
    } catch (e) {
      console.error("saveNickname error", e);
      if (!lastError)
        setLastError(`${e?.code || "unknown"}: ${e?.message || e}`);
      clearFlag();
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (
      !confirm(
        "정말 이 계정을 삭제하시겠습니까? (닉네임/랭킹 데이터가 함께 삭제됩니다)"
      )
    )
      return;

    setDeleting(true);
    setLastError("");
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("no-uid");

      const ops = [];
      ops.push(remove(ref(db, `users/${uid}`)));
      ops.push(remove(ref(db, `leaderboard_totals/${uid}`)));
      ops.push(remove(ref(db, `leaderboard/${uid}`)));
      await Promise.allSettled(ops);

      try {
        await deleteUser(auth.currentUser);
      } catch (e) {
        console.warn("deleteUser failed, signing out instead", e);
        try {
          await signOut(auth);
        } catch {}
      }

      setEditOpen(false);
      setNickname("");
      setNickInput("");
      alert("계정을 삭제했습니다.");
    } catch (e) {
      console.error("[handleDeleteAccount]", e);
      setLastError(`${e?.code || "unknown"}: ${e?.message || e}`);
      alert("계정 삭제 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.");
    } finally {
      setDeleting(false);
    }
  };

  // 내 정보 카드
  const myCard = useMemo(() => {
    if (!user) return null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">내 계정</div>
            <div className="text-[10px] text-slate-700  break-all">
              {user.uid}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500">닉네임</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {nickname || "설정 안 됨"}
              </span>
              <button
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                onClick={() => {
                  setNickInput(nickname || "");
                  setEditOpen(true);
                }}
                title="닉네임 수정"
              >
                <FiEdit2 className="text-slate-700" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [user, nickname]);

  // 랭킹
  const rankBoard = (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="text-sm font-semibold mb-2">누적 수익률 랭킹</div>
      <div className="text-xs text-slate-500 mb-2">정렬: Total ROI 높은 순</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">닉네임</th>
              <th className="py-2 pr-2 text-right">Total ROI</th>
              <th className="py-2 pr-2 text-right">Total Profit</th>
              <th className="py-2 pr-2 text-right">업데이트</th>
            </tr>
          </thead>
          <tbody>
            {loadingRank ? (
              <tr>
                <td className="py-3 text-slate-400" colSpan={5}>
                  로딩 중…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r, i) => (
                <tr key={r.uid ?? i} className="border-b last:border-0 text-xs">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">{r.nickname || "anon"}</td>
                  <td className="py-2 pr-2 text-right">
                    {Number(r.totalRoi || 0).toFixed(2)}%
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {Number(r.totalProfit || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-3 text-slate-400" colSpan={5}>
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 grid gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Rank</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              connected === null
                ? "border-slate-200 text-slate-500"
                : connected
                ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                : "border-rose-200 text-rose-700 bg-rose-50"
            }`}
            title="Realtime Database connection status (.info/connected)"
          >
            {connected === null
              ? "conn: ?"
              : connected
              ? "conn: on"
              : "conn: off"}
          </span>
        </div>
        {!user ? (
          <button
            onClick={handleCreateAnon}
            className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm hover:bg-black"
          >
            계정 생성
          </button>
        ) : (
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="h-10 px-4 rounded-xl border border-rose-300 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-60"
            title="계정과 관련 데이터를 삭제합니다"
          >
            {deleting ? "삭제중…" : "계정 삭제"}
          </button>
        )}
      </div>

      {/* 로그인전 */}
      {!user && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-700">
          <p className="text-sm">
            랭킹을 등록하거나 닉네임을 설정하려면 먼저 <b>익명 계정 생성</b>{" "}
            버튼을 눌러 주세요.
          </p>
        </div>
      )}

      {/* 로그인 후 */}
      {user && (
        <>
          {myCard}
          {rankBoard}
        </>
      )}

      {/* 닉네임 편집 */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-xl p-4 border border-slate-200">
            <h3 className="text-base font-semibold mb-3">닉네임 변경</h3>
            <input
              type="text"
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value)}
              placeholder="닉네임 입력"
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              maxLength={24}
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={saveNickname}
                disabled={savingNick}
                className="h-10 rounded-xl bg-slate-900 text-white text-sm hover:bg-black disabled:opacity-60"
              >
                {savingNick ? "저장중…" : "저장"}
              </button>
              <button
                onClick={() => setEditOpen(false)}
                className="h-10 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
            {lastError && (
              <div className="text-[11px] text-rose-600 mt-2">{lastError}</div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">
              닉네임은 24자 이하로 입력해 주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
