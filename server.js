import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// upload config
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, Date.now() + "." + ext);
  }
});
const upload = multer({ storage });

/* --------------------------
   JOBS STORE
---------------------------*/
const jobs = {};

/* --------------------------
   /analyze  — job queue
---------------------------*/
app.post("/analyze", (req, res) => {
  upload.array("files")(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err.message);
      return res.status(400).json({ error: err.message });
    }

    // ✅ ارجع jobId فوراً قبل ما Back4App يقطع الكونكشن
    const jobId = Date.now().toString();
    jobs[jobId] = { status: "processing" };
    res.json({ jobId });

    // ✅ اشتغل في الخلفية
    try {
      const files = req.files;

      const uploadedFiles = [];
      for (const file of files) {
        const f = await openai.files.create({
          file: fs.createReadStream(file.path),
          purpose: "assistants"
        });
        uploadedFiles.push(f.id);
      }

      const response = await openai.responses.create({
        model: "gpt-5.4",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `أنت محلل مالي محترف.
استخرج البيانات من ملفات (Accountant + CR4 + Spreading) وارجع JSON فقط بنفس الـ schema المرفق.

📌 قواعد:

لا تخمن → أي قيمة غير موجودة = null
لو القيم بوحدة (LE 000's) → اضرب ×1000
لا تستخدم Total Liabilities بدل Current Liabilities

📌 مهم جدًا:

استخرج البيانات لآخر 3 سنوات متاحة في الملفات
لو وجدت أكثر من سنة:
استخدم الأعمدة الخاصة بـ (YY/12/31 ، YY/12/31 ، YY/12/31)

جميع القيم الرقمية يجب أن تكون Arrays بنفس الترتيب

📌 ملاحظات:

Inventories لو متقسمة → اجمعها
Total Expenses = Gross Profit - Net Profit (لو مش موجود)
Others خُدها كما هي

📌 المطلوب:

ارجع JSON فقط بدون أي شرح بالشكل التالي:
{
"company_name": "",
"financial_year": "",
"commercial_register": "",

"years": ["2023", "2022", "2021"],

"sales": [null, null, null],
"gross_profit": [null, null, null],
"net_profit": [null, null, null],

"total_assets": [null, null, null],
"total_liabilities": [null, null, null],
"total_equity": [null, null, null],
"current_assets": [null, null, null],
"current_liabilities": [null, null, null],

"cash_flow_from_operations": [null, null, null],
"roe": ["", "", ""],
"roa": ["", "", ""],
"leverage": ["", "", ""],

"balance_sheet": {
  "cash": [null, null, null],
  "inventories": [null, null, null],
  "accounts_receivable_debtors": [null, null, null],
  "cash_collateral": [null, null, null],
  "prepaid_expenses": [null, null, null],
  "others_current_assets": [null, null, null],
  "total_current_assets": [null, null, null],

  "buildings": [null, null, null],
  "intangible_assets": [null, null, null],
  "accumulated_depreciation": [null, null, null],
  "lands": [null, null, null],
  "machinery_equipment": [null, null, null],
  "vehicles": [null, null, null],
  "office_furniture": [null, null, null],
  "properties_under_development": [null, null, null],
  "others_fixed_assets": [null, null, null],
  "total_fixed_assets": [null, null, null],
  "total_assets_bs": [null, null, null],

  "liabilities": [null, null, null],
  "bank_overdraft": [null, null, null],
  "accounts_payable": [null, null, null],
  "current_portion_term_loan": [null, null, null],
  "accrued_expenses": [null, null, null],
  "advance_payments": [null, null, null],
  "others_current_liabilities": [null, null, null],
  "total_current_liabilities": [null, null, null],

  "non_current_portion_term_loan": [null, null, null],
  "notes_payables": [null, null, null],
  "partners_loans": [null, null, null],
  "others_long_term": [null, null, null],
  "total_long_term_liabilities": [null, null, null],

  "owners_equity": [null, null, null],
  "shareholders_current_account": [null, null, null],
  "current_year_net_profit_loss": [null, null, null],
  "retained_earnings": [null, null, null],
  "reserves": [null, null, null],
  "legal_reserve": [null, null, null],
  "other_equity": [null, null, null],
  "paid_up_capital": [null, null, null],
  "total_equity_bs": [null, null, null],
  "total_liabilities_equity": [null, null, null],
  "difference": [null, null, null]
},

"income_statement": {
  "period": ["", "", ""],
  "year": ["2023", "2022", "2021"],

  "total_sales_revenues": [null, null, null],
  "cogs": [null, null, null],
  "gross_profit_is": [null, null, null],
  "sga_expenses": [null, null, null],
  "depreciation_industrial": [null, null, null],
  "depreciation_administration": [null, null, null],
  "interest_revenue": [null, null, null],
  "interest_expenses": [null, null, null],
  "other_expenses": [null, null, null],
  "taxes": [null, null, null],
  "other_revenues": [null, null, null],
  "provisions": [null, null, null],
  "total_expenses": [null, null, null],
  "net_profit_loss_is": [null, null, null]
}
}`
              },
              ...uploadedFiles.map(id => ({
                type: "input_file",
                file_id: id
              }))
            ]
          }
        ]
      });

      let text = response.output_text;
      console.log("GPT response:", text);
      let clean = text.replace(/```json|```/g, "").trim();
      jobs[jobId] = { status: "done", result: JSON.parse(clean) };

    } catch (e) {
      console.error("Background job error:", e);
      jobs[jobId] = { status: "error", error: e.message };
    }
  });
});

/* --------------------------
   /extract_pdf  — job queue
---------------------------*/
app.post("/extract_pdf", (req, res) => {
  upload.array("files", 1)(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err.message);
      return res.status(400).json({ error: err.message });
    }

    // ✅ ارجع jobId فوراً
    const jobId = Date.now().toString();
    jobs[jobId] = { status: "processing" };
    res.json({ jobId });

    // ✅ اشتغل في الخلفية
    try {
      const files = req.files;
      const uploadedFiles = [];
      for (const file of files) {
        const f = await openai.files.create({
          file: fs.createReadStream(file.path),
          purpose: "assistants"
        });
        uploadedFiles.push(f.id);
      }

      const response = await openai.responses.create({
        model: "gpt-5.4",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `استخرج البيانات من ملف PDF المرفق وأرجع النتيجة بصيغة JSON فقط.

ممنوع تكتب أي شرح.
ممنوع تكتب markdown.
ممنوع تكتب \`\`\`json.
ممنوع تكتب أي نص قبل أو بعد JSON.
لازم أول حرف في الرد يكون {
ولازم آخر حرف في الرد يكون }

لو معلومة غير موجودة اتركها فارغة "".
لو الحقل array وغير موجود ارجعه [].
لا تخمن أي بيانات غير موجودة في الملف.

ارجع بنفس هذا الشكل فقط:

{
  "companyName": "",
  "address": "",
  "phone": [],
  "email": [],
  "taxNumber": "",
  "ComReg": "",
  "companySection": "",
  "name": [],
  "role": [],
  "boardSection": "",
  "shareBoardName": [],
  "countArrows": [],
  "amountArrows": [],
  "amountpres": [],
  "sharememersSection": "",
  "capitalAuth": "",
  "capitalPaid": "",
  "employees": "",
  "customerName": [],
  "customerPhone": [],
  "customerDisc": [],
  "supplierName": [],
  "supplierPhone": [],
  "supplierDisc": []
}`
            },
            ...uploadedFiles.map(id => ({ type: "input_file", file_id: id }))
          ]
        }]
      });

      let clean = response.output_text.replace(/```json|```/g, "").trim();
      jobs[jobId] = { status: "done", result: JSON.parse(clean) };

    } catch (e) {
      console.error("Background job error:", e);
      jobs[jobId] = { status: "error", error: e.message };
    }
  });
});

/* --------------------------
   /job/:id  — polling endpoint
---------------------------*/
app.get("/job/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "not found" });
  res.json(job);
});

/* --------------------------
   /ping
---------------------------*/
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

/* --------------------------
   RUN
---------------------------*/
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () =>
  console.log("🚀 Server running on port", PORT)
);

server.requestTimeout = 180000;
server.headersTimeout = 185000;
server.keepAliveTimeout = 65000;
