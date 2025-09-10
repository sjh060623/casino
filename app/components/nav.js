import { FaChartLine } from "react-icons/fa6";
import { FaCircleNotch } from "react-icons/fa";
import { FaRankingStar } from "react-icons/fa6";

import Link from "next/link";

export default function Nav() {
  return (
    <nav className="flex flex-row bottom-0 sticky w-full h-16 items-center justify-center p-3 bg-white">
      <div className="flex w-52 justify-between border border-slate-200 shadow-2xl rounded-4xl px-5 py-2">
        <Link href="/chart">
          <div className="flex flex-col items-center font-thin text-xs space-y-2">
            <FaChartLine size={20} />
            Chart
          </div>
        </Link>
        <Link href="/">
          <div className="flex flex-col items-center font-thin text-xs space-y-2">
            <FaCircleNotch size={20} />
            Trade
          </div>
        </Link>
        <Link href="/rank">
          <div className="flex flex-col items-center font-thin text-xs space-y-2">
            <FaRankingStar size={20} />
            Rank
          </div>
        </Link>
      </div>
    </nav>
  );
}
