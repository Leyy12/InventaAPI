"use client";

import React, { useState } from "react";
import { Upload, Download, X, AlertTriangle, CheckCircle, Loader2, FileText } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import Papa from "papaparse";
import { Product } from "@/app/products/page";

// ── Segment badge styling ──────────────────────────────────────────────────────
const segmentStyle = (seg?: string) => {
  switch (seg?.toLowerCase()) {
    case "grocery":  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "pharmacy": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "hardware": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:         return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
};

// ── Flexible column alias map ─────────────────────────────────────────────────
// Maps many common CSV column names → our internal field name
const COLUMN_ALIASES: Record<string, string> = {
  // name
  name: "name", product_name: "name", productname: "name",
  generic_name: "name", genericname: "name", item_name: "name",
  medicine_name: "name", drug_name: "name", item: "name",
  description: "description", // fallback for name if no dedicated column

  // brand
  brand: "brand", brand_name: "brand", brandname: "brand",
  manufacturer: "brand", company: "brand", lab: "brand",

  // segment
  segment: "segment", category_type: "segment", product_type: "segment",
  type: "segment", dept: "segment", department: "segment",

  // category
  category: "category", drug_category: "category", subcategory: "category",
  sub_category: "category", product_category: "category", class: "category",
  therapeutic_class: "category", drug_class: "category",

  // sku / barcode
  sku: "sku", barcode: "sku", item_code: "sku", product_code: "sku",
  code: "sku", item_id: "sku", upc: "sku",

  // price
  price: "price", srp: "price", retail_price: "price", unit_price: "price",
  selling_price: "price", market_price: "price", msrp: "price",

  // size / dosage / form
  size: "size", dosage: "size", unit: "size", packaging: "size",
  form: "size", strength: "size", pack_size: "size", weight: "size",
  volume: "size", net_weight: "size",

  // flavor
  flavor: "flavor", variant: "flavor", formulation: "flavor",

  // expiry
  expiration_date: "expirationDate", expiry: "expirationDate",
  expiry_date: "expirationDate", exp_date: "expirationDate",
  expirationdate: "expirationDate",
};

function mapRow(rawRow: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(rawRow)) {
    const normalKey = rawKey.toLowerCase().replace(/\s+/g, "_");
    const internalKey = COLUMN_ALIASES[normalKey] ?? normalKey;
    // Don't overwrite if already mapped (first occurrence wins)
    if (!(internalKey in mapped)) mapped[internalKey] = rawVal?.trim() ?? "";
  }
  return mapped;
}

// ── Infer segment from filename ────────────────────────────────────────────────
function inferSegmentFromFilename(fname: string): string {
  const f = fname.toLowerCase();
  if (f.includes("pharma") || f.includes("drug") || f.includes("medicine")) return "Pharmacy";
  if (f.includes("grocery") || f.includes("food") || f.includes("supermarket")) return "Grocery";
  if (f.includes("hardware") || f.includes("tools") || f.includes("construction")) return "Hardware";
  return "";
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportCsvModal({
  existingProducts,
  onClose,
  onImported,
}: {
  existingProducts: Product[];
  onClose: () => void;
  onImported: (products: Product[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"new" | "update" | "appended" | "rejected">("new");
  const [defaultSegment, setDefaultSegment] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Core matching ─────────────────────────────────────────────────────────
  function classifyRow(mapped: Record<string, string>, segment: string, price: number | null) {
    const csvSku  = mapped["sku"]  || "";
    const csvName = mapped["name"] || "";

    // Find existing product — SKU first, then name+segment, then name-only
    let match: Product | undefined;

    if (csvSku) {
      match = existingProducts.find(p =>
        p.sku === csvSku || p.variants?.some(v => v.sku === csvSku)
      );
    }
    if (!match && csvName) {
      match = existingProducts.find(p =>
        p.name?.toLowerCase().trim() === csvName.toLowerCase() &&
        p.segment?.toLowerCase() === segment.toLowerCase()
      );
    }
    if (!match && csvName && !csvSku) {
      // Broader: name-only (no segment in CSV)
      match = existingProducts.find(p =>
        p.name?.toLowerCase().trim() === csvName.toLowerCase()
      );
    }

    if (!match) return { status: "new" as const, matchId: null };

    // Found a match — compare every non-empty CSV field against DB
    const pVariant = (match.variants?.[0] || {}) as any;

    const fields: Array<{ csv: string; db: string }> = [
      { csv: (mapped["brand"]    || "").toLowerCase(), db: (match.brand    || "").toLowerCase() },
      { csv: (mapped["category"] || "").toLowerCase(), db: (match.category || "").toLowerCase() },
      { csv: (mapped["size"]     || "").toLowerCase(), db: (pVariant.size   || "").toLowerCase() },
      { csv: (mapped["flavor"]   || "").toLowerCase(), db: (pVariant.flavor || "").toLowerCase() },
    ];

    let hasConflict = false;  // CSV overwriting existing non-empty DB field
    let hasFill     = false;  // CSV filling a field that's empty in DB

    for (const f of fields) {
      if (!f.csv) continue; // CSV doesn't specify this field — skip
      if (f.db && f.db !== f.csv) { hasConflict = true; break; }
      if (!f.db) hasFill = true;
    }

    // Price
    if (price !== null) {
      const dbPrice = pVariant.price ?? null;
      if (dbPrice !== null && Math.abs(Number(dbPrice) - price) > 0.001) hasConflict = true;
      else if (dbPrice === null) hasFill = true;
    }

    if (hasConflict) return { status: "update"    as const, matchId: match.id };
    if (hasFill)     return { status: "appended"  as const, matchId: match.id };
    return             { status: "rejected"  as const, matchId: match.id }; // exact dup
  }

  // ── CSV parsing ───────────────────────────────────────────────────────────
  const parseCSV = (text: string, fname: string) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^"|"$/g, "").trim(), // keep original case for display
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        if (!data.length) {
          setErrors(["CSV is empty or has no data rows."]);
          return;
        }

        // Check if we can resolve "name"
        const sampleMapped = mapRow(data[0]);
        if (!sampleMapped["name"]) {
          // Try to tell user what columns we see so they can fix their file
          const cols = (results.meta.fields || []).join(", ");
          setErrors([
            `Could not find a product name column. Columns detected: "${cols}". ` +
            `Please rename your name column to one of: name, product_name, generic_name, item_name, medicine_name.`
          ]);
          return;
        }

        const guessedSegment = inferSegmentFromFilename(fname);
        const parsed: any[] = [];
        const errs: string[] = [];

        data.forEach((rawRow, i) => {
          const rowNum = i + 2;
          const row = mapRow(rawRow);

          const name = row["name"];
          if (!name) { errs.push(`Row ${rowNum}: missing product name`); return; }

          // Resolve segment: from CSV, or from filename guess, or skip validation
          let segment = row["segment"] || guessedSegment || defaultSegment;
          if (segment) {
            const sl = segment.toLowerCase();
            if (sl.includes("pharm") || sl.includes("drug") || sl.includes("med")) segment = "Pharmacy";
            else if (sl.includes("groc") || sl.includes("food")) segment = "Grocery";
            else if (sl.includes("hard") || sl.includes("tool")) segment = "Hardware";
            else if (!["Grocery","Hardware","Pharmacy"].includes(segment)) segment = "Pharmacy"; // default
          } else {
            segment = "Pharmacy"; // ultimate fallback
          }

          const rawPrice = row["price"] || row["srp"] || "";
          const price = rawPrice ? parseFloat(rawPrice.replace(/[^0-9.]/g, "")) : null;

          const { status, matchId } = classifyRow(row, segment, price);

          parsed.push({
            _row: rowNum,
            _status: status,
            _matchId: matchId,
            name,
            brand:    row["brand"]       || "",
            segment,
            category: row["category"]    || "",
            description: row["description"] || "",
            sku:      row["sku"]         || "",
            status:   "Active" as const,
            is_active: true,
            variants: [{
              flavor:         row["flavor"]          || "",
              size:           row["size"]            || "",
              price:          price !== null && !isNaN(price) ? price : 0,
              sku:            row["sku"]             || "",
              expirationDate: row["expirationDate"]  || "",
            }],
          });
        });

        // Auto-select first tab that has data
        const hasNew      = parsed.some(r => r._status === "new");
        const hasUpdate   = parsed.some(r => r._status === "update");
        const hasAppended = parsed.some(r => r._status === "appended");
        if (hasNew)      setActiveTab("new");
        else if (hasUpdate)   setActiveTab("update");
        else if (hasAppended) setActiveTab("appended");
        else setActiveTab("rejected");

        setErrors(errs);
        setRows(parsed);
      },
    });
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) { setErrors(["Please upload a .csv file."]); return; }
    setFileName(file.name);
    setRows([]);
    setErrors([]);
    setDone(false);
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Firestore write ───────────────────────────────────────────────────────
  const handleImport = async () => {
    const validRows = rows.filter(r => r._status !== "rejected");
    if (!validRows.length) return;
    setImporting(true);
    const created: Product[] = [];
    let newCount = 0, updateCount = 0, appendedCount = 0;

    try {
      for (const row of validRows) {
        const { _row, _status, _matchId, ...payload } = row;
        if ((_status === "update" || _status === "appended") && _matchId) {
          await updateDoc(doc(db, "products", _matchId), { ...payload, updatedAt: serverTimestamp() });
          created.push({ id: _matchId, ...payload } as Product);
          _status === "update" ? updateCount++ : appendedCount++;
        } else {
          const ref = await addDoc(collection(db, "products"), {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          created.push({ id: ref.id, ...payload } as Product);
          newCount++;
        }
      }

      // Audit log
      try {
        await addDoc(collection(db, "auditLogs"), {
          action: "Bulk CSV Import",
          details: `Bulk CSV Import: ${newCount} new, ${updateCount} updated, ${appendedCount} appended, ${rows.length - validRows.length} skipped`,
          timestamp: serverTimestamp(),
          user: "Admin",
        });
      } catch { /* non-critical */ }

      setImportedCount(created.length);
      setDone(true);
      onImported(created);
    } catch (e: any) {
      setErrors(prev => [...prev, `Import failed: ${e.message}`]);
    } finally {
      setImporting(false);
    }
  };

  // ── Template download ─────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const csv = [
      "name,brand,segment,category,size,price,sku,expiration_date,description",
      '"Amoxicillin 500mg","Pharex","Pharmacy","Antibiotics","500mg","18.50","AMX-500","2026-12-31","Broad-spectrum antibiotic"',
      '"Lucky Me Pancit Canton","Monde Nissin","Grocery","Instant Noodles","60g","14.00","LM-PANC-60","","Classic instant noodles"',
      '"Bosny Spray Paint","Bosny","Hardware","Paints","400ml","95.00","BSN-SPR-WHT","","General purpose spray paint"',
    ].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "import_template.csv",
    });
    a.click();
  };

  // ── Tab counts ────────────────────────────────────────────────────────────
  const counts = {
    new:      rows.filter(r => r._status === "new").length,
    appended: rows.filter(r => r._status === "appended").length,
    update:   rows.filter(r => r._status === "update").length,
    rejected: rows.filter(r => r._status === "rejected").length,
  };
  const actionable = counts.new + counts.appended + counts.update;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <Upload className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Import CSV</h2>
              <p className="text-[11px] text-slate-500">Upload a CSV file to add or update products.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Template
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {done ? (
            /* Success */
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Import Complete!</h3>
              <p className="text-sm text-slate-400">
                Successfully processed{" "}
                <span className="text-emerald-400 font-semibold">{importedCount} products</span>.
              </p>
              <button onClick={onClose} className="mt-6 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* File area */}
              {!fileName ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-all ${dragging ? "border-indigo-400 bg-indigo-500/8" : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/30"}`}
                >
                  <input ref={inputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-300">Drag &amp; drop your CSV here</p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse · .csv files only</p>
                    <p className="text-[10px] text-slate-600 mt-2">Supports flexible column names (product_name, generic_name, srp, barcode, etc.)</p>
                  </div>
                </div>
              ) : (
                /* File row once loaded */
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{fileName}</p>
                      <p className="text-[10px] text-slate-500">{rows.length} rows parsed</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFileName(""); setRows([]); setErrors([]); inputRef.current?.click(); }}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Change File
                  </button>
                  <input ref={inputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              )}

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="rounded-xl bg-red-500/8 border border-red-500/25 p-4">
                  <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {errors.length} validation error{errors.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {errors.map((e, i) => <p key={i} className="text-[11px] text-red-300/80 font-mono">{e}</p>)}
                  </div>
                </div>
              )}

              {/* Preview tabs + table */}
              {rows.length > 0 && (
                <div className="flex flex-col gap-3">

                  {/* Segmented tabs */}
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-800/50 border border-slate-700/60">
                    {([
                      { key: "new",      label: "New",      count: counts.new,      active: "bg-emerald-900/50 text-emerald-400 border-emerald-500/30" },
                      { key: "appended", label: "Appended", count: counts.appended, active: "bg-blue-900/50 text-blue-400 border-blue-500/30" },
                      { key: "update",   label: "Updates",  count: counts.update,   active: "bg-amber-900/50 text-amber-400 border-amber-500/30" },
                      { key: "rejected", label: "Skipped",  count: counts.rejected, active: "bg-slate-700/70 text-slate-300 border-slate-600" },
                    ] as const).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex flex-col items-center py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                          activeTab === tab.key ? tab.active : "border-transparent text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <span className="text-lg font-bold leading-none mb-0.5">{tab.count}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Preview table */}
                  <div className="rounded-xl border border-slate-700/60 overflow-hidden bg-slate-900/30" style={{ minHeight: 200 }}>
                    {rows.filter(r => r._status === activeTab).length === 0 ? (
                      <div className="flex h-48 items-center justify-center">
                        <p className="text-sm text-slate-500">
                          No {activeTab === "rejected" ? "skipped" : activeTab} products in this file.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800/80 sticky top-0 z-10">
                            <tr>
                              {["#","Name","Brand","Segment","Category","Size","Price","SKU"].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {rows.filter(r => r._status === activeTab).map((row, i) => (
                              <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-3 py-2 text-slate-600 font-mono">{row._row}</td>
                                <td className="px-3 py-2 text-slate-200 font-medium max-w-[180px] truncate">{row.name}</td>
                                <td className="px-3 py-2 text-slate-400 max-w-[100px] truncate">{row.brand || "—"}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${segmentStyle(row.segment)}`}>
                                    {row.segment}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate">{row.category || "—"}</td>
                                <td className="px-3 py-2 text-slate-400 font-mono">{row.variants?.[0]?.size || "—"}</td>
                                <td className="px-3 py-2 text-emerald-400 font-bold whitespace-nowrap">
                                  {row.variants?.[0]?.price ? `₱${Number(row.variants[0].price).toFixed(2)}` : "—"}
                                </td>
                                <td className="px-3 py-2 text-slate-500 font-mono max-w-[100px] truncate">{row.sku || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!done && (
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
            <p className="text-[11px] text-slate-600">
              {rows.length > 0
                ? `${actionable} rows will be written · ${counts.rejected} skipped`
                : "Upload a CSV to preview and confirm"}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || actionable === 0}
                className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
              >
                {importing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                  : <><Upload className="w-3.5 h-3.5" /> Confirm Import</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
