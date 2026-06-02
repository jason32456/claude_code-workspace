"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { money } from "@/lib/format";

export type CategorySlice = { name: string; value: number; color: string };
export type MonthlyPoint = { month: string; income: number; expense: number; net: number };

const tooltipFmt = (v: number) => money(Number(v));

export function CategoryPie({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) {
    return <Empty>Spending by category will appear here.</Empty>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip formatter={tooltipFmt} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseBar({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) return <Empty>Add transactions to see monthly trends.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip formatter={tooltipFmt} />
        <Legend />
        <Bar dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetTrendLine({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) return <Empty>Your net cash-flow trend will appear here.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip formatter={tooltipFmt} />
        <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-center text-sm text-slate-400">
      {children}
    </div>
  );
}
