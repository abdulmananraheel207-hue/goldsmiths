# GoldLedger

Shop management for a gold and jewellery retailer in Pakistan: daily gold rates, customers and their balances, stock, the sales counter with printable invoices, reports, and backups. It replaces the old PHP system.

> **Renaming the product:** the name lives in one place, [`app.config.json`](app.config.json) (`appName`). The server and the web app both read it.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 or newer (tested on 22) |
| npm | 10+ |
| MySQL | 8.0 |

## 2. Setup (first time)

```bash
# 1. Install everything (server + client, npm workspaces)
npm install

# 2. Configure the server
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
#    then edit server/.env: DB_USER, DB_PASSWORD, JWT_SECRET, SETTINGS_ENCRYPTION_KEY

# 3. Create the database and tables
npm run migrate

# 4. Load starting data (admin account, settings, 13 karats, sample data)
npm run seed

# 5. Run (API on :4000, web app on :5173)
npm run dev
```

Open **http://localhost:5173**.

### Default login

| Username | Password |
|---|---|
| `admin` | `Admin@12345` |

On first login the app asks you to change the password (**Change Password** in the menu).

### The seeded gold price is a placeholder

The seed enters a **placeholder** 24K price (Rs 400,000 per tola), dated **yesterday** and labelled "PLACEHOLDER" in Rate History. It is not a real market price. Because it is dated yesterday, the Dashboard and Add Sale page show the reminder *"Today's gold price has not been set yet"*. Click **Update price** (top banner) or **Add Today's Gold Price** (Gold Rates & Karats page) and enter the real price.

## 3. Environment variables (`server/.env`)

| Variable | Meaning |
|---|---|
| `PORT` | API port (default 4000) |
| `CLIENT_ORIGIN` | Web app address, used for CORS (default `http://localhost:5173`) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `DB_NAME` | Main database (default `goldledger`) |
| `DB_NAME_TEST` | Test database. It is **dropped and re-created** by `npm test`, and its name must contain "test" |
| `JWT_SECRET` | Long random string that signs login sessions. **Required in production** |
| `SETTINGS_ENCRYPTION_KEY` | Long random string that encrypts the tax-authority credential. If you change it, re-enter the credential in Settings |
| `COOKIE_SECURE` | `true` when served over HTTPS |
| `LOGIN_RATE_LIMIT` | Failed logins allowed per 15 minutes per address (default 10) |

To generate a random secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 4. Scripts

Run from the project root:

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API (auto-restarts on change) and the web app together |
| `npm run migrate` | Creates the database if needed and applies migrations |
| `npm run seed` | Loads starting data. **Erases all data.** It refuses to run if sales exist unless `SEED_FORCE=1` |
| `npm test` | Server tests (unit + API, using the test database), then client tests |
| `npm run test:unit -w server` | Only the gold-rate and sale maths tests (no database needed) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run build` then `npm start` | Production: builds the web app; the API server then serves it on port 4000 |
| `npm run reset-admin-password` | Sets a new admin password from the terminal (see below) |

## 5. Forgot the admin password?

There is only one account, so the password is reset from the computer that runs the server:

```bash
npm run reset-admin-password                          # asks for the new password twice
npm run reset-admin-password -- "MyNewPass@2026"      # non-interactive
npm run reset-admin-password -- "MyNewPass@2026" --username admin
```

This signs out every open session and is recorded in the audit log.

## 6. Backups

- **Manual:** Settings > Backup > **Download database backup** produces a complete `.sql` file. It is generated in Node, so `mysqldump` is not required.
- **Restore:** `mysql -u root -p goldledger < goldledger-backup-YYYY-MM-DD-HH-MM.sql`
- **Scheduled (recommended, daily):** use `mysqldump`, which ships with MySQL Server.
  - *Windows (Task Scheduler)*: create a daily task that runs a `.bat` file such as:
    ```bat
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u backup_user -pYOURPASS --single-transaction goldledger > "D:\Backups\goldledger-%date:~-4%-%date:~3,2%-%date:~0,2%.sql"
    ```
  - *Linux (cron)*: `0 22 * * * mysqldump --single-transaction goldledger | gzip > /backups/goldledger-$(date +\%F).sql.gz`
  - Keep copies off the shop computer (USB drive or cloud storage) and test a restore occasionally.

## 7. Project structure

```
app.config.json            product name (rename here)
server/
  knexfile.js              DB config (DECIMALs returned as exact strings, never floats)
  migrations/              schema
  seeds/                   starting data (uses the real sale logic)
  scripts/                 create-db, reset-admin-password
  src/
    app.js, index.js       Express app (helmet, cors, rate limit, cookie JWT) and server start
    middleware/            auth (sliding idle timeout), error handler ({message, errors?})
    routes/                auth, settings, categories, gold-rates, customers, items, sales, reports, backup
    services/
      goldRates.js         ★ single source of truth for karat maths (shared with the client)
      saleCalc.js          ★ line/totals/balance maths (shared with the client)
      rates.js             apply daily rate (one transaction), manual overrides, current rate
      sales.js             create (one transaction, stock lock, invoice counter) / void / load
      ledger.js            customer balance derived from ledger data
      taxUploader.js       ★ FBR/IRIS placeholder; the only file to change for the real integration
      taxQueue.js          upload queue, retries, resend
      settings.js, crypto.js, audit.js, backup.js
  tests/                   vitest: gold maths, sale maths, DB behaviour, API
client/
  src/
    components/ui/         Button, Input, Select, Modal, Table, Card, Toast, ConfirmDialog, PageHeader, Combobox…
    components/layout/     sidebar layout, Gold Now banner, idle logout
    pages/                 Login, Dashboard, Customers, Categories, Items, Add Sale, Sales History, Invoice, Reports, Settings, Change Password
    lib/                   api client, formatting (Rs, CNIC, phone), exports (CSV/Excel/PDF/Print)
```

## 8. How the key rules are enforced

- **Gold prices are never hard-coded.** Each karat is `karat ÷ 24 × 24K price per tola`, and the gram price is that divided by `grams_per_tola` (a setting, default 11.6638). Full precision is kept internally; values are rounded only for display (rates are stored with 4 decimals).
- **Current rate** = the latest `gold_rate_history` row. Adding the daily price updates all karats and writes history in one transaction.
- **Rate snapshots:** every sale stores the 24K price and grams-per-tola used, and every line stores its gram and tola rate. Past sales are never recomputed.
- **Invoice numbers** come from a row-locked counter: sequential, gap-free and never reused (cancelled sales keep theirs).
- **Stock** is locked (`SELECT … FOR UPDATE`) and decremented in the same transaction as the sale, with a guard against going below zero. Cancelling a sale restores it.
- **Customer balance** = opening balance + unpaid balances of active sales − payments received. It is always calculated and never typed in.
- **Audit log** records creates, updates and deletes, price changes, manual overrides, sales, cancellations, payments, settings changes, password changes and backups.

## 9. Tax invoice posting (FBR / PRA)

Invoices are posted with the **PostData** API (built by PRAL for both FBR and PRA). All the code is in `server/src/services/taxUploader.js`, and all the settings are in **Settings > Tax Integration**.

**Which authority?** Gold jewellery is a sale of *goods*, so sales tax and POS reporting normally go to **FBR**. **PRA** (Punjab Revenue Authority) covers *services* such as restaurants. Confirm with your tax advisor.

### What you need, and where to paste it

| Setting | Where to get it |
|---|---|
| **POS ID** (numbers) | FBR: register the POS in the FBR portal (IRIS / e.fbr; reported path: Registration → POS Client Registration). PRA: https://reg.pra.punjab.gov.pk/ |
| **Bearer token** | Issued with the POS registration. Sandbox and Production tokens are different. Stored encrypted. |
| **Default PCT code** | HS/PCT classification for your goods (for example, the gold jewellery heading under 7113). Confirm the exact code with your tax advisor. |
| **PNTN** | PRA only: your Punjab NTN (XXXXXXX-X) |
| **Environment** | Start with **Sandbox**. Switch to **Production** only after the IP is whitelisted. |

### Going live
1. Paste the POS ID, token and PCT code, choose **Sandbox**, then **Save** and **Test Connection**. In Sandbox this sends one test invoice and should show a tax invoice number.
2. Make a test sale and check that its status shows **Uploaded** and the invoice prints the FBR/PRA invoice number and QR code.
3. Ask the authority to whitelist the shop's public IP address (PRA: eims@pra.punjab.gov.pk). Without this, Production replies with error **900908**.
4. Paste the **Production** token, switch Environment to **Production**, and save.

### How it behaves
- Each sale is saved first and uploaded afterwards, so a failed upload never blocks or undoes a sale.
- When "Upload automatically" is off, sales wait as "Waiting to send" until you press **Resend to Tax**.
- Server errors and network problems are retried automatically, with growing delays, up to 10 times. Rejections (bad token, IP not approved, invalid data) are not retried; fix the cause and press **Resend to Tax**.
- A successful upload stores the tax invoice number on the sale. The invoice QR code then contains that number.

### Defaults to verify against your official technical document
These come from publicly described PostData integrations, not from an official spec, so check them against the document FBR/PRA gives you at registration:
- **API addresses:** FBR Sandbox `https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData`, FBR Production `https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData`, PRA `https://ims.pral.com.pk/ims/{sandbox|production}/api/Live/PostData`. Any of these can be overridden under **Advanced: API address**.
- **PaymentMode codes:** Cash = 1, Card = 2, Bank transfer = 6. These are in `PAYMENT_MODE` in `taxUploader.js`.
- **Success:** response `Code` = `"100"`, with the tax invoice number in `InvoiceNumber`.
- **Not yet built:** cancelling a sale that was already uploaded does **not** send a credit note. Handle it on the tax portal, or add a credit-note upload (InvoiceType 3 with RefUSIN).
- **Legal:** recent FBR rules may require POS integration software to be **licensed** by FBR. Check this before going live in Production.

## 10. Assumptions and decisions

These defaults were chosen where the brief was open to interpretation:

- **Wastage** is always entered **in grams** on the Add Sale page. Gross weight = weight + wastage grams, and gold value = gross weight × rate per gram × quantity. (The `wastage_type` column is kept in the database for old records, but new sales always save `grams`.)
- **Item weight** is per piece, so a line's gold value = gross weight × rate per gram × quantity.
- **Tax** is charged on (sub total − discount). The **card fee** is a percent of (taxable amount + tax), charged only for card payments. The **POS fee** is added after tax.
- **Seed price** is a placeholder (Rs 400,000 / tola 24K) dated yesterday, so the reminder shows.
- **Payments** can be general or tied to an invoice. A payment cannot exceed what the customer currently owes. If a sale is cancelled after the customer made payments against it, those payments stay on record and show as customer credit (a refund decision for the shop).
- **Change returned** (paying more than the total) is never stored as customer credit.
- **Deleting:** customers and items that appear in sales or payments are soft-deleted. Others are removed. Tags and CNICs of soft-deleted records stay reserved. A customer who still owes money cannot be deleted.
- **Categories:** a category with items cannot be deleted; the app offers to make it inactive. Inactive categories and items cannot be chosen for new items or sales.
- **Walk-in Customer** (CNIC `9999997-8`, phone `03000000000`, as given) is flagged `is_walk_in`. It cannot be deleted and must pay in full.
- **Idle logout** is enforced twice: the session cookie expires after the idle period and is refreshed on activity (server), and the browser logs out after the same period without input (client). Changing the password signs out other sessions.
- **Password hashing** uses `bcryptjs`, a pure-JS implementation of the same bcrypt algorithm (cost 12). It avoids native build tools on Windows.
- **Excel export** uses `write-excel-file`, which avoids the unmaintained `xlsx` package on npm.
- **Thermal printing:** the Invoice page has both "Print Invoice" (A4) and "Print Receipt (80mm)".
- **Dates** use the MySQL server's local clock (`CURDATE()`), so "today" follows the shop computer's time zone.
- **Fonts** are bundled (Nunito via `@fontsource`), so the app works without internet.
