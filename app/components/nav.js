import { FaChartLine } from "react-icons/fa6";
import { FaCircleNotch } from "react-icons/fa";
import Link from "next/link";
import ResetStorageButton from "./remove";

export default function Nav() {
  return (
    <nav className="flex flex-row bottom-0 sticky w-full h-16 border rounded-t-2xl border-slate-200 p-3 bg-slate-50">
      <div className="flex flex-row space-x-5 items-center">
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
        <ResetStorageButton />
      </div>
    </nav>
  );
}
