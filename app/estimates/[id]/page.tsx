"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";
import { calculateFormula, formulaTokens, FormulaMeasurement } from "@/lib/formula";

type Estimate = {
  id: string;
  title: string;
  estimate_number: number;
  status: string;
  notes: string | null;
  discount_amount: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  jobs: {
    id: string;
    title: string;
    clients: {
      first_name: string;
      last_name: string;
      email: string | null;
    } | null;
    properties: {
      address_1: string;
      city: string;
      state: string;
      postal_code: string;
    } | null;
  } | null;
};
type Item = {
  id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  taxable: boolean;
  position: number;
  quantity_source: "manual" | "calculated" | "override";
  calculation_formula: string | null;
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unit_price: number;
  taxable: boolean;
  quantity_formula: string | null;
  quantity_rounding: "ceil" | "round" | "floor" | "none";
};

export default function EstimateEditor() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter(),
    { supabase, organizationId, loading, userName } = useWorkspace();
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [items, setItems] = useState<Item[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [measurements, setMeasurements] = useState<FormulaMeasurement[]>([]),
    [saving, setSaving] = useState(false),
    [recalculating, setRecalculating] = useState(false),
    [showCatalog, setShowCatalog] = useState(false),
    [catalogQuery, setCatalogQuery] = useState("");
  async function load() {
    const [{ data: e }, { data: i }, { data: p }] = await Promise.all([
      supabase
        .from("estimates")
        .select(
          "id,title,estimate_number,status,notes,discount_amount,tax_rate,subtotal,tax_amount,total,jobs(id,title,clients(first_name,last_name,email),properties(address_1,city,state,postal_code))",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("estimate_items")
        .select(
          "id,product_id,name,description,quantity,unit,unit_price,taxable,position,quantity_source,calculation_formula",
        )
        .eq("estimate_id", id)
        .order("position"),
      supabase
        .from("products")
        .select("id,name,description,category,unit,unit_price,taxable,quantity_formula,quantity_rounding")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("category")
        .order("name"),
    ]);
    const loadedEstimate=e as unknown as Estimate;
    setEstimate(loadedEstimate);
    setItems((i || []) as Item[]);
    setProducts((p || []) as Product[]);
    if(loadedEstimate?.jobs?.id){
      const [{data:fields},{data:values}]=await Promise.all([
        supabase.from("measurement_fields").select("id,token,unit").eq("organization_id",organizationId).eq("active",true),
        supabase.from("job_measurements").select("measurement_field_id,value").eq("job_id",loadedEstimate.jobs.id),
      ]);
      const valueMap=new Map((values||[]).map(row=>[row.measurement_field_id,Number(row.value)]));
      setMeasurements((fields||[]).map(field=>({token:field.token,unit:field.unit,value:valueMap.get(field.id)||0})));
    }
  }
  useEffect(() => {
    if (organizationId) load();
  }, [organizationId]);
  const calculated = useMemo(() => {
    const subtotal = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0,
      ),
      taxable = items
        .filter((i) => i.taxable)
        .reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
          0,
        ),
      tax = (taxable * Number(estimate?.tax_rate || 0)) / 100,
      total =
        Math.max(0, subtotal - Number(estimate?.discount_amount || 0)) + tax;
    return { subtotal, tax, total };
  }, [items, estimate?.discount_amount, estimate?.tax_rate]);
  const catalogGroups = useMemo(() => {
    const filtered = products.filter((p) =>
      `${p.name} ${p.description || ""} ${p.category}`
        .toLowerCase()
        .includes(catalogQuery.toLowerCase()),
    );
    return Array.from(new Set(filtered.map((p) => p.category))).map(
      (category) => ({
        category,
        products: filtered.filter((p) => p.category === category),
      }),
    );
  }, [products, catalogQuery]);
  async function addItem() {
    if (!estimate) return;
    const { data } = await supabase
      .from("estimate_items")
      .insert({
        organization_id: organizationId,
        estimate_id: id,
        name: "New line item",
        quantity: 1,
        unit: "each",
        unit_price: 0,
        position: items.length,
      })
      .select(
        "id,product_id,name,description,quantity,unit,unit_price,taxable,position,quantity_source,calculation_formula",
      )
      .single();
    if (data) setItems((c) => [...c, data as Item]);
  }
  async function addProduct(product: Product) {
    let quantity=1,quantitySource:"manual"|"calculated"="manual";
    if(product.quantity_formula){
      try{quantity=calculateFormula(product.quantity_formula,measurements,product.quantity_rounding);quantitySource="calculated"}catch(error){alert(error instanceof Error?error.message:"This product formula could not be calculated.");return}
    }
    const { data } = await supabase
      .from("estimate_items")
      .insert({
        organization_id: organizationId,
        estimate_id: id,
        product_id: product.id,
        name: product.name,
        description: product.description,
        quantity,
        unit: product.unit,
        unit_price: product.unit_price,
        taxable: product.taxable,
        position: items.length,
        quantity_source: quantitySource,
        calculation_formula: product.quantity_formula,
        calculation_inputs: Object.fromEntries(measurements.map(item=>[item.token,item.value])),
      })
      .select(
        "id,product_id,name,description,quantity,unit,unit_price,taxable,position,quantity_source,calculation_formula",
      )
      .single();
    if (data) setItems((c) => [...c, data as Item]);
    setShowCatalog(false);
  }
  async function updateItem(item: Item, patch: Partial<Item>) {
    setItems((c) => c.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    await supabase.from("estimate_items").update(patch).eq("id", item.id);
  }
  async function removeItem(item: Item) {
    setItems((c) => c.filter((i) => i.id !== item.id));
    await supabase.from("estimate_items").delete().eq("id", item.id);
  }
  async function saveEstimate(patch: Partial<Estimate>) {
    if (!estimate) return;
    const next = { ...estimate, ...patch },
      subtotal = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0,
      ),
      taxable = items
        .filter((i) => i.taxable)
        .reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
          0,
        ),
      tax = (taxable * Number(next.tax_rate || 0)) / 100,
      total = Math.max(0, subtotal - Number(next.discount_amount || 0)) + tax;
    setEstimate({ ...next, subtotal, tax_amount: tax, total });
    await supabase
      .from("estimates")
      .update({ ...patch, subtotal, tax_amount: tax, total })
      .eq("id", id);
  }
  async function setStatus(status: string) {
    setSaving(true);
    await saveEstimate({});
    await supabase.from("estimates").update({ status }).eq("id", id);
    await load();
    setSaving(false);
  }
  async function recalculateQuantities() {
    setRecalculating(true);
    const productMap = new Map(products.map((product) => [product.id, product]));
    try {
      const changed = await Promise.all(
        items
          .filter(
            (item) =>
              item.calculation_formula && item.quantity_source !== "override",
          )
          .map(async (item) => {
            const product = item.product_id
              ? productMap.get(item.product_id)
              : undefined;
            const quantity = calculateFormula(
              item.calculation_formula || "",
              measurements,
              product?.quantity_rounding || "ceil",
            );
            const { error } = await supabase
              .from("estimate_items")
              .update({
                quantity,
                quantity_source: "calculated",
                calculation_inputs: Object.fromEntries(
                  measurements.map((value) => [value.token, value.value]),
                ),
              })
              .eq("id", item.id);
            if (error) throw error;
            return { id: item.id, quantity };
          }),
      );
      const changedMap = new Map(changed.map((row) => [row.id, row.quantity]));
      setItems((current) =>
        current.map((item) =>
          changedMap.has(item.id)
            ? {
                ...item,
                quantity: changedMap.get(item.id) || 0,
                quantity_source: "calculated",
              }
            : item,
        ),
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "The quantities could not be recalculated.",
      );
    } finally {
      setRecalculating(false);
    }
  }
  const calculatedItems = items.filter(
    (item) => item.calculation_formula && item.quantity_source !== "override",
  );
  const missingMeasurementTokens = Array.from(
    new Set(
      calculatedItems.flatMap((item) =>
        formulaTokens(item.calculation_formula || ""),
      ),
    ),
  ).filter(
    (token) =>
      !measurements.some(
        (measurement) =>
          measurement.token === token && Number(measurement.value) !== 0,
      ),
  );
  if (loading || !estimate)
    return (
      <main className="auth-loading">
        <span>R</span>
      </main>
    );
  return (
    <CrmShell userName={userName}>
      <div className="content estimate-editor">
        <div className="estimate-head">
          <button onClick={() => router.push("/estimates")}>
            ← All estimates
          </button>
          <div>
            <p className="eyebrow">ESTIMATE #{estimate.estimate_number}</p>
            <input
              value={estimate.title}
              onChange={(e) =>
                setEstimate({ ...estimate, title: e.target.value })
              }
              onBlur={(e) => saveEstimate({ title: e.target.value })}
            />
            <p>
              {estimate.jobs?.title} · {estimate.jobs?.clients?.first_name}{" "}
              {estimate.jobs?.clients?.last_name}
            </p>
          </div>
          <div>
            <span className={`estimate-status ${estimate.status}`}>
              {estimate.status}
            </span>
            <select
              value={estimate.status}
              disabled={saving}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>
        <div className="estimate-layout">
          <section className="panel estimate-sheet">
            <div className="proposal-brand">
              <div>
                <b>ROOFNUT</b>
                <span>PROPOSAL</span>
              </div>
              <p>
                {estimate.jobs?.clients?.first_name}{" "}
                {estimate.jobs?.clients?.last_name}
                <br />
                {estimate.jobs?.properties?.address_1}
                <br />
                {estimate.jobs?.properties?.city},{" "}
                {estimate.jobs?.properties?.state}{" "}
                {estimate.jobs?.properties?.postal_code}
              </p>
            </div>
            <div className="estimate-table-head">
              <span>Product / service</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Price</span>
              <span>Total</span>
              <span></span>
            </div>
            {items.map((item) => (
              <div className="estimate-item" key={item.id}>
                <div>
                  {item.product_id && (
                    <small className="catalog-linked">▤ Catalog item</small>
                  )}
                  {item.quantity_source === "calculated" && (
                    <small className="calculated-quantity">⌗ Quantity calculated from job measurements</small>
                  )}
                  {item.quantity_source === "override" && (
                    <small className="overridden-quantity">✎ Calculated quantity manually changed</small>
                  )}
                  <input
                    value={item.name}
                    onChange={(e) =>
                      setItems((c) =>
                        c.map((i) =>
                          i.id === item.id ? { ...i, name: e.target.value } : i,
                        ),
                      )
                    }
                    onBlur={(e) => updateItem(item, { name: e.target.value })}
                  />
                  <textarea
                    value={item.description || ""}
                    placeholder="Description (optional)"
                    onChange={(e) =>
                      setItems((c) =>
                        c.map((i) =>
                          i.id === item.id
                            ? { ...i, description: e.target.value }
                            : i,
                        ),
                      )
                    }
                    onBlur={(e) =>
                      updateItem(item, { description: e.target.value })
                    }
                  />
                </div>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item, { quantity: Number(e.target.value), quantity_source: item.calculation_formula ? "override" : "manual" })
                  }
                />
                <input
                  value={item.unit}
                  onChange={(e) =>
                    setItems((c) =>
                      c.map((i) =>
                        i.id === item.id ? { ...i, unit: e.target.value } : i,
                      ),
                    )
                  }
                  onBlur={(e) => updateItem(item, { unit: e.target.value })}
                />
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) =>
                    updateItem(item, { unit_price: Number(e.target.value) })
                  }
                />
                <b>
                  $
                  {(
                    Number(item.quantity) * Number(item.unit_price)
                  ).toLocaleString()}
                </b>
                <button onClick={() => removeItem(item)}>×</button>
              </div>
            ))}
            <div className="estimate-add-actions">
              <button
                className="add-from-catalog"
                onClick={() => setShowCatalog(true)}
              >
                ▤ Add from product catalog
              </button>
              <button className="add-line" onClick={addItem}>
                ＋ Blank line item
              </button>
            </div>
            <textarea
              className="estimate-notes"
              value={estimate.notes || ""}
              placeholder="Proposal notes, scope, warranty, and terms…"
              onChange={(e) =>
                setEstimate({ ...estimate, notes: e.target.value })
              }
              onBlur={(e) => saveEstimate({ notes: e.target.value })}
            />
          </section>
          <aside className="panel estimate-summary">
            <h3>Estimate summary</h3>
            <label>
              Discount
              <input
                type="number"
                value={estimate.discount_amount}
                onChange={(e) =>
                  saveEstimate({ discount_amount: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Tax rate %
              <input
                type="number"
                value={estimate.tax_rate}
                onChange={(e) =>
                  saveEstimate({ tax_rate: Number(e.target.value) })
                }
              />
            </label>
            <div>
              <span>Subtotal</span>
              <b>${calculated.subtotal.toLocaleString()}</b>
            </div>
            <div>
              <span>Tax</span>
              <b>${calculated.tax.toLocaleString()}</b>
            </div>
            <div className="grand-total">
              <span>Total</span>
              <b>${calculated.total.toLocaleString()}</b>
            </div>
            {!!calculatedItems.length && (
              <div className="estimate-recalculate">
                <b>⌗ Measurement calculations</b>
                {missingMeasurementTokens.length ? (
                  <p>
                    These measurements are blank or zero: {" "}
                    {missingMeasurementTokens.join(", ")}
                  </p>
                ) : (
                  <p>Job measurements are ready to calculate.</p>
                )}
                <button
                  type="button"
                  disabled={recalculating}
                  onClick={recalculateQuantities}
                >
                  {recalculating ? "Calculating…" : "↻ Recalculate quantities"}
                </button>
                <button
                  type="button"
                  className="measurement-shortcut"
                  onClick={() =>
                    estimate.jobs?.id &&
                    router.push(`/jobs/${estimate.jobs.id}/measurements`)
                  }
                >
                  Edit job measurements →
                </button>
              </div>
            )}
            <p>
              Approving this estimate automatically updates the job contract
              value to this total.
            </p>
            <button
              disabled={estimate.status === "approved"}
              onClick={() => setStatus("approved")}
            >
              {estimate.status === "approved"
                ? "✓ Approved"
                : "Approve estimate"}
            </button>
          </aside>
        </div>
      </div>
      {showCatalog && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setShowCatalog(false)
          }
        >
          <section className="modal catalog-picker">
            <button
              className="modal-close"
              onClick={() => setShowCatalog(false)}
            >
              ×
            </button>
            <p className="eyebrow">PRODUCT CATALOG</p>
            <h2>Add a saved item.</h2>
            <div className="catalog-search">
              ⌕{" "}
              <input
                autoFocus
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search materials, labor, or upgrades…"
              />
            </div>
            <div className="catalog-picker-list">
              {catalogGroups.map((group) => (
                <section key={group.category}>
                  <h3>{group.category}</h3>
                  {group.products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                    >
                      <div>
                        <b>{product.name}</b>
                        <p>
                          {product.description || `Priced per ${product.unit}`}
                        </p>
                      </div>
                      <span>
                        ${Number(product.unit_price).toLocaleString()} /{" "}
                        {product.unit}
                      </span>
                      <em>＋ Add</em>
                    </button>
                  ))}
                </section>
              ))}
              {!products.length && (
                <div className="catalog-empty">
                  <b>Your catalog is empty.</b>
                  <span>
                    Open Product catalog from the sidebar and add your standard
                    items first.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </CrmShell>
  );
}
