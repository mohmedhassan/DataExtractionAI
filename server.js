import { File } from "node:buffer";
globalThis.File = File;

import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import XLSX from "xlsx";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());

const openai = new OpenAI({
  apiKey:process.env.OPENAI_API_KEY
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
   VALIDATION + FIX
---------------------------*/

const normalize = (item) => ({
  ...item,
  sales: Number(item.sales) || 0,
  gross_profit: Number(item.gross_profit) || 0,
  net_profit: Number(item.net_profit) || 0,
  total_assets: Number(item.total_assets) || 0,
  total_liabilities: Number(item.total_liabilities) || 0,
  total_equity: Number(item.total_equity) || 0,
  current_assets: Number(item.current_assets) || 0,
  cash_flow_from_operations: Number(item.cash_flow_from_operations) || null
});

const validate = (item) => {
  const errors = [];

  if (item.total_assets !== item.total_liabilities + item.total_equity) {
    errors.push("Balance sheet mismatch");
  }

  if (item.current_assets > item.total_assets) {
    errors.push("Current assets > total assets");
  }

  if (item.cash_flow_from_operations > 10000000) {
    errors.push("Cash flow units issue");
  }

  return errors;
};

const autoFix = (item) => {
  if (item.cash_flow_from_operations > 10000000) {
    item.cash_flow_from_operations =
      Math.round(item.cash_flow_from_operations / 1000);
  }

  if (item.current_assets < 10000000) {
    item.current_assets = null;
  }

  return item;
};

/* --------------------------
   API
---------------------------*/

app.post("/analyze", upload.array("files", 10), async (req, res) => {
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

  /*  const response = await openai.responses.create({
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
							}
					`
            },
            ...uploadedFiles.map(id => ({
              type: "input_file",
              file_id: id
            }))
          ]
        }
      ]
    });*/

    // clean JSON
  /* let text = response.output_text;*/
		let text = `{
  "company_name": "شركة الجزيرة للاستيراد والتصدير",
  "financial_year": "2023",
  "commercial_register": "24040",
  "years": ["2023", "2022", "2021"],
  "sales": [4920000, 3520000, 2510000],
  "gross_profit": [1230000, 880000, 630000],
  "net_profit": [1075000, 770000, 530000],
  "total_assets": [1710000, 1190000, 1135000],
  "total_liabilities": [250000, 220000, 200000],
  "total_equity": [1400000, 920000, 885000],
  "current_assets": [1560000, 1010000, 925000],
  "current_liabilities": [250000, 220000, 200000],
  "cash_flow_from_operations": [605000, 740000, -40000],
  "roe": ["92.8%", "85.4%", "85.4%"],
  "roa": ["74.3%", "66.3%", "66.3%"],
  "leverage": ["17.9%", "23.9%", "22.6%"],
  "balance_sheet": {
    "cash": [150000, 130000, 125000],
    "inventories": [1050000, 540000, 470000],
    "accounts_receivable_debtors": [360000, 340000, 330000],
    "cash_collateral": [null, null, null],
    "prepaid_expenses": [null, null, null],
    "others_current_assets": [null, null, null],
    "total_current_assets": [1560000, 1010000, 925000],
    "buildings": [300000, 300000, 300000],
    "intangible_assets": [null, null, null],
    "accumulated_depreciation": [150000, 120000, 90000],
    "lands": [null, null, null],
    "machinery_equipment": [null, null, null],
    "vehicles": [null, null, null],
    "office_furniture": [null, null, null],
    "properties_under_development": [null, null, null],
    "others_fixed_assets": [null, null, null],
    "total_fixed_assets": [150000, 180000, 210000],
    "total_assets_bs": [1710000, 1190000, 1135000],
    "liabilities": [250000, 220000, 200000],
    "bank_overdraft": [null, null, null],
    "accounts_payable": [250000, 220000, 200000],
    "current_portion_term_loan": [null, null, null],
    "accrued_expenses": [null, null, null],
    "advance_payments": [null, null, null],
    "others_current_liabilities": [null, null, null],
    "total_current_liabilities": [250000, 220000, 200000],
    "non_current_portion_term_loan": [null, null, null],
    "notes_payables": [null, null, null],
    "partners_loans": [null, null, null],
    "others_long_term": [null, null, null],
    "total_long_term_liabilities": [null, null, null],
    "owners_equity": [1400000, 920000, 885000],
    "shareholders_current_account": [274000, 99000, 304000],
    "current_year_net_profit_loss": [1075000, 770000, 530000],
    "retained_earnings": [null, null, null],
    "reserves": [null, null, null],
    "legal_reserve": [null, null, null],
    "other_equity": [null, null, null],
    "paid_up_capital": [51000, 51000, 51000],
    "total_equity_bs": [1400000, 920000, 885000],
    "total_liabilities_equity": [1710000, 1190000, 1135000],
    "difference": [0, 0, 0]
  },
  "income_statement": {
    "period": ["12 months", "12 months", "12 months"],
    "year": ["2023", "2022", "2021"],
    "total_sales_revenues": [4920000, 3520000, 2510000],
    "cogs": [3690000, 2640000, 1880000],
    "gross_profit_is": [1230000, 880000, 630000],
    "sga_expenses": [123000, 79000, 70000],
    "depreciation_industrial": [null, null, null],
    "depreciation_administration": [30000, 30000, 30000],
    "interest_revenue": [null, null, null],
    "interest_expenses": [null, null, null],
    "other_expenses": [null, null, null],
    "taxes": [2000, 1000, null],
    "other_revenues": [null, null, null],
    "provisions": [null, null, null],
    "total_expenses": [155000, 110000, 100000],
    "net_profit_loss_is": [1075000, 770000, 530000]
  }
}`;
	console.log(text);
    let clean = text.replace(/```json|```/g, "").trim();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.json(JSON.parse(clean));

  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

/* --------------------------
   RUN
---------------------------*/

app.listen(process.env.PORT, () =>
  console.log("🚀 Server running on port", process.env.PORT)
);
