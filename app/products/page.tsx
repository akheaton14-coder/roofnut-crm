"use client";
import { useEffect, useMemo, useState } from "react";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";
import { formulaTokens, normalizeFormulaTokens } from "@/lib/formula";

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  product_type: "material" | "labor";
  unit: string;
  cost: number;
  cost_tax_rate: number;
  profit_margin: number;
  unit_price: number;
  taxable: boolean;
  active: boolean;
  quantity_formula: string | null;
  quantity_rounding: "ceil" | "round" | "floor" | "none";
};
type Unit = { id?: string; value: string; label: string };
type MeasurementField = { id: string; name: string; token: string; unit: string; field_group: string };
const categories = ["Roofing", "Vinyl", "Hardie", "Gutters", "Misc."];
const builtInUnits: Unit[] = [
  { value: "each", label: "Each" },
  { value: "sq", label: "Square" },
  { value: "lf", label: "Linear foot" },
  { value: "sf", label: "Square foot" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "allowance", label: "Allowance" },
];
const blank: Partial<Product> = {
  name: "",
  description: "",
  category: "Roofing",
  product_type: "material",
  unit: "each",
  cost: 0,
  cost_tax_rate: 7.5,
  profit_margin: 45,
  unit_price: 0,
  taxable: false,
  active: true,
  quantity_formula: null,
  quantity_rounding: "ceil",
};
const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function pricing(product: Partial<Product>) {
  const cost = Math.max(0, Number(product.cost || 0)),
    taxRate =
      product.product_type === "labor"
        ? 0
        : Math.max(0, Number(product.cost_tax_rate || 0)),
    tax = (cost * taxRate) / 100,
    costWithTax = cost + tax,
    margin = Math.min(95, Math.max(0, Number(product.profit_margin || 0))),
    price = margin >= 100 ? costWithTax : costWithTax / (1 - margin / 100);
  return {
    cost,
    tax,
    costWithTax,
    margin,
    profit: Math.max(0, price - costWithTax),
    price,
  };
}

export default function ProductsPage() {
  const { supabase, organizationId, loading, userName } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]),
    [customUnits, setCustomUnits] = useState<Unit[]>([]),
    [measurementFields, setMeasurementFields] = useState<MeasurementField[]>([]),
    [editing, setEditing] = useState<Partial<Product> | null>(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [ready, setReady] = useState(true),
    [manageUnits, setManageUnits] = useState(false),
    [unitLabel, setUnitLabel] = useState("");
  async function load() {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,name,description,category,product_type,unit,cost,cost_tax_rate,profit_margin,unit_price,taxable,active,quantity_formula,quantity_rounding",
      )
      .eq("organization_id", organizationId)
      .order("category")
      .order("name");
    if (error) setReady(false);
    else {
      setReady(true);
      setProducts((data || []) as Product[]);
    }
    const { data: units } = await supabase
      .from("product_units")
      .select("id,value,label")
      .eq("organization_id", organizationId)
      .order("label");
    setCustomUnits((units || []) as Unit[]);
    const { data: measurementData } = await supabase
      .from("measurement_fields")
      .select("id,name,token,unit,field_group")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("field_group")
      .order("position");
    setMeasurementFields((measurementData || []) as MeasurementField[]);
  }
  useEffect(() => {
    load();
  }, [organizationId]);
  const visible = products.filter(
      (p) =>
        (category === "All" || p.category === category) &&
        `${p.name} ${p.description || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    breakdown = pricing(editing || {});
  async function save() {
    if (!editing?.name?.trim() || !organizationId) return;
    const calculated = pricing(editing),
      payload = {
        name: editing.name.trim(),
        description: editing.description || null,
        category: editing.category || "Roofing",
        product_type: editing.product_type || "material",
        unit: editing.unit || "each",
        cost: calculated.cost,
        cost_tax_rate:
          editing.product_type === "labor"
            ? 0
            : Number(editing.cost_tax_rate || 0),
        profit_margin: calculated.margin,
        unit_price: Number(calculated.price.toFixed(2)),
        taxable: false,
        active: editing.active !== false,
        quantity_formula: editing.quantity_formula?.trim() || null,
        quantity_rounding: editing.quantity_rounding || "ceil",
        organization_id: organizationId,
      };
    if (editing.id)
      await supabase.from("products").update(payload).eq("id", editing.id);
    else await supabase.from("products").insert(payload);
    setEditing(null);
    await load();
  }
  async function archive(product: Product) {
    await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);
    await load();
  }
  async function addUnit() {
    const label = unitLabel.trim();
    if (!label || !organizationId) return;
    const value = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const { data, error } = await supabase
      .from("product_units")
      .insert({ organization_id: organizationId, value, label })
      .select("id,value,label")
      .single();
    if (error) {
      alert("Run the newest Product Units migration in Supabase first.");
      return;
    }
    setCustomUnits((current) => [...current, data as Unit]);
    setEditing((current) => (current ? { ...current, unit: value } : current));
    setUnitLabel("");
    setManageUnits(false);
  }
  async function removeUnit(unit: Unit) {
    if (!unit.id) return;
    if (products.some((product) => product.unit === unit.value)) {
      alert("This unit is being used by a product and cannot be deleted yet.");
      return;
    }
    await supabase.from("product_units").delete().eq("id", unit.id);
    setCustomUnits((current) => current.filter((item) => item.id !== unit.id));
  }
  if (loading)
    return (
      <main className="auth-loading">
        <span>R</span>
      </main>
    );
  return (
    <CrmShell userName={userName}>
      <div className="content directory product-directory">
        <div className="directory-head">
          <div>
            <p className="eyebrow">ESTIMATING</p>
            <h1>Product catalog</h1>
            <p>
              Your reusable materials, labor, roofing systems, and upgrades.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => setEditing({ ...blank })}
          >
            ＋ New product
          </button>
        </div>
        {!ready && (
          <div className="workflow-warning">
            <b>Activate product costing</b>
            <span>
              Run the newest Product Costing migration in Supabase, then refresh
              this page.
            </span>
          </div>
        )}
        <div className="catalog-tools">
          <div className="catalog-search">
            ⌕{" "}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products and descriptions…"
            />
          </div>
          <div className="catalog-filters">
            {["All", ...categories].map((item) => (
              <button
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <section className="catalog-grid">
          {visible.map((product) => (
            <article
              className={!product.active ? "archived" : ""}
              key={product.id}
            >
              <div className="catalog-card-top">
                <span>
                  {product.category} · {product.product_type}
                </span>
                {!product.active && <em>Archived</em>}
              </div>
              <h3>{product.name}</h3>
              <p>{product.description || "No description yet."}</p>
              <div className="catalog-cost-line">
                <span>Cost ${money(product.cost)}</span>
                <span>{product.quantity_formula ? "⌗ Calculated quantity" : `${product.profit_margin}% margin`}</span>
              </div>
              <div className="catalog-price">
                <b>${money(product.unit_price)}</b>
                <span>/ {product.unit}</span>
              </div>
              <footer>
                <span>Final selling price</span>
                <div>
                  <button onClick={() => setEditing(product)}>Edit</button>
                  <button onClick={() => archive(product)}>
                    {product.active ? "Archive" : "Restore"}
                  </button>
                </div>
              </footer>
            </article>
          ))}
          {!visible.length && (
            <div className="catalog-empty">
              <b>No products found.</b>
              <span>
                Add your first roofing material, labor item, or upgrade.
              </span>
            </div>
          )}
        </section>
      </div>
      {editing && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <section className="modal product-modal costing-modal">
            <button className="modal-close" onClick={() => setEditing(null)}>
              ×
            </button>
            <p className="eyebrow">
              {editing.id ? "EDIT PRODUCT" : "NEW PRODUCT"}
            </p>
            <h2>
              {editing.id
                ? "Update catalog item."
                : "Build your selling price."}
            </h2>
            <div className="product-cost-layout">
              <div className="form-grid">
                <label className="wide">
                  Product or service name
                  <input
                    autoFocus
                    value={editing.name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    value={editing.category || "Roofing"}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value })
                    }
                  >
                    {categories.map((item) => (
                      <option value={item} key={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={editing.product_type || "material"}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        product_type: e.target.value as "material" | "labor",
                        cost_tax_rate: e.target.value === "labor" ? 0 : 7.5,
                      })
                    }
                  >
                    <option value="material">Material</option>
                    <option value="labor">Labor</option>
                  </select>
                </label>
                <label>
                  Unit
                  <select
                    value={editing.unit || "each"}
                    onChange={(e) => {
                      if (e.target.value === "__manage__") setManageUnits(true);
                      else setEditing({ ...editing, unit: e.target.value });
                    }}
                  >
                    {[...builtInUnits, ...customUnits].map((unit) => (
                      <option value={unit.value} key={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="__manage__">＋ Manage units…</option>
                  </select>
                </label>
                <label>
                  Base cost
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editing.cost || ""}
                    placeholder="Enter base cost"
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        cost:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Cost tax %
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    disabled={editing.product_type === "labor"}
                    value={
                      editing.product_type === "labor"
                        ? ""
                        : editing.cost_tax_rate || ""
                    }
                    placeholder={
                      editing.product_type === "labor" ? "No tax" : "Enter tax %"
                    }
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        cost_tax_rate:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Profit margin %
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="95"
                    step="1"
                    value={editing.profit_margin || ""}
                    placeholder="Enter margin %"
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        profit_margin:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="wide">
                  Description
                  <textarea
                    value={editing.description || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                    placeholder="Scope, material details, warranty, or customer-facing description…"
                  />
                </label>
                <div className="wide product-calculation-editor">
                  <div className="calculation-heading">
                    <div><b>Quantity calculation</b><span>Optional · uses job measurements</span></div>
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setEditing({
                          ...editing,
                          quantity_formula: `${editing.quantity_formula || ""}${editing.quantity_formula ? " " : ""}{{${e.target.value}}}`,
                        });
                      }}
                    >
                      <option value="">＋ Insert measurement token…</option>
                      {measurementFields.map((field) => (
                        <option value={field.token} key={field.id}>{field.name} ({field.unit})</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={editing.quantity_formula || ""}
                    onChange={(e) => setEditing({ ...editing, quantity_formula: e.target.value })}
                    onPaste={(e) => {
                      e.preventDefault();
                      setEditing({
                        ...editing,
                        quantity_formula: normalizeFormulaTokens(
                          e.clipboardData.getData("text"),
                          measurementFields,
                        ),
                      });
                    }}
                    onBlur={(e) =>
                      setEditing({
                        ...editing,
                        quantity_formula: normalizeFormulaTokens(
                          e.target.value,
                          measurementFields,
                        ),
                      })
                    }
                    placeholder="Example: (({{TOTAL_ROOF_AREA}} * (1 + {{WASTE_PERCENTAGE}})) / 100) * 3"
                  />
                  <div className="calculation-options">
                    <label>Round result<select value={editing.quantity_rounding || "ceil"} onChange={(e) => setEditing({ ...editing, quantity_rounding: e.target.value as Product["quantity_rounding"] })}><option value="ceil">Round up</option><option value="round">Round normally</option><option value="floor">Round down</option><option value="none">Keep decimals</option></select></label>
                    <div><b>Measurements used</b><p>{formulaTokens(editing.quantity_formula || "").map(token => measurementFields.find(field => field.token === token)?.name || token).join(" · ") || "No calculation—estimate quantity will be entered manually."}</p></div>
                  </div>
                  <small>Paste JobNimbus formulas normally—measurement names are converted into tokens automatically. Percent measurements are automatically converted, so 10% is used as 0.10.</small>
                </div>
              </div>
              <aside className="pricing-breakdown">
                <p>PRICING BREAKDOWN</p>
                <div>
                  <span>Base cost</span>
                  <b>${money(breakdown.cost)}</b>
                </div>
                <div>
                  <span>
                    {editing.product_type === "labor"
                      ? "Cost tax (labor)"
                      : `Cost tax (${Number(editing.cost_tax_rate || 0)}%)`}
                  </span>
                  <b>+ ${money(breakdown.tax)}</b>
                </div>
                <div className="cost-total">
                  <span>Cost after tax</span>
                  <b>${money(breakdown.costWithTax)}</b>
                </div>
                <div>
                  <span>Profit at {breakdown.margin}% margin</span>
                  <b>+ ${money(breakdown.profit)}</b>
                </div>
                <div className="selling-total">
                  <span>Final selling price</span>
                  <b>${money(breakdown.price)}</b>
                </div>
                <small>
                  True margin means profit is {breakdown.margin}% of the final
                  selling price.
                </small>
              </aside>
            </div>
            <div className="modal-actions">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="primary-button"
                disabled={!editing.name?.trim()}
                onClick={save}
              >
                Save product at ${money(breakdown.price)} →
              </button>
            </div>
          </section>
        </div>
      )}
      {manageUnits && (
        <div className="modal-backdrop unit-manager-backdrop">
          <section className="modal unit-manager">
            <button
              className="modal-close"
              onClick={() => setManageUnits(false)}
            >
              ×
            </button>
            <p className="eyebrow">CATALOG SETTINGS</p>
            <h2>Manage units.</h2>
            <p>
              Add any unit your company uses. It will appear in every product
              dropdown.
            </p>
            <div className="unit-compose">
              <input
                autoFocus
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUnit()}
                placeholder="Example: Bundle, Roll, Sheet…"
              />
              <button
                className="primary-button"
                disabled={!unitLabel.trim()}
                onClick={addUnit}
              >
                ＋ Add unit
              </button>
            </div>
            <div className="unit-list">
              <p>BUILT IN</p>
              {builtInUnits.map((unit) => (
                <div key={unit.value}>
                  <span>{unit.label}</span>
                  <small>{unit.value}</small>
                  <em>Default</em>
                </div>
              ))}
              {!!customUnits.length && <p>CUSTOM</p>}
              {customUnits.map((unit) => (
                <div key={unit.value}>
                  <span>{unit.label}</span>
                  <small>{unit.value}</small>
                  <button onClick={() => removeUnit(unit)}>Delete</button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="primary-button"
                onClick={() => setManageUnits(false)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </CrmShell>
  );
}
