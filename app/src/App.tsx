import { useMemo, useState } from "react";
import { OverrideSummary } from "./components/OverrideSummary";
import { PrintView } from "./components/PrintView";
import { QuoteHeader } from "./components/QuoteHeader";
import { SectionEditor } from "./components/SectionEditor";
import { WarningList } from "./components/WarningList";
import { computeQuote } from "./core/engine";
import { formatMoney } from "./core/money";
import { company } from "./data/masters";
import { downloadExcel } from "./export/excel";
import { downloadPdf } from "./export/pdf";
import { useQuote } from "./state/useQuote";
import { Button, Callout, Confirm, Tabs } from "./ui/controls";

export default function App() {
  const q = useQuote();
  const [view, setView] = useState<"entry" | "print">("entry");
  const [busy, setBusy] = useState<"" | "pdf" | "excel">("");
  const [discarding, setDiscarding] = useState(false);

  const computed = useMemo(() => computeQuote(q.quote), [q.quote]);

  // The quote has left the building, so the crash-recovery copy has done its job
  // (dev-plan §5). The downloaded file is the record from here.
  const run = async (what: "pdf" | "excel") => {
    setBusy(what);
    try {
      if (what === "pdf") await downloadPdf(computed);
      else await downloadExcel(computed);
      q.forget();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>{company.name}</h1>
          <span className="muted small">Proforma quotation</span>
        </div>

        <span className="divider--v" />

        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { value: "entry", label: "Entry" },
            { value: "print", label: "What prints" },
          ]}
        />

        <span className="spacer" />

        <span className="muted small num">
          {q.quote.proformaNo ? `No ${q.quote.proformaNo} · ` : ""}
          {q.quote.date}
        </span>
        <span className="strong num">₹ {formatMoney(computed.grandTotal)}</span>

        {/* Starting again throws the whole quote away, so it asks first — and it
            sits up here with the other whole-document actions rather than at the
            end of the page next to Add section. */}
        <Button variant="ghost" onClick={() => setDiscarding(true)}>
          New quote
        </Button>

        <Button
          onClick={() => run("excel")}
          title="The quote with its formulas, to reopen and revise later"
        >
          {busy === "excel" ? "Preparing…" : "Download Excel"}
        </Button>
        <Button variant="primary" onClick={() => run("pdf")}>
          {busy === "pdf" ? "Preparing…" : "Download PDF"}
        </Button>
      </header>

      {discarding && (
        <Confirm
          title="Start a new quote?"
          body="Everything typed into this one is cleared, and it is not kept anywhere."
          confirmLabel="Yes, start fresh"
          onConfirm={() => {
            q.startBlank();
            setDiscarding(false);
          }}
          onCancel={() => setDiscarding(false)}
        />
      )}

      <main className="page">
        {q.draft && (
          <Callout tone="info" title="An unfinished quote was left open">
            <div className="row">
              <span className="muted small">
                Last change {new Date(q.draft.savedAt).toLocaleString("en-IN")}
                {q.draft.quote.customerName ? ` · ${q.draft.quote.customerName}` : ""}
              </span>
              <span className="spacer" />
              <Button
                variant="primary"
                onClick={() => {
                  if (q.draft) q.restoreDraft(q.draft.quote);
                  q.dismissDraft();
                }}
              >
                Pick it up
              </Button>
              <Button
                onClick={() => {
                  q.startBlank();
                  q.dismissDraft();
                }}
              >
                Start fresh
              </Button>
            </div>
          </Callout>
        )}

        <div
          className="panel"
          role="tabpanel"
          id={`panel-${view}`}
          aria-labelledby={`tab-${view}`}
        >
          {view === "print" ? (
            <>
              <div className="no-print notices">
                <OverrideSummary computed={computed} onResetAll={q.resetAll} />
                <WarningList computed={computed} />
              </div>
              <PrintView computed={computed} />
            </>
          ) : (
            <>
              <QuoteHeader
                quote={q.quote}
                onChange={q.patchQuote}
                onInputUnit={q.setInputUnit}
                onPrintUnit={q.setPrintUnit}
              />

              {computed.sections.map((section, i) => (
                <SectionEditor
                  key={section.section.id}
                  index={i}
                  quote={q.quote}
                  computed={section}
                  canRemove={computed.sections.length > 1}
                  onSetProduct={(product) => q.setProduct(section.section.id, product)}
                  onPatchSection={(patch) => q.patchSection(section.section.id, patch)}
                  onPatchLine={(lineId, patch) => q.patchLine(section.section.id, lineId, patch)}
                  onResetLine={(lineId) => q.resetLine(section.section.id, lineId)}
                  onRemoveLine={(lineId) => q.removeLine(section.section.id, lineId)}
                  onAddLine={() => q.addLine(section.section.id)}
                  onAddCharge={() => q.addCharge(section.section.id)}
                  onPatchCharge={(id, patch) => q.patchCharge(section.section.id, id, patch)}
                  onSetChargeLabel={(id, label) => q.setChargeLabel(section.section.id, id, label)}
                  onRemoveCharge={(id) => q.removeCharge(section.section.id, id)}
                  onRemoveSection={() => q.removeSection(section.section.id)}
                />
              ))}

              <div className="row">
                <Button onClick={q.addSection}>Add section</Button>
              </div>

              <OverrideSummary computed={computed} onResetAll={q.resetAll} />
              <WarningList computed={computed} />

              <section className="card">
                <div className="card__body">
                  <div className="totals">
                    <div className="totals__row totals__row--grand">
                      <span className="totals__label strong">Total amount</span>
                      <span className="totals__value">₹ {formatMoney(computed.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
