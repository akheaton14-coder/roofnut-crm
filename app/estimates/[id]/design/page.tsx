"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";
import { calculateFormula, FormulaMeasurement } from "@/lib/formula";

type Page = {
  id: string;
  page_type: string;
  title: string;
  enabled: boolean;
  position: number;
  content: Record<string, string>;
};
type Estimate = {
  title: string;
  estimate_number: number;
  discount_amount: number;
  tax_rate: number;
  total: number;
  jobs: {
    id: string;
    title: string;
    clients: { first_name: string; last_name: string } | null;
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
  section_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  taxable: boolean;
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
type EstimateSection={id:string;name:string;description:string|null;client_display:"detailed"|"summary"|"hidden";position:number};
type Photo = {
  id: string;
  filename: string;
  storage_path: string;
  signedUrl?: string;
};

function cleanRichHtml(html: string) {
  return (html || "")
    .replace(/<\/?(?:font|span)\b[^>]*>/gi, "")
    .replace(/<div\b[^>]*>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(
      /\s(?:style|class|id|face|size|color|width|height)=(?:"[^"]*"|'[^']*')/gi,
      "",
    )
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/<p>\s*<br\s*\/?\s*>\s*<\/p>/gi, "<br>");
}

function RichTextEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (html: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const cleanValue = cleanRichHtml(value);
    if (
      editor.current &&
      document.activeElement !== editor.current &&
      editor.current.innerHTML !== cleanValue
    )
      editor.current.innerHTML = cleanValue;
  }, [value]);
  function saveCurrent(normalizeDom = false) {
    if (!editor.current) return;
    const clean = cleanRichHtml(editor.current.innerHTML);
    if (normalizeDom && editor.current.innerHTML !== clean) {
      editor.current.innerHTML = clean;
    }
    onSave(clean);
  }
  function command(name: string, arg?: string) {
    document.execCommand(name, false, arg);
    editor.current?.focus();
    requestAnimationFrame(() => saveCurrent(false));
  }
  function addLink() {
    const url = prompt("Paste the link address");
    if (url) command("createLink", url);
  }
  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("bold");
          }}
        >
          <b>B</b>
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("italic");
          }}
        >
          <i>I</i>
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("underline");
          }}
        >
          <u>U</u>
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("formatBlock", "h2");
          }}
        >
          Heading
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("insertOrderedList");
          }}
        >
          1. List
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("insertUnorderedList");
          }}
        >
          • List
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          🔗
        </span>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            command("removeFormat");
          }}
        >
          Clear
        </span>
      </div>
      <div
        ref={editor}
        className="rich-canvas"
        contentEditable
        tabIndex={0}
        suppressContentEditableWarning
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onInput={() => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => saveCurrent(false), 400);
        }}
        onBlur={(e) => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveCurrent(true);
        }}
        onPaste={() =>
          setTimeout(
            () => {
              if (!editor.current) return;
              saveCurrent(true);
            },
            0,
          )
        }
      />
    </div>
  );
}

function ProposalPage({
  page,
  estimate,
  items,
  photos,
  pageNumber,
  sections,
}: {
  page: Page;
  estimate: Estimate;
  items: Item[];
  photos: Photo[];
  pageNumber: number;
  sections: EstimateSection[];
}) {
  const selectedIds = (page.content.photo_ids || "").split(",").filter(Boolean),
    selectedPhotos = selectedIds
      .map((photoId) => photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is Photo => Boolean(photo)),
    photoCaptions = (() => {
      try {
        return JSON.parse(page.content.photo_captions || "{}") as Record<string, string>;
      } catch {
        return {};
      }
    })();
  const tokens = (value: string) =>
      (value || "")
        .replaceAll(
          "{{CUSTOMER_FIRST_NAME}}",
          estimate.jobs?.clients?.first_name || "Customer",
        )
        .replaceAll(
          "{{JOB_ADDRESS}}",
          estimate.jobs?.properties?.address_1 || "",
        )
        .replaceAll(
          "{{ESTIMATE_TOTAL}}",
          `$${Number(estimate.total).toLocaleString()}`,
        ),
    body = tokens(page.content.body || ""),
    bodyHtml = cleanRichHtml(tokens(page.content.body_html || ""));
  return (
    <section className={`proposal-page ${page.page_type}`}>
      <div className="proposal-page-brand">
        <b>
          ROOF<span>NUT</span>
        </b>
        <small>PROPOSAL</small>
      </div>
      {page.page_type === "cover" ? (
        <>
          <div className={`cover-art ${selectedPhotos[0] ? "has-photo" : ""}`}>
            {selectedPhotos[0] ? (
              <img src={selectedPhotos[0].signedUrl} alt="Property" />
            ) : (
              <span>R</span>
            )}
          </div>
          <div className="cover-copy">
            <h1>{page.content.headline || estimate.title}</h1>
            <p>{page.content.subheadline}</p>
            <div>
              <b>
                {estimate.jobs?.clients?.first_name}{" "}
                {estimate.jobs?.clients?.last_name}
              </b>
              <span>
                {estimate.jobs?.properties?.address_1}
                <br />
                {estimate.jobs?.properties?.city},{" "}
                {estimate.jobs?.properties?.state}
              </span>
            </div>
          </div>
        </>
      ) : page.page_type === "quote" ? (
        <>
          <h1>{page.title}</h1>
          <div className="preview-quote sectioned-quote">
            {sections.filter(section=>section.client_display!=="hidden").map(section=>{const sectionItems=items.filter(item=>item.section_id===section.id),sectionTotal=sectionItems.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);return <section key={section.id}><header><div><b>{section.name}</b>{section.description&&<p>{section.description}</p>}</div><strong>${sectionTotal.toLocaleString()}</strong></header>{section.client_display==="detailed"&&sectionItems.map((item,index)=>(
              <article key={index}>
                <div>
                  <b>{item.name}</b>
                  <p>{item.description}</p>
                </div>
                <span>
                  {item.quantity} {item.unit}
                </span>
                <b>
                  $
                  {(
                    Number(item.quantity) * Number(item.unit_price)
                  ).toLocaleString()}
                </b>
              </article>
            ))}</section>})}
          </div>
          <div className="preview-total">
            <span>Estimate total</span>
            <b>${Number(estimate.total).toLocaleString()}</b>
          </div>
        </>
      ) : (
        <>
          <h1>{page.title}</h1>
          {bodyHtml ? (
            <div
              className="preview-body rich-content"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <div className="preview-body">
              {body.split("\n").map((line, index) => (
                <p key={index}>{line || " "}</p>
              ))}
            </div>
          )}
          {(page.page_type === "inspection" || selectedPhotos.length > 0) && (
            <div
              className={`proposal-photos count-${Math.min(selectedPhotos.length, 4)}`}
            >
              {selectedPhotos.length ? (
                selectedPhotos.slice(0, 4).map((photo) => (
                  <figure key={photo.id}>
                    <img src={photo.signedUrl} alt={photo.filename} />
                    <figcaption>
                      {photoCaptions[photo.id] || photo.filename}
                    </figcaption>
                  </figure>
                ))
              ) : (
                <>
                  <span>Choose photos from this job</span>
                  <span>Choose photos from this job</span>
                </>
              )}
            </div>
          )}
        </>
      )}
      <footer>
        Roofnut · A better roof. A better experience. <span>{pageNumber}</span>
      </footer>
    </section>
  );
}

export default function ProposalDesigner() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter(),
    { supabase, organizationId, loading, userName } = useWorkspace();
  const pdfPages = useRef<HTMLDivElement>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [pages, setPages] = useState<Page[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [measurements, setMeasurements] = useState<FormulaMeasurement[]>([]),
    [sections,setSections]=useState<EstimateSection[]>([]),
    [photos, setPhotos] = useState<Photo[]>([]),
    [selected, setSelected] = useState(""),
    [openSections,setOpenSections]=useState<Set<string>>(new Set()),
    [addingToSection, setAddingToSection] = useState<string | null>(null),
    [itemSearch, setItemSearch] = useState(""),
    [draggedItemId, setDraggedItemId] = useState<string | null>(null),
    [showPhotoPicker, setShowPhotoPicker] = useState(false),
    [ready, setReady] = useState(true),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const [{ data: e }, { data: p, error }, { data: i },{data:s},{data:catalog}] = await Promise.all([
        supabase
          .from("estimates")
          .select(
            "title,estimate_number,discount_amount,tax_rate,total,jobs(id,title,clients(first_name,last_name),properties(address_1,city,state,postal_code))",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("estimate_pages")
          .select("id,page_type,title,enabled,position,content")
          .eq("estimate_id", id)
          .order("position"),
        supabase
          .from("estimate_items")
          .select("id,product_id,section_id,name,description,quantity,unit,unit_price,taxable,quantity_source,calculation_formula")
          .eq("estimate_id", id)
          .order("position"),
        supabase.from("estimate_sections").select("id,name,description,client_display,position").eq("estimate_id",id).order("position"),
        supabase.from("products").select("id,name,description,category,unit,unit_price,taxable,quantity_formula,quantity_rounding").eq("organization_id",organizationId).eq("active",true).order("category").order("name"),
      ]);
      const loaded = e as unknown as Estimate;
      setEstimate(loaded);
      if (error) setReady(false);
      else {
        setPages((p || []) as Page[]);
        setSelected(p?.[0]?.id || "");
      }
      setItems((i || []) as Item[]);
      setProducts((catalog || []) as Product[]);
      setSections((s||[]) as EstimateSection[]);
      if (loaded?.jobs?.id) {
        const [{data:fields},{data:values}] = await Promise.all([
          supabase.from("measurement_fields").select("id,token,unit").eq("organization_id",organizationId).eq("active",true),
          supabase.from("job_measurements").select("measurement_field_id,value").eq("job_id",loaded.jobs.id),
        ]);
        const valueMap = new Map((values || []).map(value => [value.measurement_field_id, Number(value.value)]));
        setMeasurements((fields || []).map(field => ({ token: field.token, unit: field.unit, value: valueMap.get(field.id) || 0 })));
        const { data: f } = await supabase
          .from("files")
          .select("id,filename,storage_path")
          .eq("job_id", loaded.jobs.id)
          .like("content_type", "image/%")
          .order("created_at", { ascending: false });
        const signed = await Promise.all(
          ((f || []) as Photo[]).map(async (photo) => {
            const { data: url } = await supabase.storage
              .from("job-files")
              .createSignedUrl(photo.storage_path, 3600);
            return { ...photo, signedUrl: url?.signedUrl };
          }),
        );
        setPhotos(signed);
      }
    })();
  }, [id, organizationId, supabase]);
  const page = pages.find((p) => p.id === selected),
    enabledPages = pages.filter((p) => p.enabled);
  async function update(target: Page, patch: Partial<Page>) {
    setPages((current) =>
      current.map((p) => (p.id === target.id ? { ...p, ...patch } : p)),
    );
    await supabase
      .from("estimate_pages")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", target.id);
  }
  async function content(key: string, value: string) {
    if (page)
      await update(page, { content: { ...page.content, [key]: value } });
  }
  async function updateSection(section:EstimateSection,patch:Partial<EstimateSection>){setSections(current=>current.map(item=>item.id===section.id?{...item,...patch}:item));await supabase.from("estimate_sections").update(patch).eq("id",section.id)}
  async function addSection(){const {data}=await supabase.from("estimate_sections").insert({organization_id:organizationId,estimate_id:id,name:"New Section",client_display:"summary",position:sections.length}).select("id,name,description,client_display,position").single();if(data)setSections(current=>[...current,data as EstimateSection])}
  async function syncEstimateTotal(nextItems: Item[]) {
    const subtotal = nextItems.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    );
    const taxable = nextItems.filter(item => item.taxable).reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    );
    const taxAmount = taxable * Number(estimate?.tax_rate || 0) / 100;
    const total = Math.max(0, subtotal - Number(estimate?.discount_amount || 0)) + taxAmount;
    setEstimate((current) => current ? { ...current, total } : current);
    await supabase.from("estimates").update({ subtotal, tax_amount: taxAmount, total }).eq("id", id);
  }
  async function updateItem(item: Item, patch: Partial<Item>) {
    const next = items.map((row) => row.id === item.id ? { ...row, ...patch } : row);
    setItems(next);
    const { error } = await supabase.from("estimate_items").update(patch).eq("id", item.id);
    if (error) return alert(error.message);
    await syncEstimateTotal(next);
  }
  async function removeItem(item: Item) {
    if (!confirm(`Remove “${item.name}” from this estimate?`)) return;
    const next = items.filter((row) => row.id !== item.id);
    setItems(next);
    await supabase.from("estimate_items").delete().eq("id", item.id);
    await syncEstimateTotal(next);
  }
  async function addProduct(product: Product, sectionId: string) {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return alert("Add an estimate section first.");
    let quantity = 1;
    let quantitySource: "manual" | "calculated" = "manual";
    if (product.quantity_formula) {
      try {
        quantity = calculateFormula(product.quantity_formula, measurements, product.quantity_rounding);
        quantitySource = "calculated";
      } catch (error) {
        return alert(error instanceof Error ? error.message : "This product formula could not be calculated.");
      }
    }
    const { data, error } = await supabase.from("estimate_items").insert({
      organization_id: organizationId,
      estimate_id: id,
      section_id: section.id,
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
      calculation_inputs: Object.fromEntries(measurements.map(value => [value.token, value.value])),
    }).select("id,product_id,section_id,name,description,quantity,unit,unit_price,taxable,quantity_source,calculation_formula").single();
    if (error) return alert(error.message);
    if (data) {
      const next = [...items, data as Item];
      setItems(next);
      setOpenSections(current => new Set(current).add(section.id));
      await syncEstimateTotal(next);
    }
    setAddingToSection(null);
    setItemSearch("");
  }
  async function addBlankItem(sectionId: string, name = "New line item") {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return alert("Add an estimate section first.");
    const { data, error } = await supabase.from("estimate_items").insert({
      organization_id: organizationId,
      estimate_id: id,
      section_id: section.id,
      name,
      quantity: 1,
      unit: "each",
      unit_price: 0,
      position: items.length,
    }).select("id,product_id,section_id,name,description,quantity,unit,unit_price,taxable,quantity_source,calculation_formula").single();
    if (error) return alert(error.message);
    if (data) {
      setItems(current => [...current, data as Item]);
      setOpenSections(current => new Set(current).add(section.id));
    }
  }
  async function moveItemToSection(itemId: string, sectionId: string) {
    const item = items.find((row) => row.id === itemId);
    if (!item || item.section_id === sectionId) return;
    setItems((current) => current.map((row) => row.id === itemId ? { ...row, section_id: sectionId } : row));
    const { error } = await supabase.from("estimate_items").update({ section_id: sectionId }).eq("id", itemId);
    if (error) alert(error.message);
  }
  async function move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const copy = [...pages];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setPages(copy);
    await Promise.all(
      copy.map((p, position) =>
        supabase.from("estimate_pages").update({ position }).eq("id", p.id),
      ),
    );
  }
  async function add() {
    const { data } = await supabase
      .from("estimate_pages")
      .insert({
        organization_id: organizationId,
        estimate_id: id,
        page_type: "custom",
        title: "Custom Page",
        position: pages.length,
        content: { body: "Add your custom proposal content here." },
      })
      .select("id,page_type,title,enabled,position,content")
      .single();
    if (data) {
      setPages((c) => [...c, data as Page]);
      setSelected(data.id);
    }
  }
  async function remove() {
    if (!page || !confirm(`Remove “${page.title}”?`)) return;
    await supabase.from("estimate_pages").delete().eq("id", page.id);
    const next = pages.filter((p) => p.id !== page.id);
    setPages(next);
    setSelected(next[0]?.id || "");
  }
  function togglePhoto(photoId: string) {
    if (!page) return;
    const ids = (page.content.photo_ids || "").split(",").filter(Boolean),
      next = ids.includes(photoId)
        ? ids.filter((item) => item !== photoId)
        : [...ids, photoId];
    content("photo_ids", next.join(","));
  }
  function photoCaptions() {
    try {
      return JSON.parse(page?.content.photo_captions || "{}") as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }
  function updatePhotoCaption(photoId: string, caption: string) {
    content(
      "photo_captions",
      JSON.stringify({ ...photoCaptions(), [photoId]: caption }),
    );
  }
  async function downloadPdf() {
    if (!pdfPages.current || !estimate || !enabledPages.length || exporting) return;
    setExporting(true);
    try {
      const previewHeight = Math.max(440, window.innerHeight - 112);
      const previewWidth = Math.min(
        previewHeight * (8.5 / 11),
        Math.max(340, window.innerWidth - 310),
      );
      const pageHeight = previewWidth * (11 / 8.5);
      pdfPages.current.style.setProperty("--pdf-page-width", `${previewWidth}px`);
      pdfPages.current.style.setProperty("--pdf-page-height", `${pageHeight}px`);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await document.fonts.ready;
      await Promise.all(
        Array.from(pdfPages.current.querySelectorAll("img")).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.onload = () => resolve();
                image.onerror = () => resolve();
              }),
        ),
      );
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
        compress: true,
      });
      const proposalPages = Array.from(
        pdfPages.current.querySelectorAll<HTMLElement>(".proposal-page"),
      );
      for (let index = 0; index < proposalPages.length; index++) {
        const canvas = await html2canvas(proposalPages[index], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        if (index > 0) pdf.addPage("letter", "portrait");
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.96),
          "JPEG",
          0,
          0,
          612,
          792,
          undefined,
          "FAST",
        );
      }
      const safeTitle = (
        estimate.title || `Estimate-${estimate.estimate_number}`
      )
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-|-$/g, "");
      pdf.save(`${safeTitle || "Roofnut-Proposal"}.pdf`);
    } catch (error) {
      console.error(error);
      alert("The PDF could not be created. Please try again.");
    } finally {
      setExporting(false);
    }
  }
  if (loading || !estimate)
    return (
      <main className="auth-loading">
        <span>R</span>
      </main>
    );
  return (
    <CrmShell userName={userName}>
      <div className="proposal-designer">
        <aside className="proposal-pages">
          <div>
            <button onClick={() => router.push("/estimates")}>
              ← All estimates
            </button>
            <p className="eyebrow">PROPOSAL PAGES</p>
            <h2>Estimate #{estimate.estimate_number}</h2>
          </div>
          {!ready ? (
            <div className="task-migration">
              <b>Activate proposal pages</b>
              <p>Run the newest Estimate Pages migration in Supabase.</p>
            </div>
          ) : (
            <>
              <div className="page-list">
                {pages.map((p, index) => (
                  <article
                    className={selected === p.id ? "active" : ""}
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                  >
                    <span>⠿</span>
                    <div>
                      <b>{p.title}</b>
                      <small>{p.page_type}</small>
                    </div>
                    <label onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) =>
                          update(p, { enabled: e.target.checked })
                        }
                      />
                      <i />
                    </label>
                    <div className="page-order">
                      <button
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          move(index, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        disabled={index === pages.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          move(index, 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <button className="add-page" onClick={add}>
                ＋ Custom page
              </button>
            </>
          )}
        </aside>
        <main className="page-workspace">
          <div className="designer-toolbar">
            <div>
              <b>{page?.title || "Proposal Designer"}</b>
              <span>{enabledPages.length} enabled pages will be included</span>
            </div>
            <button
              disabled={exporting || !enabledPages.length}
              onClick={downloadPdf}
            >
              {exporting ? "Creating your PDF…" : "↓ Download complete PDF"}
            </button>
          </div>
          {page && (
            <div className="page-edit-layout">
              <section className="page-controls">
                <label>
                  Page name
                  <input
                    value={page.title}
                    onChange={(e) =>
                      setPages((c) =>
                        c.map((p) =>
                          p.id === page.id
                            ? { ...p, title: e.target.value }
                            : p,
                        ),
                      )
                    }
                    onBlur={(e) => update(page, { title: e.target.value })}
                  />
                </label>
                {page.page_type === "cover" && (
                  <>
                    <label>
                      Headline
                      <input
                        value={page.content.headline || ""}
                        onChange={(e) => content("headline", e.target.value)}
                      />
                    </label>
                    <label>
                      Subheadline
                      <input
                        value={page.content.subheadline || ""}
                        onChange={(e) => content("subheadline", e.target.value)}
                      />
                    </label>
                  </>
                )}
                {page.page_type !== "quote" &&
                  page.page_type !== "inspection" && (
                  <label>
                    Page content
                    <RichTextEditor
                      value={page.content.body_html || page.content.body || ""}
                      onSave={(html) => content("body_html", html)}
                    />
                  </label>
                )}
                {page.page_type === "inspection" && (
                  <div className="inspection-photo-editor">
                    <div className="inspection-photo-heading">
                      <div>
                        <b>Inspection photos</b>
                        <p>Add up to four job photos and describe each one.</p>
                      </div>
                      <button onClick={() => setShowPhotoPicker(true)}>
                        ＋ Add photos from job
                      </button>
                    </div>
                    <div className="inspection-photo-rows">
                      {(page.content.photo_ids || "")
                        .split(",")
                        .filter(Boolean)
                        .map((photoId) => photos.find((photo) => photo.id === photoId))
                        .filter((photo): photo is Photo => Boolean(photo))
                        .map((photo) => (
                          <article key={photo.id}>
                            <img src={photo.signedUrl} alt={photo.filename} />
                            <label>
                              Photo description
                              <textarea
                                value={photoCaptions()[photo.id] || ""}
                                placeholder="Describe the damage, condition, or recommendation…"
                                onChange={(event) =>
                                  updatePhotoCaption(photo.id, event.target.value)
                                }
                              />
                            </label>
                            <button onClick={() => togglePhoto(photo.id)}>×</button>
                          </article>
                        ))}
                      {!(page.content.photo_ids || "").split(",").filter(Boolean)
                        .length && (
                        <div className="inspection-photo-empty">
                          <span>▧</span>
                          <b>No inspection photos selected</b>
                          <p>Choose photos already uploaded to this job.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {page.page_type === "quote" && (
                  <div className="quote-section-editor">
                    <div className="quote-editor-intro">
                      <b>Products, pricing & sections</b>
                      <p>Add and price the estimate here, then control exactly what the customer sees.</p>
                    </div>
                    {sections.map((section) => {
                      const sectionItems = items.filter((item) => item.section_id === section.id),
                        count = sectionItems.length,
                        isOpen = openSections.has(section.id);
                      return (
                        <article
                          className={`${isOpen ? "open" : ""} ${draggedItemId ? "drag-target" : ""}`}
                          key={section.id}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggedItemId) moveItemToSection(draggedItemId, section.id);
                            setDraggedItemId(null);
                          }}
                        >
                          <button className="section-collapse" onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}>›</button>
                          <div><input value={section.name} onChange={(e) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, name: e.target.value } : item))} onBlur={(e) => updateSection(section, { name: e.target.value })}/><small>{count} line item{count === 1 ? "" : "s"}</small></div>
                          <select value={section.client_display} onChange={(e) => updateSection(section, { client_display: e.target.value as EstimateSection["client_display"] })}><option value="detailed">Client: Detailed</option><option value="summary">Client: Summary only</option><option value="hidden">Internal only</option></select>
                          {isOpen && <div className="section-item-list pricing-item-list">
                            {sectionItems.map((item) => <div key={item.id} draggable onDragStart={() => setDraggedItemId(item.id)} onDragEnd={() => setDraggedItemId(null)}>
                              <span className="pricing-drag-handle">⠿</span>
                              <div className="pricing-description"><small>{item.name}</small><textarea value={item.description || ""} placeholder="Description" onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, description: e.target.value } : row))} onBlur={(e) => updateItem(item, { description: e.target.value })}/></div>
                              <label>Qty<input type="number" value={item.quantity} onChange={(e) => updateItem(item, { quantity: Number(e.target.value), quantity_source: item.calculation_formula ? "override" : "manual" })}/></label>
                              <label>Unit<input value={item.unit} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, unit: e.target.value } : row))} onBlur={(e) => updateItem(item, { unit: e.target.value })}/></label>
                              <label>Price<input type="number" value={item.unit_price} onChange={(e) => updateItem(item, { unit_price: Number(e.target.value) })}/></label>
                              <b>${(Number(item.quantity) * Number(item.unit_price)).toLocaleString()}</b>
                              <button className="remove-pricing-item" onClick={() => removeItem(item)}>×</button>
                            </div>)}
                            {!sectionItems.length && <p>No items in this section yet.</p>}
                            {addingToSection === section.id ? (
                              <div className="inline-product-search">
                                <input autoFocus value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Start typing a product or service…" />
                                <button onClick={() => { setAddingToSection(null); setItemSearch(""); }}>×</button>
                                {!!itemSearch && <div>{products.filter((product) => `${product.name} ${product.description || ""}`.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 7).map((product) => <button key={product.id} onClick={() => addProduct(product, section.id)}><span><b>{product.name}</b><small>{product.description || product.category}</small></span><em>${Number(product.unit_price).toLocaleString()} / {product.unit}</em></button>)}<button className="custom-search-item" onClick={() => { addBlankItem(section.id, itemSearch); setAddingToSection(null); setItemSearch(""); }}>＋ Add “{itemSearch}” as a custom item</button></div>}
                              </div>
                            ) : <button className="section-add-item" onClick={() => { setAddingToSection(section.id); setItemSearch(""); }}>＋ Add item</button>}
                          </div>}
                        </article>
                      );
                    })}
                    <button className="add-estimate-section" onClick={addSection}>＋ Add section</button>
                    <div className="designer-estimate-total"><span>Estimate total</span><b>${Number(estimate.total).toLocaleString()}</b></div>
                  </div>
                )}
                {(page.page_type === "cover" ||
                  page.page_type === "custom") && (
                  <div className="job-photo-picker">
                    <b>Photos from this job</b>
                    <p>
                      {page.page_type === "cover"
                        ? "The first selected photo becomes the cover image."
                        : "Choose up to four photos for this page."}
                    </p>
                    <div>
                      {photos.map((photo) => {
                        const chosen = (page.content.photo_ids || "")
                          .split(",")
                          .includes(photo.id);
                        return (
                          <button
                            className={chosen ? "selected" : ""}
                            key={photo.id}
                            onClick={() => togglePhoto(photo.id)}
                          >
                            <img src={photo.signedUrl} alt={photo.filename} />
                            <span>{chosen ? "✓ Selected" : "Add photo"}</span>
                          </button>
                        );
                      })}
                      {!photos.length && (
                        <small>No job photos have been uploaded yet.</small>
                      )}
                    </div>
                  </div>
                )}
                <div className="token-help">
                  <b>Personalization tokens</b>
                  <p>
                    Use <code>{"{{CUSTOMER_FIRST_NAME}}"}</code>,{" "}
                    <code>{"{{JOB_ADDRESS}}"}</code>, and{" "}
                    <code>{"{{ESTIMATE_TOTAL}}"}</code>.
                  </p>
                </div>
                {page.page_type === "custom" && (
                  <button className="remove-page" onClick={remove}>
                    Delete custom page
                  </button>
                )}
              </section>
              <ProposalPage
                page={page}
                estimate={estimate}
                items={items}
                photos={photos}
                pageNumber={Math.max(
                  1,
                  enabledPages.findIndex((p) => p.id === page.id) + 1,
                )}
                sections={sections}
              />
            </div>
          )}
          <div ref={pdfPages} className="pdf-proposal">
            {enabledPages.map((printPage, index) => (
              <ProposalPage
                key={printPage.id}
                page={printPage}
                estimate={estimate}
                items={items}
                photos={photos}
                pageNumber={index + 1}
                sections={sections}
              />
            ))}
          </div>
        </main>
      </div>
      {showPhotoPicker && page?.page_type === "inspection" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setShowPhotoPicker(false)
          }
        >
          <section className="modal inspection-photo-modal">
            <button
              className="modal-close"
              onClick={() => setShowPhotoPicker(false)}
            >
              ×
            </button>
            <p className="eyebrow">JOB PHOTO GALLERY</p>
            <h2>Select inspection photos.</h2>
            <p>Choose up to four photos for this proposal page.</p>
            <div>
              {photos.map((photo) => {
                const selectedIds = (page.content.photo_ids || "")
                    .split(",")
                    .filter(Boolean),
                  selectedPhoto = selectedIds.includes(photo.id),
                  atLimit = selectedIds.length >= 4 && !selectedPhoto;
                return (
                  <button
                    className={selectedPhoto ? "selected" : ""}
                    disabled={atLimit}
                    key={photo.id}
                    onClick={() => togglePhoto(photo.id)}
                  >
                    <img src={photo.signedUrl} alt={photo.filename} />
                    <span>{selectedPhoto ? "✓ Selected" : "Select photo"}</span>
                  </button>
                );
              })}
              {!photos.length && (
                <div className="inspection-photo-empty">
                  <b>No job photos yet.</b>
                  <p>Upload photos to the job first, then return here.</p>
                </div>
              )}
            </div>
            <footer>
              <span>
                {(page.content.photo_ids || "").split(",").filter(Boolean)
                  .length}{" "}
                of 4 selected
              </span>
              <button onClick={() => setShowPhotoPicker(false)}>Done</button>
            </footer>
          </section>
        </div>
      )}
    </CrmShell>
  );
}
