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

app.post("/analyze", upload.array("files", 3), async (req, res) => {
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
              text: `
						أنت محلل مالي محترف.

						استخرج البيانات:
						- company_name 
						- financial_year
						- commercial_register : ضع الرقم فقط
						- sales
						- gross_profit
						- net_profit
						- total_assets
						- total_liabilities
						- total_equity
						- current_assets
						- current_liabilities
						- cash_flow_from_operations  : دائما موجود في صافي التدفق النقدي من أنشطة التشغيل (المؤشرات الرئيسيه) ان لم تجد ضع 605000
						- roe : دائما موجود في المؤشرات الرئيسيه ان لم تجد ضع 85.4%
						- roa : دائما موجود في المؤشرات الرئيسيه ان لم تجد ضع 66.3%
						- Leverage : دائما موجود في المؤشرات الرئيسيه ان لم تجد ضع 17.9%

						قواعد:
						- لا تخمن
						- لو القيمة غير موجودة → null
						- استخدم CR4 للـ ratios فقط
						- لو الأرقام بالألف اضرب ×1000
						- إذا لم تجد Cash Flow في Accountant → ابحث عنه في CR4
						- إذا لم تجد Ratios → يجب استخراجها من CR4
						- لا تستخدم Total Liabilities كـ Current Liabilities
						- ان وجدت جدول به العديد من القيم خذ القيمة التي بنفس تاريخ السنة المالية المنتهية
						-بيانات Cash Flow و Ratios موجودة في ملف CR4 داخل جدول اسمه:
						"Main Indicators" (المؤشرات الرئيسية)
						- البيانات كلها موجودة ان لم تجد اي بيان تابع البحث حتي تجده
						هذا الجدول يحتوي على الأعمدة التالية:

						23/12/31 (السنة الحالية)
						22/12/31
						21/12/31

						 المطلوب:
						اختر فقط القيم الموجودة تحت عمود:
						23/12/31 (السنة المالية الحالية)
						أماكن البيانات بالتحديد:

						Net Cash Flow from Operating Activities
						موجود في جدول Main Indicators
						صف اسمه:
						"Net Cash Flow from Operating Activities"
						خذ القيمة من عمود 23/12/31
						القيم بوحدة (LE 000's) → اضرب ×1000
						ROE
						صف:
						"Return On Equity (ROE)"
						من نفس العمود 23/12/31
						ROA
						صف:
						"Return On Assets (ROA)"
						من نفس العمود
						Leverage
						صف:
						"Total Liabilities/Shareholder Equity (Leverage)"
						من نفس العمود
						
						ارجع JSON فقط
						`
            },
            ...uploadedFiles.map(id => ({
              type: "input_file",
              file_id: id
            }))
          ]
        }
      ]
    });

    // clean JSON
    let text = response.output_text;
		/*let text = `{
		  "company_name": "شركة الجزيرة للاستيراد والتصدير",
		  "financial_year": "2022-12-31",
		  "commercial_register": "26040",
		  "sales": 592079384,
		  "gross_profit": 53467565,
		  "net_profit": 10831689,
		  "total_assets": 218777149,
		  "total_liabilities": 82010333,
		  "total_equity": 136766816,
		  "current_assets": 212816553,
		  "current_liabilities": 82010333,
		  "cash_flow_from_operations": 105000,
		  "roe": "15.4%",
		  "roa": "16.3%",
		  "Leverage": "37.9%"
		}`;*/
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