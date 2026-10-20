/**
 * Chuyển đổi linh hoạt chuỗi ngày tháng (hỗ trợ ISO YYYY-MM-DD, chuẩn VN/Excel DD/MM/YYYY, DD-MM-YYYY)
 */
export function parseDateFlexible(dateStr) {
  if (!dateStr || !String(dateStr).trim()) return new Date();
  const trimmed = String(dateStr).trim();

  // 1. Định dạng ISO: YYYY-MM-DD hoặc YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const [, year, month, day, h = 0, m = 0, s = 0] = isoMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(s));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 2. Định dạng ngày tháng VN / Excel: DD/MM/YYYY hoặc DD-MM-YYYY
  const vnMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (vnMatch) {
    const [, day, month, year, h = 0, m = 0, s = 0] = vnMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(s));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 3. Fallback standard Date constructor
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? new Date(NaN) : fallback;
}

/**
 * Chuyển đổi số linh hoạt (hỗ trợ cả dấu thập phân phẩy của Excel VN như 100,5 hoặc chấm 100.5)
 */
export function parseNumberFlexible(val) {
  if (val === undefined || val === null || val === "") return NaN;
  let str = String(val).trim();
  if (str.includes(",") && str.includes(".")) {
    if (str.indexOf(",") < str.indexOf(".")) {
      str = str.replace(/,/g, "");
    } else {
      str = str.replace(/\./g, "").replace(",", ".");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  return Number(str);
}

/**
 * Phân tích tệp CSV hỗ trợ chuẩn RFC 4180, Excel sep= directive, UTF-8 BOM, dấu phẩy và chấm phẩy
 */
export function parseCsv(text) {
  let input = String(text || "").replace(/^\uFEFF/, "").trimStart();
  let delimiter = ",";

  // Kiểm tra chỉ lệnh sep=, hoặc sep=; đặc thù của Microsoft Excel
  const sepMatch = input.match(/^sep=([,;\t|])(?:\r?\n|$)/i);
  if (sepMatch) {
    delimiter = sepMatch[1];
    input = input.slice(sepMatch[0].length);
  } else {
    // Tự động nhận diện dấu phân cách nếu không có sep=
    const firstLine = input.split(/\r?\n/)[0] || "";
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    if (semicolonCount > commaCount && semicolonCount >= 1) {
      delimiter = ";";
    } else if (tabCount > commaCount && tabCount >= 1) {
      delimiter = "\t";
    }
  }

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV có dấu ngoặc kép chưa đóng.");
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => value.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV có tên cột bị trùng.");
  }
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`Dòng ${index + 2} có số cột không khớp với header.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

