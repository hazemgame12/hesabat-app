import { pool } from "@workspace/db";

const KEEP_IDS = [
  "9fbea778-80c1-419e-8bd6-1c34505c3aa4",
  "6fea6fa7-15f2-4695-b104-4a99ec8be639",
  "e764ca7b-6efa-490d-abc5-84136eae2ed3",
  "01a476a3-3777-49ba-8969-b5c441123ee1",
  "6ce900bf-fd81-428b-bb24-e2a2ad65876a",
];

const TABLES = [
  "asset_depreciation_entries",
  "fixed_assets",
  "inventory_movements",
  "inventory_items",
  "bank_statement_lines",
  "bank_reconciliations",
  "bank_movements",
  "bank_accounts",
  "advance_installments",
  "custody_attachments",
  "custodies",
  "advances",
  "payroll_run_lines",
  "payroll_runs",
  "employee_pay_components",
  "payroll_employees",
  "payment_allocations",
  "payments",
  "invoice_lines",
  "invoices",
  "customers",
  "suppliers",
  "revaluations",
  "exchange_rates",
  "currencies",
  "taxes",
  "cost_centers",
  "fiscal_years",
  "code_sequences",
  "e_invoice_configs",
  "audit_logs",
  "subscriptions",
  "support_tickets",
  "ticket_comments",
  "feature_votes",
  "journal_entry_attachments",
  "journal_entry_lines",
  "journal_entries",
  "accounts",
  "invitations",
  "sessions",
  "users",
  "companies",
];

async function cleanup() {
  console.log("Starting demo cleanup...");

  const idList = KEEP_IDS.map((id) => `'${id}'`).join(",");

  for (const table of TABLES) {
    try {
      let col = table === "companies" ? "id" : "company_id";
      // Check if table has company_id column
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'company_id'`,
        [table],
      );
      if (cols.rows.length === 0 && table !== "companies") {
        console.log(`Skipping ${table} (no company_id column)`);
        continue;
      }
      if (table === "companies") {
        col = "id";
      }
      const result = await pool.query(
        `DELETE FROM ${table} WHERE ${col} NOT IN (${idList}) RETURNING *`,
      );
      console.log(`Deleted ${result.rowCount} rows from ${table}`);
    } catch (err: any) {
      console.log(`Skipped ${table}: ${err.message}`);
    }
  }

  // Also delete sessions without valid users
  try {
    const result = await pool.query(
      `DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)`,
    );
    console.log(`Deleted ${result.rowCount} orphaned sessions`);
  } catch (err: any) {
    console.log(`Skipped sessions cleanup: ${err.message}`);
  }

  console.log("Cleanup complete!");
  await pool.end();
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
