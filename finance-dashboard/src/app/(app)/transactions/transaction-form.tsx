"use client";

import { useState } from "react";
import { inputDate } from "@/lib/format";
import { createTransaction } from "./actions";

type Category = { id: string; name: string; type: string };

export function TransactionForm({ categories }: { categories: Category[] }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const options = categories.filter((c) => c.type === type);

  return (
    <form
      action={async (fd) => {
        await createTransaction(fd);
        (document.getElementById("txn-form") as HTMLFormElement)?.reset();
        setType("expense");
      }}
      id="txn-form"
      className="grid grid-cols-2 gap-3 sm:grid-cols-6"
    >
      <div className="col-span-2 sm:col-span-1">
        <label className="label">Type</label>
        <select
          name="type"
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as "income" | "expense")}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div className="col-span-1">
        <label className="label">Amount</label>
        <input name="amount" type="number" step="0.01" min="0.01" className="input" placeholder="0.00" required />
      </div>
      <div className="col-span-1">
        <label className="label">Date</label>
        <input name="date" type="date" className="input" defaultValue={inputDate(new Date())} required />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="label">Category</label>
        <select name="categoryId" className="input">
          <option value="">Uncategorized</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="label">Note</label>
        <input name="note" className="input" placeholder="optional" />
      </div>
      <div className="col-span-2 flex items-end sm:col-span-1">
        <button type="submit" className="btn w-full">
          Add
        </button>
      </div>
    </form>
  );
}
