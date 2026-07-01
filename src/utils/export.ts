import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Expense, Liability, SavingGoal, UserProfile } from '@/src/types/models';
import { formatDate } from '@/src/utils/format';

export async function exportCsv(
  expenses: Expense[],
  liabilities: Liability[],
  goals: SavingGoal[]
): Promise<void> {
  let csv = 'Type,Name/Title,Amount,Category,Date/DueDate,Details/Notes\n';
  expenses.forEach((it) => {
    const dateStr = formatDate(it.dateMillis);
    csv += `Expense,"${it.title.replace(/"/g, '""')}",${it.amount},"${it.category}",${dateStr},"${it.notes.replace(/"/g, '""')}"\n`;
  });
  liabilities.forEach((it) => {
    const dateStr = formatDate(it.dueDateMillis);
    csv += `Liability,"${it.name.replace(/"/g, '""')}",${it.amount},"${it.frequency}",${dateStr},"Paid: ${it.isPaid}, Freq: ${it.frequency}"\n`;
  });
  goals.forEach((it) => {
    const dateStr = formatDate(it.targetDateMillis);
    csv += `SavingsGoal,"${it.name.replace(/"/g, '""')}",${it.targetAmount},"Savings",${dateStr},"Saved: ${it.savedAmount}, Required: ${it.currentRequiredMonthly}/mo"\n`;
  });

  const path = `${cacheDirectory}FutureFund_Financials_Export.csv`;
  await writeAsStringAsync(path, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: 'Share FutureFund CSV Export',
    });
  }
}

export async function exportPdfReport(
  profile: UserProfile | null,
  expenses: Expense[],
  liabilities: Liability[],
  goals: SavingGoal[],
  aiAdvice?: string | null
): Promise<void> {
  const userName = profile?.displayName ?? 'User';
  const userEmail = profile?.email ?? '';
  const monthlyIncome = profile?.monthlyIncome ?? 5000;
  const savingsRate = profile?.baseSavingsRatePercent ?? 20;
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalLiability = liabilities.reduce((s, l) => s + l.amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);

  let expenseRows = '';
  expenses.forEach((it) => {
    expenseRows += `<tr><td>${it.title}</td><td>${it.category}</td><td>₹${it.amount.toLocaleString('en-IN')}</td><td>${formatDate(it.dateMillis)}</td></tr>`;
  });

  let adviceSection = '';
  if (aiAdvice) {
    const clean = aiAdvice.replace(/\n/g, '<br/>').replace(/\*\*/g, '<b>').replace(/\*/g, '• ');
    adviceSection = `
      <div class="section">
        <div class="section-title">AI Advisor Insights</div>
        <div class="ai-advice">${clean}</div>
      </div>`;
  }

  const html = `
    <html><head><style>
      body { font-family: sans-serif; margin: 30px; color: #333; }
      h1 { color: #1a73e8; text-align: center; }
      .section { margin-bottom: 25px; }
      .section-title { font-size: 18px; font-weight: bold; border-bottom: 2px solid #1a73e8; color: #1a73e8; padding-bottom: 5px; }
      .summary-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
      .summary-card { background: #f1f3f4; border-radius: 8px; padding: 15px; width: 30%; text-align: center; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1a73e8; color: white; padding: 10px; text-align: left; }
      td { padding: 10px; border-bottom: 1px solid #ddd; }
      .ai-advice { background: #e8f0fe; border-left: 4px solid #1a73e8; padding: 15px; }
    </style></head><body>
      <h1>FutureFund AI Financial Report</h1>
      <p style="text-align:center">Generated on ${formatDate(Date.now(), 'full')} for ${userName} (${userEmail})</p>
      <div class="section"><div class="section-title">Profile Summary</div>
        <div class="summary-grid">
          <div class="summary-card"><h3>Monthly Net Income</h3><p>₹${monthlyIncome.toLocaleString('en-IN')}</p></div>
          <div class="summary-card"><h3>Target Savings Rate</h3><p>${savingsRate.toFixed(1)}%</p></div>
          <div class="summary-card"><h3>Total Tracked Expenses</h3><p>₹${totalExpense.toLocaleString('en-IN')}</p></div>
        </div>
      </div>
      <div class="section"><div class="section-title">Expenses Log</div>
        <table><thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead><tbody>${expenseRows}</tbody></table>
      </div>
      <div class="section"><div class="section-title">Liabilities & Goals</div>
        <div class="summary-grid">
          <div class="summary-card" style="width:48%"><h3>Total Liabilities</h3><p>₹${totalLiability.toLocaleString('en-IN')}</p></div>
          <div class="summary-card" style="width:48%"><h3>Total Goals Saved</h3><p>₹${totalSaved.toLocaleString('en-IN')}</p></div>
        </div>
      </div>
      ${adviceSection}
    </body></html>`;

  await Print.printAsync({ html });
}
